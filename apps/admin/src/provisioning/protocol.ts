// The contract between the Admin and the node agent (src/node-agent). The agent pulls the desired set of instances for
// its node and pushes back what it saw; nothing ever connects to the node. Shared by both sides, so it imports only zod.
import { z } from "zod";

export const AGENT_API = "/api/agent/v1";
export const NODE_TOKEN_PATTERN = /^arko_node_[A-Za-z0-9_-]{43}$/;

/** Every container and volume the agent makes carries these; it never touches anything without them. */
export const LABEL_MANAGED = "arkobot.managed";
export const LABEL_INSTANCE = "arkobot.instance";
export const LABEL_NODE = "arkobot.node";
export const LABEL_REVISION = "arkobot.revision";
export const LABEL_SLUG = "arkobot.slug";
/** On the relay containers of a shared node (edges): kept apart from the instances' containers. */
export const LABEL_EDGE = "arkobot.edge";
/** On a backup or restore helper container: the task it runs (src/node-agent/tasks.ts). */
export const LABEL_TASK = "arkobot.task";

const SLUG = /^[a-z0-9][a-z0-9-]{1,62}$/;
const ENV_NAME = /^[A-Z][A-Z0-9_]{0,63}$/;

export const desiredInstanceSchema = z.object({
  id: z.uuid(),
  slug: z.string().regex(SLUG),
  /** running: create or start it; stopped: stop it; absent: remove the container (never the volume). */
  desired: z.enum(["running", "stopped", "absent"]),
  /** Stopped because it sleeps (a plan that sleeps when idle): a visit to its address wakes it (the agent's waking page). */
  sleeping: z.boolean().default(false),
  host: z.string().min(3).max(253),
  image: z.string().min(3).max(300),
  /** Changes whenever anything below (or the generation) changes: the agent then recreates the container. */
  revision: z.string().regex(/^[0-9a-f]{16,64}$/),
  env: z.record(z.string().regex(ENV_NAME), z.string().max(4096)),
  resources: z.object({
    memoryMb: z.number().int().min(256).max(262_144),
    cpus: z.number().min(0.1).max(64),
    pids: z.number().int().min(64).max(65_536),
  }),
});
export type DesiredInstance = z.infer<typeof desiredInstanceSchema>;

/** An instance that runs on a customer's own VPS: this (shared) node's Traefik passes its TLS connections through to it. */
export const desiredEdgeSchema = z.object({
  id: z.uuid(),
  slug: z.string().regex(SLUG),
  host: z.string().min(3).max(253),
  target: z.string().regex(/^(?:\d{1,3}\.){3}\d{1,3}:\d{1,5}$/),
});
export type DesiredEdge = z.infer<typeof desiredEdgeSchema>;

/**
 * A job the agent runs beside the instances (src/node-agent/tasks.ts). backup: freeze the instance's container a moment,
 * pack its volume, send it to the backup store through part URLs the Admin signs. restore: unpack `url` (a signed download
 * link) into the volume of an instance that has no container on this node yet.
 */
export const desiredTaskSchema = z.object({
  id: z.uuid(),
  kind: z.enum(["backup", "restore"]),
  instanceId: z.uuid(),
  slug: z.string().regex(SLUG),
  url: z.url().max(4096).optional(),
});
export type DesiredTask = z.infer<typeof desiredTaskSchema>;

export const desiredStateSchema = z.object({
  node: z.object({ id: z.uuid(), name: z.string() }),
  pollSeconds: z.number().int().min(5).max(600),
  instances: z.array(desiredInstanceSchema).max(1000),
  edges: z.array(desiredEdgeSchema).max(1000).default([]),
  tasks: z.array(desiredTaskSchema).max(200).default([]),
  /**
   * Only on a customer's extra VPS (a "computer" for its bots): the SSH login its ArkoBot uses. The agent keeps
   * /home/<user>/.ssh/authorized_keys equal to these lines (each one carries its own from="…" restriction).
   */
  sshAccess: z.object({ user: z.string().regex(/^[a-z_][a-z0-9_-]{0,31}$/), keys: z.array(z.string().min(20).max(2000)).max(8) }).nullable().default(null),
});
export type DesiredState = z.infer<typeof desiredStateSchema>;

export const observedInstanceSchema = z.object({
  id: z.uuid(),
  state: z.enum(["running", "starting", "stopped", "absent", "error"]),
  health: z.enum(["healthy", "unhealthy", "starting", "none"]).nullable().default(null),
  containerId: z.string().regex(/^[0-9a-f]{12,64}$/).nullable().default(null),
  revision: z.string().max(64).nullable().default(null),
  error: z.string().max(2000).nullable().default(null),
  /** The instance's data volume as the agent last measured it (at most every ~10 min); absent when not measured yet. */
  disk: z.object({ bytes: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER), measuredAt: z.iso.datetime() }).optional(),
});
export type ObservedInstance = z.infer<typeof observedInstanceSchema>;

export const statusReportSchema = z.object({
  agentVersion: z.string().max(40),
  instances: z.array(observedInstanceSchema).max(1000),
  /** Managed containers on this node that the desired state does not name. */
  orphans: z.array(z.string().max(64)).max(1000).default([]),
  error: z.string().max(2000).nullable().default(null),
  /** This server's SSH host public keys (/etc/ssh/ssh_host_*_key.pub), so an ArkoBot that logs in never trusts on first use. */
  sshHostKeys: z.array(z.string().regex(/^(ssh-ed25519|ecdsa-sha2-nistp(?:256|384|521)|ssh-rsa) [A-Za-z0-9+/]+={0,3}$/)).max(8).optional(),
});
export type StatusReport = z.infer<typeof statusReportSchema>;

/** The Admin's nudge to a node's waking page after it woke an instance there: a visit that always wakes. */
export const WAKE_POKE_HEADER = "x-arkobot-wake";

/** A backup helper asks for the URL of one part of its upload (S3 parts: 5 MiB at least, except the last). */
export const BACKUP_PART_BYTES = 64 * 1024 * 1024;
export const taskPartRequestSchema = z.object({ partNumber: z.number().int().min(1).max(10_000) });
export const taskCompleteSchema = z.object({
  parts: z.array(z.object({ partNumber: z.number().int().min(1).max(10_000), etag: z.string().min(1).max(200) })).min(1).max(10_000),
  bytes: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
});
export const taskFailSchema = z.object({ error: z.string().max(1000) });

/** The agent's waking page asks the Admin to wake a sleeping instance someone just visited. */
export const wakeRequestSchema = z.object({ instanceId: z.uuid() });
export const wakeAnswerSchema = z.object({ ok: z.boolean(), state: z.enum(["waking", "awake", "not_sleeping", "unknown"]) });
export type WakeAnswer = z.infer<typeof wakeAnswerSchema>;
