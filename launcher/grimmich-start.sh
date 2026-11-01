#!/bin/bash
# Start Grimmich in the background and open it in the browser. If it is already running, only the browser is opened.
. "$(dirname "$(readlink -f "$0")")/common.sh"
cd "$FOLDER" || exit 1

if [ ! -x "$PY" ]; then
    notify "$(pick "Die Python-Umgebung fehlt (.venv im Grimmich-Ordner). Siehe README, Abschnitt Start." "The Python environment is missing (.venv in the Grimmich folder). See the README, section Start.")"
    exit 1
fi

if [ -n "$(query)" ]; then
    xdg-open "$URL" >/dev/null 2>&1
    exit 0
fi

nohup setsid "$PY" grimmich.py >> "$LOG" 2>&1 &
echo $! > "$PIDFILE"

for i in $(seq 1 60); do
    if [ -n "$(query)" ]; then
        xdg-open "$URL" >/dev/null 2>&1
        exit 0
    fi
    if ! kill -0 "$(cat "$PIDFILE" 2>/dev/null)" 2>/dev/null; then
        notify "$(pick "Grimmich ließ sich nicht starten. Einzelheiten stehen in grimmich-start.log im Grimmich-Ordner." "Grimmich could not be started. Details are in grimmich-start.log in the Grimmich folder.")"
        exit 1
    fi
    sleep 0.5
done
notify "$(pick "Grimmich antwortet nicht. Einzelheiten stehen in grimmich-start.log im Grimmich-Ordner." "Grimmich does not answer. Details are in grimmich-start.log in the Grimmich folder.")"
exit 1
