import { spawnSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

// The owner's VPS (docs/otavio-bot/VPS-24H.md): the fork's image, its compose
// stacks with and without another proxy in front, the scripts the guide runs,
// and the workflows that test and publish the image.
// A Windows checkout can turn LF into CRLF (core.autocrlf), so compare the text with LF line endings.
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const yaml = (path: string) => parse(read(path), { logLevel: "silent" });
const IMAGE = "ghcr.io/otaviobmarques/sistema-otavio-bot";
const SCRIPTS = ["deploy/ligar-desktops.sh", "deploy/backup.sh", "deploy/restaurar-backup.sh", "deploy/instalar-backup-diario.sh"];

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
