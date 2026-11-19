// Copies static assets into the standalone server bundle (Next.js output: "standalone").
import { cpSync, existsSync } from "node:fs";
if (existsSync(".next/standalone")) {
  cpSync(".next/static", ".next/standalone/.next/static", { recursive: true });
  if (existsSync("public")) cpSync("public", ".next/standalone/public", { recursive: true });
}
