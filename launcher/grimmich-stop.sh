#!/bin/bash
# Stop the Grimmich running in the background. If a job is running, it is not stopped (unless --force is given).
. "$(dirname "$(readlink -f "$0")")/common.sh"

status="$(query)"
if [ -z "$status" ]; then
    notify "$(pick "Grimmich läuft nicht." "Grimmich is not running.")"
    rm -f "$PIDFILE"
    exit 0
fi
if [ "$status" = "running" ] && [ "$1" != "--force" ]; then
    notify "$(pick "Es läuft gerade ein Auftrag (z. B. Aktualisieren oder Schreiben). Grimmich wurde nicht beendet. Bitte warten, bis der Auftrag fertig ist." "A job is running right now (e.g. Update or Write). Grimmich was not stopped. Please wait until the job is finished.")"
    exit 1
fi

pid="$(cat "$PIDFILE" 2>/dev/null)"
if [ -z "$pid" ] || ! tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null | grep -q "grimmich.py"; then
    notify "$(pick "Grimmich läuft, wurde aber nicht über den Starter gestartet. Bitte im Terminal mit Strg+C beenden." "Grimmich is running but was not started through the launcher. Please stop it in the terminal with Ctrl+C.")"
    exit 1
fi
kill "$pid"
for i in $(seq 1 20); do
    kill -0 "$pid" 2>/dev/null || { rm -f "$PIDFILE"; notify "$(pick "Grimmich wurde beendet." "Grimmich was stopped.")"; exit 0; }
    sleep 0.25
done
notify "$(pick "Grimmich reagiert nicht auf das Beenden." "Grimmich does not react to the stop request.")"
exit 1
