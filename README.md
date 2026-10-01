# MMM-Reolink

Lokale Reolink-Integration für MagicMirror.

## Zugangsdaten

`credentials.json` enthält die Kamera-Passwörter und wird nicht versioniert. Die Beispiel-Datei liegt als `credentials.json.sample` im Repository.

```bash
cp credentials.json.sample credentials.json
```

Danach Benutzername und Passwort eintragen. Die Schlüssel (`garden`, `doorbell`) müssen zum Wert von `credential` in der Modul-Konfiguration passen.
