/**
 * Jeton HMAC partagé entre l'origine disque et le manifeste casque.
 * Le même calcul vit dans origin/hmac.mjs (Node).
 */
export function originPayload(method: string, path: string, exp: number): string {
  return `${method.toUpperCase()}\n${path}\n${exp}`;
}
