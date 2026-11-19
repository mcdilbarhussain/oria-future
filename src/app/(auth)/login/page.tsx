import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { ActionForm, SubmitButton } from "@/components/forms";
import { loginAction } from "../actions";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getCurrentUser()) redirect("/dashboard");
  const { next } = await searchParams;
  return (
    <>
      <h1 className="text-2xl font-bold">Welcome back</h1>
      <p className="mt-1 text-sm text-slate-500">Sign in to the ORIA FUTURE ERP.</p>
      <ActionForm action={loginAction} className="mt-8 space-y-4" resetOnSuccess={false}>
        <input type="hidden" name="next" value={next ?? ""} />
        <label className="block"><span className="label">Email</span><input name="email" type="email" autoComplete="username" required className="input" placeholder="you@oriafuture.com" /></label>
        <label className="block"><span className="label">Password</span><input name="password" type="password" autoComplete="current-password" required className="input" /></label>
        <div className="flex justify-end"><Link href="/forgot-password" className="text-xs font-medium text-navy-600 hover:underline">Forgot password?</Link></div>
        <SubmitButton className="btn-primary w-full py-2.5" pendingText="Signing in…">Sign in</SubmitButton>
      </ActionForm>
    </>
  );
}
