#!/usr/bin/env bash
# =============================================================================
#  test-headset-flow.sh
#  Simule un casque Quest qui s'appaire au dashboard et télécharge son manifest.
#
#  Usage :
#    1. Va dans le dashboard, connecte-toi (compte admin).
#    2. Lance ce script :  bash scripts/test-headset-flow.sh
#    3. Il affiche un code 6 chiffres.
#    4. Va sur la page "Casques" du dashboard → "Appairer un casque" → tape le code.
#    5. Le script récupère automatiquement le device_token, appelle le manifest,
#       envoie un heartbeat et un sync_report.
#
#  Prérequis : bash, curl, jq  (sudo apt install jq  /  brew install jq)
# =============================================================================
set -euo pipefail

PROJECT_ID="eanocqzhvlpgppccfppi"
BASE="https://${PROJECT_ID}.supabase.co/functions/v1"
ANON_KEY="sb_publishable_BG39aLgEbKIdusPcOHHcgg_ynDKu6aA"

need() { command -v "$1" >/dev/null 2>&1 || { echo "❌ il manque '$1'"; exit 1; }; }
need curl; need jq

hdr=(-H "apikey: $ANON_KEY" -H "Content-Type: application/json")

echo "▶  1/5  Demande d'un code de pairing (simule le casque au boot)…"
init=$(curl -fsS -X POST "$BASE/headset-pair-init" "${hdr[@]}" \
  -d '{"serial":"TEST-SERIAL-001","model":"Quest 3 (script)"}')
code=$(echo "$init" | jq -r .code)
secret=$(echo "$init" | jq -r .pairing_secret)

echo ""
echo "    ┌─────────────────────────────────────────┐"
echo "    │  CODE À TAPER DANS LE DASHBOARD :  $code  │"
echo "    └─────────────────────────────────────────┘"
echo ""
echo "    ➜ Dashboard → page 'Casques' → 'Appairer un casque'"
echo "    ➜ Tape le code + donne un nom au casque (ex : 'Casque Test')"
echo ""
echo "▶  2/5  Polling toutes les 3 s en attendant que tu valides côté dashboard…"

device_token=""
for i in $(seq 1 80); do
  poll=$(curl -fsS -X POST "$BASE/headset-pair-poll" "${hdr[@]}" \
    -d "{\"code\":\"$code\",\"pairing_secret\":\"$secret\"}" || true)
  status=$(echo "$poll" | jq -r .status 2>/dev/null || echo "error")
  if [ "$status" = "claimed" ]; then
    device_token=$(echo "$poll" | jq -r .device_token)
    headset_id=$(echo "$poll" | jq -r .headset_id)
    echo "    ✅ Casque appairé !  headset_id=$headset_id"
    break
  fi
  echo "    … status=$status  (tentative $i/80)"
  sleep 3
done

if [ -z "$device_token" ]; then
  echo "❌ Pas de claim reçu après 4 minutes. Tu as bien validé dans le dashboard ?"
  exit 1
fi

auth=(-H "Authorization: Bearer $device_token" -H "apikey: $ANON_KEY" -H "Content-Type: application/json")

echo ""
echo "▶  3/5  Récupération du manifest (liste des vidéos à télécharger)…"
manifest=$(curl -fsS -X POST "$BASE/headset-manifest" "${auth[@]}" -d '{}')
echo "$manifest" | jq '{generated_at, url_expires_in, video_count: (.videos|length), first_video: .videos[0]}'

echo ""
echo "▶  4/5  Envoi d'un heartbeat (batterie 87 %, 32 Go libres)…"
curl -fsS -X POST "$BASE/headset-heartbeat" "${auth[@]}" \
  -d '{"battery_percent":87,"storage_free_bytes":34359738368,"storage_total_bytes":137438953472,"app_version":"0.1.0-test"}' \
  | jq .

echo ""
echo "▶  5/5  Envoi d'un rapport de sync factice (succès, 3 vidéos téléchargées)…"
started=$(curl -fsS -X POST "$BASE/headset-report-sync" "${auth[@]}" -d '{"phase":"started"}')
report_id=$(echo "$started" | jq -r .report_id)
curl -fsS -X POST "$BASE/headset-report-sync" "${auth[@]}" \
  -d "{\"phase\":\"finished\",\"report_id\":\"$report_id\",\"status\":\"success\",\"downloaded_count\":3,\"failed_count\":0,\"total_bytes\":1234567890}" \
  | jq .

echo ""
echo "✅  Tout est passé. Va vérifier dans le dashboard :"
echo "    • page 'Casques'  → ton casque doit apparaître 'en ligne'"
echo "    • page 'Suivi sync' → tu dois voir un rapport 'success' avec 3 vidéos"
echo ""
echo "📝  Garde précieusement ce device_token si tu veux rejouer des appels :"
echo "$device_token"