/**
 * Presence semantics for Quest headsets.
 * The server cannot detect physical power-on — only that the VR app contacted it.
 */

export type AppContactState =
  | "app_active"
  | "app_recent"
  | "app_offline"
  | "never"
  | "revoked";

export function appContactState(
  status: "pending" | "active" | "revoked" | string,
  lastSeenAt: string | null | undefined,
  nowMs: number = Date.now(),
): AppContactState {
  if (status === "revoked") return "revoked";
  if (!lastSeenAt) return "never";
  const diff = nowMs - new Date(lastSeenAt).getTime();
  if (diff < 2 * 60 * 1000) return "app_active";
  if (diff < 10 * 60 * 1000) return "app_recent";
  return "app_offline";
}

export function appContactLabel(state: AppContactState): string {
  switch (state) {
    case "app_active":
      return "Application active";
    case "app_recent":
      return "Application récemment vue";
    case "app_offline":
      return "Application hors ligne";
    case "never":
      return "Jamais connectée";
    case "revoked":
      return "Révoqué";
  }
}

export function formatRelativeFr(iso: string | null | undefined): string {
  if (!iso) return "jamais";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "à l'instant";
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h} h`;
  return `il y a ${Math.floor(h / 24)} j`;
}
