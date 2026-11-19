/* ORIA FUTURE – seed: roles, departments, users and clearly-labelled DEMO data. Idempotent-ish: run on an empty DB. */
import { PrismaClient, Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { DEFAULT_ROLES, expandGrants } from "../src/lib/permissions";

const prisma = new PrismaClient();
const D = (n: number) => new Prisma.Decimal(n);
const daysAgo = (n: number) => new Date(Date.now() - n * 86400_000);
const rnd = (a: number, b: number) => Math.floor(Math.random() * (b - a + 1)) + a;
const pick = <T,>(a: T[]) => a[rnd(0, a.length - 1)];

async function main() {
  const withDemo = process.env.SEED_DEMO !== "false";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || "OriaAdmin#2026";
  const demoPassword = "Demo#Password1";

  await prisma.companySetting.upsert({ where: { id: 1 }, create: { id: 1, legalName: "ORIA FUTURE LTD", email: "office@oriafuture.com", address: "Unit 4, Trafford Park, Manchester, M17 1AB, United Kingdom" }, update: {} });

  // Roles & permissions
  const roles: Record<string, string> = {};
  for (const r of DEFAULT_ROLES) {
    const role = await prisma.role.upsert({ where: { key: r.key }, create: { key: r.key, name: r.name, description: r.description, level: r.level, isSystem: true }, update: { name: r.name, description: r.description, level: r.level } });
    roles[r.key] = role.id;
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    const grants = expandGrants(r.grants);
    if (grants.length) await prisma.rolePermission.createMany({ data: grants.map((g) => ({ roleId: role.id, ...g })) });
  }

  // Departments
  const deptDefs = [
    { code: "MGMT", name: "Management Team", color: "#0c1630", description: "Company leadership, approvals and oversight." },
    { code: "STOCK", name: "Stock & Warehouse", color: "#355291", description: "UK warehouse, inventory and purchasing requests." },
    { code: "FIN", name: "Finance Department", color: "#9c701f", description: "Income, expenses, supplier payments and reporting." },
    { code: "EBAY", name: "eBay Account Selling", color: "#0f766e", description: "Listings, orders and customer service across eBay accounts." },
    { code: "OFFICE", name: "Office Workers", color: "#6b21a8", description: "General office and administrative work." },
  ];
  const depts: Record<string, string> = {};
  for (const d of deptDefs) depts[d.code] = (await prisma.department.upsert({ where: { code: d.code }, create: d, update: {} })).id;

  const owner = await prisma.user.upsert({
    where: { email: "owner@oriafuture.com" },
    create: { email: "owner@oriafuture.com", name: "Company Owner", jobTitle: "Founder & CEO", passwordHash: await bcrypt.hash(adminPassword, 12), roleId: roles.super_admin, departmentId: depts.MGMT, mustChangePassword: true, avatarColor: "#c09028" },
    update: {},
  });

  // Default warehouse + chat groups always exist
  const wh = await prisma.warehouse.upsert({ where: { code: "UK-MAN" }, create: { code: "UK-MAN", name: "Manchester Main Warehouse", address: "Unit 4, Trafford Park, Manchester M17 1AB", isDefault: true }, update: {} });

  if (!withDemo) { await ensureGroups(owner.id, depts); console.log("Seeded base data (no demo)."); return; }

  // ───── DEMO DATA (all marked isDemo where applicable; users use @demo.oriafuture.com) ─────
  const pw = await bcrypt.hash(demoPassword, 12);
  const people: [string, string, string, string][] = [
    ["Sarah Mitchell", "gm", "general_manager", "MGMT"],
    ["James Carter", "ops", "operations_manager", "MGMT"],
    ["Daniel Hughes", "stock.manager", "stock_manager", "STOCK"],
    ["Aisha Khan", "stock.worker", "stock_worker", "STOCK"],
    ["Tom Baker", "stock.worker2", "stock_worker", "STOCK"],
    ["Emily Watson", "finance.manager", "finance_manager", "FIN"],
    ["Oliver Grant", "finance", "finance_worker", "FIN"],
    ["Priya Patel", "ebay.manager", "ebay_account_manager", "EBAY"],
    ["Liam Chen", "lister", "ebay_listing_employee", "EBAY"],
    ["Sophie Turner", "support", "customer_support", "EBAY"],
    ["Mohammed Ali", "office", "office_worker", "OFFICE"],
  ];
  const colors = ["#253d74", "#0f766e", "#9c701f", "#6b21a8", "#b91c1c", "#1d4ed8", "#15803d"];
  const U: Record<string, string> = {};
  for (const [name, handle, role, dept] of people) {
    const u = await prisma.user.upsert({
      where: { email: `${handle}@demo.oriafuture.com` },
      create: { email: `${handle}@demo.oriafuture.com`, name, passwordHash: pw, roleId: roles[role], departmentId: depts[dept], jobTitle: DEFAULT_ROLES.find((r) => r.key === role)!.name, avatarColor: pick(colors), lastLoginAt: daysAgo(rnd(0, 3)) },
      update: {},
    });
    U[handle] = u.id;
  }
  await prisma.department.update({ where: { id: depts.MGMT }, data: { managerId: U.gm } });
  await prisma.department.update({ where: { id: depts.STOCK }, data: { managerId: U["stock.manager"] } });
  await prisma.department.update({ where: { id: depts.FIN }, data: { managerId: U["finance.manager"] } });
  await prisma.department.update({ where: { id: depts.EBAY }, data: { managerId: U["ebay.manager"] } });
  await ensureGroups(owner.id, depts);

  // Suppliers (China)
  const supDefs = [
    { companyName: "Shenzhen Brightway Electronics Co., Ltd.", contactPerson: "Kevin Zhang", email: "kevin@brightway-demo.cn", phone: "+86 755 8888 1234", wechat: "kevin_bw", city: "Shenzhen", province: "Guangdong", categories: ["Electronics", "Phone Accessories"], paymentTerms: "30% deposit, 70% before shipment", currency: "USD", rating: D(4.5) },
    { companyName: "Yiwu Homestyle Trading Co.", contactPerson: "Linda Wu", email: "linda@homestyle-demo.cn", phone: "+86 579 8555 2211", wechat: "linda_yiwu", city: "Yiwu", province: "Zhejiang", categories: ["Home & Kitchen", "Storage"], paymentTerms: "100% T/T before shipment", currency: "USD", rating: D(4.1) },
    { companyName: "Guangzhou FitPro Sports Equipment", contactPerson: "Jason Li", email: "jason@fitpro-demo.cn", phone: "+86 20 3666 7788", wechat: "fitpro_jason", city: "Guangzhou", province: "Guangdong", categories: ["Sports", "Fitness"], paymentTerms: "Net 15 after B/L", currency: "USD", rating: D(3.8) },
    { companyName: "Ningbo AutoParts Manufacturing", contactPerson: "Helen Chen", email: "helen@nbauto-demo.cn", phone: "+86 574 8777 9900", city: "Ningbo", province: "Zhejiang", categories: ["Car Accessories"], paymentTerms: "50% deposit, 50% on B/L copy", currency: "USD", rating: D(4.3) },
  ];
  const sups = [];
  for (const s of supDefs) sups.push(await prisma.supplier.create({ data: { ...s, isDemo: true, defaultShippingCost: D(rnd(80, 300)), notes: "DEMO supplier record" } }));

  // Products
  const prodDefs: [string, string, string, number, number, number][] = [
    ["OF-USBC-65W", "65W USB-C GaN Fast Charger", "Electronics", 6.2, 19.99, 0],
    ["OF-CBL-2M", "Braided USB-C Cable 2m (2-pack)", "Phone Accessories", 1.1, 7.99, 0],
    ["OF-EAR-TWS", "Wireless Earbuds TWS Pro", "Electronics", 8.4, 29.99, 0],
    ["OF-PB-20K", "20000mAh Power Bank", "Electronics", 9.5, 24.99, 0],
    ["OF-CASE-IP15", "Shockproof Case iPhone 15", "Phone Accessories", 0.9, 9.99, 0],
    ["OF-KIT-ORG", "Kitchen Drawer Organiser Set", "Home & Kitchen", 3.2, 14.99, 1],
    ["OF-VAC-BAG", "Vacuum Storage Bags (10-pack)", "Storage", 2.8, 12.99, 1],
    ["OF-LED-STR", "LED Strip Lights 10m RGB", "Home & Kitchen", 4.1, 16.99, 1],
    ["OF-YOGA-MAT", "Non-slip Yoga Mat 6mm", "Fitness", 4.6, 18.99, 2],
    ["OF-RES-BND", "Resistance Bands Set (5)", "Fitness", 2.2, 11.99, 2],
    ["OF-DMB-10", "Adjustable Dumbbell 10kg", "Sports", 11.8, 34.99, 2],
    ["OF-CAR-MNT", "Magnetic Car Phone Mount", "Car Accessories", 1.7, 9.49, 3],
    ["OF-CAR-VAC", "Cordless Car Vacuum Cleaner", "Car Accessories", 10.5, 32.99, 3],
    ["OF-DASH-CAM", "1080p Dash Cam with Night Vision", "Car Accessories", 14.2, 44.99, 3],
  ];
  const prods = [];
  for (const [sku, name, category, cost, price, si] of prodDefs) {
    const p = await prisma.product.create({ data: { sku, name, category, costPrice: D(cost), sellPrice: D(price), barcode: `50${rnd(10000000000, 99999999999)}`, reorderLevel: 20, reorderQty: 200, preferredSupplierId: sups[si].id, isDemo: true, description: `DEMO product – ${name}` } });
    prods.push(p);
    await prisma.supplierProduct.create({ data: { supplierId: sups[si].id, productId: p.id, name, unitPrice: D(+(cost * 1.25).toFixed(2)), moq: pick([100, 200, 500]), shippingCostPerUnit: D(+(cost * 0.15).toFixed(2)), leadTimeDays: rnd(15, 40) } });
    const qty = sku === "OF-DASH-CAM" ? 6 : sku === "OF-RES-BND" ? 12 : rnd(40, 400);
    await prisma.stockLevel.create({ data: { productId: p.id, warehouseId: wh.id, quantity: qty, binLocation: `A${rnd(1, 9)}-${rnd(1, 30)}` } });
    await prisma.stockMovement.create({ data: { productId: p.id, warehouseId: wh.id, type: "IN", quantity: qty, balanceAfter: qty, reference: "Opening stock", note: "DEMO opening balance", userId: U["stock.manager"], createdAt: daysAgo(60) } });
  }

  // eBay accounts (DEMO – not connected to eBay)
  const accDefs = [
    { code: "OF-MAIN", name: "ORIA Main Store (DEMO)", ebayUsername: "oria_main_demo" },
    { code: "OF-TECH", name: "ORIA Tech Deals (DEMO)", ebayUsername: "oria_tech_demo" },
    { code: "OF-HOME", name: "ORIA Home & Fitness (DEMO)", ebayUsername: "oria_home_demo" },
  ];
  const accs = [];
  for (const a of accDefs) accs.push(await prisma.ebayAccount.create({ data: { ...a, isDemo: true, status: "CONNECTED", environment: "SANDBOX", connectedAt: daysAgo(90), lastSyncAt: daysAgo(0), notes: "DEMO account with sample data. It is NOT connected to eBay – connect a real account from the eBay Accounts page." } }));
  for (const h of ["ebay.manager", "lister", "support"]) for (const a of accs.slice(0, h === "support" ? 2 : 3)) await prisma.ebayAccountAssignment.create({ data: { userId: U[h], ebayAccountId: a.id } });

  // Listings
  for (const p of prods) {
    const acc = p.category === "Electronics" || p.category === "Phone Accessories" ? accs[1] : p.category === "Car Accessories" ? accs[0] : accs[2];
    await prisma.ebayListing.create({ data: { ebayAccountId: acc.id, productId: p.id, sku: p.sku, title: p.name, description: `<p>${p.name}</p><p>Fast UK dispatch from our Manchester warehouse.</p>`, categoryId: String(rnd(10000, 99999)), price: p.sellPrice, quantity: rnd(10, 80), status: "ACTIVE", ebayItemId: `DEMO-${rnd(100000000, 999999999)}`, views: rnd(50, 3000), watchers: rnd(0, 80), soldQuantity: rnd(5, 250), createdById: U.lister, updatedById: U.lister, isDemo: true, imageUrls: [] } });
  }
  await prisma.ebayListing.create({ data: { ebayAccountId: accs[0].id, sku: "OF-DRAFT-01", title: "Car Seat Gap Filler Organiser (draft)", price: D(8.99), quantity: 50, status: "DRAFT", createdById: U.lister, isDemo: true, imageUrls: [] } });
  await prisma.ebayListing.create({ data: { ebayAccountId: accs[1].id, sku: "OF-ERR-01", title: "Smart Watch Band 22mm", price: D(6.99), quantity: 30, status: "ERROR", lastError: "DEMO: Item specifics 'Brand' is required for this category.", createdById: U.lister, isDemo: true, imageUrls: [] } });

  // Orders over last 60 days + sales income
  const cities = [["London", "E1 6AN"], ["Birmingham", "B1 1AA"], ["Leeds", "LS1 4AP"], ["Glasgow", "G1 2FF"], ["Bristol", "BS1 4DJ"], ["Liverpool", "L1 8JQ"]];
  const buyers = ["jsmith_88", "kate.w", "mark_t_uk", "buyer_4412", "lucy.m", "dan_r", "angela_b", "harry_p77", "zoe-k", "raj.s"];
  let n = 0;
  for (let day = 60; day >= 0; day--) {
    for (let k = 0; k < rnd(1, 5); k++) {
      const p = pick(prods), acc = pick(accs), qty = rnd(1, 2), [city, pc] = pick(cities);
      const total = +(Number(p.sellPrice) * qty + 2.99).toFixed(2);
      const fees = +(total * 0.128 + 0.3).toFixed(2);
      const dispatched = day > 1 || Math.random() > 0.5;
      const refunded = Math.random() < 0.04 ? total : 0;
      const orderedAt = new Date(daysAgo(day).getTime() - rnd(0, 20) * 3600_000);
      const o = await prisma.ebayOrder.create({
        data: {
          ebayAccountId: acc.id, orderId: `DEMO-${String(++n).padStart(2, "0")}-${rnd(10000, 99999)}`, buyerUsername: pick(buyers), buyerName: "Demo Buyer", shipToCity: city, shipToPostcode: pc, shipToCountry: "GB",
          orderStatus: dispatched ? "FULFILLED" : "NOT_STARTED", paymentStatus: refunded ? "FULLY_REFUNDED" : "PAID", total: D(total), deliveryCost: D(2.99), fees: D(fees), refundedAmount: D(refunded),
          dispatchBy: new Date(orderedAt.getTime() + 2 * 86400_000), dispatchedAt: dispatched ? new Date(orderedAt.getTime() + 86400_000) : null, carrier: dispatched ? "Royal Mail" : null, trackingNumber: dispatched ? `RM${rnd(100000000, 999999999)}GB` : null, orderedAt, isDemo: true,
          items: { create: [{ lineItemId: `L${n}`, sku: p.sku, title: p.name, quantity: qty, unitPrice: p.sellPrice, productId: p.id }] },
        },
      });
      await prisma.transaction.create({ data: { type: "INCOME", category: "SALES", amount: D(total), date: orderedAt, description: `eBay order ${o.orderId}`, reference: o.orderId, ebayAccountId: acc.id, ebayOrderId: o.id, createdById: owner.id, isDemo: true } });
      await prisma.transaction.create({ data: { type: "EXPENSE", category: "PLATFORM_FEE", amount: D(fees), date: orderedAt, description: `eBay fees ${o.orderId}`, reference: o.orderId, ebayAccountId: acc.id, ebayOrderId: o.id, createdById: owner.id, isDemo: true } });
      if (refunded) {
        await prisma.transaction.create({ data: { type: "EXPENSE", category: "REFUND", amount: D(refunded), date: new Date(orderedAt.getTime() + 5 * 86400_000), description: `Refund ${o.orderId}`, reference: o.orderId, ebayAccountId: acc.id, ebayOrderId: o.id, createdById: U.finance, isDemo: true } });
        await prisma.ebayReturn.create({ data: { ebayAccountId: acc.id, returnId: `DEMO-R${n}`, orderId: o.orderId, buyerUsername: o.buyerUsername, reason: pick(["NOT_AS_DESCRIBED", "DEFECTIVE_ITEM", "NO_LONGER_NEED_ITEM"]), status: "CLOSED", refundAmount: D(refunded), openedAt: new Date(orderedAt.getTime() + 3 * 86400_000), isDemo: true } });
      }
    }
  }
  await prisma.ebayReturn.create({ data: { ebayAccountId: accs[1].id, returnId: "DEMO-R-OPEN1", orderId: "DEMO-OPEN", buyerUsername: "kate.w", reason: "DEFECTIVE_ITEM", status: "WAITING_FOR_SELLER", refundAmount: D(29.99), openedAt: daysAgo(1), isDemo: true } });

  // Finance accounts & operating expenses
  const bank = await prisma.financeAccount.create({ data: { name: "Business Current Account (DEMO)", type: "BANK", openingBalance: D(25000) } });
  await prisma.financeAccount.create({ data: { name: "eBay Payouts (DEMO)", type: "PAYOUT", openingBalance: D(0) } });
  const months = [2, 1, 0];
  for (const m of months) {
    const d = new Date(); d.setMonth(d.getMonth() - m, 1);
    await prisma.transaction.create({ data: { type: "EXPENSE", category: "WAREHOUSE", amount: D(2400), date: d, description: "Warehouse rent – Trafford Park", financeAccountId: bank.id, createdById: U.finance, isDemo: true } });
    await prisma.transaction.create({ data: { type: "EXPENSE", category: "SHIPPING", amount: D(rnd(600, 1100)), date: new Date(d.getTime() + 10 * 86400_000), description: "Royal Mail Click & Drop monthly invoice", financeAccountId: bank.id, createdById: U.finance, isDemo: true } });
    await prisma.transaction.create({ data: { type: "EXPENSE", category: "OFFICE", amount: D(rnd(150, 400)), date: new Date(d.getTime() + 5 * 86400_000), description: "Packaging materials", financeAccountId: bank.id, createdById: U.finance, isDemo: true } });
  }
  await prisma.transaction.create({ data: { type: "EXPENSE", category: "SUPPLIER_PAYMENT", amount: D(3850), date: daysAgo(20), description: "Deposit – Shenzhen Brightway PO", supplierId: sups[0].id, financeAccountId: bank.id, createdById: U.finance, isDemo: true } });
  await prisma.transaction.create({ data: { type: "EXPENSE", category: "SUPPLIER_PAYMENT", amount: D(4200), date: daysAgo(-10), dueDate: daysAgo(-10), description: "Balance due – Yiwu Homestyle", supplierId: sups[1].id, paymentStatus: "OUTSTANDING", isEstimated: true, createdById: U.finance, isDemo: true } });
  await prisma.transaction.create({ data: { type: "EXPENSE", category: "SHIPPING", amount: D(1650), date: daysAgo(2), description: "Sea freight Ningbo → Felixstowe (awaiting approval)", status: "PENDING_APPROVAL", createdById: U.finance, isDemo: true } });

  // Employee payments (restricted)
  for (const h of Object.keys(U)) await prisma.employeePayment.create({ data: { userId: U[h], period: new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 7), amount: D(rnd(1900, 3800)), paidAt: daysAgo(5), note: "DEMO payroll record", createdById: U["finance.manager"] } });

  // Purchase workflow examples
  const pr1 = await prisma.purchaseRequest.create({ data: { reference: "PR-2026-0001", productId: prods[13].id, quantity: 200, reason: "Dash cam below reorder level (6 units). DEMO.", priority: "HIGH", status: "SUBMITTED", requestedById: U["stock.manager"], history: [{ at: daysAgo(1), by: "Daniel Hughes", status: "SUBMITTED" }] } });
  const pr2 = await prisma.purchaseRequest.create({ data: { reference: "PR-2026-0002", productId: prods[9].id, quantity: 500, reason: "Resistance bands – Q1 fitness season. DEMO.", status: "QUOTED", requestedById: U["stock.worker"], managementReviewById: U.ops, history: [{ at: daysAgo(6), by: "Aisha Khan", status: "SUBMITTED" }, { at: daysAgo(5), by: "James Carter", status: "MANAGEMENT_REVIEWED" }, { at: daysAgo(5), by: "James Carter", status: "QUOTATION_REQUESTED" }, { at: daysAgo(3), by: "Daniel Hughes", status: "QUOTED" }] } });
  await prisma.quotation.create({ data: { supplierId: sups[2].id, purchaseRequestId: pr2.id, unitPrice: D(2.6), moq: 300, shippingCost: D(180), leadTimeDays: 25, createdById: U["stock.manager"], notes: "DEMO quote via WeChat" } });
  await prisma.quotation.create({ data: { supplierId: sups[1].id, purchaseRequestId: pr2.id, unitPrice: D(2.45), moq: 500, shippingCost: D(240), leadTimeDays: 30, createdById: U["stock.manager"], notes: "DEMO quote via email" } });
  void pr1;
  const po = await prisma.purchaseOrder.create({ data: { poNumber: "PO-2026-0001", supplierId: sups[0].id, warehouseId: wh.id, status: "IN_TRANSIT", currency: "USD", subtotal: D(3100), shippingCost: D(320), total: D(3420), carrier: "COSCO Sea Freight", trackingNumber: "COSU6234567890", orderedAt: daysAgo(25), shippedAt: daysAgo(12), eta: daysAgo(-14), createdById: U.ops, isDemo: true, items: { create: [{ productId: prods[0].id, quantity: 300, unitCost: D(7.0) }, { productId: prods[3].id, quantity: 100, unitCost: D(10) }] } } });
  void po;
  const enq = await prisma.priceEnquiry.create({ data: { reference: "ENQ-2026-0001", productId: prods[2].id, productName: prods[2].name, quantity: 300, targetPrice: D(8), status: "QUOTING", requestedById: U.lister, notes: "Best-seller on Tech Deals – check if we can get a better price. DEMO." } });
  await prisma.quotation.create({ data: { supplierId: sups[0].id, enquiryId: enq.id, unitPrice: D(8.9), moq: 200, shippingCost: D(150), leadTimeDays: 20, createdById: U["stock.manager"] } });
  await prisma.supplierCommunication.create({ data: { supplierId: sups[0].id, userId: U["stock.manager"], channel: "WECHAT", subject: "TWS earbuds price", summary: "Kevin confirmed $8.90 at 200 MOQ, can do $8.40 at 1000+. DEMO." } });
  await prisma.supplierReview.create({ data: { supplierId: sups[0].id, userId: U.ops, rating: 5, comment: "Consistent quality, quick replies. DEMO." } });

  // Tasks
  const taskDefs: [string, string, string | null, string, "LOW" | "MEDIUM" | "HIGH" | "URGENT", "NEW" | "ASSIGNED" | "IN_PROGRESS" | "WAITING_APPROVAL" | "COMPLETED" | "OVERDUE", number][] = [
    ["Stock count – aisle A", "Full cycle count of aisle A and reconcile differences.", "stock.worker", "STOCK", "HIGH", "IN_PROGRESS", 2],
    ["Photograph new dash cam stock", "Take 8 photos per SKU on white background.", "lister", "EBAY", "MEDIUM", "ASSIGNED", 3],
    ["Reply to all unread buyer messages", "Clear the Tech Deals inbox before 5pm.", "support", "EBAY", "URGENT", "IN_PROGRESS", 0],
    ["Reconcile October eBay payouts", "Match payouts to bank statement.", "finance", "FIN", "HIGH", "WAITING_APPROVAL", -1],
    ["Prepare monthly P&L pack", "Monthly report for owner review.", "finance.manager", "FIN", "MEDIUM", "NEW", 6],
    ["Order packaging supplies", "Mailing bags and boxes are low.", "office", "OFFICE", "LOW", "COMPLETED", -3],
    ["Update supplier price list", "Refresh Yiwu Homestyle prices from latest quote.", "stock.manager", "STOCK", "MEDIUM", "OVERDUE", -2],
  ];
  for (const [title, description, who, dept, priority, status, due] of taskDefs) {
    const t = await prisma.task.create({ data: { title, description, assigneeId: who ? U[who] : null, departmentId: depts[dept], priority, status, dueDate: daysAgo(-due), createdById: U.gm, progress: status === "COMPLETED" ? 100 : status === "IN_PROGRESS" ? 40 : status === "WAITING_APPROVAL" ? 100 : 0, completedAt: status === "COMPLETED" ? daysAgo(1) : null } });
    await prisma.taskComment.create({ data: { taskId: t.id, userId: U.gm, body: "Please keep this task updated. (DEMO)" } });
  }

  // Buyer messages
  const msgDefs = [
    [accs[1], "kate.w", "Earbuds left side not charging", "Hi, my left earbud doesn't charge in the case. Can you help?", true],
    [accs[1], "mark_t_uk", "Combined postage?", "If I buy two chargers can you combine postage?", false],
    [accs[0], "harry_p77", "Dash cam SD card", "What's the max SD card size the dash cam supports?", false],
    [accs[2], "zoe-k", "Yoga mat colour", "Do you have the yoga mat in purple?", false],
  ] as const;
  for (const [acc, buyer, subject, body, important] of msgDefs) {
    await prisma.buyerMessageThread.create({ data: { ebayAccountId: acc.id, externalId: `DEMO-M-${rnd(100000, 999999)}`, buyerUsername: buyer, subject, ebayItemId: `DEMO-${rnd(100000000, 999999999)}`, lastMessageAt: daysAgo(rnd(0, 2)), important, isDemo: true, assignedToId: important ? U.support : null, status: important ? "ASSIGNED" : "NEW", messages: { create: { direction: "INBOUND", body, status: "RECEIVED", sentAt: daysAgo(rnd(0, 2)) } } } });
  }
  for (const [name, body, category] of [
    ["Thank you for your order", "Hi {buyer},\n\nThank you for your order! It will be dispatched from our UK warehouse within 1 working day.\n\nKind regards,\nORIA FUTURE", "Orders"],
    ["Combined postage", "Hi {buyer},\n\nYes – add all items to your basket and use 'Request total from seller' and we'll combine postage for you.\n\nBest wishes,\nORIA FUTURE", "Pre-sale"],
    ["Faulty item – replacement", "Hi {buyer},\n\nSorry to hear about this. Please open a return via eBay and we'll send a replacement as soon as it's scanned in.\n\nKind regards,\nORIA FUTURE", "After-sale"],
  ]) await prisma.replyTemplate.create({ data: { name, body, category, createdById: U["ebay.manager"] } });

  // Notifications & chat
  await prisma.notification.createMany({ data: [
    { userId: owner.id, type: "PURCHASE_REQUEST", title: "Purchase request PR-2026-0001 submitted", body: "Dash cam ×200 – awaiting management review", link: "/purchasing/requests" },
    { userId: owner.id, type: "LOW_STOCK", title: "Low stock: OF-DASH-CAM", body: "6 units left", link: "/inventory" },
    { userId: owner.id, type: "PAYMENT_APPROVAL", title: "Payment approval required", body: "Sea freight £1,650.00", link: "/finance/transactions?status=PENDING_APPROVAL" },
  ] });
  const general = await prisma.chatChannel.findFirst({ where: { name: "Company-wide" } });
  if (general) {
    await prisma.chatMessage.createMany({ data: [
      { channelId: general.id, senderId: U.gm, body: "Morning team! Reminder: stock count in aisle A today.", createdAt: daysAgo(0.2), pinned: true },
      { channelId: general.id, senderId: U["stock.manager"], body: "On it – Aisha and Tom are starting at 10.", createdAt: daysAgo(0.18) },
    ] });
  }
  await prisma.dailyReport.create({ data: { userId: U.office, date: daysAgo(1), summary: "Ordered packaging, filed supplier invoices.", completed: "Packaging order placed", hoursWorked: D(7.5) } });
  console.log(`Seeded. Owner login: owner@oriafuture.com / ${adminPassword}   Demo users: *@demo.oriafuture.com / ${demoPassword}`);
}

