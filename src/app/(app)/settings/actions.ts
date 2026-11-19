"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { assertPerm } from "@/lib/auth";
import { run, zs, formToObject, type ActionResult } from "@/lib/action";
import { audit } from "@/lib/audit";

export async function saveSettings(_: unknown, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await assertPerm("settings", "edit");
    const d = z.object({
      companyName: zs.str(100), legalName: zs.optStr(150), email: zs.optStr(150), phone: zs.optStr(50), address: zs.optStr(300),
      baseCurrency: z.enum(["GBP", "USD", "EUR"]), timezone: zs.str(60), lowStockAlerts: zs.bool(), require2FAForAdmins: zs.bool(), sessionIdleMinutes: z.coerce.number().int().min(5).max(720),
    }).parse(formToObject(fd));
    const before = await prisma.companySetting.findUnique({ where: { id: 1 } });
    await prisma.companySetting.upsert({ where: { id: 1 }, create: { id: 1, ...d }, update: d });
    await audit({ userId: u.id, module: "settings", action: "update", summary: "updated company settings", before, after: d });
    revalidatePath("/settings");
    return { ok: true, message: "Settings saved." };
  });
}

export async function saveWarehouse(_: unknown, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await assertPerm("warehouse", "manage");
    const d = z.object({ code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{2,12}$/), name: zs.str(100), address: zs.optStr(300), country: zs.str(60), isDefault: zs.bool() }).parse(formToObject(fd));
    const id = fd.get("id") ? String(fd.get("id")) : null;
    if (d.isDefault) await prisma.warehouse.updateMany({ data: { isDefault: false } });
    if (id) await prisma.warehouse.update({ where: { id }, data: d }); else await prisma.warehouse.create({ data: d });
    await audit({ userId: u.id, module: "warehouse", action: id ? "update" : "create", summary: `${id ? "updated" : "added"} warehouse location ${d.name}`, after: d });
    revalidatePath("/settings"); revalidatePath("/warehouse");
    return { ok: true, message: "Warehouse saved." };
  });
}
