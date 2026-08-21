import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { getPermissions, type AppRole, type RolePermissions } from "@/lib/permissions";

export type { AppRole };
type Role = AppRole | null;

/**
 * Distinguishes "the server told us this account has no role" from "we could not
 * reach the server". Conflating the two used to lock legitimate admins out of
 * the app behind the "Compte non autorisé" screen on any network blip.
 */
export type RoleStatus = "loading" | "resolved" | "unreachable";

interface AuthContextValue extends RolePermissions {
  user: User | null;
  session: Session | null;
  role: Role;
  roleStatus: RoleStatus;
  loading: boolean;
  signOut: () => Promise<void>;
  /** Re-fetch role from get_user_role / user_roles (no inventing defaults). */
  refreshRole: () => Promise<void>;
}

const emptyPermissions = getPermissions(null);

const AuthContext = createContext<AuthContextValue>({
  user: null,
  session: null,
  role: null,
  roleStatus: "loading",
  loading: true,
  signOut: async () => {},
  refreshRole: async () => {},
  ...emptyPermissions,
});

function isRole(value: unknown): value is AppRole {
  return value === "owner" || value === "admin" || value === "operator";
}

/** Transport-level failures deserve a retry; an authoritative empty answer does not. */
function isTransientError(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  const message = (error.message ?? "").toLowerCase();
  return (
    message.includes("failed to fetch") ||
    message.includes("networkerror") ||
    message.includes("load failed") ||
    message.includes("timeout") ||
    message.includes("aborted") ||
    error.code === "500" ||
    error.code === "502" ||
    error.code === "503" ||
    error.code === "504"
  );
}

const RETRY_DELAYS_MS = [400, 1200, 3000];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role>(null);
  const [roleStatus, setRoleStatus] = useState<RoleStatus>("loading");
  const [loading, setLoading] = useState(true);

  // getSession() and the INITIAL_SESSION event both fire on every page load.
  // Sharing the in-flight promise deduplicates the RPC *and* keeps the second
  // caller awaiting it, so `loading` cannot flip to false mid-fetch.
  const inFlight = useRef<{ uid: string; promise: Promise<void> } | null>(null);
  const mounted = useRef(true);

  /**
   * Reads the role once, from user_roles / get_user_role only — never from JWT
   * claims — and reports whether the answer is authoritative.
   */
  const readRole = useCallback(async (uid: string): Promise<{ role: Role; reachable: boolean }> => {
    const rpc = await supabase.rpc("get_user_role", { _user_id: uid });
    if (!rpc.error && (isRole(rpc.data) || rpc.data === null)) {
      return { role: isRole(rpc.data) ? rpc.data : null, reachable: true };
    }
    if (isTransientError(rpc.error)) return { role: null, reachable: false };

    const row = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", uid)
      .maybeSingle();

    if (row.error) return { role: null, reachable: !isTransientError(row.error) };
    // Never invent a default operator role client-side.
    return { role: isRole(row.data?.role) ? row.data.role : null, reachable: true };
  }, []);

  const fetchRole = useCallback(
    (uid: string): Promise<void> => {
      if (inFlight.current?.uid === uid) return inFlight.current.promise;

      const promise = (async () => {
        for (let attempt = 0; ; attempt++) {
          const { role: nextRole, reachable } = await readRole(uid);
          if (!mounted.current) return;

          if (reachable) {
            setRole(nextRole);
            setRoleStatus("resolved");
            return;
          }
          if (attempt >= RETRY_DELAYS_MS.length) {
            // Keep any previously known role instead of downgrading to "no access".
            setRoleStatus("unreachable");
            return;
          }
          await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
          if (!mounted.current) return;
        }
      })().finally(() => {
        if (inFlight.current?.uid === uid) inFlight.current = null;
      });

      inFlight.current = { uid, promise };
      return promise;
    },
    [readRole],
  );

  useEffect(() => {
    mounted.current = true;

    const applySession = (next: Session | null) => {
      setSession(next);
      setUser(next?.user ?? null);
      if (!next?.user) {
        setRole(null);
        setRoleStatus("resolved");
        return null;
      }
      return next.user.id;
    };

    const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
      // TOKEN_REFRESHED fires roughly hourly and carries no role change, so
      // re-reading the role there is pure overhead.
      const uid = applySession(newSession);
      if (uid && event !== "TOKEN_REFRESHED") {
        void fetchRole(uid).finally(() => {
          if (mounted.current) setLoading(false);
        });
      } else if (!uid) {
        setLoading(false);
      }
    });

    void supabase.auth
      .getSession()
      .then(({ data: { session: s } }) => {
        const uid = applySession(s);
        if (!uid) return;
        return fetchRole(uid);
      })
      .finally(() => {
        if (mounted.current) setLoading(false);
      });

    return () => {
      mounted.current = false;
      sub.subscription.unsubscribe();
    };
  }, [fetchRole]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setRole(null);
    setRoleStatus("resolved");
  }, []);

  const refreshRole = useCallback(async () => {
    if (!user) {
      setRole(null);
      setRoleStatus("resolved");
      return;
    }
    setRoleStatus("loading");
    await fetchRole(user.id);
  }, [user, fetchRole]);

  // A fresh object here would re-render every consumer on any unrelated change.
  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      role,
      roleStatus,
      loading,
      signOut,
      refreshRole,
      ...getPermissions(role),
    }),
    [user, session, role, roleStatus, loading, signOut, refreshRole],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
