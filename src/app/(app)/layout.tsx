import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { onlineCounts } from "@/lib/events";
import { AppShell, type NavGroup } from "@/components/shell";
import { NotificationBell, RealtimeProvider, UserMenu } from "@/components/realtime";
import { logoutAction } from "../(auth)/actions";
import { GlobalSearch } from "./search";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const u = await requireUser();
  const [unread, unreadMsgs, pendingReq] = await Promise.all([
    prisma.notification.count({ where: { userId: u.id, readAt: null } }),
    u.can("buyer_messages", "view") ? prisma.buyerMessageThread.count({ where: { unread: true, ebayAccount: u.isSuperAdmin || u.can("ebay_accounts", "manage") ? {} : { id: { in: u.assignedEbayAccountIds } } } }) : 0,
    u.can("purchasing", "approve") ? prisma.purchaseRequest.count({ where: { status: { in: ["SUBMITTED", "FINANCE_REVIEWED"] } } }) : 0,
  ]);
  const c = u.can;
  const groups: NavGroup[] = [
    { title: "Overview", items: [
      { href: "/dashboard", label: "Dashboard", icon: "LayoutDashboard" },
      c("tasks", "view") && { href: "/tasks", label: "Tasks", icon: "ListChecks" },
      c("chat", "view") && { href: "/chat", label: "Team Chat", icon: "MessagesSquare" },
      c("requests", "view") && { href: "/requests", label: "Requests & Reports", icon: "Inbox" },
      { href: "/notifications", label: "Notifications", icon: "Bell", badge: unread },
    ] },
    { title: "eBay", items: [
      c("ebay_accounts", "view") && { href: "/ebay/accounts", label: "eBay Accounts", icon: "Store" },
      c("ebay_orders", "view") && { href: "/ebay/orders", label: "Orders", icon: "ShoppingCart" },
      c("ebay_listings", "view") && { href: "/ebay/listings", label: "Listings", icon: "Tags" },
      c("buyer_messages", "view") && { href: "/ebay/messages", label: "Buyer Messages", icon: "Mail", badge: unreadMsgs },
      c("ebay_orders", "view") && { href: "/ebay/returns", label: "Returns & Refunds", icon: "Undo2" },
    ] },
    { title: "Operations", items: [
      c("inventory", "view") && { href: "/inventory", label: "Inventory", icon: "Boxes" },
      c("warehouse", "view") && { href: "/warehouse", label: "Warehouse", icon: "Warehouse" },
      c("suppliers", "view") && { href: "/suppliers", label: "China Suppliers", icon: "Factory" },
      c("enquiries", "view") && { href: "/enquiries", label: "Price Enquiries", icon: "FileSearch" },
      c("purchasing", "view") && { href: "/purchasing", label: "Purchasing", icon: "ClipboardList", badge: pendingReq },
    ] },
    { title: "Finance", items: [
      c("finance", "view") && { href: "/finance", label: "Finance Dashboard", icon: "Landmark" },
      c("finance", "view") && { href: "/finance/transactions", label: "Income & Expenses", icon: "Receipt" },
      c("payroll", "view") && { href: "/finance/payroll", label: "Employee Payments", icon: "Wallet" },
      c("reports", "view") && { href: "/reports", label: "Reports & Analytics", icon: "BarChart3" },
    ] },
    { title: "Administration", items: [
      c("employees", "view") && { href: "/employees", label: "Employees", icon: "Users" },
      c("departments", "view") && { href: "/departments", label: "Departments", icon: "Building2" },
      c("roles", "view") && { href: "/roles", label: "Roles & Permissions", icon: "ShieldCheck" },
      c("activity_logs", "view") && { href: "/activity-logs", label: "Activity Logs", icon: "History" },
      c("settings", "view") && { href: "/settings", label: "Company Settings", icon: "Settings" },
      { href: "/profile", label: "My Profile", icon: "UserCircle" },
    ] },
  ].map((g) => ({ ...g, items: g.items.filter(Boolean) as NavGroup["items"] })).filter((g) => g.items.length);

  const settings = await prisma.companySetting.findUnique({ where: { id: 1 }, select: { require2FAForAdmins: true } });
  const need2FA = !u.totpEnabled && (u.isSuperAdmin || (settings?.require2FAForAdmins && u.role.level >= 60));
  const banner = u.mustChangePassword || need2FA ? (
    <div className="border-b border-gold-300 bg-gold-50 px-6 py-2 text-sm text-gold-800">
      Security: please {u.mustChangePassword && <><Link href="/profile" className="font-semibold underline">change your initial password</Link>{need2FA ? " and " : ""}</>}{need2FA && <Link href="/profile" className="font-semibold underline">enable two-factor authentication</Link>}.
    </div>
  ) : null;

  return (
    <RealtimeProvider initialOnline={[...onlineCounts.entries()].filter(([, n]) => n > 0).map(([id]) => id)}>
      <AppShell nav={groups} banner={banner} topbar={
        <>
          <GlobalSearch />
          <div className="ml-auto flex items-center gap-1">
            <NotificationBell initialUnread={unread} />
            <UserMenu name={u.name} role={u.role.name} color={u.avatarColor}>
              <div className="border-b px-3 py-2"><p className="text-sm font-semibold">{u.name}</p><p className="truncate text-xs text-slate-500">{u.email}</p></div>
              <Link href="/profile" className="block rounded-lg px-3 py-2 text-sm hover:bg-slate-50">My profile & security</Link>
              <form action={logoutAction}><button className="w-full rounded-lg px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50">Sign out</button></form>
            </UserMenu>
          </div>
        </>
      }>
        {children}
      </AppShell>
    </RealtimeProvider>
  );
}
