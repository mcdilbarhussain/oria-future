// Pure, unit-tested definition of the 11-step stock purchasing workflow.
import type { Action, Module } from "../permissions";

export type PRStatus = "SUBMITTED" | "MANAGEMENT_REVIEWED" | "QUOTATION_REQUESTED" | "QUOTED" | "FINANCE_REVIEWED" | "APPROVED" | "ORDERED" | "RECEIVED" | "REJECTED" | "CANCELLED";

export type PRStep = "management_review" | "request_quotation" | "add_quotation" | "finance_review" | "final_approve" | "create_po" | "receive" | "reject" | "cancel";

export const PR_STEPS: Record<PRStep, { from: PRStatus[]; to: PRStatus; perm: [Module, Action]; label: string }> = {
  management_review: { from: ["SUBMITTED"], to: "MANAGEMENT_REVIEWED", perm: ["purchasing", "approve"], label: "Management review – accept request" },
  request_quotation: { from: ["MANAGEMENT_REVIEWED"], to: "QUOTATION_REQUESTED", perm: ["purchasing", "edit"], label: "Request supplier quotation" },
  add_quotation: { from: ["QUOTATION_REQUESTED", "QUOTED"], to: "QUOTED", perm: ["purchasing", "edit"], label: "Upload supplier quotation" },
  finance_review: { from: ["QUOTED"], to: "FINANCE_REVIEWED", perm: ["finance", "approve"], label: "Finance review of estimated cost" },
  final_approve: { from: ["FINANCE_REVIEWED"], to: "APPROVED", perm: ["purchasing", "approve"], label: "Final approval by authorised manager" },
  create_po: { from: ["APPROVED"], to: "ORDERED", perm: ["purchasing", "create"], label: "Generate purchase order" },
  receive: { from: ["ORDERED"], to: "RECEIVED", perm: ["warehouse", "edit"], label: "Stock received at warehouse" },
  reject: { from: ["SUBMITTED", "MANAGEMENT_REVIEWED", "QUOTATION_REQUESTED", "QUOTED", "FINANCE_REVIEWED"], to: "REJECTED", perm: ["purchasing", "approve"], label: "Reject" },
  cancel: { from: ["SUBMITTED", "MANAGEMENT_REVIEWED", "QUOTATION_REQUESTED"], to: "CANCELLED", perm: ["purchasing", "create"], label: "Cancel request" },
};

export function canTransition(status: PRStatus, step: PRStep) {
  return PR_STEPS[step].from.includes(status);
}

export function nextSteps(status: PRStatus): PRStep[] {
  return (Object.keys(PR_STEPS) as PRStep[]).filter((s) => canTransition(status, s));
}

export const PR_TIMELINE: PRStatus[] = ["SUBMITTED", "MANAGEMENT_REVIEWED", "QUOTATION_REQUESTED", "QUOTED", "FINANCE_REVIEWED", "APPROVED", "ORDERED", "RECEIVED"];

/** Landed cost estimate in the quote currency: units * price + shipping. */
export function quoteTotal(q: { unitPrice: number; shippingCost: number; moq: number }, qty: number) {
  const units = Math.max(qty, q.moq);
  return Math.round((units * q.unitPrice + q.shippingCost) * 100) / 100;
}

export function cheapestQuote<T extends { unitPrice: number; shippingCost: number; moq: number }>(quotes: T[], qty: number): T | undefined {
  return [...quotes].sort((a, b) => quoteTotal(a, qty) - quoteTotal(b, qty))[0];
}