async function ensureGroups(ownerId: string, depts: Record<string, string>) {
  const all = await prisma.user.findMany({ where: { deletedAt: null }, select: { id: true, departmentId: true, role: { select: { level: true } } } });
  const groups: { name: string; type: "GROUP" | "DEPARTMENT"; departmentId?: string; members: string[]; description: string }[] = [
    { name: "Company-wide", type: "GROUP", members: all.map((u) => u.id), description: "Announcements and general chat for everyone." },
    { name: "Management", type: "DEPARTMENT", departmentId: depts.MGMT, members: all.filter((u) => u.departmentId === depts.MGMT || u.role.level >= 80).map((u) => u.id), description: "Management group" },
    { name: "Stock Team", type: "DEPARTMENT", departmentId: depts.STOCK, members: all.filter((u) => u.departmentId === depts.STOCK).map((u) => u.id), description: "Stock & warehouse team" },
    { name: "Finance", type: "DEPARTMENT", departmentId: depts.FIN, members: all.filter((u) => u.departmentId === depts.FIN).map((u) => u.id), description: "Finance department" },
    { name: "eBay Selling Team", type: "DEPARTMENT", departmentId: depts.EBAY, members: all.filter((u) => u.departmentId === depts.EBAY).map((u) => u.id), description: "eBay account selling team" },
    { name: "Office", type: "DEPARTMENT", departmentId: depts.OFFICE, members: all.filter((u) => u.departmentId === depts.OFFICE).map((u) => u.id), description: "Office workers" },
  ];
  for (const g of groups) {
    let ch = await prisma.chatChannel.findFirst({ where: { name: g.name, type: g.type } });
    if (!ch) ch = await prisma.chatChannel.create({ data: { name: g.name, type: g.type, departmentId: g.departmentId, description: g.description } });
    for (const uid of new Set([...g.members, ownerId])) await prisma.chatMember.upsert({ where: { channelId_userId: { channelId: ch.id, userId: uid } }, create: { channelId: ch.id, userId: uid, isAdmin: uid === ownerId }, update: {} });
  }
}

main().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
