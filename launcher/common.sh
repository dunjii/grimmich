# Shared helpers for the launcher scripts (sourced by the other scripts).
FOLDER="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/.." && pwd)"
PORT=8765
URL="http://localhost:$PORT"
PY="$FOLDER/.venv/bin/python"
PIDFILE="$FOLDER/grimmich.pid"
LOG="$FOLDER/grimmich-start.log"

# pick(german, english): the German text if the system language is German, otherwise English
pick() {
    case "${LC_ALL:-${LC_MESSAGES:-${LANG:-}}}" in de*) echo "$1" ;; *) echo "$2" ;; esac
}

notify() {  # show a short message on the screen (and write it to the log)
    echo "$(date '+%F %T') $1" >> "$LOG"
    if command -v notify-send >/dev/null 2>&1; then notify-send "Grimmich" "$1"
    elif command -v zenity >/dev/null 2>&1; then zenity --info --title="Grimmich" --text="$1" 2>/dev/null
    elif command -v kdialog >/dev/null 2>&1; then kdialog --title "Grimmich" --msgbox "$1"
    else echo "$1"; fi
}

# Print the status of the running Grimmich ("running" / "free"), or nothing if it does not answer.
query() {
    "$PY" -I - "$URL/api/job" <<'P' 2>/dev/null
import json, sys, urllib.request
try:
    with urllib.request.urlopen(sys.argv[1], timeout=2) as r:
        print("running" if json.load(r).get("running") else "free")
except Exception:
    pass
P
}
