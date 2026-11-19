"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";

type Ev = { kind: string; [k: string]: unknown };
type Listener = (e: Ev) => void;
type Toast = { id: number; title: string; body?: string; link?: string };
const Ctx = createContext<{ subscribe: (fn: Listener) => () => void; online: Set<string>; connected: boolean }>({ subscribe: () => () => {}, online: new Set(), connected: false });
export const useRealtime = () => useContext(Ctx);

/** Single SSE connection per tab; reconnects automatically. */
export function RealtimeProvider({ children, initialOnline }: { children: ReactNode; initialOnline: string[] }) {
  const listeners = useRef(new Set<Listener>());
  const [online, setOnline] = useState(() => new Set(initialOnline));
  const [connected, setConnected] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const router = useRouter();

  useEffect(() => {
    let es: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout>;
    const connect = () => {
      es = new EventSource("/api/events");
      es.onopen = () => setConnected(true);
      es.onerror = () => { setConnected(false); es?.close(); retry = setTimeout(connect, 5000); };
      es.onmessage = (m) => {
        let ev: Ev;
        try { ev = JSON.parse(m.data); } catch { return; }
        if (ev.kind === "presence") setOnline((s) => { const n = new Set(s); if (ev.online) n.add(ev.userId as string); else n.delete(ev.userId as string); return n; });
        if (ev.kind === "notification") {
          const t = { id: Date.now() + Math.random(), title: ev.title as string, body: ev.body as string, link: ev.link as string };
          setToasts((x) => [...x.slice(-3), t]);
          setTimeout(() => setToasts((x) => x.filter((y) => y.id !== t.id)), 7000);
          if ("Notification" in window && Notification.permission === "granted" && document.hidden) new Notification(t.title, { body: t.body });
        }
        if (ev.kind === "refresh") router.refresh();
        listeners.current.forEach((fn) => fn(ev));
      };
    };
    connect();
    return () => { clearTimeout(retry); es?.close(); };
  }, [router]);

  const subscribe = useCallback((fn: Listener) => { listeners.current.add(fn); return () => { listeners.current.delete(fn); }; }, []);
  return (
    <Ctx.Provider value={{ subscribe, online, connected }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-80 flex-col gap-2">
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto rounded-xl border-l-4 border-gold-500 bg-navy-900 p-3 text-white shadow-2xl">
            <p className="text-sm font-semibold">{t.title}</p>
            {t.body && <p className="mt-0.5 line-clamp-2 text-xs text-navy-200">{t.body}</p>}
            {t.link && <Link href={t.link} className="mt-1 inline-block text-xs font-semibold text-gold-300 hover:underline">Open →</Link>}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

type N = { id: string; title: string; body: string | null; link: string | null; createdAt: string; readAt: string | null };

export function NotificationBell({ initialUnread }: { initialUnread: number }) {
  const { subscribe, connected } = useRealtime();
  const [unread, setUnread] = useState(initialUnread);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<N[]>([]);
  useEffect(() => subscribe((e) => { if (e.kind === "notification") setUnread((u) => u + 1); }), [subscribe]);
  const load = async () => {
    const r = await fetch("/api/notifications?limit=12");
    if (r.ok) { const j = await r.json(); setItems(j.items); setUnread(j.unread); }
  };
  const markAll = async () => { await fetch("/api/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ all: true }) }); setUnread(0); load(); };
  return (
    <div className="relative">
      <button className="btn-ghost relative" aria-label="Notifications" onClick={() => { setOpen(!open); if (!open) { load(); if ("Notification" in window && Notification.permission === "default") Notification.requestPermission(); } }}>
        <Bell size={19} />
        {unread > 0 && <span className="absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full bg-red-600 px-1 text-center text-[10px] font-bold leading-[18px] text-white">{unread > 99 ? "99+" : unread}</span>}
        <span className={`absolute bottom-1 right-1 h-1.5 w-1.5 rounded-full ${connected ? "bg-emerald-500" : "bg-slate-300"}`} title={connected ? "Live" : "Reconnecting"} />
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-50 w-[22rem] max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b px-4 py-2.5">
            <p className="text-sm font-semibold">Notifications</p>
            <button className="text-xs font-medium text-navy-600 hover:underline" onClick={markAll}>Mark all read</button>
          </div>
          <ul className="max-h-96 divide-y overflow-y-auto">
            {items.length === 0 && <li className="p-6 text-center text-sm text-slate-500">No notifications</li>}
            {items.map((n) => (
              <li key={n.id} className={n.readAt ? "" : "bg-navy-50/60"}>
                <Link href={n.link || "/notifications"} onClick={() => setOpen(false)} className="block px-4 py-2.5 hover:bg-slate-50">
                  <p className="text-sm font-medium text-slate-800">{n.title}</p>
                  {n.body && <p className="line-clamp-2 text-xs text-slate-500">{n.body}</p>}
                  <p className="mt-0.5 text-[11px] text-slate-400">{new Date(n.createdAt).toLocaleString("en-GB")}</p>
                </Link>
              </li>
            ))}
          </ul>
          <Link href="/notifications" onClick={() => setOpen(false)} className="block border-t px-4 py-2 text-center text-xs font-semibold text-navy-700 hover:bg-slate-50">View all</Link>
        </div>
      )}
    </div>
  );
}

export function UserMenu({ name, role, color, children }: { name: string; role: string; color: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ini = name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-slate-100">
        <span className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: color }}>{ini}</span>
        <span className="hidden text-left leading-tight sm:block"><span className="block text-sm font-semibold text-slate-800">{name}</span><span className="block text-[11px] text-slate-500">{role}</span></span>
      </button>
      {open && <div className="absolute right-0 top-11 z-50 w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-2xl" onClick={() => setOpen(false)}>{children}</div>}
    </div>
  );
}
