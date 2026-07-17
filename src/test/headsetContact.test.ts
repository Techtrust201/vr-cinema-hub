import { describe, it, expect } from "vitest";
import { appContactLabel, appContactState } from "@/lib/headsetContact";

describe("appContactState", () => {
  const now = Date.parse("2026-07-17T10:00:00.000Z");

  it("revoked wins over recent contact", () => {
    expect(appContactState("revoked", new Date(now - 30_000).toISOString(), now)).toBe("revoked");
  });

  it("never when no last_seen_at", () => {
    expect(appContactState("active", null, now)).toBe("never");
  });

  it("app_active under 2 minutes", () => {
    expect(appContactState("active", new Date(now - 60_000).toISOString(), now)).toBe("app_active");
  });

  it("app_recent between 2 and 10 minutes", () => {
    expect(appContactState("active", new Date(now - 5 * 60_000).toISOString(), now)).toBe("app_recent");
  });

  it("app_offline after 10 minutes", () => {
    expect(appContactState("active", new Date(now - 11 * 60_000).toISOString(), now)).toBe("app_offline");
  });

  it("labels are explicit about the VR application", () => {
    expect(appContactLabel("app_active")).toBe("Application active");
    expect(appContactLabel("app_offline")).toBe("Application hors ligne");
  });
});
