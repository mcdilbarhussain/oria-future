"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { assertPerm, type CurrentUser } from "@/lib/auth";
import { run, zs, formToObject, UserError, type ActionResult } from "@/lib/action";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { saveUpload } from "@/lib/storage";
import { ASSIGNEE_TRANSITIONS, MANAGER_TRANSITIONS, type TStatus } from "@/lib/workflows/tasks";

const isManager = (u: CurrentUser) => u.can("tasks", "manage") || u.can("tasks", "approve");

export async function createTask(_: unknown, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await assertPerm("tasks", "create");
    const d = z.object({ title: zs.str(200), description: zs.optStr(5000), priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]), dueDate: zs.optDate(), assigneeId: zs.optStr(40), departmentId: zs.optStr(40) }).parse(formToObject(fd));
    if (!d.assigneeId && !d.departmentId) throw new UserError("Assign the task to an employee or a department.");
    const task = await prisma.task.create({ data: { ...d, status: d.assigneeId ? "ASSIGNED" : "NEW", createdById: u.id } });
    for (const f of fd.getAll("files")) if (f instanceof File && f.size) await saveUpload(f, u.id, "task", task.id);
    const targets = d.assigneeId ? [d.assigneeId] : (await prisma.user.findMany({ where: { departmentId: d.departmentId!, deletedAt: null }, select: { id: true } })).map((x) => x.id);
    await notify(targets.filter((t) => t !== u.id), { type: "TASK_ASSIGNED", title: `New task: ${d.title}`, body: `Priority ${d.priority}${d.dueDate ? ` · due ${d.dueDate.toLocaleDateString("en-GB")}` : ""}`, link: `/tasks/${task.id}` });
    await audit({ userId: u.id, module: "tasks", action: "create", entity: "Task", entityId: task.id, summary: `created task "${d.title}"` });
    revalidatePath("/tasks");
    return { ok: true, message: "Task created." };
  });
}

export async function changeTaskStatus(_: unknown, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await assertPerm("tasks", "edit");
    const id = String(fd.get("id"));
    const to = String(fd.get("status")) as TStatus;
    const note = String(fd.get("note") || "").trim();
    const t = await prisma.task.findFirstOrThrow({ where: { id, deletedAt: null } });
    const from = t.status as TStatus;
    const mine = t.assigneeId === u.id || (!t.assigneeId && t.departmentId === u.departmentId);
    const allowed = (mine && ASSIGNEE_TRANSITIONS[from]?.includes(to)) || (isManager(u) && (MANAGER_TRANSITIONS[from]?.includes(to) || ASSIGNEE_TRANSITIONS[from]?.includes(to)));
    if (!allowed) throw new UserError(`You can't move this task from ${from} to ${to}.`);
    const now = new Date();
    await prisma.task.update({ where: { id }, data: {
      status: to,
      assigneeId: !t.assigneeId && to === "IN_PROGRESS" ? u.id : undefined,
      acceptedAt: to === "IN_PROGRESS" && !t.acceptedAt ? now : undefined,
      submittedAt: to === "WAITING_APPROVAL" ? now : undefined,
      completedAt: to === "COMPLETED" ? now : to === "IN_PROGRESS" ? null : undefined,
      progress: to === "COMPLETED" || to === "WAITING_APPROVAL" ? 100 : undefined,
      reviewedById: to === "COMPLETED" || to === "REJECTED" ? u.id : undefined,
    } });
    await prisma.taskComment.create({ data: { taskId: id, userId: u.id, kind: "STATUS", body: `Status: ${from} → ${to}${note ? ` — ${note}` : ""}` } });
    if (to === "WAITING_APPROVAL") await notify([t.createdById], { type: "TASK_SUBMITTED", title: `Task submitted for approval: ${t.title}`, body: `by ${u.name}`, link: `/tasks/${id}` });
    if ((to === "COMPLETED" || to === "REJECTED" || (from === "COMPLETED" && to === "IN_PROGRESS")) && t.assigneeId) await notify([t.assigneeId], { type: "TASK_REVIEWED", title: `Task ${to === "COMPLETED" ? "approved" : to === "REJECTED" ? "rejected" : "reopened"}: ${t.title}`, body: note || undefined, link: `/tasks/${id}` });
    await audit({ userId: u.id, module: "tasks", action: "status", entity: "Task", entityId: id, summary: `moved task "${t.title}" ${from} → ${to}` });
    revalidatePath(`/tasks/${id}`); revalidatePath("/tasks");
    return { ok: true };
  });
}

export async function updateProgress(_: unknown, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await assertPerm("tasks", "edit");
    const id = String(fd.get("id"));
    const progress = z.coerce.number().int().min(0).max(100).parse(fd.get("progress"));
    const t = await prisma.task.findFirstOrThrow({ where: { id } });
    if (t.assigneeId !== u.id && !isManager(u)) throw new UserError("Only the assignee can update progress.");
    await prisma.task.update({ where: { id }, data: { progress, status: t.status === "ASSIGNED" || t.status === "NEW" ? "IN_PROGRESS" : undefined } });
    revalidatePath(`/tasks/${id}`);
    return { ok: true, message: "Progress updated." };
  });
}

export async function addTaskComment(_: unknown, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await assertPerm("tasks", "view");
    const id = String(fd.get("id"));
    const kind = z.enum(["COMMENT", "ASSISTANCE", "PROOF"]).parse(fd.get("kind") || "COMMENT");
    const body = zs.str(5000).parse(fd.get("body"));
    const t = await prisma.task.findFirstOrThrow({ where: { id } });
    await prisma.taskComment.create({ data: { taskId: id, userId: u.id, body, kind } });
    for (const f of fd.getAll("files")) if (f instanceof File && f.size) await saveUpload(f, u.id, "task", id);
    const watchers = [t.createdById, t.assigneeId].filter((x): x is string => !!x && x !== u.id);
    await notify(watchers, { type: kind === "ASSISTANCE" ? "ASSISTANCE" : "TASK_COMMENT", title: kind === "ASSISTANCE" ? `🆘 ${u.name} requested assistance: ${t.title}` : `${u.name} commented on: ${t.title}`, body: body.slice(0, 140), link: `/tasks/${id}` });
    revalidatePath(`/tasks/${id}`);
    return { ok: true };
  });
}

export async function reassignTask(_: unknown, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await assertPerm("tasks", "manage");
    const id = String(fd.get("id"));
    const d = z.object({ assigneeId: zs.optStr(40), dueDate: zs.optDate(), priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]) }).parse(formToObject(fd));
    const t = await prisma.task.update({ where: { id }, data: { ...d, status: d.assigneeId ? undefined : "NEW", reminderSentAt: null } });
    if (d.assigneeId) await notify([d.assigneeId], { type: "TASK_ASSIGNED", title: `Task assigned to you: ${t.title}`, link: `/tasks/${id}` });
    await audit({ userId: u.id, module: "tasks", action: "update", entity: "Task", entityId: id, summary: `updated assignment/deadline of "${t.title}"` });
    revalidatePath(`/tasks/${id}`);
    return { ok: true, message: "Task updated." };
  });
}

export async function deleteTask(_: unknown, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await assertPerm("tasks", "delete");
    const t = await prisma.task.update({ where: { id: String(fd.get("id")) }, data: { deletedAt: new Date() } });
    await audit({ userId: u.id, module: "tasks", action: "delete", entity: "Task", entityId: t.id, summary: `deleted task "${t.title}"` });
    revalidatePath("/tasks");
    return { ok: true };
  });
}
