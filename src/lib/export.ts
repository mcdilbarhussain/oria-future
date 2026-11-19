import "server-only";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import type { Col, Report } from "./reports";

const fmt = (v: unknown, c: Col): string => {
  if (v === null || v === undefined) return "";
  if (c.type === "date") return new Date(v as string).toLocaleDateString("en-GB");
  if (c.type === "money") return Number(v).toFixed(2);
  if (c.type === "percent") return `${v}%`;
  return String(v);
};

export function toCSV(r: Report) {
  // Prevent CSV/formula injection when opened in Excel
  const esc = (s: string) => { const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s) ? `'${s}` : s; return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe; };
  const lines = [r.columns.map((c) => esc(c.label)).join(","), ...r.rows.map((row) => r.columns.map((c) => esc(fmt(row[c.key], c))).join(","))];
  return "﻿" + lines.join("\r\n");
}

export async function toXLSX(r: Report) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "ORIA FUTURE ERP";
  const ws = wb.addWorksheet(r.title.slice(0, 31));
  ws.addRow([`ORIA FUTURE – ${r.title}`]).font = { bold: true, size: 14, color: { argb: "FF0C1630" } };
  ws.addRow([`Generated ${new Date().toLocaleString("en-GB")}`]).font = { italic: true, color: { argb: "FF64748B" } };
  ws.addRow([]);
  const header = ws.addRow(r.columns.map((c) => c.label));
  header.eachCell((cell) => { cell.font = { bold: true, color: { argb: "FFFFFFFF" } }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1B2E5A" } }; });
  for (const row of r.rows) {
    ws.addRow(r.columns.map((c) => { const v = row[c.key]; if (v === null || v === undefined) return ""; if (c.type === "date") return new Date(v as string); if (c.type === "money" || c.type === "number" || c.type === "percent") return Number(v); return String(v); }));
  }
  r.columns.forEach((c, i) => { const col = ws.getColumn(i + 1); col.width = Math.min(50, Math.max(12, c.label.length + 4)); if (c.type === "money") col.numFmt = "#,##0.00"; if (c.type === "date") col.numFmt = "dd/mm/yyyy"; });
  if (r.summary?.length) { ws.addRow([]); for (const [k, v] of r.summary) ws.addRow([k, v]).font = { bold: true }; }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function toPDF(r: Report): Promise<Buffer> {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ size: "A4", layout: r.columns.length > 6 ? "landscape" : "portrait", margin: 36 });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    const W = doc.page.width - 72;
    doc.rect(0, 0, doc.page.width, 64).fill("#0c1630");
    doc.fillColor("#d4a93a").fontSize(16).font("Helvetica-Bold").text("ORIA FUTURE", 36, 20);
    doc.fillColor("#ffffff").fontSize(11).font("Helvetica").text(r.title, 36, 40);
    doc.fillColor("#64748b").fontSize(8).text(`Generated ${new Date().toLocaleString("en-GB")}`, 36, 76);
    let y = 96;
    if (r.summary?.length) { doc.fillColor("#0c1630").fontSize(9).font("Helvetica-Bold").text(r.summary.map(([k, v]) => `${k}: ${typeof v === "number" ? v.toLocaleString("en-GB") : v}`).join("   ·   "), 36, y, { width: W }); y = doc.y + 10; }
    const cw = W / r.columns.length;
    const header = () => { doc.rect(36, y, W, 16).fill("#1b2e5a"); doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(7.5); r.columns.forEach((c, i) => doc.text(c.label, 38 + i * cw, y + 4, { width: cw - 4, ellipsis: true, lineBreak: false })); y += 18; };
    header();
    doc.font("Helvetica").fontSize(7.5);
    r.rows.forEach((row, idx) => {
      if (y > doc.page.height - 50) { doc.addPage(); y = 36; header(); doc.font("Helvetica").fontSize(7.5); }
      if (idx % 2) doc.rect(36, y - 2, W, 14).fill("#f1f5f9");
      doc.fillColor("#1e293b");
      r.columns.forEach((c, i) => doc.text(fmt(row[c.key], c), 38 + i * cw, y, { width: cw - 4, ellipsis: true, lineBreak: false, align: c.type && c.type !== "text" && c.type !== "date" ? "right" : "left" }));
      y += 14;
    });
    doc.end();
  });
}

export function fileResponse(body: Buffer | string, filename: string, type: string) {
  return new Response(typeof body === "string" ? body : new Uint8Array(body), { headers: { "Content-Type": type, "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "no-store" } });
}
