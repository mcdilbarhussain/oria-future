import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { randomToken } from "./crypto";
import { prisma } from "./db";
import { UserError } from "./action";

const DIR = path.resolve(process.env.STORAGE_DIR || "./storage/uploads");
const MAX = Number(process.env.MAX_UPLOAD_MB || 10) * 1024 * 1024;
const ALLOWED = /^(image\/(png|jpe?g|gif|webp)|application\/pdf|text\/(plain|csv)|application\/(msword|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet)|vnd\.ms-excel|zip))$/;

/**
 * Storage adapter. "local" writes to STORAGE_DIR (mount a persistent, backed-up volume in production).
 * Files are only served through /api/files/[id] which enforces authentication.
 */
export async function saveUpload(file: File, uploadedById: string, entityType?: string, entityId?: string) {
  if (!file || file.size === 0) return null;
  if (file.size > MAX) throw new UserError(`File too large (max ${process.env.MAX_UPLOAD_MB || 10} MB)`);
  if (!ALLOWED.test(file.type)) throw new UserError(`File type not allowed: ${file.type || "unknown"}`);
  const ext = path.extname(file.name).replace(/[^.a-z0-9]/gi, "").slice(0, 8);
  const key = `${new Date().toISOString().slice(0, 7)}/${randomToken(16)}${ext}`;
  await fs.mkdir(path.join(DIR, path.dirname(key)), { recursive: true });
  await fs.writeFile(path.join(DIR, key), Buffer.from(await file.arrayBuffer()));
  return prisma.fileAsset.create({
    data: { filename: file.name.slice(0, 200), mimeType: file.type, size: file.size, storageKey: key, uploadedById, entityType, entityId },
  });
}

export async function readUpload(storageKey: string) {
  const p = path.join(DIR, storageKey);
  if (!p.startsWith(DIR)) throw new Error("Invalid path");
  return fs.readFile(p);
}
