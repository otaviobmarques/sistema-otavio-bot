// A small Docker Engine API client over the daemon's unix socket (node:http, no dependencies). Only the calls the agent
// needs. Unversioned paths: the daemon answers in its own API version. Errors carry the daemon's message, never a body
// the agent sent (a container's create body holds its secrets).
import { request } from "node:http";

export interface ContainerSummary {
  Id: string;
  Names: string[];
  Labels: Record<string, string>;
  State: string;
}

export interface ContainerDetails {
  Id: string;
  Config: { Labels: Record<string, string> | null };
  State: { Status: string; Running: boolean; Restarting?: boolean; Error?: string; ExitCode?: number; Health?: { Status: string } | null };
}

export interface NetworkDetails {
  Name: string;
  IPAM?: { Config?: { Subnet?: string }[] | null } | null;
}

export class DockerError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** What the reconciler uses; tests give it a fake. */
export interface DockerApi {
  listContainers(labelFilter: string): Promise<ContainerSummary[]>;
  inspectContainer(id: string): Promise<ContainerDetails>;
  imageExists(image: string): Promise<boolean>;
  pullImage(image: string): Promise<void>;
  createVolume(name: string, labels: Record<string, string>): Promise<void>;
  inspectNetwork(name: string): Promise<NetworkDetails | null>;
  createNetwork(name: string, labels: Record<string, string>): Promise<void>;
  createContainer(name: string, body: Record<string, unknown>): Promise<string>;
  startContainer(id: string): Promise<void>;
  stopContainer(id: string, timeoutSeconds: number): Promise<void>;
  /** Removes the container only: volumes are never removed (`v=false`). */
  removeContainer(id: string): Promise<void>;
}

/** `ghcr.io/owner/repo:tag` → fromImage and tag for POST /images/create. A digest stays in fromImage. */
export function splitImage(image: string): { fromImage: string; tag: string | null } {
  if (image.includes("@")) return { fromImage: image, tag: null };
  const slash = image.lastIndexOf("/");
  const colon = image.lastIndexOf(":");
  return colon > slash ? { fromImage: image.slice(0, colon), tag: image.slice(colon + 1) } : { fromImage: image, tag: "latest" };
}

export class DockerClient implements DockerApi {
  readonly #socketPath: string;
  readonly #registryAuth: string | null;

  /** `registryAuth`: the X-Registry-Auth value for pulls (base64url JSON), when the image is private. */
  constructor(options: { socketPath: string; registryAuth?: string | null }) {
    this.#socketPath = options.socketPath;
    this.#registryAuth = options.registryAuth ?? null;
  }

  #call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}, timeoutMs = 60_000): Promise<{ status: number; text: string }> {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    return new Promise((resolve, reject) => {
      const req = request({
        socketPath: this.#socketPath, path, method, timeout: timeoutMs,
        headers: { host: "docker", ...(payload ? { "content-type": "application/json", "content-length": Buffer.byteLength(payload) } : {}), ...headers },
      }, (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString("utf8") }));
        res.on("error", reject);
      });
      req.on("timeout", () => req.destroy(new Error(`Docker: ${method} ${path.split("?")[0]} demorou demais`)));
      req.on("error", reject);
      if (payload) req.write(payload);
      req.end();
    });
  }

  async #json<T>(method: string, path: string, body?: unknown, ok: number[] = [200]): Promise<T> {
    const { status, text } = await this.#call(method, path, body);
    if (!ok.includes(status)) throw new DockerError(status, `Docker ${method} ${path.split("?")[0]}: ${status} ${messageOf(text)}`);
    return (text ? JSON.parse(text) : null) as T;
  }

  listContainers(labelFilter: string) {
    return this.#json<ContainerSummary[]>("GET", `/containers/json?all=true&filters=${encodeURIComponent(JSON.stringify({ label: [labelFilter] }))}`);
  }

  inspectContainer(id: string) {
    return this.#json<ContainerDetails>("GET", `/containers/${encodeURIComponent(id)}/json`);
  }

  async imageExists(image: string) {
    const { status } = await this.#call("GET", `/images/${encodeURIComponent(image)}/json`);
    return status === 200;
  }

  async pullImage(image: string) {
    const { fromImage, tag } = splitImage(image);
    const query = `fromImage=${encodeURIComponent(fromImage)}${tag ? `&tag=${encodeURIComponent(tag)}` : ""}`;
    const { status, text } = await this.#call("POST", `/images/create?${query}`, undefined,
      this.#registryAuth ? { "x-registry-auth": this.#registryAuth } : {}, 15 * 60_000);
    if (status !== 200) throw new DockerError(status, `Docker pull ${image}: ${status} ${messageOf(text)}`);
    // The pull streams JSON lines; a failure mid-way arrives as {"error": …} with status 200.
    const failed = text.split("\n").map((line) => { try { return JSON.parse(line) as { error?: string }; } catch { return null; } }).find((line) => line?.error);
    if (failed?.error) throw new DockerError(500, `Docker pull ${image}: ${failed.error.slice(0, 300)}`);
  }

  async createVolume(name: string, labels: Record<string, string>) {
    await this.#json("POST", "/volumes/create", { Name: name, Labels: labels }, [200, 201]);
  }

  async inspectNetwork(name: string) {
    const { status, text } = await this.#call("GET", `/networks/${encodeURIComponent(name)}`);
    if (status === 404) return null;
    if (status !== 200) throw new DockerError(status, `Docker GET /networks: ${status} ${messageOf(text)}`);
    return JSON.parse(text) as NetworkDetails;
  }

  async createNetwork(name: string, labels: Record<string, string>) {
    await this.#json("POST", "/networks/create", { Name: name, Driver: "bridge", Labels: labels, CheckDuplicate: true }, [200, 201]);
  }

  async createContainer(name: string, body: Record<string, unknown>) {
    const created = await this.#json<{ Id: string }>("POST", `/containers/create?name=${encodeURIComponent(name)}`, body, [201]);
    return created.Id;
  }

  async startContainer(id: string) {
    await this.#json("POST", `/containers/${encodeURIComponent(id)}/start`, undefined, [204, 304]);
  }

  async stopContainer(id: string, timeoutSeconds: number) {
    const { status, text } = await this.#call("POST", `/containers/${encodeURIComponent(id)}/stop?t=${timeoutSeconds}`, undefined, {}, (timeoutSeconds + 30) * 1000);
    if (status !== 204 && status !== 304) throw new DockerError(status, `Docker stop: ${status} ${messageOf(text)}`);
  }

  async removeContainer(id: string) {
    await this.#json("DELETE", `/containers/${encodeURIComponent(id)}?v=false&force=false`, undefined, [204, 404]);
  }
}

function messageOf(text: string): string {
  let parsed: { message?: unknown } | null = null;
  try {
    parsed = JSON.parse(text) as { message?: unknown };
  } catch {
    parsed = null;
  }
  return typeof parsed?.message === "string" ? parsed.message.slice(0, 300) : text.slice(0, 200);
}
