import bcrypt from "bcryptjs";
import { z } from "zod";

export const passwordSchema = z
  .string()
  .min(10, "Password must be at least 10 characters")
  .max(128)
  .regex(/[a-z]/, "Must contain a lowercase letter")
  .regex(/[A-Z]/, "Must contain an uppercase letter")
  .regex(/[0-9]/, "Must contain a number");

export const hashPassword = (p: string) => bcrypt.hash(p, 12);
export const verifyPassword = (p: string, h: string) => bcrypt.compare(p, h);
