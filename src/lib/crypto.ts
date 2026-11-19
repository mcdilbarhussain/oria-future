import crypto from "node:crypto";

function key(): Buffer {
  const k = process.env.ENCRYPTION_KEY;
  if (!k) throw new Error("ENCRYPTION_KEY is not configured");
  const buf = Buffer.from(k, "base64");
  if (buf.length !== 32) throw new Error("ENCRYPTION_KEY must be 32 bytes (base64 encoded)");
  return buf;
}

/** AES-256-GCM. Output: v1.<iv>.<tag>.<ciphertext> (base64url) */
export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), enc.toString("base64url")].join(".");
}

export function decrypt(payload: string): string {
  const [v, iv, tag, data] = payload.split(".");
  if (v !== "v1" || !iv || !tag || !data) throw new Error("Invalid encrypted payload");
  const d = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(data, "base64url")), d.final()]).toString("utf8");
}

export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString("base64url");
export const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
