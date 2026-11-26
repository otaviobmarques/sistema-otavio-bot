// One pass of the agent: bring this node's Docker in line with the Admin's desired state. Idempotent. It only ever looks
// at containers labelled arkobot.managed=true with this node's id; anything else on the server is invisible to it. It
// removes a container only for an instance the Admin marked absent, and never removes a volume.
import { LABEL_AGENT_CONFIG, agentConfigHash, containerName, containerSpec, managedLabels, STOP_TIMEOUT_S, volumeName, type NodeSettings } from "./spec.ts";
import type { ContainerDetails, ContainerSummary, DockerApi } from "./docker.ts";
import {
  LABEL_INSTANCE, LABEL_MANAGED, LABEL_NODE, LABEL_REVISION, type DesiredInstance, type DesiredState, type ObservedInstance, type StatusReport,
} from "../provisioning/protocol.ts";

export type Log = (line: string) => void;

/** Whether this container is one this agent may touch: ours, and this node's. Checked again before every change. */
export function isOurs(labels: Record<string, string> | null | undefined, nodeId: string): boolean {
  return labels?.[LABEL_MANAGED] === "true" && labels?.[LABEL_NODE] === nodeId && typeof labels?.[LABEL_INSTANCE] === "string";
}

function observe(details: ContainerDetails, revision: string | null): Omit<ObservedInstance, "id"> {
  const status = details.State.Status;
  const health = details.State.Health?.Status;
  const healthValue = health === "healthy" || health === "unhealthy" || health === "starting" ? health : "none";
  const state: ObservedInstance["state"] = status === "running" ? "running" : status === "created" || status === "restarting" ? "starting" : "stopped";
  return {
    state, health: state === "stopped" ? null : healthValue, containerId: details.Id.slice(0, 64), revision,
    error: details.State.Error ? details.State.Error.slice(0, 500) : null,
  };
}

async function ensureImage(docker: DockerApi, image: string, log: Log): Promise<void> {
  try {
    await docker.pullImage(image);
  } catch (error) {
    // A registry hiccup must not stop an instance whose image is already here.
    if (!(await docker.imageExists(image))) throw error;
    log(`pull de ${image} falhou; usando a imagem que já está no servidor (${(error as Error).message})`);
  }
}

async function removeOurs(docker: DockerApi, container: ContainerSummary, nodeId: string): Promise<void> {
  const details = await docker.inspectContainer(container.Id);
  if (!isOurs(details.Config.Labels, nodeId)) throw new Error("contêiner sem as etiquetas do ArkoBot: não mexo nele");
  if (details.State.Running) await docker.stopContainer(container.Id, STOP_TIMEOUT_S);
  await docker.removeContainer(container.Id);
}

