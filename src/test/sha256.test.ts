import { describe, expect, it } from "vitest";
import { webcrypto } from "node:crypto";
import { Sha256, sha256Hex, sha256HexOfBlob } from "@/lib/sha256";

/** Reference digest from the platform implementation. */
async function reference(data: Uint8Array): Promise<string> {
  const view = new Uint8Array(data); // detach from any larger buffer
  const digest = await webcrypto.subtle.digest("SHA-256", view);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function bytes(length: number, seed = 1): Uint8Array {
  const out = new Uint8Array(length);
  let x = seed;
  for (let i = 0; i < length; i++) {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    out[i] = x & 0xff;
  }
  return out;
}

describe("sha256Hex", () => {
  it("matches the known digest of the empty input", () => {
    expect(sha256Hex(new Uint8Array(0))).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("matches the known digest of \"abc\"", () => {
    expect(sha256Hex(new TextEncoder().encode("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  // 55/56/64 are the padding boundaries, 119/120/128 the two-block ones.
  const sizes = [0, 1, 55, 56, 57, 63, 64, 65, 119, 120, 128, 1000, 4096, 100_000];

  it.each(sizes)("matches crypto.subtle for %i bytes", async (size) => {
    const data = bytes(size);
    expect(sha256Hex(data)).toBe(await reference(data));
  });
});

describe("Sha256 incremental updates", () => {
  it("produces the same digest regardless of how input is split", async () => {
    const data = bytes(10_000, 7);
    const expected = await reference(data);

    for (const chunk of [1, 7, 63, 64, 65, 500, 4096]) {
      const hasher = new Sha256();
      for (let offset = 0; offset < data.length; offset += chunk) {
        hasher.update(data.subarray(offset, Math.min(offset + chunk, data.length)));
      }
      expect(hasher.digestHex(), `chunk size ${chunk}`).toBe(expected);
    }
  });

  it("is stable when digestHex is called twice", () => {
    const hasher = new Sha256().update(new TextEncoder().encode("abc"));
    expect(hasher.digestHex()).toBe(hasher.digestHex());
  });

  it("refuses updates after digest", () => {
    const hasher = new Sha256().update(new Uint8Array([1]));
    hasher.digestHex();
    expect(() => hasher.update(new Uint8Array([2]))).toThrow();
  });
});

describe("sha256HexOfBlob", () => {
  it("hashes a blob and reports monotonic progress", async () => {
    const data = bytes(300_000, 3);
    const progress: number[] = [];
    const digest = await sha256HexOfBlob(new Blob([data]), (f) => progress.push(f));

    expect(digest).toBe(await reference(data));
    expect(progress.at(-1)).toBeCloseTo(1, 5);
    for (let i = 1; i < progress.length; i++) {
      expect(progress[i]).toBeGreaterThanOrEqual(progress[i - 1]);
    }
  });

  it("hashes an empty blob", async () => {
    expect(await sha256HexOfBlob(new Blob([]))).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("honours an abort signal", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      sha256HexOfBlob(new Blob([bytes(200_000)]), undefined, controller.signal),
    ).rejects.toThrow();
  });
});
