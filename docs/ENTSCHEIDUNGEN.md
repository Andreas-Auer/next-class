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
| Modell | Alle Lehrkräfte sind **gleichwertig** und heißen in der Oberfläche einfach „Lehrkraft“. Technisch führt ein Gerät die Einheit, die anderen halten eine Kopie; fällt es aus, übernimmt automatisch die nächste Lehrkraft (Schritt 13). |
| Beitritt (Einzelstunde) | Eigener **Lehrer-Code** (anders als der Schüler-Code) **und** Bestätigung durch eine bereits verbundene Lehrkraft. |
| Beitritt (Kurs) | Lehrkräfte, die zum Kurs gehören, sind beim Start desselben Kurses automatisch dabei (Teamteaching). |
| Name der Lehrkraft | Wird **einmal** eingegeben (beim ersten Start, zusammen mit dem Abgabe-Ordner). |

## Kurse (Stand 2026-11-07)

| Thema | Entscheidung |
|---|---|
| Kurs | Wiederkehrender Unterricht mit Name (z. B. `BP-KU`), fester 6-stelliger PIN, Programm-Vorlage, Internet-Ausnahmen, Sitzplan und Zeit pro Kurs (Uhrzeit wie 08:00–09:40, alternativ Stunden und Minuten). |
| Einzelstunde | Einmalige Einheit ohne Kurs, eigener, klar unterscheidbarer Button. |
| Synchronisation | Kurseinstellungen werden zwischen den Lehrkräften des Kurses synchronisiert. **Ausnahmen:** Ansicht von vorne/hinten und Abgabe-Ordner gelten pro Lehrkraft. |
| Kurs-Kacheln | Kursname groß und fett, darunter klein die Namen der Lehrkräfte. |
| Kurs entfernen | Schüler können einen Kurs nicht selbst entfernen. Er verschwindet, wenn die Lehrkraft den Schüler entfernt oder den Kurs löscht. |
| PIN-Schutz | Zu viele falsche PINs sperren das Durchprobieren vorübergehend. |

## Schüler und Ablauf (Stand 2026-11-07)

| Thema | Entscheidung |
|---|---|
| Anmeldung | Dialog mit **Vorname, Nachname, Klasse**, Beispiel immer „Maria“, „Musterschülerin“, „3aHBT“. Danach kann nur die Lehrkraft den Namen ändern. |
| Geräte-Wiedererkennung | Zufälliger Geräteschlüssel, keine MAC-Adressen. |
| Einschreiben | In der **ersten Stunde** eines Kurses wird jeder mit PIN automatisch eingeschrieben (markiert „neu“). Ab der zweiten Stunde klopfen neue Geräte an. Kein „Einschreibung öffnen“. |
| Automatischer Beitritt | Ist ein eigener Kurs live, sieht der Schüler das sofort. Läuft gleichzeitig ein anderer Kurs, bleibt er im ersten. |
| Teilnehmen | Schüler sehen die Einheit live und treten mit **„Am Unterricht teilnehmen“** bei. |
| Sperren | **„Unterricht starten – Computer sperren“** mit 10 s Vorwarnung; nicht erlaubte Programme werden nach weiteren 10 s hart beendet. |
| Freigabe | Vorübergehend oder dauerhaft, für alle oder einzelne. Rückkehr ohne Anklopfen, solange die App lief. Kein Freigabe-Button für Schüler. |
| App beendet | Sofortiger optischer und akustischer Alarm bei der Lehrkraft (App beendet, nur Firewall, Verbindung ca. 10 s weg). Nach Neustart der App muss angeklopft werden; die Lehrkraft lässt wieder zu. |
| Farben | Grün = live/teilnehmend, Grau = offline/nicht verfügbar, Rot = gesperrt, Orange = Achtung. |
| Status im Sitzplan | teilnehmend, „online – dem Unterricht nicht beigetreten“, „offline“. |
| Sitzplan | Raster mit Reihen und Spalten (z. B. 7 × 6) und Gang-Spalten, Plätze rasten ein und lassen sich tauschen, Bereich „Nicht zugeordnet“. Button „Ansicht von vorne/hinten“ direkt über dem Sitzplan. |

## Aufgaben, Abgaben und Material (Stand 2026-11-07)

| Thema | Entscheidung |
|---|---|
| Aufgabe | Die Lehrkraft erstellt eine Aufgabe (Titel, Text, optional Abgabezeit, optional Dateien als Material). Alle Schüler sehen sie sofort. |
| Abgabe | Schüler geben Dateien in Next-Class ab und sehen eine Bestätigung. Funktioniert im Schulnetz, also auch bei Internetsperre. |
| Ablage | `<Abgabe-Ordner>/YYYYMMDD_Kurs_ErstesWortDerAufgabe/Nachname Vorname/<Dateien>`, z. B. `20261123_BP-KU_Grundriss/Musterschülerin Maria/`. Unerlaubte Zeichen werden entfernt; gleiches Wort am selben Tag → `_Grundriss-2`; gleicher Schülername → `(3aHBT)` als Zusatz. |
| Erneut abgeben | Erlaubt bis zur Abgabezeit, nichts wird überschrieben (`Grundriss (2).pln`). Zu spät = orange. |
| Größe | Limit pro Abgabe, einstellbar pro Aufgabe, Standard **1 GB**. |
| Teamteaching | Jede Lehrkraft erhält die Dateien in ihren eigenen Ordner. Der Schüler lädt einmal hoch, die Lehrer-Apps verteilen untereinander und liefern Fehlendes nach. |
| Abgabe-Ordner | Standard `Dokumente/Next-Class Abgaben` (Windows, macOS, Linux; wird automatisch angelegt). Sichtbar ganz oben in den Einstellungen mit Hinweis, dass jeder Kurs einen eigenen Ordner haben kann; pro Kurs in den Kurseinstellungen änderbar; im Aufgaben-Dialog angezeigt. Fehlt der Ordner, fragt Next-Class vor dem Start der Aufgabe nach. |
| Material | Dateien der Lehrkraft landen beim Schüler unter `Downloads/Next-Class/<Ordner der Aufgabe>/`. |
| Oberfläche | So einfach und direkt wie möglich, keine Fachbegriffe wie „Nur auf diesem Gerät“. |

## Noch offen

- Angaben der Schul-IT (erst ab der Internetsperre nötig): Subnetze von WLAN und Netzlaufwerken, Proxy im LAN, interne DNS-Server, Multicast bzw. Client-Isolation im WLAN.
- Datenschutz: Live-Ansicht auf privaten Geräten mit Direktion abstimmen, Schüler und Eltern informieren.
