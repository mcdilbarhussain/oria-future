import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader, Card, Field, KV, Badge, Avatar } from "@/components/ui";
import { ActionButton, ActionForm, SubmitButton } from "@/components/forms";
import { fmtDateTime } from "@/lib/format";
import { updateProfile, changePassword, disable2FA, revokeSession } from "./actions";
import { TwoFactorSetup } from "./twofa";

export const metadata = { title: "My Profile" };

export default async function ProfilePage() {
  const u = await requireUser();
  const [sessions, accounts] = await Promise.all([
    prisma.session.findMany({ where: { userId: u.id, expiresAt: { gt: new Date() }, pending2FA: false }, orderBy: { lastActiveAt: "desc" } }),
    prisma.ebayAccount.findMany({ where: { id: { in: u.assignedEbayAccountIds } }, select: { name: true } }),
  ]);
  return (
    <>
      <PageHeader title="My Profile" subtitle="Personal details and account security" />
      <div className="grid gap-6 xl:grid-cols-3">
        <Card title="Profile">
          <div className="mb-4 flex items-center gap-3"><Avatar name={u.name} color={u.avatarColor} size={52} /><div><p className="font-semibold">{u.name}</p><p className="text-sm text-slate-500">{u.email}</p></div></div>
          <KV items={[["Role", u.role.name], ["Department", u.department?.name], ["Job title", u.jobTitle], ["eBay accounts", u.isSuperAdmin || u.can("ebay_accounts", "manage") ? "All accounts" : accounts.map((a) => a.name).join(", ") || "None"]]} />
          <ActionForm action={updateProfile} resetOnSuccess={false} className="mt-5 space-y-3">
            <Field label="Display name"><input name="name" defaultValue={u.name} className="input" /></Field>
            <Field label="Phone"><input name="phone" defaultValue={u.phone ?? ""} className="input" /></Field>
            <SubmitButton className="btn-secondary">Save</SubmitButton>
          </ActionForm>
        </Card>
        <Card title="Change password">
          {u.mustChangePassword && <p className="mb-3 rounded-lg bg-gold-50 px-3 py-2 text-sm text-gold-800">You are using a temporary password – please change it now.</p>}
          <ActionForm action={changePassword} className="space-y-3">
            <Field label="Current password"><input name="current" type="password" required autoComplete="current-password" className="input" /></Field>
            <Field label="New password" hint="10+ characters with upper, lower case and a number"><input name="password" type="password" required autoComplete="new-password" className="input" /></Field>
            <Field label="Confirm new password"><input name="confirm" type="password" required autoComplete="new-password" className="input" /></Field>
            <SubmitButton>Change password</SubmitButton>
          </ActionForm>
        </Card>
        <Card title={<span className="flex items-center gap-2">Two-factor authentication {u.totpEnabled ? <Badge tone="green">Enabled</Badge> : <Badge tone="amber">Off</Badge>}</span>}>
          {u.totpEnabled ? (
            <ActionForm action={disable2FA} className="space-y-3">
              <p className="text-sm text-slate-600">Your account requires a code from your authenticator app at sign-in.</p>
              <Field label="Confirm password to disable"><input name="password" type="password" required className="input" /></Field>
              <SubmitButton className="btn-danger" confirm="Disable two-factor authentication?">Disable 2FA</SubmitButton>
            </ActionForm>
          ) : <TwoFactorSetup />}
        </Card>
        <Card title="Active sessions" className="xl:col-span-3" padded={false}>
          <ul className="divide-y">{sessions.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <div><p className="font-medium">{s.userAgent?.slice(0, 90) ?? "Unknown device"} {s.id === u.sessionId && <Badge tone="green">This device</Badge>}</p><p className="text-xs text-slate-500">IP {s.ip} · last active {fmtDateTime(s.lastActiveAt)} · expires {fmtDateTime(s.expiresAt)}</p></div>
              {s.id !== u.sessionId && <ActionButton action={revokeSession} fields={{ id: s.id }}>Sign out</ActionButton>}
            </li>
          ))}</ul>
        </Card>
      </div>
    </>
  );
}
