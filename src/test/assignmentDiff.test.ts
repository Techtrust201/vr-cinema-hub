import { describe, it, expect } from "vitest";
import { computeScopeUnionDiff } from "@/lib/assignmentDiff";

describe("computeScopeUnionDiff", () => {
  it("keeps removed headset in the union", () => {
    const before = [{ headset_id: "a", desired_manifest_version: 3 }];
    const after: Array<{ headset_id: string; desired_manifest_version?: number }> = [];
    const diff = computeScopeUnionDiff(before, after);
    expect(diff).toHaveLength(1);
    expect(diff[0].scope).toBe("removed_from_scope");
    expect(diff[0].desired_after).toBeNull();
  });

  it("marks added headset", () => {
    const diff = computeScopeUnionDiff([], [{ headset_id: "b", desired_manifest_version: 1 }]);
    expect(diff[0].scope).toBe("added_to_scope");
  });

  it("marks still_in_scope when present both sides", () => {
    const diff = computeScopeUnionDiff(
      [{ headset_id: "c", desired_manifest_version: 2 }],
      [{ headset_id: "c", desired_manifest_version: 3 }],
    );
    expect(diff[0].scope).toBe("still_in_scope");
    expect(diff[0].desired_before).toBe(2);
    expect(diff[0].desired_after).toBe(3);
  });
});
