import { afterEach, describe, expect, it, vi } from "vitest";
import { hasSitePassword, isParticipantPath } from "@/lib/site-password";

vi.mock("server-only", () => ({}));
const header = vi.hoisted(() => ({ value: null as string | null }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(header.value ? { authorization: header.value } : {}),
}));
const basic = (pw: string) => `Basic ${Buffer.from(`any:${pw}`).toString("base64")}`;

describe("site password", () => {
  it("accepts only the right password (any username)", () => {
    expect(hasSitePassword(basic("s3cret"), "s3cret")).toBe(true);
    expect(hasSitePassword(basic("wrong!"), "s3cret")).toBe(false);
    expect(hasSitePassword(null, "s3cret")).toBe(false);
  });

  it("participants skip it only on their link and voice endpoints", () => {
    expect(isParticipantPath("/e/boutique-luna")).toBe(true);
    expect(isParticipantPath("/api/voice/speak")).toBe(true);
    expect(isParticipantPath("/")).toBe(false);
    expect(isParticipantPath("/api/cron/process-jobs")).toBe(false);
  });
});

// Each case re-imports the env module (fresh cache): slow disks need more than the 5 s default.
describe("requireAdmin", { timeout: 30_000 }, () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules(); // env() is cached per module instance
  });
  const load = async () => (await import("@/server/auth/admin")).requireAdmin;

  it("is open locally without SITE_PASSWORD", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("SITE_PASSWORD", "");
    await expect((await load())()).resolves.toBeUndefined();
  });

  it("blocks production when SITE_PASSWORD is missing", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SITE_PASSWORD", "");
    await expect((await load())()).rejects.toThrow("SITE_PASSWORD");
  });

  it("checks the request's password when set", async () => {
    vi.stubEnv("SITE_PASSWORD", "s3cret");
    header.value = basic("wrong!");
    await expect((await load())()).rejects.toThrow();
    header.value = basic("s3cret");
    await expect((await load())()).resolves.toBeUndefined();
  });
});
