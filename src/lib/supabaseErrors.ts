/**
 * Returns true when a Supabase error is a RLS / permission rejection
 * (typical when a non-admin tries to mutate an admin-only table).
 */
export function isPermissionError(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  if (err.code === "42501") return true;
  return /permission denied|row-level security|RLS/i.test(err.message ?? "");
}

interface SupabaseLikeError {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
}

/**
 * Traduit une erreur Supabase en phrase compréhensible et si possible actionnable.
 *
 * Les retours bruts de PostgreSQL — « new row violates row-level security policy for
 * table "videos" », noms de contraintes, codes à cinq caractères — étaient affichés tels
 * quels. L'exploitant à qui l'application est destinée n'a aucun moyen d'en tirer quoi
 * que ce soit.
 *
 * Quand le cas n'est pas reconnu, le message reste générique mais conserve le code
 * technique entre parenthèses : assez discret pour ne pas inquiéter, assez précis pour
 * qu'un dépannage à distance puisse partir de quelque chose.
 */
export function humanizeSupabaseError(
  err: SupabaseLikeError | Error | null | undefined,
  fallback = "L'action n'a pas abouti.",
): string {
  if (!err) return fallback;

  const code = "code" in err ? (err.code ?? "") : "";
  const message = err.message ?? "";

  if (isPermissionError({ code, message })) {
    return "Vous n'avez pas les droits nécessaires pour cette action.";
  }

  // Connexion perdue : le cas le plus fréquent en salle, et le seul que l'exploitant
  // peut résoudre seul.
  if (/fetch|network|failed to fetch|timeout|ECONN/i.test(message)) {
    return "Le serveur est injoignable. Vérifiez la connexion Internet, puis réessayez.";
  }

  if (/jwt|token|session/i.test(message) && /expir|invalid/i.test(message)) {
    return "Votre session a expiré. Reconnectez-vous pour continuer.";
  }

  switch (code) {
    case "23505":
    case "23514":
      return "Un élément portant ce nom existe déjà. Choisissez-en un autre.";
    case "23503":
      return "Cet élément est encore utilisé ailleurs : retirez-le d'abord de la playlist ou du groupe concerné.";
    case "23502":
      return "Un champ obligatoire est vide.";
    case "PGRST116":
      return "L'élément demandé n'existe plus. Rafraîchissez la page.";
    case "22P02":
      return "Une valeur saisie n'a pas le format attendu.";
    case "57014":
      return "L'opération a été trop longue et a été interrompue. Réessayez.";
  }

  // Codes applicatifs renvoyés par les fonctions et les RPC du projet.
  if (message === "admin_required") return "Cette action est réservée aux administrateurs.";
  if (message === "owner_required") return "Cette action est réservée au propriétaire du compte.";
  if (message === "invalid_email") return "Cette adresse email n'est pas valide.";
  if (message === "invalid_role") return "Ce rôle n'existe pas.";
  if (message === "admin_cannot_create_owner") {
    return "Seul le propriétaire du compte peut désigner un autre propriétaire.";
  }
  if (message === "last_owner") {
    return "Le compte doit garder au moins un propriétaire.";
  }

  return code ? `${fallback} (code ${code})` : fallback;
}
