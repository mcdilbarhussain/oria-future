"use client";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
export function GlobalSearch() {
  const router = useRouter();
  return (
    <form className="relative hidden max-w-md flex-1 md:block" onSubmit={(e) => { e.preventDefault(); const q = new FormData(e.currentTarget).get("q"); if (q) router.push(`/search?q=${encodeURIComponent(String(q))}`); }}>
      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input name="q" placeholder="Search SKUs, orders, suppliers, employees…" className="input pl-9" />
    </form>
  );
}
