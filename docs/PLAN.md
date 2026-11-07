# Umsetzungsplan

Jeder Schritt bekommt einen eigenen Branch (`step-N-…`) und eine Testanleitung.

| # | Schritt | Status |
|---|---|---|
| 1 | Branding & Trennung von Next-Exam (Name, App-IDs, Ports, Multicast-Adresse, MSI-Upgrade-Codes, Secrets, Fork-Hinweis in README und About-Dialog) | erledigt (`step-1-branding`) |
| 2 | Entschlacken: Prüfungsmodi, QEMU, LanguageTool, PDF/Signatur, BiP, Moodle, MSAL, SEB, iOS und Kiosk entfernen; Schüler-App als normales Fenster | erledigt (`step-2-slim`) |
| 3 | Unterrichtseinheit: Beitritt nur mit Name + PIN, automatisches Finden, manuelle IP, automatisches Wiederverbinden, Status verbunden / getrennt seit | erledigt (`step-3-join`) |
| 4 | Inaktivitäts-Anzeige: Bildschirm unverändert, Zähler ab 2 min | erledigt (`step-4-idle`) |
| 5 | Programmsperre mit Freigabeliste, Vorlagen, Katalog und Vorwarnung (ohne Admin-Rechte) | erledigt (`step-5-applock`); Windows/Linux noch nicht auf echten Geräten getestet |
| 6 | Hilfsdienst (Go, Einrichtung per Admin-Abfrage aus der Schüler-App, lokale API, Aufräumen beim Start, Endzeit) | erledigt (`step-6-netlock`), Probemodus getestet |
| 7 | Internetsperre: Windows-Firewall, dazu bereits macOS pf und Linux nftables | erledigt (`step-6-netlock`); **noch nicht auf echten Geräten getestet** |
| 8 | Ereignisprotokoll (beigetreten, getrennt, App beendet, Programmsperre, Firewall verändert) | erledigt (`step-8-events`) |
| 9 | Endzeit für beide Sperren (ohne Kontakt + 5 min, max. 4 h, Neustart = frei), nur die sperrende Einheit hebt vorzeitig auf | erledigt (`step-8-events`) |
| 10 | macOS (pf), danach Linux (nftables) | offen |
| 11 | Ausnahmen für die Internetsperre (Lizenzserver, Netzlaufwerke: Name, IP oder Netz) | erledigt (`step-11-exceptions`) |
| 12 | Co-Lehrkräfte: Beitritt mit Lehrer-Code + Bestätigung, gleichberechtigte Steuerung über den Host, Zustand synchron | erledigt (`step-12-coteachers`) |
| 13 | Übernahme bei Host-Ausfall: erste Co-Lehrkraft übernimmt nach 20 s, Schüler verbinden sich automatisch neu, Sperren bleiben, alter Host gibt ab | erledigt (`step-13-failover`) |
| 14 | CI (Tests + unsignierte Installer für Windows, macOS, Linux; Release bei Versions-Tag) und Kurzanleitung | erledigt (`step-14-ci`) |
| 15 | Gleichwertige Lehrkräfte („Lehrkraft“ statt Host/Co), Name und Abgabe-Ordner einmalig beim ersten Start, Einstellungen mit Abgabe-Ordner | erledigt (`step-15-teachers`) |
| 16 | Kurse: feste PIN, Vorlage, Ausnahmen, Zeit, Einzelstunde, Kurs-Kacheln, Synchronisation zwischen Lehrkräften, PIN-Schutz | offen |
| 17 | Schüler-Anmeldung: Vorname/Nachname/Klasse, Geräteschlüssel, automatisches Einschreiben in Stunde 1, danach Anklopfen, Live-Anzeige und Farben | offen |
| 18 | Unterrichtsablauf: „Am Unterricht teilnehmen“, „Unterricht starten – Computer sperren“ (10 s), Freigaben, Alarm mit Ton, Anklopfen nach Neustart | offen |
| 19 | Sitzplan: Raster, Gang, Einrasten/Tauschen, „Nicht zugeordnet“, Ansicht vorne/hinten, Status pro Platz | offen |
| 20 | Aufgaben und Abgaben: Ablage pro Datum/Kurs/Aufgabe/Schüler, erneute Abgabe, 1 GB, Verteilung an alle Lehrkräfte | offen |
| 21 | Material austeilen (Downloads/Next-Class/…) | offen |
