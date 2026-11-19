import { redirect } from "next/navigation";
import { getPendingUser } from "@/lib/auth";
import { ActionForm, SubmitButton } from "@/components/forms";
import { verify2FAAction } from "../../actions";

export default async function TwoFactorPage() {
  const u = await getPendingUser();
  if (!u) redirect("/login");
  if (!u.pending2FA) redirect("/dashboard");
  return (
    <>
      <h1 className="text-2xl font-bold">Two-factor authentication</h1>
      <p className="mt-1 text-sm text-slate-500">Enter the 6-digit code from your authenticator app.</p>
      <ActionForm action={verify2FAAction} className="mt-8 space-y-4" resetOnSuccess={false}>
        <input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required autoFocus className="input text-center text-2xl tracking-[0.5em]" />
        <SubmitButton className="btn-primary w-full py-2.5" pendingText="Verifying…">Verify</SubmitButton>
      </ActionForm>
    </>
  );
}
