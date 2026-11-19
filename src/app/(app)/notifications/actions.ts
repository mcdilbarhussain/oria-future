"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { run, type ActionResult } from "@/lib/action";
export async function markAllRead(): Promise<ActionResult> {
  return run(async () => {
    const u = await requireUser();
    await prisma.notification.updateMany({ where: { userId: u.id, readAt: null }, data: { readAt: new Date() } });
    revalidatePath("/", "layout");
    return { ok: true };
  });
}
