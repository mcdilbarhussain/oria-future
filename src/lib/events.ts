import "server-only";
import { EventEmitter } from "node:events";
import { Client } from "pg";

/**
 * Real-time event bus.
 * Events are published through PostgreSQL NOTIFY so every app instance receives them,
 * then fanned out to the browser via Server-Sent Events (/api/events).
 */
export type BusEvent =
  | { kind: "notification"; userIds: string[]; title: string; body?: string | null; link?: string | null; type: string }
  | { kind: "chat"; userIds: string[]; channelId: string; messageId: string; senderName: string; preview: string }
  | { kind: "chat_read"; userIds: string[]; channelId: string; userId: string }
  | { kind: "presence"; userIds: "*"; userId: string; online: boolean }
  | { kind: "refresh"; userIds: string[] | "*"; scope: string };

const CHANNEL = "oria_events";
type G = { bus?: EventEmitter; listener?: Promise<Client | null>; online?: Map<string, number> };
const g = globalThis as unknown as G;
export const bus = g.bus ?? (g.bus = new EventEmitter().setMaxListeners(1000));
export const onlineCounts = g.online ?? (g.online = new Map());

function ensureListener() {
  if (g.listener) return g.listener;
  g.listener = (async () => {
    try {
      const c = new Client({ connectionString: process.env.DATABASE_URL });
      await c.connect();
      await c.query(`LISTEN ${CHANNEL}`);
      c.on("notification", (msg) => {
        if (!msg.payload) return;
        try { bus.emit("event", JSON.parse(msg.payload)); } catch { /* ignore */ }
      });
      c.on("error", () => { g.listener = undefined; });
      return c;
    } catch (e) {
      console.error("[events] LISTEN failed, falling back to in-process bus", e);
      g.listener = undefined;
      return null;
    }
  })();
  return g.listener;
}

export async function publish(ev: BusEvent) {
  const client = await ensureListener();
  const payload = JSON.stringify(ev);
  if (client && payload.length < 7900) {
    try { await client.query("SELECT pg_notify($1, $2)", [CHANNEL, payload]); return; } catch { /* fall through */ }
  }
  bus.emit("event", ev);
}

export function subscribe(fn: (ev: BusEvent) => void) {
  void ensureListener();
  bus.on("event", fn);
  return () => bus.off("event", fn);
}

export function isOnline(userId: string) { return (onlineCounts.get(userId) ?? 0) > 0; }
