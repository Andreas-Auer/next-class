# Entscheidungen

Stand: 2026-11-06. Getroffen von Andreas Auer.

## Grundsätzliches

| Thema | Entscheidung |
|---|---|
| Zweck | Reines Unterrichtswerkzeug, keine Prüfungsumgebung. Prüfungsfunktionen werden entfernt. |
| Fork | Hard Fork von Next-Exam. Fehlerbehebungen aus `upstream` werden bei Bedarf gezielt übernommen, kein regelmäßiges Mergen. |
| Koexistenz | Next-Class und Next-Exam müssen parallel installiert sein können: eigene Ports, Multicast-Adresse, App-IDs, MSI-Upgrade-Codes, Ordner und Secrets. |
| Sprache | Oberfläche Deutsch, Code und Kommentare Englisch. |
| Plattform-Reihenfolge | Windows → macOS → Linux. Linux mit eingeschränkter Programmsperre unter Wayland. |
| Code-Signierung | Keine. Windows zeigt einmalig eine SmartScreen-Warnung, macOS verlangt "Trotzdem öffnen" in den Systemeinstellungen. Die Architektur soll eine spätere Signierung ohne Umbau erlauben. |
| Hilfsdienst | Eigener privilegierter Systemdienst in **Go** (Firewall, Watchdog, Aufräumen). Die Electron-Apps laufen ohne Admin-Rechte. |

## Sperren

| Thema | Entscheidung |
|---|---|
| Endzeit | Beim Sperren wird eine Endzeit gesetzt, wahlweise als Dauer (z. B. +50 / +100 min) oder als genaue Uhrzeit. |
| Ohne Kontakt zur Lehrer-App | Das Gerät bleibt bis zur Endzeit + **5 min Puffer** gesperrt. |
| Obergrenze | Jede Sperre endet spätestens **4 h** nach Sperrbeginn (Schutz gegen Tippfehler). |
| Neustart | Nach einem Neustart ist das Gerät immer frei; der Dienst räumt beim Start alle Regeln auf. |
| Nicht freigegebene Programme | Modus pro Einheit umschaltbar: **beenden** (Standard; erst höflich schließen, dann hart beenden, 30 s Vorwarnung) oder **nur melden**. |

## Überwachung

| Thema | Entscheidung |
|---|---|
| Live-Ansicht | **Immer an**, solange ein Schüler verbunden ist. Am Schülergerät ist ein Symbol sichtbar. Es wird nichts gespeichert. |
| Inaktivitäts-Anzeige | Die Schüler-App vergleicht etwa alle 10 s ein verkleinertes Bildschirmfoto mit dem letzten veränderten. Kleine Änderungen (Mauszeiger, Uhr, Textcursor, Kompressionsrauschen) werden über eine Toleranzschwelle ignoriert. Ab **2 min** ohne Veränderung zeigt die Lehrer-App einen hochzählenden Zähler, bis sich der Bildschirm ändert. Schwelle pro Einheit einstellbar. |
| Tastatur-/Mauseingabe | Vorerst **nicht** erfassen. |

## Mehrere Lehrkräfte

| Thema | Entscheidung |
|---|---|
| Modell | Ein Host, die anderen sind gleichberechtigte Co-Lehrkräfte mit repliziertem Zustand. Übergabe beim Verlassen, automatische Übernahme bei Host-Ausfall. |
| Beitritt | Eigener **Lehrer-Code** (anders als der Schüler-Code) **und** Bestätigung durch eine bereits verbundene Lehrkraft. |

## Noch offen

- Angaben der Schul-IT (erst ab der Internetsperre nötig): Subnetze von WLAN und Netzlaufwerken, Proxy im LAN, interne DNS-Server, Multicast bzw. Client-Isolation im WLAN.
- Datenschutz: Live-Ansicht auf privaten Geräten mit Direktion abstimmen, Schüler und Eltern informieren.
