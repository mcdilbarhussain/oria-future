// Simple fixed-window in-memory limiter (per instance). Put a reverse proxy limiter in front for multi-instance setups.
const g = globalThis as unknown as { rl?: Map<string, { n: number; reset: number }> };
const store = g.rl ?? (g.rl = new Map());
export function rateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const e = store.get(key);
  if (!e || e.reset < now) { store.set(key, { n: 1, reset: now + windowMs }); return true; }
  e.n++;
  return e.n <= max;
}
