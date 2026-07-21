export type AppRole = "owner" | "admin" | "operator";

export type RolePermissions = {
  isOwner: boolean;
  isAdmin: boolean;
  isOperator: boolean;
  /** videos, upload, playlists, groups, headsets, assignments, sync */
  canManageContent: boolean;
  /** organisation members / invites */
  canManageMembers: boolean;
  /** security / ownership audit surfaces reserved to owner */
  canManageSecurity: boolean;
  canTransferOwnership: boolean;
};

export function getPermissions(role: AppRole | null): RolePermissions {
  const isOwner = role === "owner";
  const isAdmin = role === "admin";
  const isOperator = role === "operator";
  return {
    isOwner,
    isAdmin,
    isOperator,
    canManageContent: isOwner || isAdmin || isOperator,
    canManageMembers: isOwner || isAdmin,
    canManageSecurity: isOwner,
    canTransferOwnership: isOwner,
  };
}

/** Labels for the account badge / settings. */
export function roleLabel(role: AppRole | null): string {
  if (role === "owner") return "Propriétaire";
  if (role === "admin") return "Administrateur";
  if (role === "operator") return "Opérateur";
  return "Non autorisé";
}
