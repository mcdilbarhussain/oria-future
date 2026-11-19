export type TStatus = "NEW" | "ASSIGNED" | "IN_PROGRESS" | "WAITING_APPROVAL" | "COMPLETED" | "REJECTED" | "OVERDUE";

/** Which status changes an employee (assignee) vs a manager may perform. */
export const ASSIGNEE_TRANSITIONS: Partial<Record<TStatus, TStatus[]>> = {
  NEW: ["IN_PROGRESS"],
  ASSIGNED: ["IN_PROGRESS"],
  IN_PROGRESS: ["WAITING_APPROVAL"],
  REJECTED: ["IN_PROGRESS"],
  OVERDUE: ["IN_PROGRESS", "WAITING_APPROVAL"],
};
export const MANAGER_TRANSITIONS: Partial<Record<TStatus, TStatus[]>> = {
  WAITING_APPROVAL: ["COMPLETED", "REJECTED"],
  COMPLETED: ["IN_PROGRESS"], // reopen
  REJECTED: ["ASSIGNED"],
};

export function isOverdue(t: { dueDate: Date | null; status: TStatus }, now = new Date()) {
  return !!t.dueDate && t.dueDate < now && !["COMPLETED", "WAITING_APPROVAL", "REJECTED"].includes(t.status);
}
