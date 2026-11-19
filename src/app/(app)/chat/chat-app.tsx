"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Hash, Lock, Paperclip, Pin, Search, Send, Users, Plus, Trash2, CheckCheck } from "lucide-react";
import { useRealtime } from "@/components/realtime";

type Channel = { id: string; type: string; name: string; otherUserId?: string; color?: string; readOnly: boolean; memberCount: number; unread: number; last: { body: string; at: string; sender: string } | null };
type Msg = { id: string; body: string; at: string; pinned: boolean; senderId: string; senderName: string; senderColor: string; file: { id: string; name: string; image: boolean } | null };
type Member = { id: string; name: string; color: string; lastReadAt: string; isAdmin: boolean };
type Person = { id: string; name: string; avatarColor: string; jobTitle: string | null };

const post = (url: string, body: unknown) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const Av = ({ name, color, size = 32, online }: { name: string; color?: string; size?: number; online?: boolean }) => (
  <span className="relative inline-flex shrink-0"><span className="inline-flex items-center justify-center rounded-full text-white" style={{ width: size, height: size, background: color ?? "#253d74", fontSize: size * 0.38, fontWeight: 600 }}>{name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase()}</span>
    {online !== undefined && <span className={clsx("absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white", online ? "bg-emerald-500" : "bg-slate-300")} />}</span>
);

