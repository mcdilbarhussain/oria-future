import { describe, it, expect, beforeAll, vi } from "vitest";
vi.mock("server-only", () => ({}));
beforeAll(() => { process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64"); });

describe("token encryption", () => {
  it("round-trips and is non-deterministic", async () => {
    const { encrypt, decrypt } = await import("../src/lib/crypto");
    const a = encrypt("v^1.1#refresh-token"), b = encrypt("v^1.1#refresh-token");
    expect(a).not.toEqual(b);
    expect(a).not.toContain("refresh");
    expect(decrypt(a)).toBe("v^1.1#refresh-token");
  });
  it("detects tampering", async () => {
    const { encrypt, decrypt } = await import("../src/lib/crypto");
    const parts = encrypt("secret").split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decrypt(parts.join("."))).toThrow();
  });
});

describe("password policy", () => {
  it("enforces strength", async () => {
    const { passwordSchema, hashPassword, verifyPassword } = await import("../src/lib/password");
    expect(passwordSchema.safeParse("short").success).toBe(false);
    expect(passwordSchema.safeParse("alllowercase1").success).toBe(false);
    expect(passwordSchema.safeParse("GoodPassword123").success).toBe(true);
    const h = await hashPassword("GoodPassword123");
    expect(h.startsWith("$2")).toBe(true);
    expect(await verifyPassword("GoodPassword123", h)).toBe(true);
    expect(await verifyPassword("wrong", h)).toBe(false);
  }, 20000);
});
