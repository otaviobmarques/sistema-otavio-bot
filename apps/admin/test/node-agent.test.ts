import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { agentConfig, createAgent } from "../src/node-agent/main.ts";
import { splitImage } from "../src/node-agent/docker.ts";
import { attachProxy, prepareNetwork, reconcile } from "../src/node-agent/reconcile.ts";
import { containerSpec, type NodeSettings } from "../src/node-agent/spec.ts";
import type { DesiredInstance, DesiredState } from "../src/provisioning/protocol.ts";
import { planResources } from "../src/provisioning/settings.ts";
import { FakeDocker } from "./fake-docker.ts";

const NODE = randomUUID();
const node: NodeSettings = { nodeId: NODE, network: "arkobot-instances", entrypoint: "websecure", certResolver: "letsencrypt", trustedProxies: "172.30.0.0/16" };
const IMAGE = "ghcr.io/otaviobmarques/sistema-otavio-bot-cloud-home:latest";
const TOKEN = `arko_node_${"a".repeat(43)}`;

function instance(overrides: Partial<DesiredInstance> = {}): DesiredInstance {
  const id = overrides.id ?? randomUUID();
  return {
    id, slug: "padaria", desired: "running", sleeping: false, host: "padaria.arkobot.com.br", image: IMAGE, revision: "a".repeat(32),
    env: { OMB_CLOUD_ROLE: "home", OMB_CLOUD_BOOTSTRAP_SECRET: "segredo-que-nunca-aparece-no-log" }, resources: { memoryMb: 1024, cpus: 0.5, pids: 512 },
    ...overrides,
  };
}
const state = (...instances: DesiredInstance[]): DesiredState => ({ node: { id: NODE, name: "vps-1" }, pollSeconds: 15, instances, edges: [], tasks: [], sshAccess: null });

