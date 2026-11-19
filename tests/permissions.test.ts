import { describe, it, expect } from "vitest";
import { can, DEFAULT_ROLES, expandGrants, perm } from "../src/lib/permissions";

const setFor = (key: string) => new Set(expandGrants(DEFAULT_ROLES.find((r) => r.key === key)!.grants).map((g) => perm(g.module, g.action)));

describe("RBAC", () => {
  it("super admin can do everything", () => {
    expect(can(new Set(), "super_admin", "payroll", "delete")).toBe(true);
    expect(can(new Set(), "super_admin", "roles", "manage")).toBe(true);
  });
  it("nobody but super admin can change roles, even if granted", () => {
    expect(can(new Set(["roles:manage", "roles:edit"]), "general_manager", "roles", "manage")).toBe(false);
    expect(can(new Set(["roles:manage"]), "general_manager", "roles", "edit")).toBe(false);
    expect(can(new Set(["roles:view"]), "general_manager", "roles", "view")).toBe(true);
  });
  it("manage implies other actions on the same module", () => {
    expect(can(new Set(["inventory:manage"]), "x", "inventory", "delete")).toBe(true);
    expect(can(new Set(["inventory:manage"]), "x", "finance", "view")).toBe(false);
  });
  it("office workers cannot see finance or payroll", () => {
    const s = setFor("office_worker");
    expect(can(s, "office_worker", "finance", "view")).toBe(false);
    expect(can(s, "office_worker", "payroll", "view")).toBe(false);
    expect(can(s, "office_worker", "tasks", "view")).toBe(true);
  });
  it("payroll is restricted to finance manager among defaults", () => {
    const withPayroll = DEFAULT_ROLES.filter((r) => r.key !== "super_admin" && can(setFor(r.key), r.key, "payroll", "view")).map((r) => r.key);
    expect(withPayroll).toEqual(["finance_manager"]);
  });
  it("finance worker can record but not approve", () => {
    const s = setFor("finance_worker");
    expect(can(s, "finance_worker", "finance", "create")).toBe(true);
    expect(can(s, "finance_worker", "finance", "approve")).toBe(false);
  });
  it("defines the 11 required default roles", () => {
    expect(DEFAULT_ROLES).toHaveLength(11);
  });
});
