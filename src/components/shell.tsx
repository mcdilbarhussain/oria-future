"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import clsx from "clsx";
import {
  LayoutDashboard, Users, Building2, ShieldCheck, ListChecks, MessagesSquare, Store, ShoppingCart, Tags, Mail, Boxes, Warehouse,
  Factory, FileSearch, ClipboardList, Landmark, Receipt, BarChart3, Bell, History, Settings, UserCircle, Menu, X, Inbox, FileText, Wallet, Undo2,
} from "lucide-react";

const ICONS = { LayoutDashboard, Users, Building2, ShieldCheck, ListChecks, MessagesSquare, Store, ShoppingCart, Tags, Mail, Boxes, Warehouse, Factory, FileSearch, ClipboardList, Landmark, Receipt, BarChart3, Bell, History, Settings, UserCircle, Inbox, FileText, Wallet, Undo2 };
export type NavItem = { href: string; label: string; icon: keyof typeof ICONS; badge?: number };
export type NavGroup = { title: string; items: NavItem[] };

function Logo() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2.5 px-2">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-gold-400 to-gold-600 text-sm font-black text-navy-950 shadow">OF</span>
      <span className="leading-tight">
        <span className="block text-sm font-extrabold tracking-[0.18em] text-white">ORIA FUTURE</span>
        <span className="block text-[10px] font-medium uppercase tracking-widest text-gold-300/80">Enterprise ERP</span>
      </span>
    </Link>
  );
}

export function AppShell({ nav, topbar, children, banner }: { nav: NavGroup[]; topbar: ReactNode; children: ReactNode; banner?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const side = (
    <nav className="flex h-full flex-col gap-5 overflow-y-auto bg-navy-950 px-3 py-5">
      <Logo />
      {nav.map((g) => (
        <div key={g.title}>
          <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-navy-300/60">{g.title}</p>
          <ul className="space-y-0.5">
            {g.items.map((it) => {
              const Icon = ICONS[it.icon];
              const active = path === it.href || (it.href !== "/dashboard" && path.startsWith(it.href + "/")) || path === it.href;
              return (
                <li key={it.href}>
                  <Link href={it.href} onClick={() => setOpen(false)} className={clsx("group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition", active ? "bg-navy-800 text-white shadow-inner" : "text-navy-200 hover:bg-navy-900 hover:text-white")}>
                    <Icon size={17} className={clsx(active ? "text-gold-400" : "text-navy-400 group-hover:text-gold-300")} />
                    <span className="flex-1">{it.label}</span>
                    {!!it.badge && <span className="rounded-full bg-gold-500 px-1.5 text-[10px] font-bold text-navy-950">{it.badge}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      <p className="mt-auto px-3 text-[10px] text-navy-400">© {new Date().getFullYear()} ORIA FUTURE LTD</p>
    </nav>
  );
  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 lg:block">{side}</aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-navy-950/60" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72">{side}</div>
          <button className="absolute right-4 top-4 rounded-full bg-white p-2" onClick={() => setOpen(false)} aria-label="Close menu"><X size={18} /></button>
        </div>
      )}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6">
          <button className="btn-ghost -ml-2 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu size={20} /></button>
          {topbar}
        </header>
        {banner}
        <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
