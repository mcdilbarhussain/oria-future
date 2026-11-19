"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { assertPerm } from "@/lib/auth";
import { run, zs, UserError, type ActionResult } from "@/lib/action";
import { ACTIONS, MODULES, SUPER_ADMIN_KEY } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { publish } from "@/lib/events";

async function requireOwner() {
  const u = await assertPerm("roles", "manage"); // only Super Admin passes (see can())
  if (!u.isSuperAdmin) throw new UserError("Only the Super Admin can change roles and permissions.");
  return u;
}

export async function createRole(_: unknown, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await requireOwner();
    const d = z.object({ name: zs.str(60), description: zs.optStr(300), level: z.coerce.number().int().min(1).max(95), copyFrom: zs.optStr(40) }).parse(Object.fromEntries(fd));
    const key = d.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") + "_" + Date.now().toString(36).slice(-4);
    const role = await prisma.role.create({ data: { key, name: d.name, description: d.description, level: d.level } });
    if (d.copyFrom) {
      const src = await prisma.rolePermission.findMany({ where: { roleId: d.copyFrom } });
      if (src.length) await prisma.rolePermission.createMany({ data: src.map((p) => ({ roleId: role.id, module: p.module, action: p.action })) });
    }
    await audit({ userId: u.id, module: "roles", action: "create", entity: "Role", entityId: role.id, summary: `created custom role ${d.name}` });
    revalidatePath("/roles");
    return { ok: true, message: "Role created – now configure its permissions." };
  });
}

export async function savePermissions(_: unknown, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await requireOwner();
    const roleId = String(fd.get("roleId"));
    const role = await prisma.role.findUniqueOrThrow({ where: { id: roleId } });
    if (role.key === SUPER_ADMIN_KEY) throw new UserError("The Super Admin role always has full access.");
    const before = (await prisma.rolePermission.findMany({ where: { roleId } })).map((p) => `${p.module}:${p.action}`).sort();
    const valid = new Set(Object.keys(MODULES).flatMap((m) => ACTIONS.map((a) => `${m}:${a}`)));
    const chosen = fd.getAll("perm").map(String).filter((p) => valid.has(p) && !p.startsWith("roles:") || p === "roles:view");
    await prisma.$transaction([
      prisma.rolePermission.deleteMany({ where: { roleId } }),
      prisma.rolePermission.createMany({ data: chosen.map((p) => { const [module, action] = p.split(":"); return { roleId, module, action }; }) }),
    ]);
    const meta = z.object({ name: zs.str(60), description: zs.optStr(300), level: z.coerce.number().int().min(1).max(95) }).parse({ name: fd.get("name"), description: fd.get("description") ?? "", level: fd.get("level") });
    await prisma.role.update({ where: { id: roleId }, data: meta });
    await audit({ userId: u.id, module: "roles", action: "update_permissions", entity: "Role", entityId: roleId, summary: `updated permissions for role ${role.name}`, before, after: chosen.sort() });
    const affected = await prisma.user.findMany({ where: { roleId }, select: { id: true } });
    await publish({ kind: "refresh", userIds: affected.map((a) => a.id), scope: "permissions" });
    revalidatePath(`/roles/${roleId}`);
    return { ok: true, message: `Saved ${chosen.length} permissions. Changes apply immediately to ${affected.length} employee(s).` };
  });
}

export async function deleteRole(_: unknown, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await requireOwner();
    const id = String(fd.get("id"));
    const role = await prisma.role.findUniqueOrThrow({ where: { id }, include: { _count: { select: { users: true } } } });
    if (role.isSystem) throw new UserError("Default system roles cannot be deleted.");
    if (role._count.users) throw new UserError("Reassign employees using this role first.");
    await prisma.role.delete({ where: { id } });
    await audit({ userId: u.id, module: "roles", action: "delete", entity: "Role", entityId: id, summary: `deleted role ${role.name}` });
    revalidatePath("/roles");
    return { ok: true };
  });
}
