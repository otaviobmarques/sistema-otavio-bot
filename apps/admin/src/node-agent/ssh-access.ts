// On a customer's extra VPS (a computer for its bots, src/computers/assign.ts on the Admin): the agent reads this
// server's SSH host keys for the Admin, so the customer's ArkoBot never trusts on first use, and keeps the login user's
// authorized_keys equal to what the Admin says (the ArkoBot's own public key, limited to its address). Both through a
// short-lived helper container from the agent's image with one host folder bound: /etc/ssh read-only, or that user's
// ~/.ssh. Nothing else on the host is touched.
import { createHash } from "node:crypto";
import { LABEL_MANAGED, LABEL_NODE } from "../provisioning/protocol.ts";
import type { DockerApi } from "./docker.ts";
import type { Log } from "./reconcile.ts";

const HOST_KEY = /^(ssh-ed25519|ecdsa-sha2-nistp(?:256|384|521)|ssh-rsa) [A-Za-z0-9+/]+={0,3}$/;
/** Host keys are read again this often (they change only when the server is reinstalled). */
export const HOST_KEYS_EVERY_MS = 6 * 3600_000;

async function runHelper(docker: DockerApi, image: string, nodeId: string, name: string, binds: string[], cmd: string[], env: Record<string, string> = {}): Promise<{ code: number; output: string }> {
  const old = (await docker.listContainers(`${LABEL_MANAGED}=true`)).find((container) => container.Names.includes(`/${name}`));
  if (old) {
    const details = await docker.inspectContainer(old.Id);
    if (details.State.Running) await docker.stopContainer(old.Id, 5);
    await docker.removeContainer(old.Id);
  }
  const id = await docker.createContainer(name, {
    Image: image, Cmd: cmd, Env: Object.entries(env).map(([key, value]) => `${key}=${value}`),
    Labels: { [LABEL_MANAGED]: "true", [LABEL_NODE]: nodeId, "arkobot.helper": "ssh" },
    HostConfig: { Binds: binds, NetworkMode: "none", Memory: 64 * 1024 * 1024, RestartPolicy: { Name: "no" }, SecurityOpt: ["no-new-privileges"] },
  });
  try {
    await docker.startContainer(id);
    for (let waited = 0; waited < 20_000; waited += 250) {
      const details = await docker.inspectContainer(id);
      if (!details.State.Running) return { code: details.State.ExitCode ?? 0, output: await docker.containerLogs(id) };
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return { code: 124, output: "" };
  } finally {
    await docker.removeContainer(id).catch(() => undefined);
  }
}

export function createSshAccess(docker: DockerApi, options: { image: string; log: Log; now?: () => number }) {
  const clock = options.now ?? Date.now;
  let hostKeys: string[] | null = null;
  let readAt = 0;
  let applied: string | null = null;
  return {
    /** This server's host keys, read at most every HOST_KEYS_EVERY_MS; undefined when they cannot be read. */
    async hostKeys(nodeId: string): Promise<string[] | undefined> {
      if (hostKeys && clock() - readAt < HOST_KEYS_EVERY_MS) return hostKeys;
      const result = await runHelper(docker, options.image, nodeId, "arkossh-hostkeys", ["/etc/ssh:/h:ro"], ["sh", "-c", "cat /h/ssh_host_*_key.pub"]);
      const keys = result.output.split("\n").map((line) => line.trim().split(" ").slice(0, 2).join(" ")).filter((line) => HOST_KEY.test(line));
      if (result.code !== 0 || !keys.length) {
        options.log("não consegui ler as chaves de host do SSH deste servidor");
        return hostKeys ?? undefined;
      }
      hostKeys = keys.slice(0, 8);
      readAt = clock();
      return hostKeys;
    },
    /** Makes /home/<user>/.ssh/authorized_keys hold exactly these lines; only writes when they changed. */
    async apply(nodeId: string, access: { user: string; keys: string[] }): Promise<string | null> {
      const content = access.keys.length ? `${access.keys.join("\n")}\n` : "";
      const hash = createHash("sha256").update(`${access.user}\n${content}`).digest("hex");
      if (hash === applied) return null;
      const result = await runHelper(docker, options.image, nodeId, "arkossh-keys", [`/home/${access.user}/.ssh:/s`],
        ["sh", "-c", 'set -e; umask 077; printf "%s" "$KEYS" > /s/.authorized_keys.tmp; chown "$(stat -c %u:%g /s)" /s/.authorized_keys.tmp; mv /s/.authorized_keys.tmp /s/authorized_keys'],
        { KEYS: content });
      if (result.code !== 0) return `não consegui gravar as chaves do usuário ${access.user} (código ${result.code})`;
      applied = hash;
      options.log(`acesso SSH do ArkoBot atualizado (${access.keys.length} chave(s))`);
      return null;
    },
  };
}
