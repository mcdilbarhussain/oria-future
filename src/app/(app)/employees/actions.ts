"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { assertPerm, type CurrentUser } from "@/lib/auth";
import { run, formToObject, zs, UserError, type ActionResult } from "@/lib/action";
import { hashPassword, passwordSchema } from "@/lib/password";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { publish } from "@/lib/events";

async function guardRole(actor: CurrentUser, roleId: string) {
  const role = await prisma.role.findUniqueOrThrow({ where: { id: roleId } });
  if (!actor.isSuperAdmin && role.level >= actor.role.level) throw new UserError("You can only assign roles below your own level. Ask the owner for high-level roles.");
  return role;
}
async function guardTarget(actor: CurrentUser, userId: string) {
  const t = await prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { role: true } });
  if (!actor.isSuperAdmin && t.role.level >= actor.role.level) throw new UserError("You cannot modify an employee at or above your own level.");
  if (t.role.key === "super_admin" && t.id !== actor.id && !actor.isSuperAdmin) throw new UserError("Only the owner can modify this account.");
  return t;
}

const base = z.object({
  name: zs.str(120), email: z.string().trim().toLowerCase().email(), roleId: zs.str(), departmentId: zs.optStr(50),
  jobTitle: zs.optStr(120), phone: zs.optStr(40),
});

export async function createEmployee(_: unknown, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await assertPerm("employees", "create");
    const d = base.extend({ password: passwordSchema }).parse(formToObject(fd));
    await guardRole(u, d.roleId);
    const created = await prisma.user.create({
      data: { name: d.name, email: d.email, roleId: d.roleId, departmentId: d.departmentId, jobTitle: d.jobTitle, phone: d.phone, passwordHash: await hashPassword(d.password), mustChangePassword: true, avatarColor: ["#253d74", "#0f766e", "#9c701f", "#6b21a8", "#1d4ed8"][Math.floor(Math.random() * 5)] },
    });
    // Join company-wide and department chat groups
    const groups = await prisma.chatChannel.findMany({ where: { OR: [{ name: "Company-wide" }, ...(d.departmentId ? [{ departmentId: d.departmentId }] : [])] } });
    for (const g of groups) await prisma.chatMember.create({ data: { channelId: g.id, userId: created.id } });
    await audit({ userId: u.id, module: "employees", action: "create", entity: "User", entityId: created.id, summary: `created employee ${d.name} (${d.email})`, after: { ...d, password: undefined } });
    const mgmt = await prisma.user.findMany({ where: { deletedAt: null, role: { level: { gte: 80 } } }, select: { id: true } });
    await notify(mgmt.map((m) => m.id).filter((id) => id !== u.id), { type: "NEW_EMPLOYEE", title: `New employee joined: ${d.name}`, link: `/employees/${created.id}` });
    revalidatePath("/employees");
    return { ok: true, message: `${d.name} created. Share the temporary password securely – they must change it on first login.` };
  });
}

export async function updateEmployee(_: unknown, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await assertPerm("employees", "edit");
    const id = String(fd.get("id"));
    const before = await guardTarget(u, id);
    const d = base.parse(formToObject(fd));
    if (d.roleId !== before.roleId) await guardRole(u, d.roleId);
    if (before.id === u.id && d.roleId !== before.roleId) throw new UserError("You cannot change your own role.");
    await prisma.user.update({ where: { id }, data: d });
    await audit({ userId: u.id, module: "employees", action: "update", entity: "User", entityId: id, summary: `updated employee ${d.name}`, before: { name: before.name, email: before.email, roleId: before.roleId, departmentId: before.departmentId }, after: d });
    revalidatePath(`/employees/${id}`);
    return { ok: true, message: "Employee updated." };
  });
}

