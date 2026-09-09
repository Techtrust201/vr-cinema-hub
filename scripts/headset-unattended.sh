#!/usr/bin/env bash
# Mode labo Quest : le casque reste allumé et l'app continue de tourner
# même quand personne ne le porte (tests, sync, ADB, pause pipi).
#
# Usage :
#   scripts/headset-unattended.sh enable
#   scripts/headset-unattended.sh disable
#   scripts/headset-unattended.sh status
#
# Sans ça, Horizon OS considère le casque retiré et s'endort en ~15 s :
# ADB coupe, l'app Unity est suspendue, heartbeats et sync s'arrêtent.
set -euo pipefail

PKG_PROD="com.techtrust.vrcinemaquest"
PKG_STAGING="com.techtrust.vrcinemaquest.staging"
UNATTENDED_FLAG="unattended.flag"
ATTENDED_FLAG="attended.flag"
REMOTE_SH="/data/local/tmp/vrcinema-keep-awake.sh"
REMOTE_PID="/data/local/tmp/vrcinema-keep-awake.pid"
REMOTE_LOG="/data/local/tmp/vrcinema-keep-awake.log"
KEEP_AWAKE_SECONDS=5

need_adb() {
  command -v adb >/dev/null 2>&1 || { echo "adb introuvable"; exit 1; }
  local serial
  serial=$(adb devices | awk 'NR>1 && $2=="device"{print $1; exit}')
  if [[ -z "${serial}" ]]; then
    echo "Aucun casque ADB (état « device »). Branche le Quest et accepte le débogage USB."
    exit 1
  fi
}

pkg_file() {
  echo "/sdcard/Android/data/$1/files/$2"
}

write_pkg_file() {
  local pkg="$1" name="$2"
  local path
  path=$(pkg_file "$pkg" "$name")
  if adb shell pm path "$pkg" >/dev/null 2>&1; then
    adb shell "mkdir -p /sdcard/Android/data/${pkg}/files && echo 1 > '${path}' && chmod 666 '${path}'" >/dev/null
    echo "  ${name}  ${path}"
  fi
}

remove_pkg_file() {
  local pkg="$1" name="$2"
  adb shell "rm -f '$(pkg_file "$pkg" "$name")'" >/dev/null 2>&1 || true
}

enable_flags() {
  local pkg="$1"
  remove_pkg_file "$pkg" "$ATTENDED_FLAG"
  write_pkg_file "$pkg" "$UNATTENDED_FLAG"
}

disable_flags() {
  local pkg="$1"
  remove_pkg_file "$pkg" "$UNATTENDED_FLAG"
  write_pkg_file "$pkg" "$ATTENDED_FLAG"
}

daemon_pid() {
  adb shell "cat '${REMOTE_PID}' 2>/dev/null" | tr -d '\r'
}

stop_daemon() {
  local pid
  pid=$(daemon_pid || true)
  if [[ -n "${pid}" ]]; then
    adb shell "kill '${pid}'" >/dev/null 2>&1 || true
  fi
  adb shell "pkill -f vrcinema-keep-awake.sh" >/dev/null 2>&1 || true
  adb shell "rm -f '${REMOTE_PID}'" >/dev/null 2>&1 || true
}

install_daemon() {
  # Recolle le capteur virtuel « porté » plus souvent que le délai d'auto-sommeil (15 s).
  adb shell "cat > '${REMOTE_SH}'" <<EOF
#!/system/bin/sh
while true; do
  am broadcast -a com.oculus.vrpowermanager.prox_close --user 0 >/dev/null 2>&1
  sleep ${KEEP_AWAKE_SECONDS}
done
EOF
  adb shell "chmod 755 '${REMOTE_SH}'"
  stop_daemon
  adb shell "sh -c 'nohup ${REMOTE_SH} >${REMOTE_LOG} 2>&1 & echo \$! > ${REMOTE_PID}'"
}

resume_app() {
  local pkg=""
  if adb shell pidof "$PKG_STAGING" >/dev/null 2>&1; then
    pkg="$PKG_STAGING"
  elif adb shell pidof "$PKG_PROD" >/dev/null 2>&1; then
    pkg="$PKG_PROD"
  elif adb shell pm path "$PKG_STAGING" >/dev/null 2>&1; then
    pkg="$PKG_STAGING"
  else
    pkg="$PKG_PROD"
  fi
  adb shell am start -n "${pkg}/com.unity3d.player.UnityPlayerGameActivity" >/dev/null
  echo "  app   ${pkg}"
}

vr_state() {
  adb shell dumpsys vrpowermanager 2>/dev/null | head -n 8 || true
}

cmd="${1:-}"
case "${cmd}" in
  enable)
    need_adb
    echo "Activation du mode labo (casque utilisable sans le porter)…"
    adb shell 'settings put global stay_on_while_plugged_in 7' >/dev/null
    adb shell 'svc power stayon true' >/dev/null 2>&1 || true
    enable_flags "$PKG_PROD"
    enable_flags "$PKG_STAGING"
    install_daemon
    adb shell 'am broadcast -a com.oculus.vrpowermanager.prox_close --user 0' >/dev/null
    resume_app
    sleep 1
    pid=$(daemon_pid || true)
    echo "  keep-awake pid=${pid:-?} (toutes les ${KEEP_AWAKE_SECONDS}s → prox_close)"
    echo
    vr_state
    echo
    echo "Le casque peut rester posé. Après un redémarrage du Quest, relance « enable »."
    echo "Pour revenir au comportement normal : $0 disable"
    ;;
  disable)
    need_adb
    echo "Désactivation du mode labo…"
    stop_daemon
    disable_flags "$PKG_PROD"
    disable_flags "$PKG_STAGING"
    adb shell 'am broadcast -a com.oculus.vrpowermanager.prox_far --user 0' >/dev/null 2>&1 || true
    adb shell 'svc power stayon false' >/dev/null 2>&1 || true
    adb shell 'settings put global stay_on_while_plugged_in 2' >/dev/null
    echo "Capteur de proximité rétabli — le casque se mettra en veille s'il n'est pas porté."
    ;;
  status)
    need_adb
    echo "=== vrpowermanager ==="
    vr_state
    echo
    echo "=== keep-awake ==="
    pid=$(daemon_pid || true)
    if [[ -n "${pid}" ]] && adb shell "kill -0 '${pid}'" >/dev/null 2>&1; then
      echo "actif  pid=${pid}"
    else
      echo "inactif"
    fi
    echo
    echo "=== flags ==="
    for pkg in "$PKG_PROD" "$PKG_STAGING"; do
      for name in "$UNATTENDED_FLAG" "$ATTENDED_FLAG"; do
        if adb shell "test -f '$(pkg_file "$pkg" "$name")'" >/dev/null 2>&1; then
          echo "présent  $(pkg_file "$pkg" "$name")"
        else
          echo "absent   $(pkg_file "$pkg" "$name")"
        fi
      done
    done
    echo
    echo "=== stay_on_while_plugged_in ==="
    adb shell 'settings get global stay_on_while_plugged_in'
    ;;
  *)
    echo "Usage: $0 enable|disable|status" >&2
    exit 2
    ;;
esac
