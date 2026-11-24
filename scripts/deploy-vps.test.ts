import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { parse } from "yaml";

// The owner's VPS (docs/otavio-bot/VPS-24H.md): the fork's image, its compose
// stacks with and without another proxy in front, the scripts the guide runs,
// and the workflows that test and publish the image.
// A Windows checkout can turn LF into CRLF (core.autocrlf), so compare the text with LF line endings.
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const yaml = (path: string) => parse(read(path), { logLevel: "silent" });
const IMAGE = "ghcr.io/otaviobmarques/sistema-otavio-bot";
const SCRIPTS = [
  "deploy/ligar-desktops.sh", "deploy/backup.sh", "deploy/restaurar-backup.sh", "deploy/instalar-backup-diario.sh",
  "deploy/atualizar.sh", "deploy/instalar-atualizador.sh",
];

interface Step { op: string; args: string }
function stageSteps(dockerfile: string, name: string): Step[] {
  const steps: Step[] = [];
  let inside = false;
  let pending = "";
  for (const line of dockerfile.split("\n")) {
    if (/^\s*#/.test(line) || (!pending && !line.trim())) continue;
    pending += line.endsWith("\\") ? `${line.slice(0, -1)} ` : line;
    if (line.endsWith("\\")) continue;
    const [, op, args] = /^\s*(\S+)\s*([\s\S]*)$/.exec(pending)!;
    pending = "";
    if (op.toUpperCase() === "FROM") inside = new RegExp(`\\sAS\\s+${name}$`, "i").test(args.trim());
    else if (inside) steps.push({ op: op.toUpperCase(), args: args.trim() });
  }
  return steps;
}

describe("the Otávio Bot VPS deployment", () => {
  const dockerfile = read("Dockerfile");

  it("ships the Docker and SSH clients in the server image, pinned, beneath the engines and the app", () => {
    expect(dockerfile).toMatch(/^FROM docker:\d+\.\d+\.\d+-cli AS docker-cli$/m);
    const server = stageSteps(dockerfile, "server");
    const ssh = server.findIndex(step => step.op === "RUN" && step.args.includes("apt-get install -y --no-install-recommends openssh-client"));
    const docker = server.findIndex(step => step.args === "--from=docker-cli /usr/local/bin/docker /usr/local/bin/docker");
    const buildx = server.findIndex(step => step.args.startsWith("--from=docker-cli /usr/local/libexec/docker/cli-plugins/docker-buildx "));
    const engines = server.findIndex(step => step.op === "RUN" && step.args.includes("npm install -g $ENGINES"));
    const app = server.findIndex(step => step.args.includes("--from=build"));
    for (const index of [ssh, docker, buildx]) {
      expect(index).toBeGreaterThan(-1);
      expect(index).toBeLessThan(engines);
      expect(index).toBeLessThan(app);
    }
    expect(server[ssh].args).toContain("rm -rf /var/lib/apt/lists/*");
    expect(stageSteps(dockerfile, "cloud-home").some(step => step.args.includes("docker-cli"))).toBe(false);
  });

  it("runs the fork's image around the clock, with a memory cap, a health check and a way to the host's SSH", () => {
    const compose = yaml("deploy/docker-compose.yml");
    expect(compose.name).toBe("${COMPOSE_PROJECT_NAME:-otavio-bot}");
    const { omb, caddy } = compose.services;
    expect(omb.image).toBe(`${IMAGE}:\${OTAVIO_BOT_VERSION:-latest}`);
    expect(omb.restart).toBe("always");
    expect(caddy.restart).toBe("always");
    // the server's own shutdown takes up to ~7 s; Docker's default 10 s before SIGKILL is too close
    expect(omb.stop_grace_period).toBe("30s");
    expect(omb.mem_limit).toBe("${OTAVIO_MEM_LIMIT:-3g}");
    expect(caddy.mem_limit).toBeTruthy();
    expect(omb.extra_hosts).toEqual(["host.docker.internal:host-gateway"]);
    expect(omb.volumes).toEqual(["data:/data"]);
    expect(omb.healthcheck.test.join(" ")).toContain("http://127.0.0.1:8799/api/health");
    expect(omb.ports).toEqual(["80:80", "443:443"]);
    expect(caddy.network_mode).toBe("service:omb");
    const edge = /^FROM caddy:(\S+) AS edge$/m.exec(dockerfile)![1];
    expect(caddy.image).toBe(`caddy:${edge}`);
  });

  it("behind another proxy, publishes one port that is never public and swaps only the Caddyfile", () => {
    const override = yaml("deploy/docker-compose.atras-de-proxy.yml");
    expect(read("deploy/docker-compose.atras-de-proxy.yml")).toMatch(/ports: !override\n/);
    expect(read("deploy/docker-compose.atras-de-proxy.yml")).toMatch(/volumes: !override\n/);
    expect(override.services.omb.ports).toEqual(["${OTAVIO_PROXY_BIND:-127.0.0.1}:${OTAVIO_PROXY_PORT:-18080}:8080"]);
    expect(override.services.caddy.volumes[0]).toBe("./Caddyfile.atras-de-proxy:/etc/caddy/Caddyfile:ro");
    const caddyfile = read("deploy/Caddyfile.atras-de-proxy");
    expect(caddyfile).toMatch(/auto_https off/);
    expect(caddyfile).toMatch(/trusted_proxies static private_ranges/);
    expect(caddyfile).toMatch(/^:8080 \{$/m);
    expect(caddyfile).toMatch(/handle \/hooks\/\* \{\n\t\treverse_proxy 127\.0\.0\.1:8800/);
    expect(caddyfile).toMatch(/reverse_proxy 127\.0\.0\.1:8799 \{[^}]*flush_interval -1/);
  });

  it("behind a Traefik that reads Docker labels, joins its network and publishes no port", () => {
    expect(read("deploy/docker-compose.traefik.yml")).toMatch(/ports: !override \[\]\n/);
    const { services, networks } = yaml("deploy/docker-compose.traefik.yml");
    expect(services.omb.networks).toEqual(["default", "traefik"]);
    expect(networks.traefik).toEqual({ external: true, name: "${TRAEFIK_NETWORK:-traefik-edge}" });
    expect(services.omb.labels).toMatchObject({
      "traefik.enable": "true",
      "traefik.docker.network": "${TRAEFIK_NETWORK:-traefik-edge}",
      "traefik.http.routers.otavio-bot.rule": "Host(`${DOMAIN}`)",
      "traefik.http.routers.otavio-bot.tls": "true",
      "traefik.http.services.otavio-bot.loadbalancer.server.port": "8080",
    });
    expect(read("deploy/.env.example")).toMatch(/^# COMPOSE_FILE=docker-compose\.yml:docker-compose\.atras-de-proxy\.yml:docker-compose\.traefik\.yml$/m);
  });

  it("documents every setting the stacks read, with no secret in the example", () => {
    const example = read("deploy/.env.example");
    const used = new Set([...`${read("deploy/docker-compose.yml")}${read("deploy/docker-compose.atras-de-proxy.yml")}${read("deploy/docker-compose.traefik.yml")}`.matchAll(/\$\{([A-Z_]+)/g)].map(match => match[1]));
    used.delete("COMPOSE_PROJECT_NAME");
    for (const name of used) expect(example, name).toMatch(new RegExp(`^#? ?${name}=`, "m"));
    for (const line of example.split("\n").filter(text => /^[A-Z_]+=/.test(text))) {
      expect(line, line).not.toMatch(/TOKEN|PASSWORD|SECRET|KEY=/);
    }
    expect(example).toMatch(/^# COMPOSE_FILE=docker-compose\.yml:docker-compose\.atras-de-proxy\.yml$/m);
  });

  it.skipIf(process.platform === "win32")("keeps the guide's scripts executable and valid bash", () => {
    for (const script of SCRIPTS) {
      expect(statSync(new URL(`../${script}`, import.meta.url)).mode & 0o111, script).not.toBe(0);
      const result = spawnSync("bash", ["-n", script], { cwd: new URL("..", import.meta.url), encoding: "utf8" });
      expect(result.status, `${script}: ${result.stderr}`).toBe(0);
      expect(read(script), script).toMatch(/^#!\/usr\/bin\/env bash\n[\s\S]*^set -euo pipefail$/m);
    }
  });

  it("authorizes the server's key only from its own Docker network, and pins the host key instead of trusting it on first use", () => {
    const script = read("deploy/ligar-desktops.sh");
    expect(script).toContain(`printf 'from="%s",no-pty,no-agent-forwarding,no-X11-forwarding %s\\n'`);
    expect(script).toContain("/etc/ssh/ssh_host_*_key.pub");
    expect(script).toContain("StrictHostKeyChecking yes");
    expect(script).toContain("HostName host.docker.internal");
    expect(script).not.toMatch(/accept-new|StrictHostKeyChecking no/);
  });

  it("backs up with a retention, root-only, and restores only after saving what is there", () => {
    const backup = read("deploy/backup.sh");
    expect(backup).toContain("umask 077");
    expect(backup).toMatch(/-mtime \+"\$BACKUP_KEEP_DAYS" -delete/);
    expect(backup).toMatch(/docker pause[\s\S]*tar --create[\s\S]*resume/);
    expect(backup).toContain("trap 'resume;");
    const restore = read("deploy/restaurar-backup.sh");
    expect(restore.indexOf("BACKUP_PAUSE=0 ./backup.sh")).toBeGreaterThan(restore.indexOf("docker compose stop"));
    expect(restore.indexOf("BACKUP_PAUSE=0 ./backup.sh")).toBeLessThan(restore.indexOf("-delete"));
    const timer = read("deploy/instalar-backup-diario.sh");
    expect(timer).toContain("OnCalendar=*-*-* 04:15:00");
    expect(timer).toContain("Persistent=true");
  });

  it("updates by itself only after a backup, one run at a time, and goes back when the new image is not healthy", () => {
    const update = read("deploy/atualizar.sh");
    expect(update).toMatch(/^exec 9>"\$STATE_DIR\/atualizar\.lock"\nflock -n 9 /m);
    expect(update).toMatch(/^ {2}latest \| main\) ;;$/m);
    expect(update.indexOf("exit 0 ;;")).toBeLessThan(update.indexOf("docker compose pull"));
    const backup = update.indexOf("if ! ./backup.sh; then");
    expect(backup).toBeGreaterThan(update.indexOf("docker compose pull"));
    expect(backup).toBeLessThan(update.indexOf('docker tag "$old_id" "$previous_tag"'));
    expect(update.indexOf('docker tag "$old_id" "$previous_tag"')).toBeLessThan(update.indexOf("\ndocker compose up -d ||"));
    expect(update).toContain('previous_tag="${image%:*}:anterior"');
    expect(update).toContain('TIMEOUT="${ATUALIZAR_TIMEOUT:-300}"');
    expect(update).toMatch(/não ficou saudável[\s\S]*docker tag "\$old_id" "\$image"\ndocker compose up -d/);

    const installer = read("deploy/instalar-atualizador.sh");
    expect(installer).toContain("ExecStart=$here/atualizar.sh");
    expect(installer).toContain("OnCalendar=*:0/30");
    expect(installer).toContain("Persistent=true");
    expect(installer).toMatch(/^RandomizedDelaySec=\d+m$/m);
    expect(installer).toContain("systemctl enable --now otavio-bot-atualizar.timer");
    expect(installer).toContain("systemctl disable --now otavio-bot-atualizar.timer");
    expect(installer).toContain("journalctl -u otavio-bot-atualizar.service");
  });

  it("smokes the image this fork builds, with no enterprise layer, and both stacks", () => {
    const workflow = yaml(".github/workflows/docker.yml");
    const steps = workflow.jobs["build-and-smoke"].steps as { name?: string; run?: string }[];
    const runs = steps.map(step => step.run ?? "").join("\n");
    expect(runs).not.toContain("OMB_LICENSE_KEY");
    expect(workflow.on.push.paths).not.toContain("enterprise/**");
    const edition = steps.find(step => step.name?.startsWith("Prove the image is the open-source edition"))!.run!;
    expect(edition).toContain(`grep -q '"edition":"oss"'`);
    expect(edition).toContain("test -e /app/dist-server/enterprise");
    expect(runs).toContain("docker exec omb docker buildx version");
    expect(runs).toContain("docker exec omb ssh -V");
    expect(runs).toContain(`docker tag openmausbot:ci ${IMAGE}:latest`);
    expect(runs).toContain("COMPOSE_FILE=deploy/docker-compose.yml:deploy/docker-compose.atras-de-proxy.yml");
  });

  it("publishes the server image with the version and latest when a version is published, and main on a push", () => {
    const workflow = yaml(".github/workflows/docker.yml");
    expect(workflow.on.workflow_call.inputs.version).toMatchObject({ type: "string", required: false });
    const publish = workflow.jobs.publish;
    expect(publish.permissions).toEqual({ contents: "read", packages: "write" });
    expect(publish.if).toContain("inputs.version != ''");
    const steps = publish.steps as { id?: string; name?: string; uses?: string; if?: string; run?: string; with?: Record<string, string> }[];
    const meta = steps.find(step => step.id === "meta")!;
    expect(meta.with!.images).toBe("ghcr.io/${{ github.repository }}");
    expect(meta.with!.tags.split("\n")).toEqual(expect.arrayContaining([
      "type=raw,value=latest,enable=${{ inputs.version != '' }}",
      "type=raw,value=${{ inputs.version }},enable=${{ inputs.version != '' }}",
      "type=raw,value=main,enable=${{ github.event_name == 'push' && github.ref == 'refs/heads/main' }}",
    ]));
    const stamp = steps.findIndex(step => step.name === "Stamp the published version");
    expect(steps[stamp].if).toBe("inputs.version != ''");
    expect(steps[stamp].run).toContain('npm pkg set version="$VERSION"');
    const server = steps.findIndex(step => step.uses?.startsWith("docker/build-push-action@") && step.id !== "home");
    expect(stamp).toBeLessThan(server);
    expect(steps[server].with!["build-args"]).toContain("ENGINES=${{ steps.keys.outputs.engines }}");

    const release = yaml(".github/workflows/publish-release.yml");
    expect(release.jobs["docker-image"]).toEqual({
      needs: "publish",
      permissions: { contents: "read", packages: "write" },
      uses: "./.github/workflows/docker.yml",
      with: { version: "${{ inputs.version }}" },
    });
  });

  it("names the files, the image and the clicks the guide relies on", () => {
    const guide = read("docs/otavio-bot/VPS-24H.md");
    expect(guide).toContain(IMAGE);
    expect(guide).toContain("200.141.20.53");
    for (const script of SCRIPTS) expect(guide, script).toContain(script.replace("deploy/", ""));
    expect(guide).toContain("docker-compose.atras-de-proxy.yml");
    expect(guide).toContain("openmausbot pair");
    expect(guide).toContain("codex login --device-auth");
    expect(guide).toContain("claude auth login");
    expect(guide).toContain("otaviobot-vps");
    // the labels it tells the owner to click, as the Portuguese app shows them
    const pt = JSON.parse(read("src/locales/pt-br.json")) as Record<string, string>;
    for (const key of [
      "connect.title", "settings.section.desktopWorkspaces", "settings.simple.page.computer", "native.menu.server",
      "native.menu.addFromLink", "place.local", "servers.yours.title", "servers.switch", "connect.address",
      "settings.section.companion", "remote.serverPairing.title", "settings.group.ai", "settings.section.engines",
      "settings.section.connections", "keys.vps.label", "engineSetup.claude.start", "engineSetup.device.start",
      "botAccess.cloud.backend", "botAccess.cloud.selfHostedVps", "settings.section.computer", "vm.vps.title",
      "vm.cloud.sleep", "settings.section.backups",
    ]) {
      expect(pt[key], key).toBeTruthy();
      expect(guide.replace(/\s+/g, " "), key).toContain(pt[key].replace(/…$/, ""));
    }
  });
});

// Images are files holding an ID: "remote_" is what `pull` fetches, "tag_" the local tag, "run_" what a service runs.
const FAKE_DOCKER = String.raw`#!/usr/bin/env bash
S="$FAKE_DOCKER_STATE"
echo "$*" >> "$S/calls"
key() { printf '%s' "$1" | tr '/:' '__'; }
resolve() { case "$1" in sha256:*) echo "$1" ;; *) cat "$S/tag_$(key "$1")" 2>/dev/null ;; esac; }
OMB=ghcr.io/otaviobmarques/sistema-otavio-bot:latest
CADDY=caddy:2.10.2
last="${"$"}{*: -1}"
if [ "$1" = compose ]; then
  case "$2" in
    config) if [ "$last" = caddy ]; then echo "$CADDY"; else echo "$OMB"; fi ;;
    ps) [ -f "$S/run_$last" ] && echo "cid_$last" ;;
    pull) [ -f "$S/pull_fails" ] && exit 1
      for ref in "$OMB" "$CADDY"; do [ -f "$S/remote_$(key "$ref")" ] && cp "$S/remote_$(key "$ref")" "$S/tag_$(key "$ref")"; done ;;
    up) resolve "$OMB" > "$S/run_omb"; resolve "$CADDY" > "$S/run_caddy" ;;
    exec) id="$(cat "$S/run_omb")"; echo "ver-${"$"}{id#sha256:}" ;;
  esac
  exit 0
fi
case "$1" in
  image) [ "$2" = inspect ] || exit 0
    id="$(resolve "$last")"; [ -n "$id" ] || exit 1
    case "$4" in *.Id*) echo "$id" ;; *revision*) echo "rev${"$"}{id#sha256:}" ;; *) echo latest ;; esac ;;
  inspect) id="$(cat "$S/run_${"$"}{last#cid_}")"
    case "$3" in *Health*) echo "$id $(cat "$S/health_${"$"}{id#sha256:}" 2>/dev/null || echo healthy)" ;; *) echo "$id" ;; esac ;;
  tag) resolve "$2" > "$S/tag_$(key "$3")" ;;
esac
`;
const OMB_LATEST = "ghcr.io_otaviobmarques_sistema-otavio-bot_latest";
const hasFlock = process.platform !== "win32" && spawnSync("flock", ["--version"]).status === 0;

describe.skipIf(!hasFlock)("atualizar.sh, with a fake docker", () => {
  const dirs: string[] = [];
  afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

  function setup({ remote = "sha256:old", version = "latest", running = true, backupFails = false, health = "healthy" } = {}) {
    const root = mkdtempSync(join(tmpdir(), "omb-atualizar-"));
    dirs.push(root);
    const state = join(root, "docker"), bin = join(root, "bin"), deploy = join(root, "deploy"), lib = join(root, "lib");
    for (const dir of [state, bin, deploy, lib]) mkdirSync(dir);
    writeFileSync(join(bin, "docker"), FAKE_DOCKER, { mode: 0o755 });
    copyFileSync(fileURLToPath(new URL("../deploy/atualizar.sh", import.meta.url)), join(deploy, "atualizar.sh"));
    writeFileSync(join(deploy, "backup.sh"), `#!/usr/bin/env bash\necho backup >> "$FAKE_DOCKER_STATE/calls"\nexit ${backupFails ? 1 : 0}\n`, { mode: 0o755 });
    writeFileSync(join(deploy, ".env"), `DOMAIN=bots.example.com\nOTAVIO_BOT_VERSION=${version}\n`);
    writeFileSync(join(state, `tag_${OMB_LATEST}`), "sha256:old\n");
    writeFileSync(join(state, "tag_caddy_2.10.2"), "sha256:caddy\n");
    writeFileSync(join(state, `remote_${OMB_LATEST}`), `${remote}\n`);
    writeFileSync(join(state, "health_new"), `${health}\n`);
    if (running) {
      writeFileSync(join(state, "run_omb"), "sha256:old\n");
      writeFileSync(join(state, "run_caddy"), "sha256:caddy\n");
    }
    const env: NodeJS.ProcessEnv = {
      ...process.env, PATH: `${bin}:${process.env.PATH}`, FAKE_DOCKER_STATE: state,
      ATUALIZAR_STATE_DIR: lib, ATUALIZAR_TIMEOUT: "2", ATUALIZAR_INTERVALO: "0",
    };
    delete env.OTAVIO_BOT_VERSION;
    const file = (name: string) => existsSync(join(state, name)) ? readFileSync(join(state, name), "utf8").trim() : "";
    const run = (wrap: string[] = []) => {
      const [command, ...args] = [...wrap, "bash", join(deploy, "atualizar.sh")];
      const result = spawnSync(command!, args, { env, encoding: "utf8" });
      return { ...result, calls: file("calls").split("\n").filter(Boolean) };
    };
    return { run, file, lib };
  }

  it("does nothing, quietly, when the pull brings nothing new", () => {
    const { run, file } = setup();
    const result = run();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.calls).toContain("compose pull --quiet omb caddy");
    expect(result.calls).not.toContain("backup");
    expect(result.calls.some(call => call.startsWith("compose up"))).toBe(false);
    expect(file("run_omb")).toBe("sha256:old");
  });

  it("backs up, keeps the old image as :anterior and runs the new one when it comes up healthy", () => {
    const { run, file } = setup({ remote: "sha256:new" });
    const result = run();
    expect(result.status, result.stderr).toBe(0);
    expect(result.calls.indexOf("backup")).toBeGreaterThan(result.calls.indexOf("compose pull --quiet omb caddy"));
    expect(result.calls.indexOf("backup")).toBeLessThan(result.calls.indexOf("compose up -d"));
    expect(file("run_omb")).toBe("sha256:new");
    expect(file("tag_ghcr.io_otaviobmarques_sistema-otavio-bot_anterior")).toBe("sha256:old");
    expect(result.stdout).toContain("atualizado: ver-old (rev. revold) → ver-new (rev. revnew)");
  });

  it("goes back to the previous image when the new one is unhealthy, and does not try that one again", () => {
    const { run, file, lib } = setup({ remote: "sha256:new", health: "unhealthy" });
    const result = run();
    expect(result.status).toBe(1);
    expect(result.calls.filter(call => call === "compose up -d")).toHaveLength(2);
    expect(file("run_omb")).toBe("sha256:old");
    expect(file(`tag_${OMB_LATEST}`)).toBe("sha256:old");
    expect(result.stderr).toContain("não ficou saudável");
    expect(result.stderr).toContain("o servidor voltou para ver-old");
    expect(readFileSync(join(lib, "versao-recusada"), "utf8").trim()).toBe("sha256:new");

    const again = run();
    expect(again.status, again.stderr).toBe(0);
    expect(again.stdout).toContain("já falhou aqui");
    expect(again.calls.filter(call => call === "compose up -d")).toHaveLength(2);
    expect(again.calls.filter(call => call === "backup")).toHaveLength(1);
    expect(file(`tag_${OMB_LATEST}`)).toBe("sha256:old");
  });

  it("does not update when the backup fails", () => {
    const { run, file } = setup({ remote: "sha256:new", backupFails: true });
    const result = run();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("o backup falhou: não atualizei");
    expect(result.calls.some(call => call.startsWith("compose up"))).toBe(false);
    expect(file("run_omb")).toBe("sha256:old");
    expect(file(`tag_${OMB_LATEST}`)).toBe("sha256:old");
  });

  it("leaves a version fixed in .env alone, and a stopped stack stopped", () => {
    const pinned = setup({ remote: "sha256:new", version: "0.2.0" }).run();
    expect(pinned.status, pinned.stderr).toBe(0);
    expect(pinned.stdout).toContain("versão fixada no .env (OTAVIO_BOT_VERSION=0.2.0)");
    expect(pinned.calls).toEqual([]);

    const stopped = setup({ remote: "sha256:new", running: false }).run();
    expect(stopped.status, stopped.stderr).toBe(0);
    expect(stopped.stdout).toContain("não está rodando");
    expect(stopped.calls.some(call => call.startsWith("compose pull"))).toBe(false);
  });

  it("runs once at a time", () => {
    const { run, lib } = setup({ remote: "sha256:new" });
    const result = run(["flock", join(lib, "atualizar.lock")]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("outra atualização já está rodando");
    expect(result.calls).toEqual([]);
  });
});