export async function setEmployeeStatus(_: unknown, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await assertPerm("employees", "edit");
    const id = String(fd.get("id"));
    const status = z.enum(["ACTIVE", "SUSPENDED"]).parse(fd.get("status"));
    if (id === u.id) throw new UserError("You cannot suspend yourself.");
    const t = await guardTarget(u, id);
    await prisma.user.update({ where: { id }, data: { status } });
    if (status === "SUSPENDED") await prisma.session.deleteMany({ where: { userId: id } });
    await audit({ userId: u.id, module: "employees", action: status === "SUSPENDED" ? "suspend" : "reactivate", entity: "User", entityId: id, summary: `${status === "SUSPENDED" ? "suspended" : "reactivated"} ${t.name}` });
    revalidatePath(`/employees/${id}`); revalidatePath("/employees");
    return { ok: true, message: status === "SUSPENDED" ? "Employee suspended and signed out." : "Employee reactivated." };
  });
}

export async function removeEmployee(_: unknown, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await assertPerm("employees", "delete");
    const id = String(fd.get("id"));
    if (id === u.id) throw new UserError("You cannot remove yourself.");
    const t = await guardTarget(u, id);
    // Soft delete: records (tasks, logs, finance) keep their history.
    await prisma.user.update({ where: { id }, data: { deletedAt: new Date(), status: "SUSPENDED", email: `${t.email}.removed.${Date.now()}` } });
    await prisma.session.deleteMany({ where: { userId: id } });
    await prisma.ebayAccountAssignment.deleteMany({ where: { userId: id } });
    await audit({ userId: u.id, module: "employees", action: "delete", entity: "User", entityId: id, summary: `removed employee ${t.name} (${t.email})` });
    revalidatePath("/employees");
    return { ok: true, message: "Employee removed (soft-deleted; history retained)." };
  });
}

export async function adminResetPassword(_: unknown, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await assertPerm("employees", "edit");
    const id = String(fd.get("id"));
    const t = await guardTarget(u, id);
    const pw = passwordSchema.parse(fd.get("password"));
    await prisma.user.update({ where: { id }, data: { passwordHash: await hashPassword(pw), mustChangePassword: true, failedLogins: 0, lockedUntil: null } });
    await prisma.session.deleteMany({ where: { userId: id } });
    await audit({ userId: u.id, module: "employees", action: "reset_password", entity: "User", entityId: id, summary: `reset password for ${t.name}` });
    return { ok: true, message: "Temporary password set. The employee has been signed out." };
  });
}

export async function reset2FA(_: unknown, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await assertPerm("employees", "manage");
    const id = String(fd.get("id"));
    const t = await guardTarget(u, id);
    await prisma.user.update({ where: { id }, data: { totpEnabled: false, totpSecretEnc: null } });
    await audit({ userId: u.id, module: "employees", action: "reset_2fa", entity: "User", entityId: id, summary: `reset two-factor authentication for ${t.name}` });
    revalidatePath(`/employees/${id}`);
    return { ok: true, message: "2FA reset." };
  });
}

export async function forceSignOut(_: unknown, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await assertPerm("employees", "edit");
    const id = String(fd.get("id"));
    const t = await guardTarget(u, id);
    const r = await prisma.session.deleteMany({ where: { userId: id } });
    await audit({ userId: u.id, module: "employees", action: "force_signout", entity: "User", entityId: id, summary: `signed out ${t.name} from ${r.count} session(s)` });
    return { ok: true, message: `Ended ${r.count} session(s).` };
  });
}

export async function setEbayAssignments(_: unknown, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await assertPerm("ebay_accounts", "manage");
    const id = String(fd.get("id"));
    const t = await guardTarget(u, id);
    const ids = fd.getAll("accounts").map(String);
    await prisma.$transaction([
      prisma.ebayAccountAssignment.deleteMany({ where: { userId: id } }),
      prisma.ebayAccountAssignment.createMany({ data: ids.map((ebayAccountId) => ({ userId: id, ebayAccountId })) }),
    ]);
    await audit({ userId: u.id, module: "ebay_accounts", action: "assign", entity: "User", entityId: id, summary: `set eBay account access for ${t.name} (${ids.length} account(s))`, after: ids });
    await publish({ kind: "refresh", userIds: [id], scope: "permissions" });
    revalidatePath(`/employees/${id}`);
    return { ok: true, message: "eBay account access updated." };
  });
}
