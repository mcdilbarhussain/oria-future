"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { assertPerm } from "@/lib/auth";
import { run, formToObject, zs, UserError, type ActionResult } from "@/lib/action";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";

const schema = z.object({ name: zs.str(80), code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{2,12}$/, "2-12 letters/numbers"), description: zs.optStr(500), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#1b2e5a"), managerId: zs.optStr(40) });

export async function saveDepartment(_: unknown, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const id = fd.get("id") ? String(fd.get("id")) : null;
    const u = await assertPerm("departments", id ? "edit" : "create");
    const d = schema.parse(formToObject(fd));
    if (id) {
      await prisma.department.update({ where: { id }, data: d });
    } else {
      const dep = await prisma.department.create({ data: d });
      // Every department gets its own group chat
      const ch = await prisma.chatChannel.create({ data: { type: "DEPARTMENT", name: d.name, departmentId: dep.id, description: `${d.name} group` } });
      await prisma.chatMember.create({ data: { channelId: ch.id, userId: u.id, isAdmin: true } });
    }
    await audit({ userId: u.id, module: "departments", action: id ? "update" : "create", entity: "Department", entityId: id ?? undefined, summary: `${id ? "updated" : "created"} department ${d.name}`, after: d });
    revalidatePath("/departments");
    return { ok: true, message: "Department saved." };
  });
}

export async function deleteDepartment(_: unknown, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await assertPerm("departments", "delete");
    const id = String(fd.get("id"));
    const members = await prisma.user.count({ where: { departmentId: id, deletedAt: null } });
    if (members) throw new UserError(`Move the ${members} employee(s) to another department first.`);
    const d = await prisma.department.update({ where: { id }, data: { deletedAt: new Date() } });
    await prisma.chatChannel.updateMany({ where: { departmentId: id }, data: { archivedAt: new Date() } });
    await audit({ userId: u.id, module: "departments", action: "delete", entity: "Department", entityId: id, summary: `archived department ${d.name}` });
    revalidatePath("/departments");
    return { ok: true };
  });
}

export async function sendInstruction(_: unknown, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await assertPerm("departments", "manage");
    const id = String(fd.get("id"));
    const msg = zs.str(2000).parse(fd.get("message"));
    const dep = await prisma.department.findUniqueOrThrow({ where: { id } });
    const members = await prisma.user.findMany({ where: { departmentId: id, deletedAt: null }, select: { id: true } });
    const ch = await prisma.chatChannel.findFirst({ where: { departmentId: id, archivedAt: null } });
    if (ch) {
      await prisma.chatMember.upsert({ where: { channelId_userId: { channelId: ch.id, userId: u.id } }, create: { channelId: ch.id, userId: u.id }, update: {} });
      await prisma.chatMessage.create({ data: { channelId: ch.id, senderId: u.id, body: `📌 Instruction from management: ${msg}`, pinned: true } });
    }
    await notify(members.map((m) => m.id), { type: "INSTRUCTION", title: `Instruction for ${dep.name}`, body: msg, link: ch ? `/chat?c=${ch.id}` : "/dashboard" });
    await audit({ userId: u.id, module: "departments", action: "instruction", entity: "Department", entityId: id, summary: `sent instruction to ${dep.name}: ${msg.slice(0, 80)}` });
    return { ok: true, message: `Sent to ${members.length} member(s).` };
  });
}
