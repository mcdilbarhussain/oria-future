// Internal scheduler (Node.js runtime only). Disable with ENABLE_INTERNAL_SCHEDULER=false and call /api/cron/run instead.
const g = globalThis as unknown as { __oriaScheduler?: boolean };
if (process.env.ENABLE_INTERNAL_SCHEDULER === "true" && !g.__oriaScheduler) {
  g.__oriaScheduler = true;
  const minutes = Math.max(5, Number(process.env.EBAY_SYNC_INTERVAL_MINUTES || 15));
  const tick = () => import("./lib/jobs").then((m) => m.runScheduledJobs()).catch((e) => console.error("[scheduler]", e));
  setTimeout(tick, 30_000);
  setInterval(tick, minutes * 60_000);
  console.info(`[scheduler] internal scheduler running every ${minutes} min`);
}
export {};
