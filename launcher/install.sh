#!/bin/bash
# Create the "Grimmich" menu entry (with logo). Usage: bash launcher/install.sh
. "$(dirname "$(readlink -f "$0")")/common.sh"
chmod +x "$FOLDER"/launcher/*.sh
TARGET="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
mkdir -p "$TARGET"
cat > "$TARGET/grimmich.desktop" <<D
[Desktop Entry]
Type=Application
Name=Grimmich
GenericName=Dating old photos
GenericName[de]=Altfotos datieren
Comment=Date and arrange old family photos
Comment[de]=Alte Familienfotos datieren und einordnen
Exec="$FOLDER/launcher/grimmich-start.sh"
Icon=$FOLDER/assets/logo-512.png
Terminal=false
Categories=Graphics;Utility;
StartupNotify=false
Actions=stop;

[Desktop Action stop]
Name=Stop Grimmich
Name[de]=Grimmich beenden
Exec="$FOLDER/launcher/grimmich-stop.sh"
D
command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$TARGET" 2>/dev/null
pick "Fertig. Im Anwendungsmenü gibt es jetzt den Eintrag \"Grimmich\"." "Done. The application menu now has the entry \"Grimmich\"."
pick "Zum Beenden: Rechtsklick auf den Eintrag, dann \"Grimmich beenden\" (oder launcher/grimmich-stop.sh)." "To stop it: right-click the entry, then \"Stop Grimmich\" (or launcher/grimmich-stop.sh)."