async function reconcileOne(docker: DockerApi, node: NodeSettings, instance: DesiredInstance, existing: ContainerSummary | null, log: Log): Promise<ObservedInstance> {
  const id = instance.id;
  if (instance.desired === "absent") {
    if (existing) {
      log(`${instance.slug}: desativada, removendo o contêiner (o volume ${volumeName(instance)} fica)`);
      await removeOurs(docker, existing, node.nodeId);
    }
    return { id, state: "absent", health: null, containerId: null, revision: null, error: null };
  }
  if (instance.desired === "stopped") {
    if (!existing) return { id, state: "absent", health: null, containerId: null, revision: null, error: null };
    const details = await docker.inspectContainer(existing.Id);
    if (!isOurs(details.Config.Labels, node.nodeId)) throw new Error("contêiner sem as etiquetas do ArkoBot: não mexo nele");
    if (details.State.Running || details.State.Restarting) {
      log(`${instance.slug}: parando`);
      await docker.stopContainer(existing.Id, STOP_TIMEOUT_S);
    }
    return { id, ...observe(await docker.inspectContainer(existing.Id), details.Config.Labels?.[LABEL_REVISION] ?? null) };
  }

  let current = existing;
  if (current) {
    const stale = current.Labels[LABEL_REVISION] !== instance.revision || current.Labels[LABEL_AGENT_CONFIG] !== agentConfigHash(node);
    if (stale) {
      log(`${instance.slug}: configuração nova, recriando o contêiner (os dados ficam no volume)`);
      await removeOurs(docker, current, node.nodeId);
      current = null;
    }
  }
  if (!current) {
    log(`${instance.slug}: criando o contêiner`);
    await ensureImage(docker, instance.image, log);
    await docker.createVolume(volumeName(instance), managedLabels(node.nodeId, instance));
    const containerId = await docker.createContainer(containerName(instance), containerSpec(instance, node));
    await docker.startContainer(containerId);
    return { id, ...observe(await docker.inspectContainer(containerId), instance.revision) };
  }
  const details = await docker.inspectContainer(current.Id);
  if (!isOurs(details.Config.Labels, node.nodeId)) throw new Error("contêiner sem as etiquetas do ArkoBot: não mexo nele");
  if (!details.State.Running && !details.State.Restarting) {
    log(`${instance.slug}: ligando`);
    await docker.startContainer(current.Id);
    return { id, ...observe(await docker.inspectContainer(current.Id), instance.revision) };
  }
  return { id, ...observe(details, instance.revision) };
}

export async function reconcile(docker: DockerApi, node: NodeSettings, desired: DesiredState, agentVersion: string, log: Log): Promise<StatusReport> {
  if (desired.node.id !== node.nodeId) throw new Error("o Admin respondeu com outro servidor");
  const listed = await docker.listContainers(`${LABEL_MANAGED}=true`);
  const ours = listed.filter((container) => isOurs(container.Labels, node.nodeId));
  const byInstance = new Map<string, ContainerSummary>();
  for (const container of ours) {
    const instanceId = container.Labels[LABEL_INSTANCE]!;
    if (!byInstance.has(instanceId)) byInstance.set(instanceId, container);
  }
  const wanted = new Set(desired.instances.map((instance) => instance.id));
  const instances: ObservedInstance[] = [];
  for (const instance of desired.instances) {
    try {
      instances.push(await reconcileOne(docker, node, instance, byInstance.get(instance.id) ?? null, log));
    } catch (error) {
      const message = (error as Error).message.slice(0, 500);
      log(`${instance.slug}: erro: ${message}`);
      instances.push({ id: instance.id, state: "error", health: null, containerId: null, revision: null, error: message });
    }
  }
  const orphans = ours.filter((container) => !wanted.has(container.Labels[LABEL_INSTANCE]!)).map((container) => container.Id.slice(0, 12));
  return { agentVersion, instances, orphans, error: null };
}

/** The node's network for instances: created when missing (labelled as ours), and its subnet for the instances' edge. */
export async function prepareNetwork(docker: DockerApi, name: string, nodeId: string): Promise<string | null> {
  let network = await docker.inspectNetwork(name);
  if (!network) {
    await docker.createNetwork(name, { [LABEL_MANAGED]: "true", [LABEL_NODE]: nodeId });
    network = await docker.inspectNetwork(name);
  }
  return network?.IPAM?.Config?.find((entry) => entry.Subnet)?.Subnet ?? null;
}

/**
 * Keeps the node's reverse proxy (Traefik) attached to the instances' network, so it can reach them while they stay
 * off the network the node's other projects use. Checked every loop: if Traefik is recreated, it is attached again.
 * Returns what happened, for the log; a missing proxy container changes nothing.
 */
export async function attachProxy(docker: DockerApi, network: string, proxy: string): Promise<"attached" | "already" | "missing"> {
  const details = await docker.inspectNetwork(network);
  const names = Object.values(details?.Containers ?? {}).map((entry) => entry.Name);
  if (names.includes(proxy)) return "already";
  return (await docker.connectNetwork(network, proxy)) ? "attached" : "missing";
}
