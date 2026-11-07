# Next-Class – Kurzanleitung

Next-Class besteht aus zwei Programmen:

- **Next-Class Lehrer** – für die Lehrkraft (startet die Unterrichtseinheit, sieht alle Schülergeräte, sperrt)
- **Next-Class Schüler** – für die Schülerinnen und Schüler

Beide Geräte müssen im **selben Schul-WLAN** sein. Einen Server braucht es nicht.

## 1. Herunterladen und installieren

Die Installationsdateien gibt es unter **Releases** im GitHub-Projekt
(<https://github.com/Andreas-Auer/next-class/releases>), Testversionen unter **Actions → CI → Artifacts**.

| System | Datei | Hinweis |
|---|---|---|
| Windows | `Next-Class-…msi` (Installation) oder `…exe` (ohne Installation) | Die Programme sind nicht signiert: Bei „Der Computer wurde durch Windows geschützt“ auf **Weitere Informationen → Trotzdem ausführen** klicken. |
| macOS (Apple-Chip M1–M4) | `…arm64.dmg` | DMG öffnen, App in „Programme“ ziehen. Beim ersten Start: **Systemeinstellungen → Datenschutz & Sicherheit → „Trotzdem öffnen“**. |
| macOS (Intel) | `…x64.dmg` | wie oben |
| Linux | `…AppImage` | Datei ausführbar machen (`chmod +x`) und starten. |

**macOS, Schüler-App:** Für die Live-Ansicht fragt macOS nach der Berechtigung **„Bildschirmaufnahme“**
(Systemeinstellungen → Datenschutz & Sicherheit → Bildschirmaufnahme → Next-Class Schüler einschalten).
Ohne diese Berechtigung sieht die Lehrkraft „Keine Bildfreigabe“, alles andere funktioniert.

## 2. Für Schülerinnen und Schüler

1. **Next-Class Schüler** starten.
2. **Namen** und die **PIN** eingeben, die die Lehrkraft zeigt, dann **Beitreten**.
3. Fertig – das Fenster darf geschlossen werden, Next-Class läuft im Hintergrund weiter (Symbol in der Taskleiste bzw. Menüleiste).
4. **Einmalig:** Wenn „Internetsperre einrichten“ angezeigt wird, darauf klicken und das
   **Administrator-Passwort** eingeben (Windows: „Ja“ bei der Rückfrage). Das richtet einen kleinen
   Hilfsdienst ein, der die Internetsperre im Unterricht umsetzt. Er ist nur aktiv, wenn die Lehrkraft sperrt.

Findet die Schüler-App die Unterrichtseinheit nicht (manche WLANs blockieren die automatische Suche):
**„Lehrer-IP manuell eingeben“** einschalten und die Lehrer-IP aus dem Dashboard der Lehrkraft eintragen.

## 3. Für Lehrkräfte

1. **Next-Class Lehrer** starten. Beim ersten Start einmalig **deinen Namen** eintragen; der **Abgaben-Ordner**
   ist schon voreingestellt (`Dokumente/Next-Class Abgaben`) und lässt sich jederzeit unter **⚙ Einstellungen** ändern.
   Dann einen Namen für die Einheit eingeben (z. B. `3ahbt-cad`) und **Unterrichtseinheit starten**.
2. PIN an die Tafel schreiben. Die Schüler erscheinen als Kacheln mit Live-Bild.
3. Im Dashboard:
   - **Bildschirme sperren** – alle Bildschirme schwarz („Bitte nach vorne schauen“)
   - **Sperren bis** – Endzeit für die Sperren (in 50 / 100 Minuten oder Uhrzeit, höchstens 4 Stunden)
   - **Internet sperren** – nur noch das Schulnetz ist erreichbar; Ausnahmen (Lizenzserver,
     Netzlaufwerke) unter „Ausnahmen“ eintragen
   - **Programmsperre** – Vorlage wählen (z. B. „CAD-Unterricht“), mit „… Programme erlaubt“
     anpassen, Modus „Nicht erlaubte beenden“ oder „Nur melden“, dann **aktivieren**.
     Die Schüler bekommen 30 Sekunden Vorwarnung zum Speichern.
   - **☰ auf einer Kachel** – laufende Programme dieses Geräts; mit „Erlauben“ in die Freigabeliste übernehmen
   - **Unveränderter Bildschirm** – ab 2 Minuten ohne Änderung wird die Kachel orange mit Zähler
   - **Ereignisse** – wer ist beigetreten, getrennt, hat die App beendet, ein gesperrtes Programm gestartet …
4. **Unterrichtseinheit beenden** gibt alle Geräte frei.

### Kurse (wiederkehrender Unterricht)

- **Meine Kurse → + Neuer Kurs**: Kursname (z. B. `BP-KU`), Unterrichtszeit (Uhrzeit wie 08:00–09:40 oder Dauer),
  Programm-Vorlage, Internet-Ausnahmen und auf Wunsch ein eigener Abgabe-Ordner.
- Jeder Kurs hat eine **feste 6-stellige PIN** (unter ⚙ sichtbar, bei Bedarf neu erzeugen).
- **Unterricht starten** auf der Kurs-Kachel: Vorlage, Ausnahmen und Ende der Stunde („Sperren bis“) sind schon eingestellt.
- **Teamteaching im Kurs:** Tritt eine Lehrkraft einmal einer Stunde des Kurses bei (Lehrer-Code + Zulassen), gehört
  sie danach zum Kurs. Startet sie später denselben Kurs, während er schon läuft, ist sie ohne Code direkt dabei.
  Die Kurseinstellungen werden dabei abgeglichen; der Abgabe-Ordner bleibt pro Lehrkraft.
- Für einmalige Stunden gibt es die **Einzelstunde** (eigene PIN nur für diese Stunde).

**Empfohlener Ablauf mit Fachsoftware:** Schüler starten zuerst Archicad, Rhino usw. (die Lizenz wird
online geprüft), danach Internet- und Programmsperre aktivieren.

### Teamteaching (mehrere Lehrkräfte)

- Die erste Lehrkraft startet die Einheit. Im Dashboard steht der **Lehrer-Code**.
- Die zweite Lehrkraft öffnet ihre Lehrer-App → **Als Lehrkraft beitreten** (oder Lehrer-IP eingeben)
  und gibt den Lehrer-Code ein.
- Die erste Lehrkraft bestätigt mit **Zulassen**. Danach betreuen beide die Einheit gleichwertig; im Dashboard
  stehen alle Lehrkräfte mit Namen.
- Fällt eine Lehrer-App aus (Akku leer, Laptop zugeklappt), führt nach etwa 20 Sekunden automatisch eine andere
  Lehrer-App die Einheit weiter. Die Schülergeräte verbinden sich von selbst neu, Sperren bleiben bestehen.
- Kommt die Lehrkraft zurück, tritt sie einfach wieder bei.

## 4. Wann ist ein Schülergerät wieder frei?

- wenn die Lehrkraft die Sperre aufhebt oder die Unterrichtseinheit beendet,
- spätestens zur eingestellten Endzeit (ohne Verbindung zur Lehrkraft: Endzeit + 5 Minuten),
- nach einem **Neustart** des Geräts.

Notfall (Gerät bleibt gesperrt): Gerät neu starten. Den Hilfsdienst ganz entfernen
(als Administrator): Windows `"C:\Program Files\NextClass Helper\nextclass-helper.exe" uninstall`,
macOS `sudo /Library/PrivilegedHelperTools/at.nextclass.helper uninstall`.

## 5. Datenschutz

- Live-Bilder werden nur im Arbeitsspeicher der Lehrer-App gehalten und **nie gespeichert**.
- Das Ereignisprotokoll gilt nur für die laufende Unterrichtseinheit und wird nicht gespeichert.
- Gespeichert werden nur die Vorlagen und Ausnahmen der Lehrkraft (auf ihrem eigenen Gerät).

## Grenzen

Schülerinnen und Schüler haben auf ihren eigenen Geräten Administratorrechte. Next-Class kann eine
Umgehung daher nicht verhindern, aber erkennen, oft automatisch rückgängig machen und melden
(z. B. „Firewall-Regel entfernt – wiederhergestellt“, „App beendet“). Weitere technische Hinweise:
[TESTEN.md](TESTEN.md), [../helper/README.md](../helper/README.md).
