import Link from "next/link";
import { MODULES, type Module } from "@/lib/permissions";
export default async function Forbidden({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const { m } = await searchParams;
  return (
    <div className="mx-auto mt-20 max-w-md text-center">
      <p className="text-5xl font-black text-navy-200">403</p>
      <h1 className="mt-2 text-xl font-bold">Access restricted</h1>
      <p className="mt-2 text-sm text-slate-500">Your role does not include access to {m && m in MODULES ? <b>{MODULES[m as Module]}</b> : "this area"}. Contact the owner or your manager if you need access.</p>
      <Link href="/dashboard" className="btn-primary mt-6">Back to dashboard</Link>
    </div>
  );
}
