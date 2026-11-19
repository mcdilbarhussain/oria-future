export const fmtMoney = (v: unknown, currency = "GBP") =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(Number(v ?? 0));
export const fmtNum = (v: unknown) => new Intl.NumberFormat("en-GB").format(Number(v ?? 0));
export const fmtDate = (d?: Date | string | null) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—");
export const fmtDateTime = (d?: Date | string | null) =>
  d ? new Date(d).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
export const label = (s?: string | null) => (s ? s.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : "—");
export const initials = (name: string) => name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
export function timeAgo(d: Date | string) {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
