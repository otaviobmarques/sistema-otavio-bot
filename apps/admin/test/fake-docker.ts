import { randomBytes } from "node:crypto";
import type { ContainerDetails, ContainerSummary, DockerApi, NetworkDetails, VolumeUsage } from "../src/node-agent/docker.ts";

interface FakeContainer {
  id: string;
  name: string;
  labels: Record<string, string>;
  body: Record<string, unknown>;
  running: boolean;
  health: string | null;
}

/** An in-memory Docker daemon with the calls the agent makes, and a log of every change. */
export class FakeDocker implements DockerApi {
  containers = new Map<string, FakeContainer>();
  volumes = new Map<string, Record<string, string>>();
  networks = new Map<string, NetworkDetails>();
  images = new Set<string>();
  calls: string[] = [];
  pullFails = false;
  /** What each volume holds, in bytes, for GET /system/df (unset: -1, as Docker says for a size it does not know). */
  volumeBytes = new Map<string, number>();
  /** How many times the agent asked for volume sizes (a read, so not in `calls`). */
  dfCalls = 0;
  dfFails = false;
  /** What a started container's health check says. */
  healthOnStart: string | null = "healthy";

  addForeign(name: string, labels: Record<string, string>, running = true): string {
    const id = randomBytes(32).toString("hex");
    this.containers.set(id, { id, name, labels, body: {}, running, health: null });
    return id;
  }

  #get(id: string): FakeContainer {
    const container = this.containers.get(id);
    if (!container) throw Object.assign(new Error(`no such container ${id}`), { status: 404 });
    return container;
  }

  async listContainers(labelFilter: string): Promise<ContainerSummary[]> {
    const [key, value] = labelFilter.split("=");
    return [...this.containers.values()].filter((c) => c.labels[key!] === value)
      .map((c) => ({ Id: c.id, Names: [`/${c.name}`], Labels: { ...c.labels }, State: c.running ? "running" : "exited" }));
  }

  async inspectContainer(id: string): Promise<ContainerDetails> {
    const c = this.#get(id);
    return { Id: c.id, Config: { Labels: { ...c.labels } }, State: { Status: c.running ? "running" : "exited", Running: c.running, Health: c.health ? { Status: c.health } : null } };
  }

  async imageExists(image: string) {
    return this.images.has(image);
  }

  async pullImage(image: string) {
    this.calls.push(`pull ${image}`);
    if (this.pullFails) throw new Error("registry down");
    this.images.add(image);
  }

  async createVolume(name: string, labels: Record<string, string>) {
    if (!this.volumes.has(name)) this.calls.push(`volume ${name}`);
    this.volumes.set(name, labels);
  }

  async inspectNetwork(name: string) {
    return this.networks.get(name) ?? null;
  }

  async createNetwork(name: string) {
    this.calls.push(`network ${name}`);
    this.networks.set(name, { Name: name, IPAM: { Config: [{ Subnet: "172.30.0.0/16" }] } });
  }

  async createContainer(name: string, body: Record<string, unknown>) {
    if ([...this.containers.values()].some((c) => c.name === name)) throw Object.assign(new Error(`name ${name} in use`), { status: 409 });
    if (!this.images.has(String(body.Image))) throw new Error("no such image");
    const id = randomBytes(32).toString("hex");
    this.containers.set(id, { id, name, labels: { ...(body.Labels as Record<string, string>) }, body, running: false, health: null });
    this.calls.push(`create ${name}`);
    return id;
  }

  async startContainer(id: string) {
    const c = this.#get(id);
    c.running = true;
    c.health = this.healthOnStart;
    this.calls.push(`start ${c.name}`);
  }

  async stopContainer(id: string) {
    const c = this.#get(id);
    c.running = false;
    this.calls.push(`stop ${c.name}`);
  }

  async removeContainer(id: string) {
    const c = this.#get(id);
    this.containers.delete(id);
    this.calls.push(`remove ${c.name}`);
  }

  async volumeUsage(): Promise<VolumeUsage[]> {
    this.dfCalls++;
    if (this.dfFails) throw new Error("df timed out");
    return [...this.volumes.entries()].map(([name, labels]) => ({ Name: name, Labels: { ...labels }, UsageData: { Size: this.volumeBytes.get(name) ?? -1, RefCount: 1 } }));
  }

  byName(name: string): FakeContainer | undefined {
    return [...this.containers.values()].find((c) => c.name === name);
  }
}
