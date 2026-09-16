// Traduction du vocabulaire interne vers des phrases compréhensibles.
//
// Les diagnostics et les rapports de synchronisation sont produits par la base et
// par l'application du casque, dans un vocabulaire de développeur. Affiché tel
// quel, il n'apprend rien à l'exploitant — et l'inquiète plutôt qu'autre chose.
//
// Règle : aucune de ces fonctions ne doit rendre un identifiant brut. Quand un
// code est inconnu, on le formate lisiblement plutôt que de le laisser tel quel.

/** Transforme `playlist_videos_invalidate` en « Playlist videos invalidate ». */
export function humanizeCode(code: string): string {
  const words = code.replace(/[_:.-]+/g, " ").trim();
  if (!words) return "";
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Pourquoi une nouvelle version de contenu a été préparée pour un casque. */
export function describeCause(cause: string | null | undefined): string {
  if (!cause) return "Mise à jour du contenu";
  const known: Record<string, string> = {
    video_update: "Un film a été modifié",
    videos_invalidate: "Un film a été modifié",
    playlist_update: "Une playlist a été modifiée",
    playlist_videos_invalidate: "Le contenu d'une playlist a changé",
    assignment_update: "Une attribution a changé",
    assignments_invalidate: "Une attribution a changé",
    group_update: "Un groupe de casques a changé",
    group_members_invalidate: "La composition d'un groupe a changé",
    force_resync: "Mise à jour forcée depuis le tableau de bord",
    manual: "Mise à jour forcée depuis le tableau de bord",
    pairing: "Premier appairage du casque",
    initial: "Contenu initial du casque",
  };
  return known[cause] ?? humanizeCode(cause);
}

/** Comment une playlist atteint un casque donné. */
export function describeImpactPath(path: string): string {
  if (path === "direct") return "Attribué directement à ce casque";
  if (path === "all") return "Attribué à tous les casques";
  if (path.startsWith("group:")) return `Via le groupe « ${path.slice(6)} »`;
  return humanizeCode(path);
}

export function describeTargetType(targetType: string): string {
  if (targetType === "headset") return "Ce casque précisément";
  if (targetType === "group") return "Un groupe dont il fait partie";
  if (targetType === "all") return "Tous les casques";
  return humanizeCode(targetType);
}

/** Issue d'un cycle de synchronisation, telle qu'elle apparaît dans l'historique. */
export function describeReportStatus(status: string): string {
  const known: Record<string, string> = {
    success: "Mise à jour réussie",
    no_change: "Déjà à jour, rien à faire",
    partial: "Partiellement réussie",
    failed: "Échec",
    started: "En cours",
    pending: "En attente",
  };
  return known[status] ?? humanizeCode(status);
}

/**
 * Écart entre la version demandée et celle réellement appliquée, en clair.
 * Les numéros de version n'ont aucun sens pour un exploitant : ce qui compte,
 * c'est de savoir si le casque a bien reçu ce qu'on lui a envoyé.
 */
export function describeVersionGap(applied: number, desired: number): string {
  if (applied >= desired) return "Contenu à jour";
  const gap = desired - applied;
  if (gap === 1) return "Une mise à jour en attente";
  return `${gap} mises à jour en attente`;
}

/** Les déclencheurs qui préviennent les casques quand le contenu change. */
export function describeTrigger(name: string): string {
  const known: Record<string, string> = {
    videos_invalidate: "Modification d'un film",
    playlist_videos_invalidate: "Modification du contenu d'une playlist",
    assignments_invalidate: "Modification d'une attribution",
    group_members_invalidate: "Modification d'un groupe de casques",
  };
  return known[name] ?? humanizeCode(name);
}

/**
 * Résultat du test à blanc : le diagnostic simule une modification puis l'annule,
 * pour confirmer que les casques seraient bien prévenus. Le vocabulaire d'origine
 * (« bump », « dry run », « rollback ») est illisible hors contexte technique.
 */
export function describeBumpTest(dryRun: {
  would_bump?: boolean;
  reason?: string;
  rollback_verified?: boolean;
  method?: string;
} | null | undefined): { ok: boolean; title: string; detail: string } {
  if (!dryRun) {
    return { ok: false, title: "Test non effectué", detail: "Le diagnostic n'a pas pu simuler de modification." };
  }
  if (dryRun.reason === "no_effective_playlist") {
    return {
      ok: false,
      title: "Aucun contenu attribué",
      detail: "Ce casque n'a aucune playlist assignée : il n'a donc rien à afficher.",
    };
  }
  if (dryRun.reason === "playlist_empty_and_no_other_video") {
    return {
      ok: false,
      title: "Playlist vide",
      detail: "La playlist attribuée ne contient aucun film. Ajoutez-y du contenu.",
    };
  }
  if (dryRun.method === "error") {
    return {
      ok: false,
      title: "Le test a échoué",
      detail: dryRun.reason ? `Erreur signalée : ${dryRun.reason}` : "Erreur inconnue pendant la simulation.",
    };
  }
  if (dryRun.would_bump && dryRun.rollback_verified !== false) {
    return {
      ok: true,
      title: "Les mises à jour automatiques fonctionnent",
      detail:
        "Une modification de contenu a été simulée puis annulée : ce casque aurait bien été prévenu. Rien n'a été modifié.",
    };
  }
  if (dryRun.would_bump === false) {
    return {
      ok: false,
      title: "Ce casque ne serait pas prévenu",
      detail:
        "Une modification de contenu a été simulée, et ce casque n'aurait reçu aucune notification. Contactez le support technique.",
    };
  }
  return {
    ok: false,
    title: "Résultat du test peu concluant",
    detail: "La simulation n'a pas pu être confirmée. Relancez le diagnostic.",
  };
}

export function fmtBytes(b: number | null | undefined): string {
  if (!b) return "—";
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} Ko`;
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(0)} Mo`;
  return `${(b / (1024 * 1024 * 1024)).toFixed(1)} Go`;
}
