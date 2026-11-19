import { getCurrentUser } from "@/lib/auth";
import { subscribe, onlineCounts, publish, type BusEvent } from "@/lib/events";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Server-Sent Events stream: live notifications, chat, presence. */
export async function GET(req: Request) {
  const u = await getCurrentUser();
  if (!u) return new Response("Unauthorized", { status: 401 });
  const enc = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const send = (data: unknown) => { try { controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`)); } catch { /* closed */ } };
      send({ kind: "hello" });
      const unsub = subscribe((ev: BusEvent) => {
        if (ev.userIds === "*" || ev.userIds.includes(u.id)) send(ev);
      });
      const ping = setInterval(() => { try { controller.enqueue(enc.encode(`: ping\n\n`)); } catch { /* closed */ } }, 25_000);
      const prev = onlineCounts.get(u.id) ?? 0;
      onlineCounts.set(u.id, prev + 1);
      if (prev === 0) void publish({ kind: "presence", userIds: "*", userId: u.id, online: true });
      void prisma.user.update({ where: { id: u.id }, data: { lastSeenAt: new Date() } }).catch(() => {});
      cleanup = () => {
        unsub(); clearInterval(ping);
        const n = (onlineCounts.get(u.id) ?? 1) - 1;
        onlineCounts.set(u.id, n);
        if (n <= 0) { void publish({ kind: "presence", userIds: "*", userId: u.id, online: false }); void prisma.user.update({ where: { id: u.id }, data: { lastSeenAt: new Date() } }).catch(() => {}); }
      };
      req.signal.addEventListener("abort", () => { cleanup(); try { controller.close(); } catch { /* */ } });
    },
    cancel() { cleanup(); },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
}
