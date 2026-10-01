# MMM-Reolink

Zeigt Reolink-Kameras aus dem lokalen Netz auf dem MagicMirror. Der RTSP-Stream wird mit ffmpeg in Einzelbilder gewandelt und nur auf `127.0.0.1` ausgeliefert. Passwörter stehen nicht in der Mirror-Konfiguration.

## Funktionen

- **Zwei Kameras:** Garten als Hauptbild und die Türklingel. Die Hauptkamera läuft, solange sie aktiviert ist.
- **Klingeln:** Ein ONVIF-Event `Visitor` an der Türklingel schaltet das Bild auf die Klingel. Nach `doorbellTimeout` (Standard 30 Sekunden) geht die Ansicht zurück zur Hauptkamera.
- **Bewegung:** Optional. Bei `motion.enabled` und `motion.switchCamera` schalten `Motion`, `MotionAlarm` und `PeopleDetect` an der Klingel für `motion.timeout` (Standard 10 Sekunden) auf die Türkamera. Eine laufende Klingelansicht wird davon nicht unterbrochen.
- **Leerlauf:** Ist die Hauptkamera aus, zeigt das Modul `infoText`. Mit `showPlaceholder: false` bleibt die Fläche unsichtbar.
- **Lokal begrenzt:** Der Bildserver hört nur auf `127.0.0.1`. Kamera-Adressen müssen private LAN-IPs sein. Zugangsdaten liegen in `credentials.json` und werden nicht versioniert.

## Voraussetzung

- MagicMirror²
- `ffmpeg` im `PATH`
- Reolink-Kameras im LAN; die Türklingel muss ONVIF-Events liefern

## Installation

```bash
cd ~/MagicMirror/modules
git clone git@github.com:PixelSprinter/MMM-Reolink.git
cd MMM-Reolink
cp credentials.json.sample credentials.json
```

In `credentials.json` Benutzername und Passwort eintragen. Die Schlüssel müssen zum Wert von `credential` in der Modul-Konfiguration passen.

## Konfiguration

```js
{
  module: "MMM-Reolink",
  position: "top_right",
  config: {
    enabled: true,
    videoPort: 8090,

    settings: {
      mainCamera: "garden",
      doorbellTimeout: 30000,
      border: "1px",
      showPlaceholder: true,
      infoText: "Main camera deactivated",
      motion: {
        enabled: false,
        switchCamera: false,
        timeout: 10000
      }
    },

    garden: {
      enabled: true,
      credential: "garden",
      ip: "192.168.1.91",
      rtspPort: 554,
      stream: "Preview_01_sub"
    },

    doorbell: {
      enabled: true,
      credential: "doorbell",
      ip: "192.168.1.92",
      rtspPort: 554,
      stream: "Preview_01_sub",
      onvifPort: 8000
    }
  }
}
```

| Option | Bedeutung |
| --- | --- |
| `enabled` | Modul ein- oder ausschalten |
| `videoPort` | Lokaler Port für die Bilder, Standard `8090` |
| `settings.mainCamera` | `garden` oder `doorbell` |
| `settings.doorbellTimeout` | Anzeigedauer nach dem Klingeln, in Millisekunden |
| `settings.border` | Rahmenstärke des Bildes |
| `settings.showPlaceholder` | Hinweis anzeigen, wenn kein Bild läuft |
| `settings.infoText` | Text dieses Hinweises |
| `settings.motion.enabled` | Bewegungs-Events der Klingel auswerten |
| `settings.motion.switchCamera` | Bei Bewegung auf die Türkamera schalten |
| `settings.motion.timeout` | Anzeigedauer nach Bewegung, in Millisekunden |
| `garden` / `doorbell` | Kamera an, Zugangsdaten-Schlüssel, IP, RTSP-Port, Stream-Pfad |
| `doorbell.onvifPort` | ONVIF-Port der Klingel, Standard `8000` |

`stream` ist der RTSP-Pfad der Kamera, zum Beispiel `Preview_01_sub` für den Substream.
