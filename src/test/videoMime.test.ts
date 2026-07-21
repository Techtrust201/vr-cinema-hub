import { describe, expect, it } from "vitest";
import { resolveVideoContentType, sanitizeStorageFileName } from "@/lib/videoMime";

function fakeFile(name: string, type: string): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type });
}

describe("resolveVideoContentType", () => {
  it("keeps a valid browser video/* type", () => {
    expect(resolveVideoContentType(fakeFile("a.mp4", "video/mp4"))).toBe("video/mp4");
  });

  it("maps .MOV octet-stream to video/quicktime", () => {
    expect(
      resolveVideoContentType(fakeFile("notre dame.MOV", "application/octet-stream")),
    ).toBe("video/quicktime");
  });

  it("maps extension case-insensitively", () => {
    expect(resolveVideoContentType(fakeFile("clip.Mp4", ""))).toBe("video/mp4");
  });
});

describe("sanitizeStorageFileName", () => {
  it("replaces spaces without destroying extension", () => {
    expect(sanitizeStorageFileName("notre dame.MOV")).toBe("notre_dame.MOV");
  });
});
