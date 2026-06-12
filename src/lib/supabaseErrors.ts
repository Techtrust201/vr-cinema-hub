/**
 * Returns true when a Supabase error is a RLS / permission rejection
 * (typical when a non-admin tries to mutate an admin-only table).
 */
export function isPermissionError(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  if (err.code === "42501") return true;
  return /permission denied|row-level security|RLS/i.test(err.message ?? "");
}