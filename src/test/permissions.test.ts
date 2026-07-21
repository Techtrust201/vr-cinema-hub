import { describe, expect, it } from "vitest";
import { getPermissions, roleLabel } from "@/lib/permissions";

describe("getPermissions", () => {
  it("grants full content + ownership to owner", () => {
    const p = getPermissions("owner");
    expect(p.isOwner).toBe(true);
    expect(p.canManageContent).toBe(true);
    expect(p.canManageMembers).toBe(true);
    expect(p.canManageSecurity).toBe(true);
    expect(p.canTransferOwnership).toBe(true);
  });

  it("grants content + members to admin, not ownership", () => {
    const p = getPermissions("admin");
    expect(p.isAdmin).toBe(true);
    expect(p.canManageContent).toBe(true);
    expect(p.canManageMembers).toBe(true);
    expect(p.canManageSecurity).toBe(false);
    expect(p.canTransferOwnership).toBe(false);
  });

  it("grants content only to operator", () => {
    const p = getPermissions("operator");
    expect(p.isOperator).toBe(true);
    expect(p.canManageContent).toBe(true);
    expect(p.canManageMembers).toBe(false);
    expect(p.canManageSecurity).toBe(false);
    expect(p.canTransferOwnership).toBe(false);
  });

  it("denies everything when role is null", () => {
    const p = getPermissions(null);
    expect(p.canManageContent).toBe(false);
    expect(p.canManageMembers).toBe(false);
    expect(roleLabel(null)).toBe("Non autorisé");
  });
});

describe("roleLabel", () => {
  it("maps roles to French badges", () => {
    expect(roleLabel("owner")).toBe("Propriétaire");
    expect(roleLabel("admin")).toBe("Administrateur");
    expect(roleLabel("operator")).toBe("Opérateur");
  });
});
