#!/usr/bin/env bash
# =============================================================================
#  test-manifest-versioning.sh
#  Valide le contrat manifest/report (scénarios A → E).
#
#  Prérequis :
#    - PGHOST/PGUSER/PGPASSWORD/PGDATABASE/PGPORT positionnés (DB Lovable Cloud)
#    - Un device_token valide d'un casque actif (exporte DEVICE_TOKEN=...)
#    - jq, curl
#
#  Le script :
#    1. récupère un casque actif (ou celui correspondant à DEVICE_TOKEN)
#    2. crée une vidéo + playlist + assignment ciblant ce casque
#    3. déroule A → E et imprime ✅/❌
#    4. nettoie (sauf si KEEP=1)
# =============================================================================
set -u

PROJECT_ID="fllhnbeukuwrvserebqn"
BASE="https://${PROJECT_ID}.supabase.co/functions/v1"
ANON_KEY="sb_publishable_BG39aLgEbKIdusPcOHHcgg_ynDKu6aA"

: "${DEVICE_TOKEN:?DEVICE_TOKEN env var required (run scripts/test-headset-flow.sh once to get one)}"
command -v jq >/dev/null || { echo "jq required"; exit 1; }
command -v psql >/dev/null || { echo "psql required"; exit 1; }

pass() { echo "  ✅ $1"; }
fail() { echo "  ❌ $1"; FAILED=1; }
FAILED=0

auth=(-H "Authorization: Bearer $DEVICE_TOKEN" -H "apikey: $ANON_KEY" -H "Content-Type: application/json")

# DELETE/UPDATE on playlist_videos require service role (psql role only has SELECT/INSERT).
SR_KEY="${SUPABASE_SERVICE_ROLE_KEY:-}"
REST="https://${PROJECT_ID}.supabase.co/rest/v1"
rest_delete() {
  # $1 = path with filters, e.g. "playlist_videos?playlist_id=eq.X&video_id=eq.Y"
  [ -z "$SR_KEY" ] && { echo "(skip rest_delete: SUPABASE_SERVICE_ROLE_KEY not set)"; return 1; }
  curl -sS -X DELETE "${REST}/$1" \
    -H "apikey: $SR_KEY" -H "Authorization: Bearer $SR_KEY" -H "Prefer: return=minimal"
}

# Decode sub from JWT
HEADSET_ID=$(echo "$DEVICE_TOKEN" | cut -d. -f2 | base64 -d 2>/dev/null | jq -r .sub)
[ -z "$HEADSET_ID" ] && { echo "Cannot decode headset_id from DEVICE_TOKEN"; exit 1; }
echo "Headset: $HEADSET_ID"

# Helpers
desired() { psql -tAc "SELECT desired_manifest_version FROM headsets WHERE id='$HEADSET_ID'"; }
applied() { psql -tAc "SELECT applied_manifest_version FROM headsets WHERE id='$HEADSET_ID'"; }

# --- Setup: video + playlist + assignment ---
echo ""
echo "▶ Setup: create video, playlist, assignment targeting this headset…"
USER_ID=$(psql -tAc "SELECT uploaded_by FROM videos WHERE uploaded_by IS NOT NULL LIMIT 1")
[ -z "$USER_ID" ] && USER_ID=$(psql -tAc "SELECT id FROM profiles LIMIT 1")
SUFFIX=$(date +%s)
pq() { psql -tAc "$1" | head -1 | tr -d '\r\n '; }
VIDEO_ID=$(pq "INSERT INTO videos (name, storage_path, format, projection, stereo_mode, size_bytes, duration_seconds, uploaded_by) VALUES ('test-versioning-${SUFFIX}.mp4', 'test/test-versioning-${SUFFIX}.mp4', '360_mono', '360', 'mono', 100, 10, '$USER_ID') RETURNING id")
PLAYLIST_ID=$(pq "INSERT INTO playlists (name, created_by) VALUES ('test-versioning-pl-${SUFFIX}', '$USER_ID') RETURNING id")
ASSIGN_ID=$(pq "INSERT INTO assignments (playlist_id, target_type, target_id, created_by) VALUES ('$PLAYLIST_ID', 'headset', '$HEADSET_ID', '$USER_ID') RETURNING id")
V0=$(desired)
echo "  desired=$V0 after assignment"

cleanup() {
  if [ "${KEEP:-0}" != "1" ]; then
    psql -c "DELETE FROM assignments WHERE id='$ASSIGN_ID'" >/dev/null 2>&1
    psql -c "DELETE FROM playlist_videos WHERE playlist_id='$PLAYLIST_ID'" >/dev/null 2>&1
    psql -c "DELETE FROM playlists WHERE id='$PLAYLIST_ID'" >/dev/null 2>&1
    psql -c "DELETE FROM videos WHERE id='$VIDEO_ID'" >/dev/null 2>&1
    echo "(cleaned up)"
  fi
}
trap cleanup EXIT

# =================== A. add video to playlist ===================
echo ""
echo "── A. Ajout d'une vidéo à la playlist ──"
V_BEFORE=$(desired)
psql -c "INSERT INTO playlist_videos (playlist_id, video_id, position) VALUES ('$PLAYLIST_ID','$VIDEO_ID',0)" >/dev/null
V_AFTER=$(desired)
A_OK=$(applied)
[ "$V_AFTER" -gt "$V_BEFORE" ] && pass "desired_manifest_version: $V_BEFORE → $V_AFTER" || fail "desired n'a pas augmenté ($V_BEFORE → $V_AFTER)"
[ "$A_OK" -lt "$V_AFTER" ] && pass "applied ($A_OK) < desired ($V_AFTER) → dashboard 'En attente'" || fail "applied >= desired sans report casque"

