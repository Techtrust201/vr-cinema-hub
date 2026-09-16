import { AlertTriangle, CheckCircle2, ChevronDown, Film, Headphones, Users, XCircle } from "lucide-react";

import {
  describeBumpTest,
  describeCause,
  describeImpactPath,
  describeTargetType,
  describeTrigger,
  describeVersionGap,
} from "@/lib/syncVocabulary";
import { cn } from "@/lib/utils";

// Rend lisible le résultat des diagnostics, qui étaient auparavant affichés en
// JSON brut. L'objet complet reste consultable, mais replié : il sert au support
// technique, pas à l'exploitant qui veut juste savoir si ses casques vont bien.

interface HeadsetDiag {
  headset?: { name?: string; status?: string; applied_manifest_version?: number; desired_manifest_version?: number };
  groups?: Array<{ group_name?: string }>;
  assignments_effective?: Array<{ playlist_name?: string; target_type?: string }>;
  effective_playlists?: Array<{ playlist_name?: string; videos?: Array<{ name?: string; position?: number }> }>;
  manifest_versions_recent?: Array<{ version?: number; cause?: string | null; created_at?: string }>;
  triggers_present?: Record<string, boolean>;
  bump_dry_run?: { would_bump?: boolean; reason?: string; rollback_verified?: boolean; method?: string };
  error?: string;
}

interface PlaylistDiag {
  playlist?: { name?: string; video_count?: number };
  impacted_headsets?: Array<{
    headset_name?: string;
    status?: string;
    desired?: number;
    applied?: number;
    impact_paths?: string[];
  }>;
  trigger_target_count?: number;
  discrepancy?: boolean;
  error?: string;
}

function Verdict({ ok, title, detail }: { ok: boolean; title: string; detail?: string }) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border px-4 py-3",
        ok
          ? "border-[hsl(140_70%_40%_/_0.35)] bg-[hsl(140_70%_40%_/_0.08)]"
          : "border-[hsl(35_90%_55%_/_0.35)] bg-[hsl(35_90%_55%_/_0.08)]",
      )}
    >
      {ok ? (
        <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-[hsl(140_70%_55%)]" />
      ) : (
        <AlertTriangle size={18} className="mt-0.5 shrink-0 text-[hsl(35_90%_55%)]" />
      )}
      <div className="min-w-0">
        <p className="text-sm font-semibold">{title}</p>
        {detail && <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>}
      </div>
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}

