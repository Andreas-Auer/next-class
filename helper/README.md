# Next-Class Helper

Kleiner Systemdienst (Go) für die **Internetsperre**. Die Schüler-App läuft ohne Admin-Rechte;
nur dieser Dienst darf Firewall-Regeln setzen.

| Plattform | Firewall | Installiert nach | Dienst |
|---|---|---|---|
| Windows | Windows-Defender-Firewall (Block-Regeln, Gruppe „NextClass“) | `C:\Program Files\NextClass Helper\` | Windows-Dienst `at.nextclass.helper` |
| macOS | pf, Anker `com.apple/250.NextClass` (pf.conf bleibt unverändert) | `/Library/PrivilegedHelperTools/at.nextclass.helper` | LaunchDaemon |
| Linux | nftables, eigene Tabelle `inet nextclass` | `/usr/local/lib/nextclass/` | systemd |

**Verhalten**
- Gesperrt wird alles außer: Subnetz der Verbindung zur Lehrkraft, Lehrer-IP, Loopback, Link-Local,
  Multicast, Broadcast und DNS-Server (nur Port 53). IPv6 nur lokal (Link-Local, ULA, Multicast).
- Die Sperre endet von selbst zur Endzeit (Lehrkraft: Endzeit, ohne Kontakt + 5 min), höchstens nach 4 Stunden.
- Beim Start des Dienstes (also nach jedem Neustart) werden alle Next-Class-Regeln entfernt.
- Alle 3 Sekunden wird geprüft, ob die Regeln noch da sind und die Firewall eingeschaltet ist;
  sonst wird wiederhergestellt und ein Ereignis an die Lehrkraft gemeldet.
- Wird der Dienst gestoppt, bleiben die Regeln bis zum nächsten Neustart (sonst wäre Stoppen eine Umgehung).

**Schnittstelle:** nur `127.0.0.1:22533`, Token aus der Token-Datei (für lokale Benutzer lesbar),
Anfragen aus Webseiten (Origin-Header, fremder Host) werden abgelehnt.

**Entwickeln**
```bash
go test ./...
npm run build:helper                 # alle Plattformen nach helper/dist/
./dist/darwin-arm64/nextclass-helper run --dry-run --addr 127.0.0.1:23533 --token-file /tmp/token
```
Im `--dry-run`-Modus wird die Firewall nie verändert (für Tests).

**Deinstallieren** (als Administrator): `nextclass-helper uninstall` – entfernt Dienst, Regeln und Dateien.
