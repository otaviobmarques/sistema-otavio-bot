import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const VERSION = "v1";
const IV_BYTES = 12;

export class SecretBoxError extends Error {}

function parseKey(raw: string, name: string): Buffer {
  const trimmed = raw.trim();
  const key = /^[0-9a-f]{64}$/i.test(trimmed) ? Buffer.from(trimmed, "hex") : Buffer.from(trimmed, "base64");
  if (key.length !== 32) throw new SecretBoxError(`${name} precisa ter 32 bytes (base64 ou hex de 64 caracteres)`);
  return key;
}

function keyId(key: Buffer): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 8);
}

/**
 * AES-256-GCM for secrets at rest. The context string is bound as additional
 * authenticated data, so a ciphertext copied to another column or row fails to
 * open. `previousKey` only decrypts, for key rotation.
 */
export class SecretBox {
  readonly #current: { id: string; key: Buffer };
  readonly #keys: Map<string, Buffer>;

  constructor(currentKey: string, previousKey?: string) {
    const current = parseKey(currentKey, "ADMIN_ENCRYPTION_KEY");
    this.#current = { id: keyId(current), key: current };
    this.#keys = new Map([[this.#current.id, current]]);
    if (previousKey) {
      const previous = parseKey(previousKey, "ADMIN_ENCRYPTION_KEY_PREVIOUS");
      this.#keys.set(keyId(previous), previous);
    }
  }

  encrypt(plaintext: string, context: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv("aes-256-gcm", this.#current.key, iv);
    cipher.setAAD(Buffer.from(context, "utf8"));
    const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [VERSION, this.#current.id, iv.toString("base64url"), tag.toString("base64url"), body.toString("base64url")].join(":");
  }

  decrypt(sealed: string, context: string): string {
    const parts = sealed.split(":");
    if (parts.length !== 5 || parts[0] !== VERSION) throw new SecretBoxError("segredo cifrado em formato desconhecido");
    const [, id, iv, tag, body] = parts as [string, string, string, string, string];
    const key = this.#keys.get(id);
    if (!key) throw new SecretBoxError("segredo cifrado com uma chave que não está configurada");
    try {
      const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
      decipher.setAAD(Buffer.from(context, "utf8"));
      decipher.setAuthTag(Buffer.from(tag, "base64url"));
      return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
    } catch {
      throw new SecretBoxError("não foi possível abrir o segredo (chave, contexto ou conteúdo inválido)");
    }
  }

  needsRotation(sealed: string): boolean {
    return sealed.split(":")[1] !== this.#current.id;
  }
}

/** A short, non-reversible label that tells two stored secrets apart without revealing either. */
export function fingerprint(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex").slice(0, 12);
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function hmacHex(secret: string, value: string): string {
  return createHmac("sha256", secret).update(value, "utf8").digest("hex");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) {
    timingSafeEqual(left, left);
    return false;
  }
  return timingSafeEqual(left, right);
}

export function generateEncryptionKey(): string {
  return randomBytes(32).toString("base64");
}
