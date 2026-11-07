# Testanleitung

## Automatische Tests (ein Rechner)

Voraussetzung: Node.js (LTS) und Go, einmalig `npm run install:dependencies`.

```bash
npm test
```
Unit-Tests (ca. 2 s): Vergleich für den unveränderten Bildschirm, Regeln der Programmsperre, Beenden von Prozessen.

```bash
npm run test:e2e
```
Baut beide Apps und spielt eine Unterrichtseinheit durch (ca. 2 min, öffnet kurz zwei Fenster):
falsche PIN → Beitritt nur mit Name + PIN → Live-Ansicht → Zähler „unveränderter Bildschirm“ →
Programmsperre (mit simulierten Programmen, es wird nichts geschlossen) → WLAN-Aussetzer mit
automatischem Wiederverbinden → Bildschirme sperren/entsperren → Verlassen → Einheit beenden.

## Von Hand (zwei Geräte im selben WLAN)

`npm run dev` startet beide Apps auf einem Rechner. Für einen echten Test die Lehrer-App auf Gerät A
und die Schüler-App auf Gerät B starten (jeweils `npm --prefix teacher run dev` bzw. `npm --prefix student run dev`).

| Was | So prüfen | Erwartung |
|---|---|---|
| Beitritt | Lehrer: Namen eingeben, „Unterrichtseinheit starten“. Schüler: Name + PIN, „Beitreten“ | Schüler-Kachel erscheint mit „Verbunden“ |
| Live-Ansicht | macOS: beim ersten Mal „Bildschirmaufnahme“ für Next-Class erlauben | Vorschaubild aktualisiert sich alle 4 s; ohne Erlaubnis: „Keine Bildfreigabe“ |
| WLAN-Aussetzer | Am Schülergerät WLAN 10 s aus und wieder ein | Schüler zeigt „verbindet neu…“, danach automatisch wieder verbunden, gleiche Kachel |
| Unveränderter Bildschirm | Schülergerät 2 min nicht anfassen (Maus bewegen ist erlaubt) | Kachel orange, Zähler ⏸ 2:00 läuft weiter; Fenster wechseln → Zähler weg |
| Bildschirme sperren | „Bildschirme sperren“ | Schülerbildschirm schwarz mit „Bildschirm gesperrt“; Entsperren hebt es auf |
| Programmsperre | Vorlage wählen, „Programmsperre aktivieren“ | Schüler sieht 30-s-Countdown, danach werden nicht erlaubte Programme geschlossen und bei der Lehrkraft gemeldet |
| Internetsperre einrichten | Schüler-App: „Internetsperre einrichten“ (Admin-Passwort) | Hinweis verschwindet; Windows: Dienst „Next-Class Helper“ läuft |
| Internetsperre | Lehrer: „Internet sperren“ bis in 50 Minuten | Schüler: „Internet gesperrt bis …“; Browser lädt keine Seite, Lehrer-App und Netzlaufwerk funktionieren |
| Hotspot | Während der Sperre Schülergerät mit Handy-Hotspot verbinden | Kein Internet; Lehrer sieht „Getrennt“ |
| Manipulation | Windows (Admin): `Remove-NetFirewallRule -Group NextClass` | nach ≤ 3 s wieder gesperrt, Lehrer sieht „Firewall-Regel entfernt – wiederhergestellt“ |
| Ende | Lehrer: „Internet freigeben“, oder Endzeit abwarten, oder Neustart | Internet wieder frei |
| Co-Lehrkraft | Gerät C: Lehrer-App → „Als Co-Lehrkraft beitreten“ (oder IP eingeben) → Name + Lehrer-Code aus dem Host-Dashboard | Host bekommt eine Rückfrage; nach „Zulassen“ steuern beide gleichberechtigt, Änderungen erscheinen bei beiden |
| Host fällt aus | Mit Co-Lehrkraft: Lehrer-App des Hosts hart beenden oder WLAN aus | Nach ca. 20–30 s: Co-Lehrkraft „Du leitest jetzt die Unterrichtseinheit“; Schüler verbinden sich selbst neu, Sperren bleiben |
| Programm übernehmen | ☰ auf einer Kachel → „Erlauben“ | Programm steht unter „Eigene Programme“ und wird nicht mehr geschlossen |

### Kurse, Ablauf, Sitzplan, Abgaben (Schritte 15–21)

