import { useState } from "react";
import { Download, Loader2, PackageCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { LiveData } from "@/hooks/useLiveData";
import { type AppRelease, formatApkSize, formatReleaseDate, isOutdated } from "@/lib/appRelease";

type HeadsetVersion = { status: string; app_version: string | null };

/**
 * Propose la dernière application casque publiée par scripts/release-headset-app.sh.
 *
 * Le lien est demandé au clic, jamais gardé dans la page : il désigne toujours la version la
 * plus récente, même si l'onglet est resté ouvert pendant une publication.
 */
export function HeadsetAppReleaseCard({
  latest,
  headsets,
}: {
  latest: LiveData<AppRelease | null>;
  headsets: HeadsetVersion[];
}) {
  const [downloading, setDownloading] = useState(false);
  const { data: release, initialLoading, error } = latest;

  const outdated = release
    ? headsets.filter((h) => h.status === "active" && isOutdated(h.app_version, release.version_name)).length
    : 0;

  async function download() {
    setDownloading(true);
    try {
      const { data, error } = await supabase.functions.invoke<{ url?: string; error?: string }>(
        "app-release-latest",
        { body: {} },
      );
      if (error || !data?.url) throw new Error(data?.error ?? error?.message ?? "Lien indisponible");
      // Le fichier est servi en pièce jointe : le navigateur le télécharge sans quitter la page.
      window.location.assign(data.url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Le téléchargement n'a pas pu démarrer.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="rounded-xl border border-[hsl(var(--vr-violet)_/_0.35)] bg-[hsl(var(--vr-violet)_/_0.06)] p-4 flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
      <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-[hsl(var(--vr-violet)_/_0.15)] text-[hsl(var(--vr-violet))]">
        <PackageCheck size={18} />
      </div>
      <div className="flex-1 min-w-0 space-y-1">
        <p className="font-semibold">Application casque DLPAlexandre</p>
        {initialLoading ? (
          <p className="text-xs text-muted-foreground">Recherche de la dernière version…</p>
        ) : error ? (
          <p className="text-xs text-muted-foreground">Téléchargement indisponible pour le moment ({error.message}).</p>
        ) : !release ? (
          <p className="text-xs text-muted-foreground">Aucune version publiée pour l'instant.</p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              Version {release.version_name} · dernière mise à jour le{" "}
              <span className="text-foreground">{formatReleaseDate(release.created_at)}</span> · {formatApkSize(release.size_bytes)}
            </p>
            {release.notes && <p className="text-xs text-muted-foreground/80">{release.notes}</p>}
            <p className="text-[11px] text-muted-foreground/70">
              À installer avec Meta Quest Developer Hub par-dessus la version en place, sans la
              désinstaller : les films et l'appairage sont conservés.
            </p>
            {outdated > 0 && (
              <p className="text-xs text-[hsl(35_90%_55%)]">
                {outdated === 1
                  ? "1 casque utilise une version plus ancienne."
                  : `${outdated} casques utilisent une version plus ancienne.`}
              </p>
            )}
          </>
        )}
      </div>
      <button
        onClick={() => void download()}
        disabled={!release || downloading}
        className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[hsl(var(--vr-violet))] text-white font-medium text-sm hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
        Télécharger DLPAlexandre.apk
      </button>
    </div>
  );
}
