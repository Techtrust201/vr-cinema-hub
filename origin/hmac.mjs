import { createHmac, timingSafeEqual } from "node:crypto";

export function originPayload(method, path, exp) {
  return `${String(method).toUpperCase()}\n${path}\n${exp}`;
}

export function signOrigin(secret, method, path, exp) {
  return createHmac("sha256", secret).update(originPayload(method, path, exp)).digest("hex");
}

export function verifyOrigin(secret, method, path, exp, sig) {
  if (!secret || !sig || !/^[0-9a-f]{64}$/i.test(sig)) return false;
  const expected = signOrigin(secret, method, path, exp);
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(sig, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
