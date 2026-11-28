// Backups and restores on this node, driven by the desired state's `tasks` (src/backups on the Admin). Each step is a
// short-lived helper container from this agent's own image, so a long upload never blocks the agent's loop and an agent
// restart picks up where the containers are:
//   backup:  pause the instance's container (consistent SQLite files) → "pack" helper tars the volume into a staging
//            volume → unpause (seconds to a few minutes, at night) → "up" helper sends the archive in parts to the
//            store, through URLs the Admin signs, and tells the Admin it is done.
//   restore: before the instance has a container here, the "restore" helper downloads the archive (a signed URL) into
//            the instance's volume; the agent then tells the Admin, which moves the instance here.
// The helpers only ever touch the one instance volume and the staging volume. Nothing is logged with a URL or a token.
import { LABEL_INSTANCE, LABEL_MANAGED, LABEL_NODE, LABEL_TASK, type DesiredTask } from "../provisioning/protocol.ts";
import type { ContainerSummary, DockerApi } from "./docker.ts";
import type { Log } from "./reconcile.ts";
import { managedLabels, volumeName, type NodeSettings } from "./spec.ts";

export const STAGING_VOLUME = "arkobot-backup-staging";
export const helperName = (task: Pick<DesiredTask, "id">, phase: "pack" | "up" | "restore") => `arkotask-${phase}-${task.id}`;

export interface TaskContext {
  /** This agent's image (it ships task-helper.mjs). */
  image: string;
  adminUrl: string;
  token: string;
  log: Log;
  /** POST to the Admin's agent API (path under /api/agent/v1). */
  call: (path: string, body: unknown) => Promise<unknown>;
}

const taskLabels = (node: NodeSettings, task: DesiredTask) => ({
  [LABEL_MANAGED]: "true", [LABEL_NODE]: node.nodeId, [LABEL_TASK]: task.id, "arkobot.task-instance": task.instanceId,
});

const isOurHelper = (labels: Record<string, string> | null | undefined, nodeId: string) =>
  labels?.[LABEL_MANAGED] === "true" && labels?.[LABEL_NODE] === nodeId && typeof labels?.[LABEL_TASK] === "string";

function helperSpec(image: string, labels: Record<string, string>, mounts: { volume: string; target: string; readOnly?: boolean }[], cmd: string[], env: Record<string, string>, network: boolean) {
  return {
    Image: image,
    Cmd: cmd,
    Env: Object.entries(env).map(([key, value]) => `${key}=${value}`),
    Labels: labels,
    WorkingDir: "/app",
    HostConfig: {
      Mounts: mounts.map((mount) => ({ Type: "volume", Source: mount.volume, Target: mount.target, ReadOnly: mount.readOnly ?? false })),
      NetworkMode: network ? "bridge" : "none",
      Memory: 512 * 1024 * 1024,
      RestartPolicy: { Name: "no" },
      SecurityOpt: ["no-new-privileges"],
    },
  };
}

/** tar exits 1 for "a file changed while read": harmless here (the container is frozen); anything else fails. */
const PACK_SCRIPT = `set -u; rm -f "/stage/$ID.tgz" "/stage/$ID.tgz.part"; tar -C /v --numeric-owner -czf "/stage/$ID.tgz.part" .; rc=$?; `
  + `if [ $rc -gt 1 ]; then rm -f "/stage/$ID.tgz.part"; exit $rc; fi; mv "/stage/$ID.tgz.part" "/stage/$ID.tgz"`;

async function byName(docker: DockerApi, list: ContainerSummary[], name: string) {
  const summary = list.find((container) => container.Names.includes(`/${name}`));
  return summary ? { summary, details: await docker.inspectContainer(summary.Id) } : null;
}

async function remove(docker: DockerApi, id: string) {
  const details = await docker.inspectContainer(id).catch(() => null);
  if (!details) return;
  if (details.State.Running) await docker.stopContainer(id, 10);
  await docker.removeContainer(id);
}

/** One pass over this node's tasks. Never throws for one task: a failure is told to the Admin and the rest go on. */
export async function reconcileTasks(docker: DockerApi, node: NodeSettings, tasks: DesiredTask[], context: TaskContext): Promise<void> {
  const managed = await docker.listContainers(`${LABEL_MANAGED}=true`);
  const helpers = managed.filter((container) => isOurHelper(container.Labels, node.nodeId));
  const instanceContainer = (instanceId: string) => managed.find((container) =>
    container.Labels[LABEL_NODE] === node.nodeId && container.Labels[LABEL_INSTANCE] === instanceId && container.Labels[LABEL_TASK] === undefined);
  const wanted = new Set(tasks.map((task) => task.id));

  // Helpers of tasks the Admin no longer lists (done, failed, timed out): gone.
  for (const helper of helpers) {
    if (!wanted.has(helper.Labels[LABEL_TASK]!)) await remove(docker, helper.Id).catch(() => undefined);
  }

  const fail = async (task: DesiredTask, error: string) => {
    context.log(`${task.slug}: ${task.kind === "backup" ? "backup" : "restauração"} falhou (${error})`);
    await context.call(`/tasks/${task.id}/fail`, { error: error.slice(0, 1000) }).catch(() => undefined);
  };

  for (const task of tasks) {
    try {
      if (task.kind === "backup") await backupStep(docker, node, task, managed, instanceContainer(task.instanceId) ?? null, context, fail);
      else await restoreStep(docker, node, task, managed, instanceContainer(task.instanceId) ?? null, context, fail);
    } catch (error) {
      await fail(task, (error as Error).message.slice(0, 300));
    }
  }

  // Never leave an instance frozen: a paused one with no running pack helper is thawed.
  const now = await docker.listContainers(`${LABEL_MANAGED}=true`);
  const packing = new Set(now.filter((c) => isOurHelper(c.Labels, node.nodeId))
    .filter((helper) => helper.Names.some((name) => name.startsWith("/arkotask-pack-")) && helper.State === "running")
    .map((helper) => helper.Labels["arkobot.task-instance"]));
  for (const container of now) {
    if (container.State !== "paused" || container.Labels[LABEL_NODE] !== node.nodeId || container.Labels[LABEL_TASK] !== undefined) continue;
    if (packing.has(container.Labels[LABEL_INSTANCE])) continue;
    await docker.unpauseContainer(container.Id).catch(() => undefined);
  }
}

