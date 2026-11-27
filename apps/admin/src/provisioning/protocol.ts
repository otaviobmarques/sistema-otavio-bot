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

const SLUG = /^[a-z0-9][a-z0-9-]{1,62}$/;
const ENV_NAME = /^[A-Z][A-Z0-9_]{0,63}$/;

export const desiredInstanceSchema = z.object({
  id: z.uuid(),
  slug: z.string().regex(SLUG),
  /** running: create or start it; stopped: stop it; absent: remove the container (never the volume). */
  desired: z.enum(["running", "stopped", "absent"]),
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

export const desiredStateSchema = z.object({
  node: z.object({ id: z.uuid(), name: z.string() }),
  pollSeconds: z.number().int().min(5).max(600),
  instances: z.array(desiredInstanceSchema).max(1000),
  edges: z.array(desiredEdgeSchema).max(1000).default([]),
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
});
export type StatusReport = z.infer<typeof statusReportSchema>;
