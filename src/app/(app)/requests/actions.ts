"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { assertPerm, requireUser } from "@/lib/auth";
import { run, zs, formToObject, UserError, type ActionResult } from "@/lib/action";
import { audit } from "@/lib/audit";
import { notify, notifyPermission } from "@/lib/notify";

export async function createRequest(_: unknown, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await assertPerm("requests", "create");
    const d = z.object({ type: z.enum(["ASSISTANCE", "BALANCE_ENQUIRY", "FINANCE", "GENERAL"]), title: zs.str(200), details: zs.optStr(5000), amount: zs.optMoney() }).parse(formToObject(fd));
    const r = await prisma.approvalRequest.create({ data: { ...d, currency: d.amount ? "GBP" : null, requestedById: u.id } });
    const finance = d.type === "BALANCE_ENQUIRY" || d.type === "FINANCE";
    await notifyPermission(finance ? "finance" : "requests", "approve", { type: finance ? "PAYMENT_APPROVAL" : "REQUEST", title: `${d.type.replace("_", " ").toLowerCase()} request from ${u.name}`, body: d.title, link: "/requests?tab=queue" }, u.id);
    await audit({ userId: u.id, module: "requests", action: "create", entity: "ApprovalRequest", entityId: r.id, summary: `submitted ${d.type} request "${d.title}"` });
    revalidatePath("/requests");
    return { ok: true, message: "Request submitted." };
  });
}

export async function reviewRequest(_: unknown, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await requireUser();
    const id = String(fd.get("id"));
    const status = z.enum(["APPROVED", "REJECTED"]).parse(fd.get("status"));
    const r = await prisma.approvalRequest.findUniqueOrThrow({ where: { id } });
    const needFinance = r.type === "BALANCE_ENQUIRY" || r.type === "FINANCE";
    if (!(needFinance ? u.can("finance", "approve") : u.can("requests", "approve"))) throw new UserError("You are not authorised to review this request.");
    if (r.status !== "PENDING") throw new UserError("Request already reviewed.");
    if (r.requestedById === u.id && !u.isSuperAdmin) throw new UserError("You cannot approve your own request.");
    const note = String(fd.get("note") || "").slice(0, 5000) || null;
    await prisma.approvalRequest.update({ where: { id }, data: { status, reviewNote: note, reviewedById: u.id, reviewedAt: new Date() } });
    await notify([r.requestedById], { type: "REQUEST_REVIEWED", title: `Your request was ${status.toLowerCase()}: ${r.title}`, body: note ?? undefined, link: "/requests" });
    await audit({ userId: u.id, module: "requests", action: status.toLowerCase(), entity: "ApprovalRequest", entityId: id, summary: `${status.toLowerCase()} request "${r.title}"` });
    revalidatePath("/requests");
    return { ok: true };
  });
}

export async function submitDailyReport(_: unknown, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await requireUser();
    const d = z.object({ summary: zs.str(3000), completed: zs.optStr(3000), blockers: zs.optStr(3000), hoursWorked: z.coerce.number().min(0).max(24).optional() }).parse(formToObject(fd));
    const date = new Date(); date.setUTCHours(0, 0, 0, 0);
    await prisma.dailyReport.upsert({ where: { userId_date: { userId: u.id, date } }, create: { ...d, userId: u.id, date }, update: d });
    if (u.department?.managerId && u.department.managerId !== u.id) await notify([u.department.managerId], { type: "DAILY_REPORT", title: `Daily report from ${u.name}`, body: d.summary.slice(0, 140), link: "/requests?tab=reports" });
    revalidatePath("/requests");
    return { ok: true, message: "Daily report submitted." };
  });
}
