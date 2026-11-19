import "server-only";
import { Prisma, type PurchaseRequestStatus } from "@prisma/client";
import { prisma } from "../db";
import { UserError } from "../action";
import type { CurrentUser } from "../auth";
import { ForbiddenError } from "../auth";
import { PR_STEPS, canTransition, type PRStep } from "../workflows/purchasing";

/** Validates permission + state machine, then moves the request and appends to its history. */
export async function recordPRStep(prId: string, step: PRStep, u: CurrentUser, note?: string, data: Prisma.PurchaseRequestUpdateInput = {}, tx: Prisma.TransactionClient | typeof prisma = prisma) {
  const pr = await tx.purchaseRequest.findUniqueOrThrow({ where: { id: prId } });
  const def = PR_STEPS[step];
  if (!u.can(...def.perm)) throw new ForbiddenError(`Your role cannot perform: ${def.label}.`);
  if (!canTransition(pr.status, step)) throw new UserError(`Cannot "${def.label}" while request is ${pr.status.replace(/_/g, " ").toLowerCase()}.`);
  if ((step === "management_review" || step === "final_approve") && pr.requestedById === u.id && !u.isSuperAdmin) throw new UserError("You cannot approve your own purchase request.");
  const history = [...((pr.history as unknown[]) ?? []), { at: new Date().toISOString(), by: u.name, byId: u.id, step, status: def.to, note: note ?? null }];
  return tx.purchaseRequest.update({ where: { id: prId }, data: { ...data, status: def.to as PurchaseRequestStatus, history: history as Prisma.InputJsonValue } });
}
