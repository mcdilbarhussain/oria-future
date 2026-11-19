"use client";
import { useActionState } from "react";
import { ActionForm, SubmitButton } from "@/components/forms";
import { start2FA, confirm2FA } from "./actions";

export function TwoFactorSetup() {
  const [state, act] = useActionState(start2FA, null);
  if (!state?.ok || !state.data) {
    return (
      <form action={act}>
        <p className="mb-3 text-sm text-slate-600">Protect your account with an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…).</p>
        <SubmitButton className="btn-gold">Set up 2FA</SubmitButton>
        {state && !state.ok && <p className="mt-2 text-sm text-red-600">{state.error}</p>}
      </form>
    );
  }
  const d = state.data as { secret: string; qr: string };
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">1. Scan this QR code with your authenticator app.</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={d.qr} alt="2FA QR code" className="h-44 w-44 rounded-lg border" />
      <p className="text-xs text-slate-500">Or enter key manually: <code className="break-all">{d.secret}</code></p>
      <ActionForm action={confirm2FA} className="space-y-2">
        <p className="text-sm text-slate-600">2. Enter the 6-digit code to confirm.</p>
        <input name="code" inputMode="numeric" required className="input w-40 text-center tracking-widest" />
        <SubmitButton>Enable 2FA</SubmitButton>
      </ActionForm>
    </div>
  );
}
