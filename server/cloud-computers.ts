// Computers the Admin hands a Cloud home: a customer's extra VPS, bought on the Admin, becomes a "Self-hosted VPS"
// computer for this home's bots (server/vps-computer.ts), driven over `docker -H ssh://arko-<id>`. The home makes its
// own SSH key (the private half never leaves it) and the Admin installs the public half on the VPS; the VPS's host keys
// come from the Admin too, so nothing is ever trusted on first use. Everything lives under the data folder, which the bot
// box hides: no bot can read the key, the hosts or this list. Signed routes: server/routes/cloud-signed.ts.
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { COMPUTERS_SSH_CONFIG, VPS_SSH_DIR } from "./vps-ssh.ts";

export const CLOUD_COMPUTERS_PATH = "/api/cloud/computers";
const KEY_FILE = "arko-computers-ed25519";
const KNOWN_HOSTS = "arko-known-hosts";
const LIST_FILE = "computers.json";

export interface CloudComputer {
  id: string;
  name: string;
  host: string;
  port: number;
  user: string;
  alias: string;
}

const ID = /^[a-z0-9][a-z0-9-]{2,62}$/;
const HOST = /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$|^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
const USER = /^[a-z_][a-z0-9_-]{0,31}$/;
const HOST_KEY = /^(ssh-ed25519|ecdsa-sha2-nistp(?:256|384|521)|ssh-rsa) [A-Za-z0-9+/]+={0,3}$/;

export const computerAlias = (id: string) => `arko-${id}`;

export interface ComputerInput {
  id: string;
  name: string;
  host: string;
  port?: number;
  user: string;
  hostKeys: string[];
}

/** Null when the input is good; else why not (said back to the Admin, never logged with the input). */
export function computerInputProblem(input: unknown): string | null {
  const value = input as Partial<ComputerInput> | null;
  if (!value || typeof value !== "object") return "invalid_body";
  if (typeof value.id !== "string" || !ID.test(value.id)) return "invalid_id";
  if (typeof value.name !== "string" || !value.name.trim() || value.name.length > 80 || /[\r\n]/.test(value.name)) return "invalid_name";
  if (typeof value.host !== "string" || !HOST.test(value.host)) return "invalid_host";
  if (value.port !== undefined && !(Number.isInteger(value.port) && value.port >= 1 && value.port <= 65_535)) return "invalid_port";
  if (typeof value.user !== "string" || !USER.test(value.user)) return "invalid_user";
  if (!Array.isArray(value.hostKeys) || value.hostKeys.length === 0 || value.hostKeys.length > 8
    || !value.hostKeys.every((key) => typeof key === "string" && HOST_KEY.test(key.trim()))) return "invalid_host_keys";
  return null;
}

const quote = (value: string) => JSON.stringify(value);

/** The Host blocks (Included by vps-ssh.ts's config, after the person's own and before the defaults). */
export function computersSshConfigText(sshDir: string, computers: CloudComputer[]): string {
  const lines = ["# Written for the computers the Admin assigned to this ArkoBot. Do not edit; it is regenerated."];
  for (const computer of computers) {
    lines.push(
      `Host ${computer.alias}`,
      `  HostName ${computer.host}`,
      `  Port ${computer.port}`,
      `  User ${computer.user}`,
      `  IdentityFile ${quote(join(sshDir, KEY_FILE))}`,
      "  IdentitiesOnly yes",
      `  UserKnownHostsFile ${quote(join(sshDir, KNOWN_HOSTS))}`,
      "  StrictHostKeyChecking yes",
      "  PasswordAuthentication no",
      "  KbdInteractiveAuthentication no",
    );
  }
  return `${lines.join("\n")}\n`;
}

const knownHostsName = (host: string, port: number) => (port === 22 ? host : `[${host}]:${port}`);

function writeAtomic(path: string, content: string, mode = 0o600) {
  const temp = `${path}.${process.pid}.tmp`;
  writeFileSync(temp, content, { mode });
  renameSync(temp, path);
  chmodSync(path, mode);
}

