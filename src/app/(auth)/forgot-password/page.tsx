import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/forms";
import { forgotPasswordAction } from "../actions";
export const metadata = { title: "Forgot password" };
export default function ForgotPage() {
  return (
    <>
      <h1 className="text-2xl font-bold">Reset your password</h1>
      <p className="mt-1 text-sm text-slate-500">Enter your work email and we&apos;ll send a secure reset link (valid for 1 hour).</p>
      <ActionForm action={forgotPasswordAction} className="mt-8 space-y-4">
        <label className="block"><span className="label">Email</span><input name="email" type="email" required className="input" /></label>
        <SubmitButton className="btn-primary w-full py-2.5" pendingText="Sending…">Send reset link</SubmitButton>
      </ActionForm>
      <p className="mt-6 text-center text-sm"><Link href="/login" className="link">Back to sign in</Link></p>
    </>
  );
}
