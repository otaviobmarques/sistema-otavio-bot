// The few S3 calls the customer backups need, against any S3-compatible store (Contabo Object Storage, Backblaze B2,
// Cloudflare R2, MinIO, AWS). Every call is a presigned URL (AWS Signature V4, query auth, path-style), so the same
// code signs the Admin's own small calls (create, complete, abort, delete) and the URLs handed to a node, whose helper
// moves the bytes straight between the node and the store: the data never passes through the Admin. Keys are never logged.
import { createHash, createHmac } from "node:crypto";

export interface S3Settings {
  /** e.g. https://usc1.contabostorage.com, https://s3.us-west-004.backblazeb2.com */
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

/** RFC 3986 encoding, as SigV4 wants it. */
const encode = (value: string) => encodeURIComponent(value).replace(/[!'()*]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`);
const sha256 = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
const hmac = (key: Buffer | string, value: string) => createHmac("sha256", key).update(value, "utf8").digest();

/** A presigned URL for one call. `query` holds the call's own parameters (uploads, partNumber, uploadId…). */
export function presign(settings: S3Settings, method: string, key: string, query: Record<string, string> = {}, expiresSeconds = 3600, now = new Date()): string {
  const base = new URL(settings.endpoint);
  const path = `${base.pathname.replace(/\/+$/, "")}/${encode(settings.bucket)}/${key.split("/").map(encode).join("/")}`;
  const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const day = amzDate.slice(0, 8);
  const scope = `${day}/${settings.region}/s3/aws4_request`;
  const params: Record<string, string> = {
    ...query,
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${settings.accessKeyId}/${scope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(Math.max(1, Math.min(604_800, Math.round(expiresSeconds)))),
    "X-Amz-SignedHeaders": "host",
  };
  const canonicalQuery = Object.keys(params).sort().map((name) => `${encode(name)}=${encode(params[name]!)}`).join("&");
  const canonical = [method, path, canonicalQuery, `host:${base.host}\n`, "host", "UNSIGNED-PAYLOAD"].join("\n");
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonical)].join("\n");
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${settings.secretAccessKey}`, day), settings.region), "s3"), "aws4_request");
  const signature = createHmac("sha256", signingKey).update(toSign, "utf8").digest("hex");
  return `${base.protocol}//${base.host}${path}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

export class S3Error extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const tag = (xml: string, name: string) => xml.match(new RegExp(`<${name}>([^<]*)</${name}>`))?.[1] ?? null;

async function call(fetcher: typeof fetch, url: string, method: string, body?: string, ok = [200]): Promise<string> {
  const response = await fetcher(url, { method, body, redirect: "error", signal: AbortSignal.timeout(60_000),
    headers: body ? { "content-type": "application/xml" } : undefined });
  const text = await response.text();
  if (!ok.includes(response.status)) {
    throw new S3Error(response.status, `armazenamento respondeu ${response.status} (${tag(text, "Code") ?? "sem código"}) em ${method}`);
  }
  return text;
}

export interface S3Client {
  createMultipart(key: string): Promise<string>;
  partUrl(key: string, uploadId: string, partNumber: number, expiresSeconds?: number): string;
  completeMultipart(key: string, uploadId: string, parts: { partNumber: number; etag: string }[]): Promise<void>;
  abortMultipart(key: string, uploadId: string): Promise<void>;
  downloadUrl(key: string, expiresSeconds?: number): string;
  deleteObject(key: string): Promise<void>;
}

export function s3Client(settings: S3Settings, fetcher: typeof fetch, now: () => Date = () => new Date()): S3Client {
  const sign = (method: string, key: string, query?: Record<string, string>, expires?: number) => presign(settings, method, key, query, expires, now());
  return {
    async createMultipart(key) {
      const text = await call(fetcher, sign("POST", key, { uploads: "" }), "POST");
      const uploadId = tag(text, "UploadId");
      if (!uploadId) throw new S3Error(502, "armazenamento não devolveu o UploadId");
      return uploadId;
    },
    partUrl: (key, uploadId, partNumber, expires = 3600) => sign("PUT", key, { partNumber: String(partNumber), uploadId }, expires),
    async completeMultipart(key, uploadId, parts) {
      const xml = `<CompleteMultipartUpload>${[...parts].sort((a, b) => a.partNumber - b.partNumber)
        .map((part) => `<Part><PartNumber>${part.partNumber}</PartNumber><ETag>${part.etag.replace(/[<>&]/g, "")}</ETag></Part>`).join("")}</CompleteMultipartUpload>`;
      const text = await call(fetcher, sign("POST", key, { uploadId }), "POST", xml);
      // S3 can answer 200 with an error body for a complete that failed late.
      if (/<Error>/.test(text)) throw new S3Error(500, `armazenamento recusou a conclusão (${tag(text, "Code") ?? "erro"})`);
    },
    async abortMultipart(key, uploadId) {
      await call(fetcher, sign("DELETE", key, { uploadId }), "DELETE", undefined, [200, 204, 404]);
    },
    downloadUrl: (key, expires = 6 * 3600) => sign("GET", key, {}, expires),
    async deleteObject(key) {
      await call(fetcher, sign("DELETE", key), "DELETE", undefined, [200, 204, 404]);
    },
  };
}
