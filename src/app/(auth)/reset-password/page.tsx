import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/forms";
import { resetPasswordAction } from "../actions";
export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <>
      <h1 className="text-2xl font-bold">Choose a new password</h1>
      <p className="mt-1 text-sm text-slate-500">At least 10 characters with upper and lower case letters and a number.</p>
      <ActionForm action={resetPasswordAction} className="mt-8 space-y-4">
        <input type="hidden" name="token" value={token ?? ""} />
        <label className="block"><span className="label">New password</span><input name="password" type="password" autoComplete="new-password" required className="input" /></label>
        <label className="block"><span className="label">Confirm password</span><input name="confirm" type="password" autoComplete="new-password" required className="input" /></label>
        <SubmitButton className="btn-primary w-full py-2.5">Update password</SubmitButton>
      </ActionForm>
      <p className="mt-6 text-center text-sm"><Link href="/login" className="link">Back to sign in</Link></p>
    </>
  );
}
