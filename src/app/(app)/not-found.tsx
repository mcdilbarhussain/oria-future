import Link from "next/link";
export default function NotFound() {
  return (
    <div className="mx-auto mt-20 max-w-md text-center">
      <p className="text-5xl font-black text-navy-200">404</p>
      <h1 className="mt-2 text-xl font-bold">Not found</h1>
      <p className="mt-2 text-sm text-slate-500">This record doesn&apos;t exist or you don&apos;t have access to it.</p>
      <Link href="/dashboard" className="btn-primary mt-6">Back to dashboard</Link>
    </div>
  );
}