export interface CloudComputersDeps {
  dataDir: string;
  /** The SSH alias bots use by default (cfg.vps.sshAlias); set to the first computer when none is set. */
  defaultAlias(): string | null;
  setDefaultAlias(alias: string | null): void;
  /** Whether a bot's VPS desktop still lives on this alias (then it cannot be removed). */
  inUse(alias: string): Promise<boolean>;
  /** `docker -H ssh://alias version`: whether the computer answers. */
  check?(alias: string): Promise<{ ok: boolean; problem?: string }>;
  keygen?(keyPath: string): Promise<void>;
}

export function createCloudComputers(deps: CloudComputersDeps) {
  const sshDir = join(deps.dataDir, VPS_SSH_DIR);
  const listPath = join(sshDir, LIST_FILE);
  const keyPath = join(sshDir, KEY_FILE);
  const prepare = () => mkdirSync(sshDir, { recursive: true, mode: 0o700 });

  const read = (): CloudComputer[] => {
    try {
      const parsed = JSON.parse(readFileSync(listPath, "utf8")) as { computers?: CloudComputer[] };
      return Array.isArray(parsed.computers) ? parsed.computers : [];
    } catch {
      return [];
    }
  };

  const write = (computers: CloudComputer[], hostKeys: Map<string, string[]>) => {
    prepare();
    writeAtomic(listPath, JSON.stringify({ computers }, null, 2));
    writeAtomic(join(sshDir, COMPUTERS_SSH_CONFIG), computersSshConfigText(sshDir, computers));
    const known = existsSync(join(sshDir, KNOWN_HOSTS)) ? readFileSync(join(sshDir, KNOWN_HOSTS), "utf8").split("\n").filter(Boolean) : [];
    // Each computer's lines are replaced as a whole; lines of computers no longer listed go.
    const names = new Map(computers.map((computer) => [knownHostsName(computer.host, computer.port), computer]));
    const kept = known.filter((line) => names.has(line.split(" ")[0]!) && !hostKeys.has(line.split(" ")[0]!));
    const added = [...hostKeys].flatMap(([name, keys]) => keys.map((key) => `${name} ${key.trim()}`));
    writeAtomic(join(sshDir, KNOWN_HOSTS), `${[...kept, ...added].join("\n")}\n`);
  };

  const keygen = deps.keygen ?? ((path: string) => new Promise<void>((resolve, reject) => {
    execFile("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-C", "arkobot-cloud", "-f", path], { timeout: 30_000 },
      (error) => (error ? reject(error) : resolve()));
  }));

  return {
    /** The home's public key, made on first ask. */
    async publicKey(): Promise<string> {
      prepare();
      if (!existsSync(keyPath)) await keygen(keyPath);
      chmodSync(keyPath, 0o600);
      return readFileSync(`${keyPath}.pub`, "utf8").trim();
    },
    list: read,
    async add(input: ComputerInput): Promise<{ computer: CloudComputer; check: { ok: boolean; problem?: string } }> {
      const problem = computerInputProblem(input);
      if (problem) throw Object.assign(new Error(problem), { status: 400 });
      await this.publicKey();
      const computer: CloudComputer = {
        id: input.id, name: input.name.trim(), host: input.host.toLowerCase(), port: input.port ?? 22, user: input.user, alias: computerAlias(input.id),
      };
      const computers = [...read().filter((existing) => existing.id !== computer.id), computer];
      write(computers, new Map([[knownHostsName(computer.host, computer.port), input.hostKeys]]));
      if (!deps.defaultAlias()) deps.setDefaultAlias(computer.alias);
      const check = deps.check ? await deps.check(computer.alias).catch((error: Error) => ({ ok: false, problem: error.message.slice(0, 300) })) : { ok: true };
      return { computer, check };
    },
    async remove(id: string): Promise<boolean> {
      const computer = read().find((existing) => existing.id === id);
      if (!computer) return false;
      if (await deps.inUse(computer.alias)) throw Object.assign(new Error("in_use"), { status: 409 });
      const computers = read().filter((existing) => existing.id !== id);
      write(computers, new Map());
      if (deps.defaultAlias() === computer.alias) deps.setDefaultAlias(computers[0]?.alias ?? null);
      return true;
    },
  };
}

export type CloudComputers = ReturnType<typeof createCloudComputers>;
