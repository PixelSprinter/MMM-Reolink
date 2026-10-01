# Changelog

## 1.0.0 (2026-10-01)

First public version.

### Added

- Show Reolink cameras from the local network on MagicMirror².
- Turn the RTSP stream into still images with ffmpeg, served only on `127.0.0.1`.
- Use any configured camera as the main camera.
- Switch to the PoE doorbell on an ONVIF `Visitor` event, then return to the main camera after `doorbellTimeout`.
- Optionally switch to the PoE doorbell on `Motion`, `MotionAlarm`, and `PeopleDetect`. A ring that is already showing is not replaced by motion.
- Mark the PoE doorbell with `doorbell: true`. Camera names stay free and only name the location.
- Keep passwords in `credentials.json`, with `credentials.json.sample` in the repository.

### Notes

- A Wi-Fi doorbell does not provide the ONVIF service and is not supported.
- This project is not an official Reolink product.