| Was | Wie | Erwartung |
|---|---|---|
| Erster Start | Lehrer-App neu starten | Name und Abgabe-Ordner werden einmal abgefragt; ⚙ Einstellungen zeigt den Ordner ganz oben |
| Kurs anlegen | **+ Neuer Kurs**: Name, Zeit 08:00–09:40, Vorlage | Kachel mit Name, Lehrkraft, Zeit; ⚙ zeigt die feste 6-stellige PIN |
| Erste Stunde | Unterricht starten; Schüler-App: Vorname/Nachname/Klasse, dann PIN | Schüler sind eingeschrieben und „neu“ |
| Zweite Stunde | Kurs erneut starten | Eingeschriebene Geräte erscheinen von selbst („online – nicht beigetreten“), mit „Am Unterricht teilnehmen“ grün; neue Geräte klopfen an |
| Sperren | **Unterricht starten – Computer sperren** | 10 s Vorwarnung, dann Internet und Programme gesperrt bis Stundenende |
| Alarm | Schüler beendet Next-Class oder WLAN aus | Kachel rot, Hinweis oben, Ton |
| Neustart | Schüler startet Next-Class neu | Klopft an; nach **Einlassen** wieder dabei |
| Freigabe | 🔓 → vorübergehend / für diese Stunde | Sperren beim Schüler aufgehoben; „für diese Stunde“ trennt ihn |
| Sitzplan | **Sitzplan**, Schüler auf Plätze ziehen, ⇅ | Plätze rasten ein, tauschen; Ansicht spiegelt sich |
| Zweite Lehrkraft | Lehrer-Code + Zulassen, später Kurs selbst starten | Danach Kurs auf ihrer Startseite; beim nächsten Mal ohne Code dabei |
| Kursabgleich | Beide Lehrer-Apps offen, keine Stunde; Lehrkraft B ändert die Zeit des Kurses | Nach höchstens ca. 15 s zeigt die Kachel bei Lehrkraft A die neue Zeit |
| Kurs entfernen (Schüler) | Kurs ist nicht live; unter „Meine Kurse“ ✕ → bestätigen | Kurs verschwindet; mit der PIN kann man wieder beitreten |
| Aufgabe | 📝 Aufgaben → + Aufgabe mit Material | Schüler sieht Aufgabe und Material; Abgabe landet in `Datum_Kurs_Wort/Nachname Vorname/` bei **beiden** Lehrkräften |

**Wichtig zur Programmsperre:** Mit `npm run dev` (ungepackte App) werden Programme nur **gemeldet**,
nie geschlossen – damit beim Entwickeln nichts verloren geht. Echtes Schließen passiert nur in der
installierten App (`npm --prefix student run build:win:msi` bzw. `build:mac:arm64`).
Zum ersten Ausprobieren in der Klasse den Modus „Nur melden“ wählen und die Meldungen ansehen.

## Automatische Tests bei jedem Push (GitHub Actions)

- Unit-Tests (JavaScript und Go)
- Ende-zu-Ende-Tests der ganzen Stunde auf **macOS und Windows** (Kurs, Einschreiben, Sperren, Sitzplan im kleinen
  Fenster 1024 px, Aufgaben, zweite Lehrkraft, Übernahme bei Absturz, Kursabgleich ohne gemeinsame Stunde)
- Echte Internetsperre und echte Programmsperre auf Windows, macOS und Linux
- Installer für Windows, macOS und Linux; bei einem Versions-Tag (`v…`) zusätzlich ein Release

## Bekannte Grenzen

- Die Programmsperre wird bei jedem Push in der CI **echt** geprüft (Job „Program lock“): Editor/TextEdit/xterm
  und ein Hintergrundprogramm „discord“ werden erkannt, gesperrt und geschlossen – auf Windows, macOS und Linux (X11).
  Nicht geprüft: echte Fachsoftware (Archicad, Rhino …) und Geräte mit Schüler-Konten ohne Admin-Rechte.
- Linux mit Wayland: nur die Blockliste (Chat, Spiele …) wird durchgesetzt, keine Freigabeliste.
- Host-Ausfall ohne Co-Lehrkraft: Niemand übernimmt; die Sperren laufen auf den Schülergeräten bis zur Endzeit (+5 min) weiter.
- Schüler können die App beenden: Die Lehrkraft sieht „App beendet“; die Internetsperre bleibt (Hilfsdienst),
  die Programmsperre wirkt erst wieder, wenn die App neu gestartet wird.
- Die Internetsperre wird bei jedem Push in der CI **echt** gesetzt und wieder entfernt – auf frischen
  Windows-, macOS- und Linux-Rechnern von GitHub (Job „Internet lock“): erlaubtes Netz erreichbar,
  DNS-Server nur Port 53, alles andere gesperrt, danach wieder alles frei.
  Nicht geprüft ist dort: echtes Schul-WLAN, Lizenzserver, Netzlaufwerke und der Hilfsdienst als
  installierter Dienst. Deshalb vor dem ersten Klasseneinsatz trotzdem auf je einem Windows- und
  Mac-Gerät von Hand testen (Tabelle oben). Zum Rückgängigmachen: Neustart, oder
  `nextclass-helper uninstall` als Administrator.
- Den Test selbst nie auf einem normalen Rechner starten (`NC_REAL_FIREWALL=1`): Er ändert die Firewall.
- Drittanbieter-Firewalls (z. B. Norton) können die Windows-Firewall ersetzen – dann greift die Sperre nicht.
