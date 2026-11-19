import { requirePage } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ebayCredentials } from "@/lib/ebay/config";
import { PageHeader, Card, Field, Badge, KV, TableWrap } from "@/components/ui";
import { ActionForm, ModalForm, SubmitButton } from "@/components/forms";
import { saveSettings, saveWarehouse } from "./actions";
import { fmtDateTime } from "@/lib/format";

export const metadata = { title: "Company Settings" };

export default async function SettingsPage() {
  const u = await requirePage("settings");
  const [s, warehouses, lastCron] = await Promise.all([
    prisma.companySetting.findUnique({ where: { id: 1 } }),
    prisma.warehouse.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } }),
    prisma.auditLog.findFirst({ where: { module: "system", action: "scheduler" }, orderBy: { createdAt: "desc" } }),
  ]);
  const eb = ebayCredentials();
  const edit = u.can("settings", "edit");
  return (
    <>
      <PageHeader title="Company Settings" />
      <div className="grid gap-6 xl:grid-cols-3">
        <Card title="Company profile" className="xl:col-span-2">
          <ActionForm action={saveSettings} resetOnSuccess={false} className="grid gap-4 sm:grid-cols-2">
            <Field label="Company name"><input name="companyName" defaultValue={s?.companyName} className="input" disabled={!edit} /></Field>
            <Field label="Legal name"><input name="legalName" defaultValue={s?.legalName ?? ""} className="input" disabled={!edit} /></Field>
            <Field label="Email"><input name="email" defaultValue={s?.email ?? ""} className="input" disabled={!edit} /></Field>
            <Field label="Phone"><input name="phone" defaultValue={s?.phone ?? ""} className="input" disabled={!edit} /></Field>
            <Field label="Address" className="sm:col-span-2"><input name="address" defaultValue={s?.address ?? ""} className="input" disabled={!edit} /></Field>
            <Field label="Base currency"><select name="baseCurrency" defaultValue={s?.baseCurrency} className="input" disabled={!edit}><option>GBP</option><option>USD</option><option>EUR</option></select></Field>
            <Field label="Timezone"><input name="timezone" defaultValue={s?.timezone} className="input" disabled={!edit} /></Field>
            <Field label="Session idle timeout (minutes)" hint="Server default comes from SESSION_IDLE_MINUTES"><input name="sessionIdleMinutes" type="number" defaultValue={s?.sessionIdleMinutes} className="input" disabled={!edit} /></Field>
            <div className="space-y-2 pt-5">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="lowStockAlerts" defaultChecked={s?.lowStockAlerts} disabled={!edit} /> Low stock notifications</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="require2FAForAdmins" defaultChecked={s?.require2FAForAdmins} disabled={!edit} /> Require 2FA for managers (reminder banner)</label>
            </div>
            {edit && <div className="sm:col-span-2"><SubmitButton>Save settings</SubmitButton></div>}
          </ActionForm>
        </Card>
        <Card title="System status">
          <KV items={[
            ["eBay API keys", eb.configured ? <Badge tone="green">Configured ({process.env.EBAY_ENVIRONMENT || "SANDBOX"})</Badge> : <Badge tone="amber">Not configured</Badge>],
            ["Email (SMTP)", process.env.SMTP_HOST ? <Badge tone="green">Configured</Badge> : <Badge tone="amber">Not configured</Badge>],
            ["Encryption key", process.env.ENCRYPTION_KEY ? <Badge tone="green">Set</Badge> : <Badge tone="red">Missing</Badge>],
            ["File storage", process.env.STORAGE_DRIVER || "local"],
            ["Internal scheduler", process.env.ENABLE_INTERNAL_SCHEDULER === "true" ? "Enabled" : "Disabled (use /api/cron/run)"],
            ["Last scheduler run", fmtDateTime(lastCron?.createdAt)],
          ]} />
          <p className="mt-4 text-xs text-slate-500">Secrets are configured as server environment variables and are never displayed or sent to the browser. Database backups: see <code>scripts/backup.sh</code> and docs/DEPLOYMENT.md.</p>
        </Card>
        <Card title="Warehouse locations" className="xl:col-span-3" padded={false} actions={u.can("warehouse", "manage") && (
          <ModalForm trigger="+ Add location" triggerClassName="btn-secondary btn-sm" title="Add warehouse location" action={saveWarehouse}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Code"><input name="code" required className="input uppercase" placeholder="UK-LON" /></Field>
              <Field label="Name"><input name="name" required className="input" /></Field>
              <Field label="Address" className="sm:col-span-2"><input name="address" className="input" /></Field>
              <Field label="Country"><input name="country" defaultValue="United Kingdom" className="input" /></Field>
              <label className="flex items-center gap-2 pt-6 text-sm"><input type="checkbox" name="isDefault" /> Default warehouse</label>
            </div>
          </ModalForm>
        )}>
          <TableWrap><table className="table"><thead><tr><th>Code</th><th>Name</th><th>Address</th><th>Country</th><th></th></tr></thead><tbody>
            {warehouses.map((w) => <tr key={w.id}><td className="font-mono">{w.code}</td><td>{w.name}</td><td>{w.address}</td><td>{w.country}</td><td>{w.isDefault && <Badge tone="gold">Default</Badge>}</td></tr>)}
          </tbody></table></TableWrap>
        </Card>
      </div>
    </>
  );
}