describe("agente do nó", () => {
  it("never touches a container without its labels or with another node's, and reports managed ones it was not asked for", async () => {
    const docker = new FakeDocker();
    const foreign = docker.addForeign("n8n", { "com.docker.compose.project": "outro-projeto" });
    const otherNode = docker.addForeign("arkoinst-outro", { "arkobot.managed": "true", "arkobot.node": randomUUID(), "arkobot.instance": randomUUID() });
    const orphan = docker.addForeign("arkoinst-velho", { "arkobot.managed": "true", "arkobot.node": NODE, "arkobot.instance": randomUUID() });
    const report = await reconcile(docker, node, state(), "t", () => undefined);
    expect(report.orphans).toEqual([orphan.slice(0, 12)]);
    expect(docker.calls).toEqual([]);
    for (const id of [foreign, otherNode, orphan]) expect(docker.containers.get(id)?.running).toBe(true);

    // A container squatting on the instance's name is reported, not replaced.
    docker.images.add(IMAGE);
    docker.addForeign("arkoinst-padaria", { app: "alheio" });
    const blocked = await reconcile(docker, node, state(instance()), "t", () => undefined);
    expect(blocked.instances[0]).toMatchObject({ state: "error" });
    expect(docker.containers.size).toBe(4);
  });

  it("stops, removes and recreates only its own containers, and never removes a volume", async () => {
    const docker = new FakeDocker();
    const logs: string[] = [];
    const log = (line: string) => logs.push(line);
    const desired = instance();
    expect((await reconcile(docker, node, state(desired), "t", log)).instances[0]).toMatchObject({ state: "running", health: "healthy", revision: desired.revision });
    expect((await reconcile(docker, node, state({ ...desired, desired: "stopped" }), "t", log)).instances[0]).toMatchObject({ state: "stopped" });
    expect(docker.byName("arkoinst-padaria")?.running).toBe(false);
    expect((await reconcile(docker, node, state(desired), "t", log)).instances[0]).toMatchObject({ state: "running" });
    docker.calls = [];
    await reconcile(docker, node, state({ ...desired, revision: "b".repeat(32) }), "t", log);
    expect(docker.calls).toEqual(["stop arkoinst-padaria", "remove arkoinst-padaria", `pull ${IMAGE}`, "create arkoinst-padaria", "start arkoinst-padaria"]);
    // A node-local change (who may name the client) also recreates it; the same state again does nothing.
    docker.calls = [];
    const moved = { ...node, trustedProxies: "10.0.0.0/8" };
    await reconcile(docker, moved, state({ ...desired, revision: "b".repeat(32) }), "t", log);
    await reconcile(docker, moved, state({ ...desired, revision: "b".repeat(32) }), "t", log);
    expect(docker.calls.filter((call) => call.startsWith("create"))).toHaveLength(1);
    expect((await reconcile(docker, node, state({ ...desired, desired: "absent" }), "t", log)).instances[0]).toMatchObject({ state: "absent" });
    expect(docker.byName("arkoinst-padaria")).toBeUndefined();
    expect([...docker.volumes.keys()]).toEqual([`arkoinst-${desired.id}-data`]);
    expect(logs.join("\n")).not.toContain("segredo-que-nunca-aparece-no-log");
  });

  it("keeps going with the local image when a pull fails, and isolates one instance's error from the rest", async () => {
    const docker = new FakeDocker();
    docker.pullFails = true;
    const report = await reconcile(docker, node, state(instance({ slug: "sem-imagem" })), "t", () => undefined);
    expect(report.instances[0]).toMatchObject({ state: "error", error: "registry down" });
    docker.images.add(IMAGE);
    const both = await reconcile(docker, node, state(instance({ slug: "a1" }), instance({ slug: "b2", image: "ghcr.io/nada:1" })), "t", () => undefined);
    expect(both.instances.map((i) => i.state)).toEqual(["running", "error"]);
  });

  it("gives each container limits, a volume, Traefik labels and nothing of the host", () => {
    const spec = containerSpec(instance(), node) as any;
    expect(spec.HostConfig).toMatchObject({ Memory: 1024 ** 3, MemorySwap: 1024 ** 3, NanoCpus: 5e8, PidsLimit: 512, Privileged: false, NetworkMode: "arkobot-instances",
      RestartPolicy: { Name: "unless-stopped" }, Init: true });
    expect(spec.HostConfig.Mounts).toEqual([{ Type: "volume", Source: expect.stringMatching(/^arkoinst-.*-data$/), Target: "/data" }]);
    expect(spec.HostConfig.Binds).toBeUndefined();
    expect(spec.Env).toContain("OMB_CLOUD_TRUSTED_PROXIES=172.30.0.0/16");
    expect(spec.Labels["traefik.http.services.arkoinst-padaria.loadbalancer.server.port"]).toBe("8080");
    expect(planResources(1024)).toEqual({ memoryMb: 1024, cpus: 0.5, pids: 512 });
    expect(planResources(4096)).toEqual({ memoryMb: 4096, cpus: 2, pids: 2048 });
    expect(planResources(8192).cpus).toBe(4);
    expect(splitImage(IMAGE)).toEqual({ fromImage: "ghcr.io/otaviobmarques/sistema-otavio-bot-cloud-home", tag: "latest" });
    expect(splitImage("localhost:5000/img")).toEqual({ fromImage: "localhost:5000/img", tag: "latest" });
    expect(splitImage("img@sha256:abc")).toEqual({ fromImage: "img@sha256:abc", tag: null });
  });

  it("changes nothing while the Admin is unreachable, and backs off", async () => {
    const docker = new FakeDocker();
    const config = agentConfig({ ARKO_ADMIN_URL: "https://admin.test", ARKO_NODE_TOKEN: TOKEN });
    const down = createAgent(config, { docker, fetch: (async () => { throw new TypeError("fetch failed"); }) as typeof fetch, log: () => undefined });
    const waits = [await down.once(), await down.once(), await down.once()];
    expect(waits).toEqual([30, 60, 120]);
    expect(docker.calls).toEqual([]);
    const refused = createAgent(config, { docker, fetch: (async () => new Response("{}", { status: 401 })) as typeof fetch, log: () => undefined });
    await refused.once();
    expect(docker.calls).toEqual([]);
  });

  it("reads its configuration from the environment and refuses a bad one", () => {
    expect(() => agentConfig({})).toThrow(/ARKO_ADMIN_URL/);
    expect(() => agentConfig({ ARKO_ADMIN_URL: "http://admin.arkobot.com.br", ARKO_NODE_TOKEN: TOKEN })).toThrow(/https/);
    expect(() => agentConfig({ ARKO_ADMIN_URL: "https://admin.arkobot.com.br", ARKO_NODE_TOKEN: "x" })).toThrow(/ARKO_NODE_TOKEN/);
    const config = agentConfig({ ARKO_ADMIN_URL: "https://admin.arkobot.com.br/", ARKO_NODE_TOKEN: TOKEN, ARKO_REGISTRY_USER: "u", ARKO_REGISTRY_TOKEN: "p" });
    expect(config).toMatchObject({ adminUrl: "https://admin.arkobot.com.br", network: "arkobot-instances", socketPath: "/var/run/docker.sock" });
    expect(JSON.parse(Buffer.from(config.registryAuth!, "base64url").toString())).toEqual({ username: "u", password: "p", serveraddress: "ghcr.io" });
  });

  it("keeps Traefik attached to the instances' network, again after Traefik is recreated, and never invents it", async () => {
    const docker = new FakeDocker();
    await prepareNetwork(docker, "arkobot-instances", NODE);
    expect(await attachProxy(docker, "arkobot-instances", "traefik-traefik-1")).toBe("missing");
    docker.proxies.add("traefik-traefik-1");
    expect(await attachProxy(docker, "arkobot-instances", "traefik-traefik-1")).toBe("attached");
    expect(await attachProxy(docker, "arkobot-instances", "traefik-traefik-1")).toBe("already");
    docker.networks.get("arkobot-instances")!.Containers = {};
    expect(await attachProxy(docker, "arkobot-instances", "traefik-traefik-1")).toBe("attached");
    expect(docker.calls.filter((call) => call.startsWith("connect"))).toEqual(["connect traefik-traefik-1 arkobot-instances", "connect traefik-traefik-1 arkobot-instances"]);
  });

  it("names the Traefik container by default and lets it be turned off", () => {
    const base = { ARKO_ADMIN_URL: "https://admin.arkobot.com.br", ARKO_NODE_TOKEN: TOKEN };
    expect(agentConfig(base).proxyContainer).toBe("traefik-traefik-1");
    expect(agentConfig({ ...base, ARKO_TRAEFIK_CONTAINER: "" }).proxyContainer).toBeNull();
    expect(agentConfig({ ...base, ARKO_TRAEFIK_CONTAINER: "meu-traefik" }).proxyContainer).toBe("meu-traefik");
  });
});
