/** CSRF defence for JSON API routes: require Origin/Referer to match the Host. */
export function sameOrigin(req: Request) {
  const origin = req.headers.get("origin") || req.headers.get("referer");
  if (!origin) return false;
  try { return new URL(origin).host === (req.headers.get("x-forwarded-host") || req.headers.get("host")); } catch { return false; }
}
