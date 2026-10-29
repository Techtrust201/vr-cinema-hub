import { supabase } from "@/integrations/supabase/client";
import { type LiveData, useLiveData } from "@/hooks/useLiveData";
import type { AppRelease } from "@/lib/appRelease";

/** Dernière version publiée, relue chaque minute pour qu'une publication apparaisse seule. */
export function useLatestAppRelease(): LiveData<AppRelease | null> {
  return useLiveData<AppRelease | null>(
    async (signal) => {
      const { data, error } = await supabase
        .from("app_releases")
        .select("version_name, version_code, size_bytes, sha256, notes, created_at")
        .order("version_code", { ascending: false })
        .limit(1)
        .abortSignal(signal)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
    { pollMs: 60_000 },
  );
}
