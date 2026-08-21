/**
 * Incremental SHA-256.
 *
 * crypto.subtle.digest() needs the whole payload in memory at once, which makes
 * it unusable for multi-gigabyte VR videos: hashing a 6 GB file that way
 * allocates 6 GB and freezes the tab. This streams the file chunk by chunk
 * instead, at constant memory, and yields between chunks so the UI stays live.
 *
 * Verified against crypto.subtle.digest in src/test/sha256.test.ts.
 */

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

export class Sha256 {
  private h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  private block = new Uint8Array(64);
  private blockLength = 0;
  private totalBytes = 0;
  private w = new Uint32Array(64);
  private done = false;

  update(chunk: Uint8Array): this {
    if (this.done) throw new Error("Sha256: update() called after digest()");
    this.totalBytes += chunk.length;

    let offset = 0;
    // Top up a partially filled block first.
    if (this.blockLength > 0) {
      const need = 64 - this.blockLength;
      const take = Math.min(need, chunk.length);
      this.block.set(chunk.subarray(0, take), this.blockLength);
      this.blockLength += take;
      offset = take;
      if (this.blockLength === 64) {
        this.compress(this.block, 0);
        this.blockLength = 0;
      }
    }
    // Consume whole blocks straight from the chunk.
    while (offset + 64 <= chunk.length) {
      this.compress(chunk, offset);
      offset += 64;
    }
    // Stash the remainder.
    if (offset < chunk.length) {
      this.block.set(chunk.subarray(offset), 0);
      this.blockLength = chunk.length - offset;
    }
    return this;
  }

  digestHex(): string {
    if (!this.done) {
      const totalBits = this.totalBytes * 8;
      const padding = new Uint8Array(this.blockLength < 56 ? 64 : 128);
      padding.set(this.block.subarray(0, this.blockLength), 0);
      padding[this.blockLength] = 0x80;
      // 64-bit big-endian bit length; files above 512 MB overflow 32 bits.
      const view = new DataView(padding.buffer);
      view.setUint32(padding.length - 8, Math.floor(this.totalBytes / 0x20000000), false);
      view.setUint32(padding.length - 4, totalBits >>> 0, false);
      for (let offset = 0; offset < padding.length; offset += 64) {
        this.compress(padding, offset);
      }
      this.blockLength = 0;
      this.done = true;
    }
    let hex = "";
    for (let i = 0; i < 8; i++) {
      hex += (this.h[i] >>> 0).toString(16).padStart(8, "0");
    }
    return hex;
  }

  private compress(input: Uint8Array, offset: number) {
    const w = this.w;
    for (let i = 0; i < 16; i++) {
      const j = offset + i * 4;
      w[i] = ((input[j] << 24) | (input[j + 1] << 16) | (input[j + 2] << 8) | input[j + 3]) >>> 0;
    }
    for (let i = 16; i < 64; i++) {
      const x = w[i - 15];
      const y = w[i - 2];
      const s0 = rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3);
      const s1 = rotr(y, 17) ^ rotr(y, 19) ^ (y >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = this.h[0], b = this.h[1], c = this.h[2], d = this.h[3];
    let e = this.h[4], f = this.h[5], g = this.h[6], h = this.h[7];

    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e;
      e = (d + t1) >>> 0;
      d = c; c = b; b = a;
      a = (t1 + t2) >>> 0;
    }

    this.h[0] = (this.h[0] + a) >>> 0;
    this.h[1] = (this.h[1] + b) >>> 0;
    this.h[2] = (this.h[2] + c) >>> 0;
    this.h[3] = (this.h[3] + d) >>> 0;
    this.h[4] = (this.h[4] + e) >>> 0;
    this.h[5] = (this.h[5] + f) >>> 0;
    this.h[6] = (this.h[6] + g) >>> 0;
    this.h[7] = (this.h[7] + h) >>> 0;
  }
}

/** Convenience wrapper for in-memory data. */
export function sha256Hex(data: Uint8Array): string {
  return new Sha256().update(data).digestHex();
}

const FALLBACK_CHUNK_BYTES = 8 * 1024 * 1024;

/** Blob.arrayBuffer is missing on some older WebViews and test shims. */
function readChunk(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === "function") return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error("Lecture du fichier impossible"));
    reader.readAsArrayBuffer(blob);
  });
}

/**
 * Hashes a Blob/File without ever holding more than one chunk in memory.
 * `onProgress` receives a 0..1 fraction.
 */
export async function sha256HexOfBlob(
  blob: Blob,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<string> {
  const hasher = new Sha256();
  const total = blob.size;
  let read = 0;

  const report = () => onProgress?.(total > 0 ? read / total : 1);

  if (typeof blob.stream === "function") {
    const reader = blob.stream().getReader();
    try {
      for (;;) {
        if (signal?.aborted) throw new DOMException("Hachage annulé", "AbortError");
        const { done, value } = await reader.read();
        if (done) break;
        hasher.update(value);
        read += value.byteLength;
        report();
      }
    } finally {
      reader.releaseLock();
    }
  } else {
    for (let offset = 0; offset < total; offset += FALLBACK_CHUNK_BYTES) {
      if (signal?.aborted) throw new DOMException("Hachage annulé", "AbortError");
      const buffer = await readChunk(blob.slice(offset, offset + FALLBACK_CHUNK_BYTES));
      hasher.update(new Uint8Array(buffer));
      read += buffer.byteLength;
      report();
    }
  }

  return hasher.digestHex();
}
