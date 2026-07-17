import { describe, it, expect } from "vitest";
import { isPermissionError } from "@/lib/supabaseErrors";

describe("isPermissionError", () => {
  it("detects 42501", () => {
    expect(isPermissionError({ code: "42501", message: "permission denied" })).toBe(true);
  });
  it("detects RLS message", () => {
    expect(isPermissionError({ message: "new row violates row-level security policy" })).toBe(true);
  });
  it("ignores unrelated errors", () => {
    expect(isPermissionError({ code: "PGRST116", message: "not found" })).toBe(false);
  });
});
