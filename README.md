# MMM-Reolink

Zeigt Reolink-Kameras aus dem lokalen Netz auf dem MagicMirror. Der RTSP-Stream wird mit ffmpeg in Einzelbilder gewandelt und nur auf `127.0.0.1` ausgeliefert. Passwörter stehen nicht in der Mirror-Konfiguration.

Reolink hat viele Kameras. Jede bekommt einen freien Namen, nur als Standort, zum Beispiel `garden`, `garage` oder `wohnzimmer`. Fest ist die IP in der Konfiguration.

Nur die PoE-Klingel braucht den Indikator `poe: true`. Daran hängt der ONVIF-Dienst für Klingeln und Bewegung. Eine WLAN-Doorbell überträgt diesen Dienst nicht und geht deshalb nicht.

## Funktionen

- **Viele Kameras:** Namen frei wählbar, jede mit eigener IP. Die Hauptkamera läuft, solange sie aktiviert ist.
- **PoE-Klingel:** Der Eintrag mit `poe: true`. Ein ONVIF-Event `Visitor` schaltet das Bild auf diese Kamera. Nach `doorbellTimeout` (Standard 30 Sekunden) geht die Ansicht zurück zur Hauptkamera.
- **Bewegung:** Optional. Bei `motion.enabled` und `motion.switchCamera` schalten `Motion`, `MotionAlarm` und `PeopleDetect` an der PoE-Klingel für `motion.timeout` (Standard 10 Sekunden) auf diese Kamera. Eine laufende Klingelansicht wird davon nicht unterbrochen.
- **Leerlauf:** Ist die Hauptkamera aus, zeigt das Modul `infoText`. Mit `showPlaceholder: false` bleibt die Fläche unsichtbar.
- **Lokal begrenzt:** Der Bildserver hört nur auf `127.0.0.1`. Kamera-Adressen müssen private LAN-IPs sein. Zugangsdaten liegen in `credentials.json` und werden nicht versioniert.

## Voraussetzung

- MagicMirror²
- `ffmpeg` im `PATH`
- Reolink-Kameras im LAN, Namen frei
- PoE-Klingel mit `poe: true`. Eine WLAN-Doorbell überträgt den ONVIF-Dienst nicht

## Installation

```bash
cd ~/MagicMirror/modules
git clone git@github.com:PixelSprinter/MMM-Reolink.git
cd MMM-Reolink
cp credentials.json.sample credentials.json
```

In `credentials.json` Benutzername und Passwort eintragen. Der Schlüssel entspricht dem frei gewählten Kameranamen.

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

    garage: {
      enabled: true,
      credential: "garage",
      ip: "192.168.1.93",
      rtspPort: 554,
      stream: "Preview_01_sub"
    },

    doorbell: {
      enabled: true,
      credential: "doorbell",
      ip: "192.168.1.92",
      rtspPort: 554,
      stream: "Preview_01_sub",
      onvifPort: 8000,
      poe: true
    }
  }
}
```

`garden` und `garage` sind nur Standorte. Weitere Kameras kommen genauso dazu. `poe: true` ist der Indikator der PoE-Klingel, der Name daneben ist frei. Ein Eintrag, der schon `doorbell` heißt, gilt auch ohne `poe: true` als PoE-Klingel.

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
| Kameraname | Frei wählbar, nur der Standort. Fest ist die IP |
| `poe` | Indikator der PoE-Klingel. WLAN-Doorbells übertragen den Dienst nicht |
| `onvifPort` | ONVIF-Port der PoE-Klingel, Standard `8000` |

`stream` ist der RTSP-Pfad der Kamera, zum Beispiel `Preview_01_sub` für den Substream.
