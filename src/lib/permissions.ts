// Central RBAC definition. Every server action / API route checks these on the backend.
export const ACTIONS = ["view", "create", "edit", "delete", "approve", "export", "manage"] as const;
export type Action = (typeof ACTIONS)[number];

export const MODULES = {
  dashboard: "Main Dashboard",
  employees: "Employee Management",
  departments: "Departments",
  roles: "Roles & Permissions",
  tasks: "Task Management",
  chat: "Internal Chat",
  requests: "Requests & Approvals",
  ebay_accounts: "eBay Accounts",
  ebay_orders: "eBay Orders",
  ebay_listings: "eBay Listings",
  buyer_messages: "Buyer Messages",
  inventory: "Inventory",
  warehouse: "Warehouse",
  suppliers: "Suppliers",
  enquiries: "Price Enquiries",
  purchasing: "Purchasing & POs",
  finance: "Finance",
  payroll: "Employee Payments (restricted)",
  reports: "Reports & Analytics",
  activity_logs: "Activity Logs",
  settings: "Company Settings",
} as const;
export type Module = keyof typeof MODULES;

export type PermissionSet = Set<string>; // "module:action"
export const perm = (m: Module, a: Action) => `${m}:${a}`;

export const SUPER_ADMIN_KEY = "super_admin";

export function can(perms: PermissionSet, roleKey: string, m: Module, a: Action): boolean {
  if (roleKey === SUPER_ADMIN_KEY) return true;
  // Roles module is reserved for the Super Admin – high level permissions cannot be delegated.
  if (m === "roles" && a !== "view") return false;
  return perms.has(perm(m, a)) || (a !== "manage" && perms.has(perm(m, "manage")));
}

type Grant = Partial<Record<Module, Action[] | "all">>;
const ALL = "all" as const;
const VIEW: Action[] = ["view"];
const WORK: Action[] = ["view", "create", "edit"];

/** Default role catalogue (seeded). Custom roles can be created by the Super Admin. */
export const DEFAULT_ROLES: { key: string; name: string; level: number; description: string; grants: Grant }[] = [
  { key: SUPER_ADMIN_KEY, name: "Super Admin / Owner", level: 100, description: "Full unrestricted control of the company.", grants: {} },
  {
    key: "general_manager", name: "General Manager", level: 90, description: "Manages all departments, approvals and reporting.",
    grants: { dashboard: ALL, employees: ["view", "create", "edit"], departments: ALL, roles: VIEW, tasks: ALL, chat: ALL, requests: ALL, ebay_accounts: ["view", "manage"], ebay_orders: ALL, ebay_listings: ALL, buyer_messages: ALL, inventory: ALL, warehouse: ALL, suppliers: ALL, enquiries: ALL, purchasing: ALL, finance: ALL, reports: ALL, activity_logs: VIEW, settings: VIEW },
  },
  {
    key: "operations_manager", name: "Operations Manager", level: 80, description: "Runs day-to-day operations, tasks and purchasing approvals.",
    grants: { dashboard: VIEW, employees: VIEW, departments: VIEW, tasks: ALL, chat: ALL, requests: ["view", "approve"], ebay_accounts: VIEW, ebay_orders: ["view", "edit", "export"], ebay_listings: ["view", "export"], buyer_messages: ["view", "approve"], inventory: ALL, warehouse: ALL, suppliers: ALL, enquiries: ALL, purchasing: ["view", "create", "edit", "approve", "export"], finance: VIEW, reports: ["view", "export"], activity_logs: VIEW },
  },
  {
    key: "stock_manager", name: "Stock Manager", level: 60, description: "Owns UK warehouse inventory and stock purchasing requests.",
    grants: { dashboard: VIEW, tasks: WORK, chat: WORK, requests: ["view", "create"], inventory: ALL, warehouse: ALL, suppliers: ["view", "create", "edit"], enquiries: ["view", "create", "edit"], purchasing: ["view", "create", "edit", "export"], reports: ["view", "export"] },
  },
  {
    key: "stock_worker", name: "Stock Worker", level: 30, description: "Records stock in/out, damages and returns.",
    grants: { dashboard: VIEW, tasks: ["view", "edit"], chat: WORK, requests: ["view", "create"], inventory: ["view", "create", "edit"], warehouse: ["view", "create", "edit"], suppliers: VIEW, enquiries: ["view", "create"], purchasing: ["view", "create"] },
  },
  {
    key: "finance_manager", name: "Finance Manager", level: 70, description: "Manages company finances, approvals and payroll records.",
    grants: { dashboard: VIEW, tasks: WORK, chat: WORK, requests: ["view", "create", "approve"], ebay_accounts: VIEW, ebay_orders: ["view", "export"], suppliers: VIEW, enquiries: VIEW, purchasing: ["view", "approve", "export"], finance: ALL, payroll: ALL, reports: ALL },
  },
  {
    key: "finance_worker", name: "Finance Worker", level: 40, description: "Records income, expenses and supplier payments.",
    grants: { dashboard: VIEW, tasks: ["view", "edit"], chat: WORK, requests: ["view", "create"], ebay_orders: VIEW, suppliers: VIEW, purchasing: VIEW, finance: ["view", "create", "edit", "export"], reports: ["view", "export"] },
  },
  {
    key: "ebay_account_manager", name: "eBay Account Manager", level: 60, description: "Manages assigned eBay accounts, listings, orders and messages.",
    grants: { dashboard: VIEW, tasks: WORK, chat: WORK, requests: ["view", "create"], ebay_accounts: ["view", "edit"], ebay_orders: ["view", "edit", "export"], ebay_listings: ALL, buyer_messages: ALL, inventory: VIEW, reports: ["view", "export"] },
  },
  {
    key: "ebay_listing_employee", name: "eBay Listing Employee", level: 30, description: "Creates and updates listings on assigned accounts.",
    grants: { dashboard: VIEW, tasks: ["view", "edit"], chat: WORK, requests: ["view", "create"], ebay_accounts: VIEW, ebay_orders: VIEW, ebay_listings: ["view", "create", "edit"], inventory: VIEW },
  },
  {
    key: "customer_support", name: "Customer Support Employee", level: 30, description: "Handles buyer messages on assigned accounts.",
    grants: { dashboard: VIEW, tasks: ["view", "edit"], chat: WORK, requests: ["view", "create"], ebay_accounts: VIEW, ebay_orders: VIEW, buyer_messages: ["view", "create", "edit"] },
  },
  {
    key: "office_worker", name: "Office Worker", level: 20, description: "Works on assigned tasks and submits daily reports.",
    grants: { dashboard: VIEW, tasks: ["view", "edit"], chat: WORK, requests: ["view", "create"] },
  },
];

export function expandGrants(g: Grant): { module: Module; action: Action }[] {
  const out: { module: Module; action: Action }[] = [];
  for (const [m, acts] of Object.entries(g) as [Module, Action[] | "all"][]) {
    for (const a of acts === "all" ? ACTIONS : acts) out.push({ module: m, action: a });
  }
  return out;
}
