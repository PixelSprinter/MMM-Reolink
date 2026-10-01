# MMM-Reolink

Zeigt Reolink-Kameras aus dem lokalen Netz auf dem MagicMirror. Der RTSP-Stream wird mit ffmpeg in Einzelbilder gewandelt und nur auf `127.0.0.1` ausgeliefert. Passwörter stehen nicht in der Mirror-Konfiguration.

Die Kameras am Standort sind WLAN, zum Beispiel `garden`. Der Name ist nur der Ort: `garden`, `garage`, `wohnzimmer` oder ein anderer Begriff. Weitere WLAN-Kameras kommen als eigene Einträge dazu.

`doorbell` ist die PoE-Klingel. Die unterscheidet sich von den WLAN-Kameras durch das PoE-Format und liefert die ONVIF-Events. Eine WLAN-Doorbell ist das nicht.

## Funktionen

- **WLAN-Kameras:** Standortnamen wie `garden`, `garage` oder `wohnzimmer`. Die Hauptkamera läuft, solange sie aktiviert ist.
- **PoE-Klingel:** Der Eintrag `doorbell`. Ein ONVIF-Event `Visitor` schaltet das Bild auf die Klingel. Nach `doorbellTimeout` (Standard 30 Sekunden) geht die Ansicht zurück zur Hauptkamera.
- **Bewegung:** Optional. Bei `motion.enabled` und `motion.switchCamera` schalten `Motion`, `MotionAlarm` und `PeopleDetect` an der PoE-Klingel für `motion.timeout` (Standard 10 Sekunden) auf `doorbell`. Eine laufende Klingelansicht wird davon nicht unterbrochen.
- **Leerlauf:** Ist die Hauptkamera aus, zeigt das Modul `infoText`. Mit `showPlaceholder: false` bleibt die Fläche unsichtbar.
- **Lokal begrenzt:** Der Bildserver hört nur auf `127.0.0.1`. Kamera-Adressen müssen private LAN-IPs sein. Zugangsdaten liegen in `credentials.json` und werden nicht versioniert.

## Voraussetzung

- MagicMirror²
- `ffmpeg` im `PATH`
- Reolink-WLAN-Kameras im LAN
- PoE-Klingel unter dem Namen `doorbell`, mit ONVIF-Events

## Installation

```bash
cd ~/MagicMirror/modules
git clone git@github.com:PixelSprinter/MMM-Reolink.git
cd MMM-Reolink
cp credentials.json.sample credentials.json
```

In `credentials.json` Benutzername und Passwort eintragen. Der Schlüssel entspricht dem Kameranamen, bei der Klingel also `doorbell`.

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

`garden` ist die WLAN-Kamera und nur ein Standortname. Dieselbe Form gilt für `garage`, `wohnzimmer` und weitere Orte. `doorbell` bleibt der Name der PoE-Klingel.

| Option | Bedeutung |
| --- | --- |
| `enabled` | Modul ein- oder ausschalten |
| `videoPort` | Lokaler Port für die Bilder, Standard `8090` |
| `settings.mainCamera` | Standortname der WLAN-Kamera, zum Beispiel `garden` |
| `settings.doorbellTimeout` | Anzeigedauer nach dem Klingeln, in Millisekunden |
| `settings.border` | Rahmenstärke des Bildes |
| `settings.showPlaceholder` | Hinweis anzeigen, wenn kein Bild läuft |
| `settings.infoText` | Text dieses Hinweises |
| `settings.motion.enabled` | Bewegungs-Events der PoE-Klingel auswerten |
| `settings.motion.switchCamera` | Bei Bewegung auf `doorbell` schalten |
| `settings.motion.timeout` | Anzeigedauer nach Bewegung, in Millisekunden |
| Standortname | WLAN-Kamera. Name nur als Ort, zum Beispiel `garden` oder `wohnzimmer` |
| `doorbell` | PoE-Klingel, fest dieser Name |
| `doorbell.onvifPort` | ONVIF-Port der PoE-Klingel, Standard `8000` |

`stream` ist der RTSP-Pfad der Kamera, zum Beispiel `Preview_01_sub` für den Substream.
