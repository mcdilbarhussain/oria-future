import "server-only";
import { z, ZodError } from "zod";
import { ForbiddenError } from "./auth";
import { Prisma } from "@prisma/client";

export type ActionResult<T = unknown> = { ok: true; message?: string; data?: T } | { ok: false; error: string; fieldErrors?: Record<string, string> };

export function formToObject(fd: FormData): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) {
    if (k.startsWith("$ACTION")) continue;
    if (k.endsWith("[]")) {
      const key = k.slice(0, -2);
      (o[key] = (o[key] as unknown[]) || []);
      (o[key] as unknown[]).push(v);
    } else o[k] = v;
  }
  return o;
}

/** Wraps a server action body with validation + uniform error handling. */
export async function run<T>(fn: () => Promise<ActionResult<T> | void>): Promise<ActionResult<T>> {
  try {
    const r = await fn();
    return r ?? { ok: true };
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e && String((e as { digest: string }).digest).startsWith("NEXT_REDIRECT")) throw e;
    if (e instanceof ForbiddenError) return { ok: false, error: e.message };
    if (e instanceof ZodError) {
      const fieldErrors: Record<string, string> = {};
      for (const i of e.issues) fieldErrors[i.path.join(".")] = i.message;
      return { ok: false, error: e.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; "), fieldErrors };
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, error: `A record with this ${(e.meta?.target as string[] | undefined)?.join(", ") ?? "value"} already exists.` };
    }
    if (e instanceof UserError) return { ok: false, error: e.message };
    console.error("[action]", e);
    return { ok: false, error: "Something went wrong. The error has been logged." };
  }
}

export class UserError extends Error {}

// Common zod helpers for FormData input
export const zs = {
  str: (max = 500) => z.string().trim().min(1, "Required").max(max),
  optStr: (max = 5000) => z.string().trim().max(max).optional().transform((v) => (v ? v : null)),
  int: (min = 0) => z.coerce.number().int().min(min),
  money: () => z.coerce.number().min(0).max(1e10).transform((n) => Math.round(n * 100) / 100),
  optMoney: () => z.union([z.literal(""), z.coerce.number().min(0)]).optional().transform((v) => (v === "" || v === undefined ? null : v)),
  optDate: () => z.string().optional().transform((v) => (v ? new Date(v) : null)).refine((d) => d === null || !isNaN(d.getTime()), "Invalid date"),
  bool: () => z.union([z.literal("on"), z.literal("true"), z.literal("false"), z.literal("")]).optional().transform((v) => v === "on" || v === "true"),
};
