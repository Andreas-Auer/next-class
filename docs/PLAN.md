# Umsetzungsplan

Jeder Schritt bekommt einen eigenen Branch (`step-N-…`) und eine Testanleitung.

| # | Schritt | Status |
|---|---|---|
| 1 | Branding & Trennung von Next-Exam (Name, App-IDs, Ports, Multicast-Adresse, MSI-Upgrade-Codes, Secrets, Fork-Hinweis in README und About-Dialog) | in Arbeit (`step-1-branding`) |
| 2 | Entschlacken: Prüfungsmodi, QEMU, LanguageTool, PDF/Signatur, BiP, Moodle, MSAL, SEB, iOS und Kiosk entfernen; Schüler-App als normales Fenster | offen |
| 3 | Unterrichtseinheit: Start mit Code, automatisches Finden, manuelle IP, Status frei / gesperrt / getrennt | offen |
| 4 | Inaktivitäts-Anzeige: Bildschirm unverändert, Zähler ab 2 min | offen |
| 5 | Programmsperre mit Freigabeliste, Vorlagen, Katalog und Vorwarnung (ohne Admin-Rechte) | offen |
| 6 | Hilfsdienst-Gerüst Windows (Go, Installer, IPC, Aufräumen beim Booten, Lease) | offen |
| 7 | Internetsperre Windows | offen |
| 8 | Watchdog und Ereignismeldungen (Regel entfernt, App beendet, gesperrtes Programm, Verbindung weg) | offen |
| 9 | Automatische Freigabe (Endzeit + 5 min, max. 4 h, Neustart) | offen |
| 10 | macOS (pf), danach Linux (nftables) | offen |
| 11 | Freigabeliste für Domains und IPs (Lizenzserver) | offen |
| 12 | Co-Lehrkräfte: Beitritt mit Lehrer-Code und Bestätigung, Synchronisation | offen |
| 13 | Übergabe und Übernahme bei Host-Ausfall | offen |
| 14 | CI-Builds (unsigniert) und Kurzanleitung auf Deutsch | offen |
