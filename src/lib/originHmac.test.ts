import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { originPayload } from "./originHmac";

describe("originPayload", () => {
  it("est stable pour GET et PUT", () => {
    expect(originPayload("get", "location/a.mp4", 10)).toBe("GET\nlocation/a.mp4\n10");
    const payload = originPayload("PUT", "location/a.mp4", 99);
    const hex = createHmac("sha256", "secret").update(payload).digest("hex");
    expect(hex).toHaveLength(64);
  });
});