function fmtDate(iso?: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function HeadsetDiagnostic({ d }: { d: HeadsetDiag }) {
  const applied = d.headset?.applied_manifest_version ?? 0;
  const desired = d.headset?.desired_manifest_version ?? 0;
  const upToDate = applied >= desired;
  const playlists = d.effective_playlists ?? [];
  const filmCount = playlists.reduce((n, p) => n + (p.videos?.length ?? 0), 0);
  const test = describeBumpTest(d.bump_dry_run);
  const triggers = Object.entries(d.triggers_present ?? {});
  const missingTriggers = triggers.filter(([, present]) => !present);

  return (
    <div className="space-y-5">
      <Verdict
        ok={upToDate}
        title={describeVersionGap(applied, desired)}
        detail={
          upToDate
            ? `Ce casque affiche bien les ${filmCount} film${filmCount > 1 ? "s" : ""} qui lui sont attribués.`
            : "Le casque n'a pas encore récupéré le dernier contenu. Il le fera à sa prochaine connexion, ou immédiatement avec « Forcer la mise à jour »."
        }
      />

      <Section icon={<Film size={13} />} title="Contenu attribué à ce casque">
        {playlists.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucune playlist ne lui est attribuée : il n'affichera rien. Assignez-lui une playlist depuis la page
            Playlists.
          </p>
        ) : (
          <div className="space-y-2">
            {playlists.map((p, i) => (
              <div key={i} className="rounded-lg border border-border/40 bg-background/40 px-3 py-2">
                <p className="text-sm font-medium">{p.playlist_name}</p>
                <ul className="mt-1 space-y-0.5">
                  {(p.videos ?? []).map((v, j) => (
                    <li key={j} className="text-xs text-muted-foreground">
                      {j + 1}. {v.name}
                    </li>
                  ))}
                  {(p.videos ?? []).length === 0 && (
                    <li className="text-xs text-[hsl(35_90%_55%)]">Cette playlist est vide.</li>
                  )}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section icon={<Users size={13} />} title="Pourquoi il reçoit ce contenu">
        {(d.assignments_effective ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune attribution en cours.</p>
        ) : (
          <ul className="space-y-1">
            {(d.assignments_effective ?? []).map((a, i) => (
              <li key={i} className="text-sm">
                <span className="font-medium">{a.playlist_name}</span>
                <span className="text-muted-foreground"> — {describeTargetType(a.target_type ?? "")}</span>
              </li>
            ))}
          </ul>
        )}
        {(d.groups ?? []).length > 0 && (
          <p className="text-xs text-muted-foreground">
            Ce casque appartient au{(d.groups ?? []).length > 1 ? "x groupes" : " groupe"}{" "}
            {(d.groups ?? []).map((g) => `« ${g.group_name} »`).join(", ")}.
          </p>
        )}
      </Section>

      {(d.manifest_versions_recent ?? []).length > 0 && (
        <Section icon={<Headphones size={13} />} title="Dernières mises à jour préparées">
          <ul className="space-y-1">
            {(d.manifest_versions_recent ?? []).slice(0, 5).map((m, i) => (
              <li key={i} className="flex items-baseline justify-between gap-3 text-sm">
                <span>{describeCause(m.cause)}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{fmtDate(m.created_at)}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section icon={<CheckCircle2 size={13} />} title="Contrôle automatique">
        <Verdict ok={test.ok} title={test.title} detail={test.detail} />
        {missingTriggers.length > 0 && (
          <p className="text-xs text-destructive">
            Alerte technique : {missingTriggers.map(([name]) => describeTrigger(name)).join(", ")} — ces
            notifications automatiques sont absentes de la base. Contactez le support.
          </p>
        )}
      </Section>
    </div>
  );
}

function PlaylistDiagnostic({ d }: { d: PlaylistDiag }) {
  const headsets = d.impacted_headsets ?? [];
  const videoCount = d.playlist?.video_count ?? 0;

  return (
    <div className="space-y-5">
      <Verdict
        ok={!d.discrepancy && headsets.length > 0}
        title={
          headsets.length === 0
            ? "Cette playlist n'est attribuée à aucun casque"
            : `Cette playlist alimente ${headsets.length} casque${headsets.length > 1 ? "s" : ""}`
        }
        detail={
          headsets.length === 0
            ? `Elle contient ${videoCount} film${videoCount > 1 ? "s" : ""}, mais personne ne la reçoit. Attribuez-la à un casque ou à un groupe.`
            : `Ses ${videoCount} film${videoCount > 1 ? "s" : ""} seront envoyés à ces casques dès leur prochaine connexion.`
        }
      />

      {d.discrepancy && (
        <Verdict
          ok={false}
          title="Incohérence détectée"
          detail={`Le système de notification cible ${d.trigger_target_count} casque(s), mais l'analyse en trouve ${headsets.length}. Certains casques risquent de ne pas être prévenus. Contactez le support technique.`}
        />
      )}

      {headsets.length > 0 && (
        <Section icon={<Headphones size={13} />} title="Casques concernés">
          <div className="space-y-1.5">
            {headsets.map((h, i) => {
              const ok = (h.applied ?? 0) >= (h.desired ?? 0);
              return (
                <div
                  key={i}
                  className="flex items-start justify-between gap-3 rounded-lg border border-border/40 bg-background/40 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{h.headset_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(h.impact_paths ?? []).map(describeImpactPath).join(" · ") || "Attribution inconnue"}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 text-xs",
                      ok ? "text-[hsl(140_70%_55%)]" : "text-[hsl(35_90%_55%)]",
                    )}
                  >
                    {describeVersionGap(h.applied ?? 0, h.desired ?? 0)}
                  </span>
                </div>
              );
            })}
          </div>
        </Section>
      )}
    </div>
  );
}

export function DiagnosticPanel({
  kind,
  title,
  data,
  onClose,
}: {
  kind: "headset" | "playlist";
  title: string;
  data: unknown;
  onClose: () => void;
}) {
  const d = (data ?? {}) as HeadsetDiag & PlaylistDiag;

  return (
    <div className="mt-4 rounded-xl border border-border/40 bg-[hsl(var(--vr-surface))] p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        <button onClick={onClose} className="text-xs text-muted-foreground transition hover:text-foreground">
          Fermer
        </button>
      </div>

      {d.error ? (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3">
          <XCircle size={18} className="mt-0.5 shrink-0 text-destructive" />
          <p className="text-sm">
            {d.error === "headset_not_found"
              ? "Ce casque n'existe plus dans la base."
              : d.error === "playlist_not_found"
                ? "Cette playlist n'existe plus."
                : "Le diagnostic n'a pas abouti."}
          </p>
        </div>
      ) : kind === "headset" ? (
        <HeadsetDiagnostic d={d} />
      ) : (
        <PlaylistDiagnostic d={d} />
      )}

      {/* Conservé pour le support : utile à transmettre, invisible par défaut. */}
      <details className="group mt-5 border-t border-border/40 pt-3">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs text-muted-foreground transition hover:text-foreground">
          <ChevronDown size={13} className="transition group-open:rotate-180" />
          Données techniques détaillées
        </summary>
        <pre className="mt-2 max-h-[40vh] overflow-auto whitespace-pre-wrap break-all rounded-lg bg-background/50 p-3 font-mono text-[11px]">
          {JSON.stringify(data, null, 2)}
        </pre>
      </details>
    </div>
  );
}
