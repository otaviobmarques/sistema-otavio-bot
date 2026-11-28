import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { computerAlias, computerInputProblem, computersSshConfigText, createCloudComputers } from "./cloud-computers.ts";
import { COMPUTERS_SSH_CONFIG, vpsSshConfigText } from "./vps-ssh.ts";

const HOST_KEY = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl";
const good = { id: "c1f2e3d4", name: "Computador 1", host: "203.0.113.10", user: "arkobot", hostKeys: [HOST_KEY] };

function setup(opts: { inUse?: boolean } = {}) {
  const dataDir = mkdtempSync(join(tmpdir(), "omb-computers-"));
  let alias: string | null = null;
  const checks: string[] = [];
  const computers = createCloudComputers({
    dataDir,
    defaultAlias: () => alias,
    setDefaultAlias: (next) => { alias = next; },
    inUse: async () => opts.inUse ?? false,
    check: async (name) => { checks.push(name); return { ok: true }; },
    keygen: async (path) => { writeFileSync(path, "PRIVATE", { mode: 0o600 }); writeFileSync(`${path}.pub`, "ssh-ed25519 AAAAPUBLIC arkobot-cloud\n"); },
  });
  return { dataDir, computers, alias: () => alias, checks };
}

describe("computers the Admin assigns to a Cloud home", () => {
  it("refuses anything that could reach ssh_config or known_hosts unchecked", () => {
    expect(computerInputProblem(good)).toBeNull();
    expect(computerInputProblem({ ...good, id: "../x" })).toBe("invalid_id");
    expect(computerInputProblem({ ...good, name: "a\nHost *" })).toBe("invalid_name");
    expect(computerInputProblem({ ...good, host: "1.2.3.4\n  ProxyCommand sh" })).toBe("invalid_host");
    expect(computerInputProblem({ ...good, host: "-oProxyCommand=x" })).toBe("invalid_host");
    expect(computerInputProblem({ ...good, user: "root;rm" })).toBe("invalid_user");
    expect(computerInputProblem({ ...good, port: 70_000 })).toBe("invalid_port");
    expect(computerInputProblem({ ...good, hostKeys: [] })).toBe("invalid_host_keys");
    expect(computerInputProblem({ ...good, hostKeys: [`${HOST_KEY}\n* ssh-rsa AAAA`] })).toBe("invalid_host_keys");
    expect(computerInputProblem({ ...good, host: "vps.example.com", port: 2222 })).toBeNull();
  });

  it("writes a strict Host block with its own key and known hosts, under the hidden data folder", () => {
    const sshDir = join("/data", ".openmausbot", "ssh");
    const text = computersSshConfigText(sshDir, [{ ...good, port: 22, alias: computerAlias(good.id) }]);
    expect(text).toContain("Host arko-c1f2e3d4\n  HostName 203.0.113.10\n  Port 22\n  User arkobot");
    expect(text).toContain(`IdentityFile ${JSON.stringify(join(sshDir, "arko-computers-ed25519"))}`);
    expect(text).toContain("StrictHostKeyChecking yes");
    expect(text).toContain("IdentitiesOnly yes");
  });

  it("adds a computer: key made once, private, the alias becomes the default, known hosts pinned; removes it again", async () => {
    const { dataDir, computers, alias, checks } = setup();
    expect(await computers.publicKey()).toBe("ssh-ed25519 AAAAPUBLIC arkobot-cloud");
    const added = await computers.add({ ...good, port: 2222 });
    expect(added).toEqual({ computer: { ...good, hostKeys: undefined, port: 2222, alias: "arko-c1f2e3d4" }, check: { ok: true } });
    expect(alias()).toBe("arko-c1f2e3d4");
    expect(checks).toEqual(["arko-c1f2e3d4"]);
    const ssh = join(dataDir, "ssh");
    // Windows has no POSIX modes; a Cloud home is always Linux.
    if (process.platform !== "win32") expect(statSync(join(ssh, "arko-computers-ed25519")).mode & 0o777).toBe(0o600);
    expect(readFileSync(join(ssh, "arko-known-hosts"), "utf8")).toBe(`[203.0.113.10]:2222 ${HOST_KEY}\n`);
    expect(readFileSync(join(ssh, COMPUTERS_SSH_CONFIG), "utf8")).toContain("Host arko-c1f2e3d4");
    // The VPS SSH config every docker command uses includes it.
    expect(vpsSshConfigText(ssh, join(dataDir, "absent"), join(dataDir, "absent2"), join(ssh, COMPUTERS_SSH_CONFIG))).toContain(`Include ${JSON.stringify(join(ssh, COMPUTERS_SSH_CONFIG))}`);
    expect(computers.list().map((computer) => computer.id)).toEqual(["c1f2e3d4"]);

    expect(await computers.remove("c1f2e3d4")).toBe(true);
    expect(alias()).toBeNull();
    expect(readFileSync(join(ssh, "arko-known-hosts"), "utf8").trim()).toBe("");
    expect(await computers.remove("c1f2e3d4")).toBe(false);
  });

  it("refuses to remove a computer a bot's desktop still lives on", async () => {
    const { computers } = setup({ inUse: true });
    await computers.add(good);
    await expect(computers.remove(good.id)).rejects.toMatchObject({ status: 409 });
    expect(computers.list()).toHaveLength(1);
  });
});
