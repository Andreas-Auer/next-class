# Next-Class

## ⬇️ Installation – hier herunterladen

Auf den Namen klicken, der Download startet sofort (immer die neueste Version).

| | Lehrer-App | Schüler-App |
|---|---|---|
| **Windows** | [Next-Class-Lehrer-Windows.exe](https://github.com/Andreas-Auer/next-class/releases/latest/download/Next-Class-Lehrer-Windows.exe) | [Next-Class-Schueler-Windows.exe](https://github.com/Andreas-Auer/next-class/releases/latest/download/Next-Class-Schueler-Windows.exe) |
| **Mac mit Apple-Chip (M1–M4)** | [Next-Class-Lehrer-Mac-Apple-Chip.dmg](https://github.com/Andreas-Auer/next-class/releases/latest/download/Next-Class-Lehrer-Mac-Apple-Chip.dmg) | [Next-Class-Schueler-Mac-Apple-Chip.dmg](https://github.com/Andreas-Auer/next-class/releases/latest/download/Next-Class-Schueler-Mac-Apple-Chip.dmg) |
| **Mac mit Intel** | [Next-Class-Lehrer-Mac-Intel.dmg](https://github.com/Andreas-Auer/next-class/releases/latest/download/Next-Class-Lehrer-Mac-Intel.dmg) | [Next-Class-Schueler-Mac-Intel.dmg](https://github.com/Andreas-Auer/next-class/releases/latest/download/Next-Class-Schueler-Mac-Intel.dmg) |
| **Linux** | [Next-Class-Lehrer-Linux.AppImage](https://github.com/Andreas-Auer/next-class/releases/latest/download/Next-Class-Lehrer-Linux.AppImage) | [Next-Class-Schueler-Linux.AppImage](https://github.com/Andreas-Auer/next-class/releases/latest/download/Next-Class-Schueler-Linux.AppImage) |

Die Apps haben (noch) kein kostenpflichtiges Zertifikat. Deshalb warnen Browser und Betriebssystem beim ersten Mal:

**Windows**
1. Der Browser blockiert den Download (Opera: „Gefährlich“, Edge: „wird nicht häufig heruntergeladen“):
   im Download-Fenster bei der Datei auf **Behalten** bzw. **… → Behalten → Trotzdem behalten** klicken.
   Klappt das nicht, die Datei mit Edge oder Chrome laden.
2. Datei öffnen. Bei der blauen Meldung „Der Computer wurde durch Windows geschützt“:
   **Weitere Informationen** → **Trotzdem ausführen**.

**Mac**
1. `.dmg` öffnen und die App in den Ordner **Programme** ziehen.
2. App öffnen. macOS meldet, dass es die App nicht überprüfen kann → **Fertig** klicken.
3. **Systemeinstellungen → Datenschutz & Sicherheit**, ganz nach unten scrollen → bei Next-Class **Dennoch öffnen** → mit Passwort bestätigen.
4. Schüler-App: unter **Datenschutz & Sicherheit → Bildschirm- & Systemaudioaufnahme** erlauben (sonst bleibt das Live-Bild schwarz).

Meldet ein Mac „… ist beschädigt“, ist es eine alte Version (0.1.0): neu herunterladen.

**Unterrichtsmodus für den regulären Unterricht – keine Prüfungsumgebung.**

Next-Class hilft Lehrkräften, Ablenkung im Unterricht mit Fachsoftware (z. B. Archicad, Rhino, QGIS, Allplan, Office) zu reduzieren:

- Unterrichtseinheit starten, Schülerinnen und Schüler treten im Schulnetz bei
- Internetsperre direkt auf dem Schülergerät (das Schulnetz bleibt erreichbar)
- Programmsperre mit Freigabeliste und wiederverwendbaren Vorlagen
- Live-Ansicht der Schülerbildschirme und Anzeige von länger unveränderten Bildschirmen
- mehrere Lehrkräfte gleichzeitig (Teamteaching)
- automatische Freigabe zur eingestellten Endzeit

> **Anleitung für Lehrkräfte und Schüler:** [docs/ANLEITUNG.md](docs/ANLEITUNG.md)
>
> Status: frühe Entwicklung. Der aktuelle Stand und die nächsten Schritte stehen in [docs/PLAN.md](docs/PLAN.md),
> die getroffenen Entscheidungen in [docs/ENTSCHEIDUNGEN.md](docs/ENTSCHEIDUNGEN.md).

## Fork von Next-Exam

Next-Class ist ein Fork von **[Next-Exam](https://github.com/Bildungsportal/next-exam)**
(© Thomas Michael Weissel und Mitwirkende, <https://next-exam.at>), lizenziert unter der
**GNU General Public License v3** (siehe [LICENSE](LICENSE)). Alle ursprünglichen Urheber- und Lizenzhinweise bleiben erhalten.

Next-Class ist **kein** offizielles Produkt des Bildungsministeriums (BMB) oder des Next-Exam-Teams
und ersetzt Next-Exam nicht. Für Prüfungen ist weiterhin Next-Exam zu verwenden.
Beide Programme können parallel installiert werden: Next-Class verwendet eigene Ports,
eine eigene Multicast-Adresse, eigene App-IDs und eigene Installationskennungen.

| | Next-Exam | Next-Class |
|---|---|---|
| API-Port | 22422 | 22522 |
| Discovery-Ports | 6024 / 6025 | 6124 / 6125 |
| Multicast-Adresse | 239.1.1.1 | 239.255.42.1 |
| App-ID | com.nextexam.* | com.nextclass.* |

## Technik

Electron, Vite, Quasar/Vue 3, Node.js, Express.

## Entwickeln

Voraussetzung: [Node.js](https://nodejs.org) (LTS) und [Go](https://go.dev) (für den Hilfsdienst der Internetsperre, siehe [helper/README.md](helper/README.md)).

```bash
npm run install:dependencies
npm run build:helper
npm run dev
```

`npm run dev` startet Lehrer- und Schüler-App gleichzeitig auf einem Rechner.

Automatischer Ende-zu-Ende-Test (baut beide Apps und spielt eine Unterrichtseinheit durch):

```bash
npm run test:e2e
```
