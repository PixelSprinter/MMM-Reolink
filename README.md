# MMM-Reolink

Zeigt Reolink-PoE-Kameras aus dem lokalen Netz auf dem MagicMirror. Der RTSP-Stream wird mit ffmpeg in Einzelbilder gewandelt und nur auf `127.0.0.1` ausgeliefert. Passwörter stehen nicht in der Mirror-Konfiguration.

Es gehen nur PoE-Kameras. Die Klingel ist eine PoE-Klingel. WLAN-Doorbells liefern keinen dauerhaften RTSP-Stream und keine ONVIF-Events und werden nicht unterstützt.

## Funktionen

- **Kameras mit freiem Namen:** Jede PoE-Kamera bekommt einen eigenen Namen, zum Beispiel `garden` oder `einfahrt`. Weitere Kameras kommen als zusätzliche Einträge dazu. Die Hauptkamera läuft, solange sie aktiviert ist.
- **PoE-Klingel:** Der Eintrag mit `onvifPort` ist die PoE-Klingel. Ein ONVIF-Event `Visitor` schaltet das Bild auf diese Kamera. Nach `doorbellTimeout` (Standard 30 Sekunden) geht die Ansicht zurück zur Hauptkamera.
- **Bewegung:** Optional. Bei `motion.enabled` und `motion.switchCamera` schalten `Motion`, `MotionAlarm` und `PeopleDetect` an der PoE-Klingel für `motion.timeout` (Standard 10 Sekunden) auf diese Kamera. Eine laufende Klingelansicht wird davon nicht unterbrochen.
- **Leerlauf:** Ist die Hauptkamera aus, zeigt das Modul `infoText`. Mit `showPlaceholder: false` bleibt die Fläche unsichtbar.
- **Lokal begrenzt:** Der Bildserver hört nur auf `127.0.0.1`. Kamera-Adressen müssen private LAN-IPs sein. Zugangsdaten liegen in `credentials.json` und werden nicht versioniert.

## Voraussetzung

- MagicMirror²
- `ffmpeg` im `PATH`
- Reolink-PoE-Kameras im LAN, die Klingel als PoE-Klingel mit ONVIF-Events

## Installation

```bash
cd ~/MagicMirror/modules
git clone git@github.com:PixelSprinter/MMM-Reolink.git
cd MMM-Reolink
cp credentials.json.sample credentials.json
```

In `credentials.json` Benutzername und Passwort eintragen. Die Schlüssel sind frei wählbar und müssen zum Kameranamen oder zum Feld `credential` passen.

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

    haustuer: {
      enabled: true,
      credential: "haustuer",
      ip: "192.168.1.92",
      rtspPort: 554,
      stream: "Preview_01_sub",
      onvifPort: 8000
    }
  }
}
```

`garden` und `haustuer` sind Beispiele. Weitere PoE-Kameras werden genauso ergänzt. `onvifPort` markiert die PoE-Klingel. Ein Eintrag namens `doorbell` gilt auch ohne gesetztes `onvifPort` als PoE-Klingel.

| Option | Bedeutung |
| --- | --- |
| `enabled` | Modul ein- oder ausschalten |
| `videoPort` | Lokaler Port für die Bilder, Standard `8090` |
| `settings.mainCamera` | Name der Hauptkamera, frei wählbar |
| `settings.doorbellTimeout` | Anzeigedauer nach dem Klingeln, in Millisekunden |
| `settings.border` | Rahmenstärke des Bildes |
| `settings.showPlaceholder` | Hinweis anzeigen, wenn kein Bild läuft |
| `settings.infoText` | Text dieses Hinweises |
| `settings.motion.enabled` | Bewegungs-Events der PoE-Klingel auswerten |
| `settings.motion.switchCamera` | Bei Bewegung auf die PoE-Klingel schalten |
| `settings.motion.timeout` | Anzeigedauer nach Bewegung, in Millisekunden |
| Kameraname | Frei wählbar. Kamera an, Zugangsdaten-Schlüssel, IP, RTSP-Port, Stream-Pfad |
| `onvifPort` | ONVIF-Port der PoE-Klingel, Standard `8000` |

`stream` ist der RTSP-Pfad der Kamera, zum Beispiel `Preview_01_sub` für den Substream.
