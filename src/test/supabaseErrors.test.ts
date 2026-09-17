import { describe, it, expect } from "vitest";
import { humanizeSupabaseError, isPermissionError } from "@/lib/supabaseErrors";

describe("isPermissionError", () => {
  it("detects 42501", () => {
    expect(isPermissionError({ code: "42501", message: "permission denied" })).toBe(true);
  });
  it("detects RLS message", () => {
    expect(isPermissionError({ message: "new row violates row-level security policy" })).toBe(true);
  });
  it("ignores unrelated errors", () => {
    expect(isPermissionError({ code: "PGRST116", message: "not found" })).toBe(false);
  });
});

describe("humanizeSupabaseError", () => {
  it("traduit un refus de droits sans exposer la politique de sécurité", () => {
    const message = humanizeSupabaseError({
      code: "42501",
      message: 'new row violates row-level security policy for table "videos"',
    });
    expect(message).toBe("Vous n'avez pas les droits nécessaires pour cette action.");
    expect(message).not.toMatch(/row-level|policy|videos/);
  });

  it("oriente vers la connexion quand le serveur est injoignable", () => {
    expect(humanizeSupabaseError({ message: "TypeError: Failed to fetch" }))
      .toMatch(/connexion Internet/i);
  });

  it("explique qu'un élément est encore référencé ailleurs", () => {
    expect(humanizeSupabaseError({ code: "23503", message: 'violates foreign key constraint' }))
      .toMatch(/encore utilisé ailleurs/i);
  });

  it("traduit les codes applicatifs du projet", () => {
    expect(humanizeSupabaseError({ message: "admin_required" }))
      .toBe("Cette action est réservée aux administrateurs.");
  });

  it("garde le code technique quand le cas est inconnu", () => {
    expect(humanizeSupabaseError({ code: "XX999", message: "internal error" }, "Échec."))
      .toBe("Échec. (code XX999)");
  });

  it("ne laisse jamais passer un message PostgreSQL brut", () => {
    const brut = 'duplicate key value violates unique constraint "playlists_name_key"';
    expect(humanizeSupabaseError({ code: "23505", message: brut })).not.toContain("playlists_name_key");
  });

  it("rend le repli quand il n'y a pas d'erreur exploitable", () => {
    expect(humanizeSupabaseError(null, "Rien fait.")).toBe("Rien fait.");
  });
});
