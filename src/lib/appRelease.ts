/**
 * Versions de l'application casque publiées sur le site (table app_releases).
 */

export type AppRelease = {
  version_name: string;
  version_code: number;
  size_bytes: number;
  sha256: string;
  notes: string | null;
  created_at: string;
};

/**
 * Les casques ne remontent que le nom de version (« 1.1.7 »), pas le numéro Android : c'est
 * donc sur lui que se fait la comparaison. Retourne null si l'un des deux n'est pas un numéro
 * lisible, pour ne jamais annoncer à tort qu'un casque est en retard.
 */
export function compareVersions(a: string, b: string): number | null {
  const parse = (v: string) => (/^\d+(\.\d+)*$/.test(v.trim()) ? v.trim().split(".").map(Number) : null);
  const pa = parse(a);
  const pb = parse(b);
  if (!pa || !pb) return null;
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

export function isOutdated(appVersion: string | null | undefined, latest: string | null | undefined): boolean {
  if (!appVersion || !latest) return false;
  return compareVersions(appVersion, latest) === -1;
}

const dateFr = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const timeFr = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris",
  hour: "2-digit",
  minute: "2-digit",
});

/** « 29/10/2026 à 14:32 », en heure de Paris quel que soit le fuseau du navigateur. */
export function formatReleaseDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "date inconnue";
  return `${dateFr.format(d)} à ${timeFr.format(d)}`;
}

export function formatApkSize(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(0)} Mo`;
}