# =================== B. call manifest ===================
echo ""
echo "── B. Appel headset-manifest ──"
manifest=$(curl -sS -X POST "$BASE/headset-manifest" "${auth[@]}")
MV=$(echo "$manifest" | jq -r .manifest_version)
SV=$(echo "$manifest" | jq -r .schema_version)
HAS_VIDEO=$(echo "$manifest" | jq --arg vid "$VIDEO_ID" '[.videos[] | select(.id==$vid)] | length')
[ "$MV" = "$V_AFTER" ] && pass "manifest_version=$MV == desired=$V_AFTER" || fail "manifest_version=$MV != desired=$V_AFTER"
[ "$SV" = "3" ] && pass "schema_version=3" || fail "schema_version=$SV"
[ "$HAS_VIDEO" = "1" ] && pass "nouvelle vidéo présente dans videos[]" || fail "vidéo absente du manifest"

SNAP=$(psql -tAc "SELECT payload::text FROM manifest_versions WHERE headset_id='$HEADSET_ID' AND version=$MV")
if [ -n "$SNAP" ]; then
  HAS_URL=$(echo "$SNAP" | jq '[.videos[] | select(.download_url != null or .url != null)] | length')
  [ "$HAS_URL" = "0" ] && pass "snapshot manifest_versions sans download_url/url" || fail "snapshot contient des signed URLs ($HAS_URL)"
else
  fail "aucun snapshot manifest_versions pour v$MV"
fi

# =================== C. report success applied=desired ===================
echo ""
echo "── C. Report success avec applied = desired ──"
started=$(curl -sS -X POST "$BASE/headset-report-sync" "${auth[@]}" -d '{"phase":"started"}')
RID=$(echo "$started" | jq -r .report_id)
curl -sS -X POST "$BASE/headset-report-sync" "${auth[@]}" \
  -d "{\"phase\":\"finished\",\"report_id\":\"$RID\",\"status\":\"success\",\"applied_manifest_version\":$MV,\"downloaded_count\":1,\"total_bytes\":100,\"remote_video_count\":1,\"local_video_count\":1,\"visible_video_count\":1}" >/dev/null
sleep 1
A_NEW=$(applied)
[ "$A_NEW" = "$MV" ] && pass "applied=$A_NEW == manifest_version=$MV → dashboard 'À jour'" || fail "applied=$A_NEW != $MV"

# =================== D. report with too-high version ===================
echo ""
echo "── D. Report avec version trop haute ──"
HIGH=$((MV + 99))
started=$(curl -sS -X POST "$BASE/headset-report-sync" "${auth[@]}" -d '{"phase":"started"}')
RID=$(echo "$started" | jq -r .report_id)
resp=$(curl -sS -X POST "$BASE/headset-report-sync" "${auth[@]}" \
  -d "{\"phase\":\"finished\",\"report_id\":\"$RID\",\"status\":\"success\",\"applied_manifest_version\":$HIGH}")
sleep 1
A_AFTER_D=$(applied)
STORED=$(psql -tAc "SELECT count(*) FROM sync_reports WHERE id='$RID'")
[ "$STORED" = "1" ] && pass "report stocké dans sync_reports" || fail "report absent"
[ "$A_AFTER_D" = "$MV" ] && pass "applied inchangé ($A_AFTER_D) malgré version=$HIGH" || fail "applied modifié à tort ($A_AFTER_D)"
echo "  → log de rejet attendu (voir supabase edge_function_logs headset-report-sync)"

# =================== E. delete video ===================
echo ""
echo "── E. Suppression de la vidéo de la playlist ──"
V_BEFORE_E=$(desired)
rest_delete "playlist_videos?playlist_id=eq.${PLAYLIST_ID}&video_id=eq.${VIDEO_ID}" >/dev/null
V_AFTER_E=$(desired)
[ "$V_AFTER_E" -gt "$V_BEFORE_E" ] && pass "desired: $V_BEFORE_E → $V_AFTER_E" || fail "desired n'a pas bumpé"
manifest2=$(curl -sS -X POST "$BASE/headset-manifest" "${auth[@]}")
MV2=$(echo "$manifest2" | jq -r .manifest_version)
GONE=$(echo "$manifest2" | jq --arg vid "$VIDEO_ID" '[.videos[] | select(.id==$vid)] | length')
[ "$GONE" = "0" ] && pass "vidéo absente du nouveau manifest (v$MV2)" || fail "vidéo encore présente"

started=$(curl -sS -X POST "$BASE/headset-report-sync" "${auth[@]}" -d '{"phase":"started"}')
RID=$(echo "$started" | jq -r .report_id)
curl -sS -X POST "$BASE/headset-report-sync" "${auth[@]}" \
  -d "{\"phase\":\"finished\",\"report_id\":\"$RID\",\"status\":\"success\",\"applied_manifest_version\":$MV2,\"downloaded_count\":0,\"deleted_count\":1}" >/dev/null
sleep 1
A_FINAL=$(applied)
[ "$A_FINAL" = "$MV2" ] && pass "applied=$A_FINAL == desired=$MV2 → dashboard 'À jour'" || fail "applied=$A_FINAL != $MV2"

echo ""
if [ "$FAILED" = "0" ]; then
  echo "🎉 Tous les scénarios A→E sont validés."
else
  echo "💥 Certains scénarios ont échoué."
  exit 1
fi
