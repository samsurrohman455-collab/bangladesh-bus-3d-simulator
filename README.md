# BANGLADESH BUS 3D SIMULATOR – ULTIMATE EDITION

Playable 3D Bangladeshi intercity bus simulator built with **Three.js**, **WebGL**, **HTML5/CSS3**, **JavaScript**, and hosted in a hardware-accelerated landscape **Android WebView / Capacitor-compatible** project.

## Playable Web Build
The complete self-contained web build lives in `app/src/main/assets/www/` (including a locally bundled `vendor/three.min.js` with zero external CDN dependencies):
1. Serve `app/src/main/assets/www/` with any static HTTP server (or run `npm run web:serve`).
2. Open `http://localhost:8080` in Chrome/Edge/Safari (landscape aspect ratio recommended).

## Android APK Packaging Workflow
- **Direct Gradle APK Build:**
  - Debug APK: `gradle :app:assembleDebug` (output in `app/build/outputs/apk/debug/`)
  - Release APK: `gradle :app:assembleRelease` (output in `app/build/outputs/apk/release/`)
- **Capacitor Workflow:**
  - `capacitor.config.json` points `webDir` directly to `app/src/main/assets/www`.
  - Run `npx cap sync android` after editing web assets when using Capacitor CLI.

## Controls
- **Touch (Landscape Mobile):** Left/Right Steering, GAS, BRAKE/REV, Handbrake (`P`), Gear `+`/`-`, `AUTO/MANUAL`, Horn, Headlights, Left/Right Indicators, Camera (`CHASE`, `COCKPIT`, `FOLLOW`), Pause.
- **Keyboard:** `WASD` / `Arrow Keys` Drive, `Space` Handbrake, `H` Horn, `L` Headlights, `Q` / `E` Indicators, `C` Switch Camera, `Shift` / `Ctrl` Gear Up/Down, `Esc` Pause.
