# MMM-Reolink

> **Disclaimer:**
>
> This project is **not** an official Reolink product and is not affiliated with, endorsed by, or supported by Reolink Innovation Limited or any of its subsidiaries. Reolink is a trademark of its respective owner. The software is provided without warranty, including accuracy, completeness, or error-free operation of the camera picture and events. Use is at your own risk.

Shows Reolink cameras from the local network on MagicMirror². ffmpeg turns the RTSP stream into still images, served only on `127.0.0.1`. Passwords are not stored in the MagicMirror configuration.

Reolink offers many cameras. Each one gets a name you choose, used only as a location, for example `garden`, `garage`, or `livingroom`. The fixed value is the camera IP in the configuration.

Only the PoE doorbell needs the indicator `doorbell: true`. That is what attaches the ONVIF service for rings and motion. A Wi-Fi doorbell does not provide that service, so it does not work.

## Features

- **Many cameras:** Names are free, each with its own IP.
- **PoE doorbell:** The entry with `doorbell: true` receives ring and motion events.
- **Motion:** Optional. With `motion.enabled` and `motion.switchCamera`, `Motion`, `MotionAlarm`, and `PeopleDetect` on the PoE doorbell switch to that camera for `motion.timeout` (10 seconds by default).

## Main camera and doorbell switch

One picture is on screen at a time. `settings.mainCamera` is the camera that runs in normal use, for example `garden`. Other cameras such as `garage` stay configured and do not appear until you set `mainCamera` to that name.

A ring on the PoE doorbell sends an ONVIF `Visitor` event. The module switches the stream to the camera marked with `doorbell: true` and keeps it there for `doorbellTimeout` (30 seconds by default). Then it switches back to `mainCamera`.

If the main camera is turned off, the stream stops after that timeout and the module shows `infoText`, or stays hidden when `showPlaceholder` is `false`.

Motion can switch to the same doorbell camera for the shorter `motion.timeout`. A ring that is already on screen is not replaced by motion. Another ring restarts the doorbell timeout.
- **Idle:** If the main camera is off, the module shows `infoText`. With `showPlaceholder: false` the area stays hidden.
- **Local only:** The picture server listens on `127.0.0.1`. Camera addresses must be private LAN IPs. Credentials live in `credentials.json` and are not committed.

## Requirements

- MagicMirror²
- `ffmpeg` on `PATH`
- Reolink cameras on the LAN, with names you choose
- A PoE doorbell marked with `doorbell: true`. A Wi-Fi doorbell does not provide the ONVIF service

## Installation

```bash
cd ~/MagicMirror/modules
git clone https://github.com/PixelSprinter/MMM-Reolink.git
cd MMM-Reolink
cp credentials.json.sample credentials.json
```

Put the username and password in `credentials.json`. Each key matches the camera name you chose.

## Configuration

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
      ip: "192.168.1.10",
      rtspPort: 554,
      stream: "Preview_01_sub"
    },

    garage: {
      enabled: true,
      credential: "garage",
      ip: "192.168.1.12",
      rtspPort: 554,
      stream: "Preview_01_sub"
    },

    doorbell: {
      enabled: true,
      credential: "doorbell",
      ip: "192.168.1.11",
      rtspPort: 554,
      stream: "Preview_01_sub",
      onvifPort: 8000,
      doorbell: true
    }
  }
}
```

`garden` and `garage` are only locations. Add more cameras the same way. `doorbell: true` marks the PoE doorbell. The name next to it is free. An entry that is already named `doorbell` still counts as the PoE doorbell without that field.

| Option | Meaning |
| --- | --- |
| `enabled` | Turn the module on or off |
| `videoPort` | Local port for the pictures, default `8090` |
| `settings.mainCamera` | Name of the main camera, free to choose |
| `settings.doorbellTimeout` | How long the doorbell stays on screen, in milliseconds |
| `settings.border` | Picture border width |
| `settings.showPlaceholder` | Show a notice when no picture is running |
| `settings.infoText` | Text of that notice |
| `settings.motion.enabled` | Handle motion events from the PoE doorbell |
| `settings.motion.switchCamera` | Switch to the PoE doorbell on motion |
| `settings.motion.timeout` | How long motion stays on screen, in milliseconds |
| Camera name | Free, location only. The IP is the fixed value |
| `doorbell` | `true` marks the PoE doorbell. A Wi-Fi doorbell does not provide the service |
| `onvifPort` | ONVIF port of the PoE doorbell, default `8000` |

`stream` is the camera RTSP path, for example `Preview_01_sub` for the sub stream.
