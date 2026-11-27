// On a shared node: one small relay container per instance that lives on a customer's own VPS. Traefik's TCP router
// matches the instance's address by SNI and passes the TLS connection through untouched (the customer's VPS holds the
// certificate); the relay forwards the bytes to that VPS's port 443. Same rules as the instances: only containers with
// this node's labels are touched, and only the relays are ever removed here.
import { createHash } from "node:crypto";
import { LABEL_EDGE, LABEL_INSTANCE, LABEL_MANAGED, LABEL_NODE, LABEL_REVISION, LABEL_SLUG, type DesiredEdge } from "../provisioning/protocol.ts";
import type { ContainerSummary, DockerApi } from "./docker.ts";
import type { Log } from "./reconcile.ts";
import type { NodeSettings } from "./spec.ts";

export const RELAY_PORT = 8443;
export const DEFAULT_RELAY_IMAGE = "ghcr.io/otaviobmarques/arkobot-node-agent:latest";

export const edgeName = (edge: Pick<DesiredEdge, "slug">) => `arkoedge-${edge.slug}`;

export function isOurEdge(labels: Record<string, string> | null | undefined, nodeId: string): boolean {
  return labels?.[LABEL_MANAGED] === "true" && labels?.[LABEL_NODE] === nodeId && labels?.[LABEL_EDGE] === "true";
}

export function edgeRevision(edge: DesiredEdge, node: NodeSettings, image: string): string {
  return createHash("sha256").update(JSON.stringify([edge.host, edge.target, node.network, node.entrypoint, image])).digest("hex").slice(0, 32);
}

export function edgeSpec(edge: DesiredEdge, node: NodeSettings, image: string): Record<string, unknown> {
  const router = edgeName(edge);
  return {
    Image: image,
    Cmd: ["node", "relay.mjs"],
    User: "node",
    Env: [`RELAY_TARGET=${edge.target}`, `RELAY_PORT=${RELAY_PORT}`],
    Labels: {
      [LABEL_MANAGED]: "true", [LABEL_NODE]: node.nodeId, [LABEL_INSTANCE]: edge.id, [LABEL_SLUG]: edge.slug, [LABEL_EDGE]: "true",
      [LABEL_REVISION]: edgeRevision(edge, node, image),
      "traefik.enable": "true",
      "traefik.docker.network": node.network,
      [`traefik.tcp.routers.${router}.rule`]: `HostSNI(\`${edge.host}\`)`,
      [`traefik.tcp.routers.${router}.entrypoints`]: node.entrypoint,
      [`traefik.tcp.routers.${router}.tls.passthrough`]: "true",
      [`traefik.tcp.routers.${router}.service`]: router,
      [`traefik.tcp.services.${router}.loadbalancer.server.port`]: String(RELAY_PORT),
    },
    HostConfig: {
      NetworkMode: node.network,
      Memory: 96 * 1024 * 1024,
      MemorySwap: 96 * 1024 * 1024,
      NanoCpus: 250_000_000,
      PidsLimit: 64,
      RestartPolicy: { Name: "unless-stopped" },
      ReadonlyRootfs: true,
      CapDrop: ["ALL"],
      SecurityOpt: ["no-new-privileges"],
      LogConfig: { Type: "json-file", Config: { "max-size": "5m", "max-file": "2" } },
      Privileged: false,
    },
  };
}

async function removeEdge(docker: DockerApi, container: ContainerSummary, nodeId: string): Promise<void> {
  const details = await docker.inspectContainer(container.Id);
  if (!isOurEdge(details.Config.Labels, nodeId)) throw new Error("contêiner sem as etiquetas de borda do ArkoBot: não mexo nele");
  if (details.State.Running) await docker.stopContainer(container.Id, 5);
  await docker.removeContainer(container.Id);
}

/** Creates, recreates and removes this node's relays to match `edges`. Returns the problems, if any, for the report. */
export async function reconcileEdges(docker: DockerApi, node: NodeSettings, edges: DesiredEdge[], image: string, log: Log): Promise<string | null> {
  const listed = (await docker.listContainers(`${LABEL_EDGE}=true`)).filter((container) => isOurEdge(container.Labels, node.nodeId));
  const byInstance = new Map(listed.map((container) => [container.Labels[LABEL_INSTANCE]!, container]));
  const wanted = new Set(edges.map((edge) => edge.id));
  const problems: string[] = [];
  for (const container of listed) {
    if (wanted.has(container.Labels[LABEL_INSTANCE]!)) continue;
    try {
      log(`borda ${container.Labels[LABEL_SLUG] ?? container.Id.slice(0, 12)}: removendo`);
      await removeEdge(docker, container, node.nodeId);
    } catch (error) {
      problems.push((error as Error).message);
    }
  }
  let pulled = false;
  for (const edge of edges) {
    try {
      let current = byInstance.get(edge.id) ?? null;
      if (current && current.Labels[LABEL_REVISION] !== edgeRevision(edge, node, image)) {
        await removeEdge(docker, current, node.nodeId);
        current = null;
      }
      if (!current) {
        if (!pulled) {
          await docker.pullImage(image).catch(async (error) => {
            if (!(await docker.imageExists(image))) throw error;
          });
          pulled = true;
        }
        log(`borda ${edge.slug}: ${edge.host} → ${edge.target}`);
        const id = await docker.createContainer(edgeName(edge), edgeSpec(edge, node, image));
        await docker.startContainer(id);
        continue;
      }
      if (current.State !== "running") await docker.startContainer(current.Id);
    } catch (error) {
      problems.push(`borda ${edge.slug}: ${(error as Error).message}`);
    }
  }
  return problems.length ? problems.join("; ").slice(0, 2000) : null;
}
