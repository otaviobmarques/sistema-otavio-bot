import { describe, expect, it } from "vitest";
import { fingerprint, generateEncryptionKey, SecretBox, SecretBoxError } from "../src/security/crypto.ts";
import { base32Decode, base32Encode, totpAt, verifyTotp } from "../src/security/totp.ts";

describe("SecretBox (AES-256-GCM)", () => {
  const key = generateEncryptionKey();

  it("round-trips a secret and never stores it in clear", () => {
    const box = new SecretBox(key);
    const sealed = box.encrypt("$aact_minha_chave_secreta", "billing_accounts.api_key:1");
    expect(sealed).not.toContain("minha_chave");
    expect(sealed.startsWith("v1:")).toBe(true);
    expect(box.decrypt(sealed, "billing_accounts.api_key:1")).toBe("$aact_minha_chave_secreta");
  });

  it("uses a fresh IV each time", () => {
    const box = new SecretBox(key);
    expect(box.encrypt("x", "c")).not.toBe(box.encrypt("x", "c"));
  });

  it("refuses a ciphertext moved to another context (row or column)", () => {
    const box = new SecretBox(key);
    const sealed = box.encrypt("segredo", "billing_accounts.api_key:1");
    expect(() => box.decrypt(sealed, "billing_accounts.api_key:2")).toThrow(SecretBoxError);
    expect(() => box.decrypt(sealed, "billing_accounts.webhook_token:1")).toThrow(SecretBoxError);
  });

  it("refuses a tampered ciphertext", () => {
    const box = new SecretBox(key);
    const parts = box.encrypt("segredo", "c").split(":");
    const body = Buffer.from(parts[4]!, "base64url");
    body[0] = body[0]! ^ 1;
    parts[4] = body.toString("base64url");
    expect(() => box.decrypt(parts.join(":"), "c")).toThrow(SecretBoxError);
  });

  it("refuses to open with another key, and opens with the previous key during rotation", () => {
    const oldKey = generateEncryptionKey();
    const sealed = new SecretBox(oldKey).encrypt("segredo", "c");
    expect(() => new SecretBox(key).decrypt(sealed, "c")).toThrow(SecretBoxError);
    const rotated = new SecretBox(key, oldKey);
    expect(rotated.decrypt(sealed, "c")).toBe("segredo");
    expect(rotated.needsRotation(sealed)).toBe(true);
    expect(rotated.needsRotation(rotated.encrypt("segredo", "c"))).toBe(false);
  });

  it("requires a 32-byte key", () => {
    expect(() => new SecretBox("curta")).toThrow(/32 bytes/);
    expect(() => new SecretBox("a".repeat(64))).not.toThrow();
  });

  it("fingerprints without revealing the secret", () => {
    expect(fingerprint("abc")).toHaveLength(12);
    expect(fingerprint("abc")).toBe(fingerprint("abc"));
    expect(fingerprint("abc")).not.toBe(fingerprint("abd"));
  });
});

describe("TOTP (RFC 6238)", () => {
  // RFC 6238 appendix B, SHA-1 secret "12345678901234567890", 8 digits there; the last 6 are what a 6-digit app shows.
  const secret = base32Encode(Buffer.from("12345678901234567890"));

  it("matches the RFC test vectors", () => {
    expect(totpAt(secret, Math.floor(59 / 30))).toBe("287082");
    expect(totpAt(secret, Math.floor(1111111109 / 30))).toBe("081804");
    expect(totpAt(secret, Math.floor(1234567890 / 30))).toBe("005924");
    expect(totpAt(secret, Math.floor(2000000000 / 30))).toBe("279037");
  });

  it("round-trips base32", () => {
    expect(base32Decode(secret).toString()).toBe("12345678901234567890");
  });

  it("accepts one step of drift and refuses a code already used", () => {
    const now = new Date(1_234_567_890_000);
    const step = Math.floor(1234567890 / 30);
    expect(verifyTotp(secret, totpAt(secret, step - 1), now, null)).toBe(step - 1);
    expect(verifyTotp(secret, totpAt(secret, step - 2), now, null)).toBeNull();
    expect(verifyTotp(secret, totpAt(secret, step), now, step)).toBeNull();
    expect(verifyTotp(secret, "12345", now, null)).toBeNull();
  });
});