async function backupStep(docker: DockerApi, node: NodeSettings, task: DesiredTask, managed: ContainerSummary[], instance: ContainerSummary | null,
  context: TaskContext, fail: (task: DesiredTask, error: string) => Promise<void>) {
  const up = await byName(docker, managed, helperName(task, "up"));
  if (up) {
    if (up.details.State.Running) return;
    const code = up.details.State.ExitCode ?? 0;
    // The helper told the Admin itself (complete or fail); a crash before that is told here.
    if (code !== 0) await fail(task, `envio terminou com código ${code}`);
    await remove(docker, up.summary.Id);
    const pack = await byName(docker, managed, helperName(task, "pack"));
    if (pack) await remove(docker, pack.summary.Id);
    return;
  }
  const pack = await byName(docker, managed, helperName(task, "pack"));
  if (pack) {
    if (pack.details.State.Running) return;
    if (instance && instance.State === "paused") await docker.unpauseContainer(instance.Id);
    const code = pack.details.State.ExitCode ?? 0;
    if (code !== 0) {
      await remove(docker, pack.summary.Id);
      await fail(task, `empacotar terminou com código ${code}`);
      return;
    }
    context.log(`${task.slug}: dados empacotados; enviando o backup`);
    const id = await docker.createContainer(helperName(task, "up"), helperSpec(context.image, taskLabels(node, task),
      [{ volume: STAGING_VOLUME, target: "/stage" }], ["node", "task-helper.mjs", "upload"],
      { ARKO_ADMIN_URL: context.adminUrl, ARKO_NODE_TOKEN: context.token, ARKO_TASK_ID: task.id, ARKO_FILE: `/stage/${task.id}.tgz` }, true));
    await docker.startContainer(id);
    return;
  }
  // Start: freeze the instance (if it runs) so its files are consistent, then pack.
  await docker.createVolume(volumeName({ id: task.instanceId }), managedLabels(node.nodeId, { id: task.instanceId, slug: task.slug }));
  await docker.createVolume(STAGING_VOLUME, { [LABEL_MANAGED]: "true", [LABEL_NODE]: node.nodeId });
  if (instance && instance.State === "running") await docker.pauseContainer(instance.Id);
  context.log(`${task.slug}: backup começou${instance?.State === "running" ? " (contêiner congelado enquanto empacota)" : ""}`);
  try {
    const id = await docker.createContainer(helperName(task, "pack"), helperSpec(context.image, taskLabels(node, task),
      [{ volume: volumeName({ id: task.instanceId }), target: "/v", readOnly: true }, { volume: STAGING_VOLUME, target: "/stage" }],
      ["sh", "-c", PACK_SCRIPT], { ID: task.id }, false));
    await docker.startContainer(id);
  } catch (error) {
    if (instance && instance.State === "running") await docker.unpauseContainer(instance.Id).catch(() => undefined);
    throw error;
  }
}

async function restoreStep(docker: DockerApi, node: NodeSettings, task: DesiredTask, managed: ContainerSummary[], instance: ContainerSummary | null,
  context: TaskContext, fail: (task: DesiredTask, error: string) => Promise<void>) {
  const helper = await byName(docker, managed, helperName(task, "restore"));
  if (helper) {
    if (helper.details.State.Running) return;
    const code = helper.details.State.ExitCode ?? 0;
    await remove(docker, helper.summary.Id);
    if (code !== 0) return fail(task, `restauração terminou com código ${code}`);
    context.log(`${task.slug}: dados restaurados`);
    await context.call(`/tasks/${task.id}/restored`, {});
    return;
  }
  // The instance must not run here while its data is written.
  if (instance) return fail(task, "a instância já tem um contêiner neste servidor");
  if (!task.url) return fail(task, "restauração sem endereço do backup");
  await docker.createVolume(volumeName({ id: task.instanceId }), managedLabels(node.nodeId, { id: task.instanceId, slug: task.slug }));
  context.log(`${task.slug}: restaurando os dados do backup`);
  const id = await docker.createContainer(helperName(task, "restore"), helperSpec(context.image, taskLabels(node, task),
    [{ volume: volumeName({ id: task.instanceId }), target: "/v" }], ["node", "task-helper.mjs", "restore"], { ARKO_RESTORE_URL: task.url }, true));
  await docker.startContainer(id);
}
