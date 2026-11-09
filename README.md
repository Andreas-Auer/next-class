# Next-Class

## ⬇️ Installation – hier herunterladen

Auf den Dateinamen klicken, der Download startet sofort (Version 0.1.0).

| | Lehrer-App | Schüler-App |
|---|---|---|
| **Windows** | [Next-Class-Teacher (.exe)](https://github.com/Andreas-Auer/next-class/releases/download/v0.1.0/Next-Class-Teacher_0.1.0.1_20261107_x64.exe) | [Next-Class-Student (.exe)](https://github.com/Andreas-Auer/next-class/releases/download/v0.1.0/Next-Class-Student_0.1.0.1_20261107_x64.exe) |
| **Mac mit Apple-Chip (M1–M4)** | [Next-Class-Teacher (arm64.dmg)](https://github.com/Andreas-Auer/next-class/releases/download/v0.1.0/Next-Class-Teacher_0.1.0.1_20261107_arm64.dmg) | [Next-Class-Student (arm64.dmg)](https://github.com/Andreas-Auer/next-class/releases/download/v0.1.0/Next-Class-Student_0.1.0.1_20261107_arm64.dmg) |
| **Mac mit Intel** | [Next-Class-Teacher (x64.dmg)](https://github.com/Andreas-Auer/next-class/releases/download/v0.1.0/Next-Class-Teacher_0.1.0.1_20261107_x64.dmg) | [Next-Class-Student (x64.dmg)](https://github.com/Andreas-Auer/next-class/releases/download/v0.1.0/Next-Class-Student_0.1.0.1_20261107_x64.dmg) |
| **Linux** | [Next-Class-Teacher (AppImage)](https://github.com/Andreas-Auer/next-class/releases/download/v0.1.0/Next-Class-Teacher_0.1.0.1_20261107_x86_64.AppImage) | [Next-Class-Student (AppImage)](https://github.com/Andreas-Auer/next-class/releases/download/v0.1.0/Next-Class-Student_0.1.0.1_20261107_x86_64.AppImage) |

Windows: bei der blauen Warnung „Weitere Informationen“ → „Trotzdem ausführen“.
Mac: Systemeinstellungen → Datenschutz & Sicherheit → „Trotzdem öffnen“.

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