export function ChatApp({ me, initialChannels, people, initialChannel, canManage, canPost }: { me: { id: string; name: string }; initialChannels: Channel[]; people: Person[]; initialChannel?: string; canManage: boolean; canPost: boolean }) {
  const { subscribe, online } = useRealtime();
  const [channels, setChannels] = useState(initialChannels);
  const [active, setActive] = useState<string | undefined>(initialChannel);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [q, setQ] = useState("");
  const [mode, setMode] = useState<"all" | "pinned" | "search">("all");
  const [error, setError] = useState("");
  const [showPeople, setShowPeople] = useState(false);
  const [mobileList, setMobileList] = useState(!initialChannel);
  const bottom = useRef<HTMLDivElement>(null);
  const activeRef = useRef(active); activeRef.current = active;
  const ch = channels.find((c) => c.id === active);

  const loadChannels = useCallback(async () => { const r = await fetch("/api/chat/channels"); if (r.ok) setChannels((await r.json()).channels); }, []);
  const load = useCallback(async (id: string, opts: { q?: string; pinned?: boolean } = {}) => {
    const p = new URLSearchParams(); if (opts.q) p.set("q", opts.q); if (opts.pinned) p.set("pinned", "1");
    const r = await fetch(`/api/chat/${id}/messages?${p}`);
    if (!r.ok) return;
    const j = await r.json(); setMsgs(j.messages); setMembers(j.members);
    if (!opts.q && !opts.pinned) { await post(`/api/chat/${id}/read`, {}); setChannels((cs) => cs.map((c) => (c.id === id ? { ...c, unread: 0 } : c))); setTimeout(() => bottom.current?.scrollIntoView(), 30); }
  }, []);

  useEffect(() => { if (active) { setMode("all"); load(active); window.history.replaceState(null, "", `/chat?c=${active}`); } }, [active, load]);
  useEffect(() => subscribe((e) => {
    if (e.kind === "chat") {
      if (e.channelId === activeRef.current) load(activeRef.current!);
      else loadChannels();
    }
    if (e.kind === "chat_read" && e.channelId === activeRef.current) setMembers((ms) => ms.map((m) => (m.id === e.userId ? { ...m, lastReadAt: new Date().toISOString() } : m)));
    if (e.kind === "refresh" && e.scope === "chat") loadChannels();
  }), [subscribe, load, loadChannels]);

  const send = async (ev: React.FormEvent) => {
    ev.preventDefault(); if (!active || (!text.trim() && !file)) return;
    setError("");
    const fd = new FormData(); fd.set("body", text); if (file) fd.set("file", file);
    const r = await fetch(`/api/chat/${active}/messages`, { method: "POST", body: fd });
    if (!r.ok) { setError((await r.json().catch(() => ({}))).error || "Failed to send"); return; }
    setText(""); setFile(null); load(active); loadChannels();
  };
  const startDM = async (userId: string) => { const r = await post("/api/chat/direct", { userId }); if (r.ok) { const { id } = await r.json(); await loadChannels(); setActive(id); setShowPeople(false); setMobileList(false); } };
  const createGroup = async () => {
    const name = prompt("Group name"); if (!name) return;
    const r = await post("/api/chat/channels", { name, memberIds: [] }); if (r.ok) { const { id } = await r.json(); await loadChannels(); setActive(id); }
  };
  const msgAction = async (mid: string, action: string) => { await post(`/api/chat/messages/${mid}`, { action }); if (active) load(active, mode === "pinned" ? { pinned: true } : {}); };
  const manageMember = async (userId: string, add: boolean) => { if (!active) return; await post(`/api/chat/${active}/members`, add ? { add: [userId] } : { remove: [userId] }); load(active); };

  const lastMine = [...msgs].reverse().find((m) => m.senderId === me.id);
  const seenBy = lastMine ? members.filter((m) => m.id !== me.id && m.lastReadAt >= lastMine.at) : [];

  return (
    <div className="card -mx-2 flex h-[calc(100vh-8rem)] overflow-hidden sm:mx-0">
      <aside className={clsx("w-full shrink-0 flex-col border-r border-slate-200 md:flex md:w-72", mobileList ? "flex" : "hidden")}>
        <div className="flex items-center justify-between border-b p-3">
          <h2 className="font-semibold">Team chat</h2>
          <div className="flex gap-1">
            <button className="btn-ghost btn-sm" title="New direct message" onClick={() => setShowPeople(!showPeople)}><Users size={16} /></button>
            {canManage && <button className="btn-ghost btn-sm" title="New group" onClick={createGroup}><Plus size={16} /></button>}
          </div>
        </div>
        {showPeople ? (
          <ul className="flex-1 overflow-y-auto">{people.map((p) => (
            <li key={p.id}><button onClick={() => startDM(p.id)} className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-slate-50"><Av name={p.name} color={p.avatarColor} online={online.has(p.id)} /><span className="min-w-0"><span className="block truncate text-sm font-medium">{p.name}</span><span className="block truncate text-xs text-slate-500">{p.jobTitle}</span></span></button></li>
          ))}</ul>
        ) : (
          <ul className="flex-1 overflow-y-auto">{channels.map((c) => (
            <li key={c.id}>
              <button onClick={() => { setActive(c.id); setMobileList(false); }} className={clsx("flex w-full items-center gap-2.5 px-3 py-2.5 text-left", c.id === active ? "bg-navy-50" : "hover:bg-slate-50")}>
                {c.type === "DIRECT" ? <Av name={c.name} color={c.color} online={c.otherUserId ? online.has(c.otherUserId) : undefined} /> : <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-navy-100 text-navy-700">{c.readOnly ? <Lock size={14} /> : <Hash size={15} />}</span>}
                <span className="min-w-0 flex-1"><span className="flex items-center justify-between"><span className={clsx("truncate text-sm", c.unread ? "font-bold" : "font-medium")}>{c.name}</span>{c.unread > 0 && <span className="rounded-full bg-gold-500 px-1.5 text-[10px] font-bold text-navy-950">{c.unread}</span>}</span>
                  <span className="block truncate text-xs text-slate-500">{c.last ? `${c.last.sender.split(" ")[0]}: ${c.last.body || "📎 file"}` : "No messages yet"}</span></span>
              </button>
            </li>
          ))}</ul>
        )}
      </aside>
      <section className={clsx("min-w-0 flex-1 flex-col md:flex", mobileList ? "hidden" : "flex")}>
        {!ch ? <div className="m-auto text-sm text-slate-500">Select a conversation</div> : (<>
          <header className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
            <button className="btn-ghost btn-sm md:hidden" onClick={() => setMobileList(true)}>←</button>
            <div className="min-w-0 flex-1"><p className="truncate font-semibold">{ch.type === "DIRECT" ? ch.name : `# ${ch.name}`}</p><p className="text-xs text-slate-500">{ch.type === "DIRECT" ? (ch.otherUserId && online.has(ch.otherUserId) ? "Online" : "Offline") : `${members.length} members · ${members.filter((m) => online.has(m.id)).length} online`}{ch.readOnly ? " · announcements only" : ""}</p></div>
            <form onSubmit={(e) => { e.preventDefault(); if (q) { setMode("search"); load(ch.id, { q }); } }} className="relative"><Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search messages" className="input w-44 py-1.5 pl-8 text-xs" /></form>
            <button className={clsx("btn-sm", mode === "pinned" ? "btn-primary" : "btn-secondary")} onClick={() => { if (mode === "pinned") { setMode("all"); load(ch.id); } else { setMode("pinned"); load(ch.id, { pinned: true }); } }}><Pin size={13} /> Pinned</button>
            {mode === "search" && <button className="btn-secondary btn-sm" onClick={() => { setQ(""); setMode("all"); load(ch.id); }}>Clear search</button>}
          </header>
          <div className="flex min-h-0 flex-1">
            <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50/50 p-4">
              {msgs.length === 0 && <p className="mt-10 text-center text-sm text-slate-500">{mode === "all" ? "No messages yet – say hello 👋" : "No matching messages"}</p>}
              {msgs.map((m) => (
                <div key={m.id} className={clsx("group flex gap-2.5", m.senderId === me.id && "flex-row-reverse")}>
                  <Av name={m.senderName} color={m.senderColor} size={30} />
                  <div className={clsx("max-w-[75%]", m.senderId === me.id && "items-end text-right")}>
                    <p className="text-[11px] text-slate-500">{m.senderId === me.id ? "You" : m.senderName} · {new Date(m.at).toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" })} {m.pinned && <Pin size={10} className="inline text-gold-600" />}</p>
                    <div className={clsx("mt-0.5 inline-block whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-left text-sm shadow-sm", m.senderId === me.id ? "bg-navy-800 text-white" : "bg-white ring-1 ring-slate-200", m.pinned && "ring-2 ring-gold-400")}>
                      {m.body}
                      {m.file && (m.file.image
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <a href={`/api/files/${m.file.id}`} target="_blank"><img src={`/api/files/${m.file.id}`} alt={m.file.name} className="mt-1 max-h-56 rounded-lg" /></a>
                        : <a href={`/api/files/${m.file.id}`} className={clsx("mt-1 flex items-center gap-1 underline", m.senderId === me.id ? "text-gold-200" : "text-navy-700")}><Paperclip size={13} />{m.file.name}</a>)}
                    </div>
                    <div className="mt-0.5 hidden gap-2 text-[11px] text-slate-400 group-hover:flex">
                      <button onClick={() => msgAction(m.id, m.pinned ? "unpin" : "pin")} className="hover:text-navy-700">{m.pinned ? "Unpin" : "Pin"}</button>
                      {(m.senderId === me.id || canManage) && <button onClick={() => confirm("Delete message?") && msgAction(m.id, "delete")} className="hover:text-red-600"><Trash2 size={11} className="inline" /> Delete</button>}
                    </div>
                  </div>
                </div>
              ))}
              {lastMine && mode === "all" && seenBy.length > 0 && <p className="flex items-center justify-end gap-1 text-[11px] text-slate-500"><CheckCheck size={13} className="text-emerald-600" /> Seen by {ch.type === "DIRECT" ? ch.name : seenBy.map((s) => s.name.split(" ")[0]).join(", ")}</p>}
              <div ref={bottom} />
            </div>
            {ch.type !== "DIRECT" && canManage && (
              <aside className="hidden w-56 shrink-0 overflow-y-auto border-l p-3 xl:block">
                <p className="label">Members ({members.length})</p>
                <ul className="space-y-1.5">{members.map((m) => <li key={m.id} className="group flex items-center gap-2 text-sm"><Av name={m.name} color={m.color} size={22} online={online.has(m.id)} /><span className="flex-1 truncate">{m.name}</span>{m.id !== me.id && <button onClick={() => manageMember(m.id, false)} className="hidden text-xs text-red-500 group-hover:block">remove</button>}</li>)}</ul>
                <p className="label mt-4">Add member</p>
                <select className="input text-xs" value="" onChange={(e) => e.target.value && manageMember(e.target.value, true)}><option value="">Select…</option>{people.filter((p) => !members.some((m) => m.id === p.id)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
              </aside>
            )}
          </div>
          {canPost && (
            <form onSubmit={send} className="border-t bg-white p-3">
              {error && <p className="mb-2 text-xs text-red-600">{error}</p>}
              {file && <p className="mb-2 text-xs text-slate-600">📎 {file.name} <button type="button" className="text-red-500" onClick={() => setFile(null)}>remove</button></p>}
              <div className="flex items-end gap-2">
                <label className="btn-ghost cursor-pointer" title="Attach file or image"><Paperclip size={18} /><input type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>
                <textarea value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(e); } }} rows={1} placeholder={`Message ${ch.type === "DIRECT" ? ch.name : "#" + ch.name}`} className="input max-h-32 min-h-[40px] flex-1 resize-none" />
                <button type="submit" className="btn-primary"><Send size={16} /></button>
              </div>
            </form>
          )}
        </>)}
      </section>
    </div>
  );
}
