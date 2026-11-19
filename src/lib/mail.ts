import "server-only";
import nodemailer from "nodemailer";

export async function sendMail(to: string, subject: string, text: string): Promise<boolean> {
  if (!process.env.SMTP_HOST) return false;
  const t = nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: Number(process.env.SMTP_PORT) === 465, auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined });
  try { await t.sendMail({ from: process.env.SMTP_FROM || "no-reply@oriafuture.com", to, subject, text }); return true; }
  catch (e) { console.error("[mail]", e); return false; }
}
