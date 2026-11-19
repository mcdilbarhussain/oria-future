import { describe, it, expect } from "vitest";
import { canTransition, nextSteps, quoteTotal, cheapestQuote, PR_TIMELINE } from "../src/lib/workflows/purchasing";
import { ASSIGNEE_TRANSITIONS, MANAGER_TRANSITIONS, isOverdue } from "../src/lib/workflows/tasks";
import { profitAndLoss } from "../src/lib/workflows/finance";

describe("purchasing workflow", () => {
  it("follows the ordered pipeline", () => {
    expect(canTransition("SUBMITTED", "management_review")).toBe(true);
    expect(canTransition("SUBMITTED", "final_approve")).toBe(false);
    expect(canTransition("QUOTED", "finance_review")).toBe(true);
    expect(canTransition("FINANCE_REVIEWED", "final_approve")).toBe(true);
    expect(canTransition("APPROVED", "create_po")).toBe(true);
    expect(canTransition("ORDERED", "receive")).toBe(true);
    expect(canTransition("ORDERED", "reject")).toBe(false);
  });
  it("cannot skip finance review", () => {
    expect(nextSteps("QUOTATION_REQUESTED")).not.toContain("final_approve");
    expect(nextSteps("QUOTED")).not.toContain("create_po");
  });
  it("timeline has 8 states", () => expect(PR_TIMELINE).toHaveLength(8));
  it("computes landed quote totals respecting MOQ", () => {
    expect(quoteTotal({ unitPrice: 2.5, shippingCost: 100, moq: 500 }, 200)).toBe(1350);
    expect(quoteTotal({ unitPrice: 2.5, shippingCost: 100, moq: 100 }, 200)).toBe(600);
  });
  it("finds the cheapest landed quote, not cheapest unit price", () => {
    const a = { id: "a", unitPrice: 2.45, shippingCost: 240, moq: 500 };
    const b = { id: "b", unitPrice: 2.6, shippingCost: 180, moq: 300 };
    expect(cheapestQuote([a, b], 300)?.id).toBe("b");
    expect(cheapestQuote([a, b], 500)?.id).toBe("a");
  });
});

describe("task workflow", () => {
  it("assignee can only submit, manager approves", () => {
    expect(ASSIGNEE_TRANSITIONS.IN_PROGRESS).toEqual(["WAITING_APPROVAL"]);
    expect(ASSIGNEE_TRANSITIONS.WAITING_APPROVAL).toBeUndefined();
    expect(MANAGER_TRANSITIONS.WAITING_APPROVAL).toContain("COMPLETED");
    expect(MANAGER_TRANSITIONS.COMPLETED).toContain("IN_PROGRESS");
  });
  it("detects overdue", () => {
    const now = new Date("2026-01-10");
    expect(isOverdue({ dueDate: new Date("2026-01-09"), status: "IN_PROGRESS" }, now)).toBe(true);
    expect(isOverdue({ dueDate: new Date("2026-01-09"), status: "COMPLETED" }, now)).toBe(false);
    expect(isOverdue({ dueDate: null, status: "NEW" }, now)).toBe(false);
  });
});

describe("profit & loss", () => {
  it("separates actual from estimated and ignores unapproved", () => {
    const r = profitAndLoss([
      { type: "INCOME", category: "SALES", amount: 1000, isEstimated: false, status: "APPROVED" },
      { type: "EXPENSE", category: "PLATFORM_FEE", amount: 130, isEstimated: false, status: "APPROVED" },
      { type: "EXPENSE", category: "PURCHASE", amount: 500, isEstimated: true, status: "APPROVED" },
      { type: "EXPENSE", category: "SHIPPING", amount: 999, isEstimated: false, status: "PENDING_APPROVAL" },
    ]);
    expect(r.actual).toEqual({ income: 1000, expense: 130, profit: 870 });
    expect(r.estimated.profit).toBe(370);
    expect(r.byCategory.SHIPPING).toBeUndefined();
  });
});
