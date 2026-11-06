# Testanleitung

## Automatische Tests (ein Rechner)

Voraussetzung: Node.js (LTS), einmalig `npm run install:dependencies`.

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
| Programm übernehmen | ☰ auf einer Kachel → „Erlauben“ | Programm steht unter „Eigene Programme“ und wird nicht mehr geschlossen |

**Wichtig zur Programmsperre:** Mit `npm run dev` (ungepackte App) werden Programme nur **gemeldet**,
nie geschlossen – damit beim Entwickeln nichts verloren geht. Echtes Schließen passiert nur in der
installierten App (`npm --prefix student run build:win:msi` bzw. `build:mac:arm64`).
Zum ersten Ausprobieren in der Klasse den Modus „Nur melden“ wählen und die Meldungen ansehen.

## Bekannte Grenzen (Stand Schritt 5)

- Windows- und Linux-Teile der Programmsperre sind noch nicht auf echten Geräten getestet.
- Linux mit Wayland: nur die Blockliste (Chat, Spiele …) wird durchgesetzt, keine Freigabeliste.
- Verbindung zur Lehrkraft verloren → Programmsperre endet derzeit mit der Verbindung
  (die vereinbarte Regel „bis Endzeit + 5 min“ kommt mit Schritt 9).
- Schüler können die App beenden – Erkennung und Meldung kommen mit Schritt 8.
- Die Internetsperre fehlt noch (Schritte 6–7, Hilfsdienst mit Admin-Rechten).
