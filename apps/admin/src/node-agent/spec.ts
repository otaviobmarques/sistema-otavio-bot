// The Docker container an instance runs as. Only a named volume for /data: no bind mount, no Docker socket, no host
// network, no privileged mode or added capabilities. Traefik on the node reaches it by its labels.
import { createHash } from "node:crypto";
import { LABEL_INSTANCE, LABEL_MANAGED, LABEL_NODE, LABEL_REVISION, LABEL_SLUG, type DesiredInstance } from "../provisioning/protocol.ts";

/** Node-local settings, from the agent's environment. */
export interface NodeSettings {
  nodeId: string;
  /** The Docker network the instances join; Traefik must be attached to it. */
  network: string;
  entrypoint: string;
  certResolver: string;
  /** Who may name the client to the instance's edge (OMB_CLOUD_TRUSTED_PROXIES): the network's subnet, where Traefik is. */
  trustedProxies: string | null;
}

export const LABEL_AGENT_CONFIG = "arkobot.agent-config";
/** The image's own supervisor stops its children within 20 s of SIGTERM (server/cloud-home-start.ts). */
export const STOP_TIMEOUT_S = 30;

export const containerName = (instance: Pick<DesiredInstance, "slug">) => `arkoinst-${instance.slug}`;
/** By instance id, not slug: a new slug never strands the data. */
export const volumeName = (instance: Pick<DesiredInstance, "id">) => `arkoinst-${instance.id}-data`;

export function managedLabels(nodeId: string, instance: Pick<DesiredInstance, "id" | "slug">): Record<string, string> {
  return { [LABEL_MANAGED]: "true", [LABEL_NODE]: nodeId, [LABEL_INSTANCE]: instance.id, [LABEL_SLUG]: instance.slug };
}

/** Changes when a node-local setting that shapes the container changes, so the container is recreated with it. */
export function agentConfigHash(node: NodeSettings): string {
  return createHash("sha256").update(JSON.stringify([node.network, node.entrypoint, node.certResolver, node.trustedProxies])).digest("hex").slice(0, 16);
}

export function containerSpec(instance: DesiredInstance, node: NodeSettings): Record<string, unknown> {
  const router = containerName(instance);
  const env = { ...instance.env, ...(node.trustedProxies ? { OMB_CLOUD_TRUSTED_PROXIES: node.trustedProxies } : {}) };
  const memory = instance.resources.memoryMb * 1024 * 1024;
  return {
    Image: instance.image,
    Env: Object.entries(env).map(([key, value]) => `${key}=${value}`),
    StopTimeout: STOP_TIMEOUT_S,
    Labels: {
      ...managedLabels(node.nodeId, instance),
      [LABEL_REVISION]: instance.revision,
      [LABEL_AGENT_CONFIG]: agentConfigHash(node),
      "traefik.enable": "true",
      "traefik.docker.network": node.network,
      [`traefik.http.routers.${router}.rule`]: `Host(\`${instance.host}\`)`,
      [`traefik.http.routers.${router}.entrypoints`]: node.entrypoint,
      [`traefik.http.routers.${router}.tls`]: "true",
      [`traefik.http.routers.${router}.tls.certresolver`]: node.certResolver,
      [`traefik.http.routers.${router}.service`]: router,
      [`traefik.http.services.${router}.loadbalancer.server.port`]: "8080",
      // The event stream must pass at once.
      [`traefik.http.services.${router}.loadbalancer.responseforwarding.flushinterval`]: "-1",
    },
    HostConfig: {
      NetworkMode: node.network,
      Mounts: [{ Type: "volume", Source: volumeName(instance), Target: "/data" }],
      Memory: memory,
      MemorySwap: memory,
      NanoCpus: Math.round(instance.resources.cpus * 1e9),
      PidsLimit: instance.resources.pids,
      RestartPolicy: { Name: "unless-stopped" },
      // The bots' browsers leave exited processes for an init to collect, and Chrome wants shared memory (Dockerfile).
      Init: true,
      ShmSize: 512 * 1024 * 1024,
      LogConfig: { Type: "json-file", Config: { "max-size": "10m", "max-file": "3" } },
      Privileged: false,
    },
  };
}
