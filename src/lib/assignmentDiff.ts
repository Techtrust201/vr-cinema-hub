export type ImpactedHeadset = {
  headset_id: string;
  desired_manifest_version?: number;
};

export type ScopeDiff = {
  headset_id: string;
  scope: "added_to_scope" | "removed_from_scope" | "still_in_scope" | "unchanged_due_to_other_assignment";
  desired_before: number;
  desired_after: number | null;
};

/** Union before∪after — a headset removed from scope must still be checked for bump. */
export function computeScopeUnionDiff(
  before: ImpactedHeadset[],
  after: ImpactedHeadset[],
): ScopeDiff[] {
  const beforeDesired = new Map(before.map((h) => [h.headset_id, h.desired_manifest_version ?? 0]));
  const afterDesired = new Map(after.map((h) => [h.headset_id, h.desired_manifest_version ?? 0]));
  const unionIds = new Set([...beforeDesired.keys(), ...afterDesired.keys()]);
  const out: ScopeDiff[] = [];
  for (const id of unionIds) {
    const inBefore = beforeDesired.has(id);
    const inAfter = afterDesired.has(id);
    let scope: ScopeDiff["scope"] = "unchanged_due_to_other_assignment";
    if (inBefore && !inAfter) scope = "removed_from_scope";
    else if (!inBefore && inAfter) scope = "added_to_scope";
    else if (inBefore && inAfter) scope = "still_in_scope";
    out.push({
      headset_id: id,
      scope,
      desired_before: beforeDesired.get(id) ?? 0,
      desired_after: inAfter ? (afterDesired.get(id) ?? 0) : null,
    });
  }
  return out;
}
