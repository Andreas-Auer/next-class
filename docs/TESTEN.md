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
| Programm übernehmen | ☰ auf einer Kachel → „Erlauben“ | Programm steht unter „Eigene Programme“ und wird nicht mehr geschlossen |

**Wichtig zur Programmsperre:** Mit `npm run dev` (ungepackte App) werden Programme nur **gemeldet**,
nie geschlossen – damit beim Entwickeln nichts verloren geht. Echtes Schließen passiert nur in der
installierten App (`npm --prefix student run build:win:msi` bzw. `build:mac:arm64`).
Zum ersten Ausprobieren in der Klasse den Modus „Nur melden“ wählen und die Meldungen ansehen.

## Bekannte Grenzen (Stand Schritt 9)

- Windows- und Linux-Teile der Programmsperre sind noch nicht auf echten Geräten getestet.
- Linux mit Wayland: nur die Blockliste (Chat, Spiele …) wird durchgesetzt, keine Freigabeliste.
- Schüler können die App beenden: Die Lehrkraft sieht „App beendet“; die Internetsperre bleibt (Hilfsdienst),
  die Programmsperre wirkt erst wieder, wenn die App neu gestartet wird.
- Die Internetsperre ist nur im Probemodus getestet (Regeln werden berechnet, aber nicht gesetzt).
  Vor dem ersten Klasseneinsatz unbedingt auf je einem Windows-, Mac- und ggf. Linux-Gerät von Hand testen
  (Tabelle oben). Zum Rückgängigmachen: Neustart, oder `nextclass-helper uninstall` als Administrator.
- Drittanbieter-Firewalls (z. B. Norton) können die Windows-Firewall ersetzen – dann greift die Sperre nicht.
