import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { getPermissions, type AppRole, type RolePermissions } from "@/lib/permissions";

export type { AppRole };
type Role = AppRole | null;

interface AuthContextValue extends RolePermissions {
  user: User | null;
  session: Session | null;
  role: Role;
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
  loading: true,
  signOut: async () => {},
  refreshRole: async () => {},
  ...emptyPermissions,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role>(null);
  const [loading, setLoading] = useState(true);

  async function fetchRole(uid: string) {
    // Prefer deterministic RPC when available; fall back to single-row select.
    // Role is always read from user_roles / get_user_role — never from JWT claims.
    const { data: rpcRole, error: rpcErr } = await supabase.rpc("get_user_role", {
      _user_id: uid,
    });
    if (
      !rpcErr &&
      (rpcRole === "owner" || rpcRole === "admin" || rpcRole === "operator" || rpcRole === null)
    ) {
      setRole(rpcRole as Role);
      return;
    }

    const { data, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", uid)
      .maybeSingle();

    if (error) {
      setRole(null);
      return;
    }
    // Never invent a default operator role client-side.
    const r = data?.role;
    setRole(r === "owner" || r === "admin" || r === "operator" ? r : null);
  }

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      if (!newSession?.user) {
        setRole(null);
      } else {
        setTimeout(() => fetchRole(newSession.user.id), 0);
      }
    });

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        fetchRole(s.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setRole(null);
  };

  const refreshRole = async () => {
    if (!user) {
      setRole(null);
      return;
    }
    await fetchRole(user.id);
  };

  const permissions = getPermissions(role);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        role,
        loading,
        signOut,
        refreshRole,
        ...permissions,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
