# Cairn

A fully offline topo, satellite, and trail map for Android, built for the moment you lose signal and still need to know where you are.

Cairn works entirely offline once you've downloaded a region: satellite imagery, topo contours, trails, public land ownership, borders, and street labels are all cached on-device, not fetched on demand. Weather radar is the one exception, since that's inherently live data and requires a connection to be meaningful.

No account. No analytics. Your flags, routes, and tracks never leave your phone unless you explicitly export a backup.

## What's new in 1.1.0

### New

- **Compass ribbon (beta)** — a sliding heading strip below the search bar, driven by Android's fused rotation-vector sensor (accelerometer + gyroscope + magnetometer) rather than the magnetometer alone, so it doesn't drift the way a raw compass reading does. True north is corrected locally from the World Magnetic Model — no network needed. Off by default; enable it in Settings. Tap the ribbon for manual north calibration if you know which way north actually is.
- **Metric / imperial toggle** — every distance in the app (routes, tracks, segments, live recording) switches between mi/ft and km/m from Settings. Short distances now read as feet or metres instead of a tiny decimal fraction of a mile.
- **Scale bar** — miles and kilometres share one overlaid bar, ticks mirrored above and below a common centre line. On by default, hideable in Settings; legends drop into its place when hidden.
- **Storage folder browser** — pick any folder on the device for backups, not just Documents or Downloads. Requires Android's "All files access" permission, granted once from the system settings screen the app sends you to.
- **GPS status indicator** — spinning arrows while searching, then a green or amber dot for fix quality; red now means an actual failure rather than just a loose fix. The accuracy circle on the map appears exactly when the dot goes amber. Tap for accuracy, coordinates and fix age, or to resync — resync also works from the locate button or by tapping your own position marker.
- **Route details** — tap a route on the map, then "More" for rename, delete, total distance, and a per-segment distance breakdown.

### Fixed

- **Map layers going blank.** A stale variable reference threw partway through the layer-application loop, so any layer ordered after weather radar silently never got drawn. This one predates 1.0.0.
- **Weather radar playback.** Three separate causes: frame layers were built but never attached to the map, so their tiles never started loading; only the visible frame was brought to the front, leaving the rest buried under the basemap; and the "all frames loaded" check timed out early and reported success while tiles were still in flight.
- **Radar stuck on "Loading…"** — a failed frame-list fetch was cached permanently, so every later attempt reused the dead result. Now retries, and shows a tappable error instead of loading forever.
- **Compass losing its markings** after the phone had been backgrounded a while. The sensor also now stops while the app is in the background instead of running in your pocket.
- **Tapping trails while placing flags** opened a route or track popup instead of dropping the flag. Applies to route planning too.
- **Tile and legend failures** now report the actual HTTP status instead of a generic message, and retry once on transient server errors.
- Layout overlaps between the flag menu, GPS chip and compass; scale bar alignment; legends colliding with the map credits.

## Features

- **Offline map layers**: satellite, topo, trail, public land ownership (BLM Surface Management Agency data), borders, street/place labels. Download any region before you lose signal
- **Full layer control**: drag to reorder, toggle visibility, independent transparency per layer, save/load your own named layer presets
- **Weather radar**: play/step through the last ~2 hours of radar with an accurate reflectivity legend (sourced from RainViewer's own published color table)
- **Flags**: a dozen icon types (water, shelter, tent, campfire, food, power, parking, photo spot, hazard, star, cache) with undo/redo
- **Route planning**: point-by-point, or by connecting flags you've already dropped, with undo/redo and a tap-for-distance popup
- **Track recording**: live distance/time while recording, prompts to name and save when you stop
- **Sessions**: save/load named snapshots of your current flags/routes/tracks
- **Storage backup**: export/restore all your data (not map tiles) to a folder on your device via Settings
- **Compass**: true-north-tracking needle, tap to reset map rotation; plus an optional heading ribbon (beta) driven by the device's fused orientation sensor, with manual north calibration
- **Units**: metric or imperial throughout, switching automatically to feet/metres for short distances
- **Scale bar**: miles and kilometres on one overlaid bar, hideable

## Building from source

This app was built and compiled entirely on an Android phone using [Termux](https://termux.dev/). No desktop required, though the same steps work on a regular Linux/Mac machine with the Android SDK installed.

### One-time setup (Termux)

```bash
pkg install -y openjdk-17 wget unzip git nodejs aapt aapt2
```

Install the Android SDK command-line tools, then:

```bash
sdkmanager "platform-tools" "platforms;android-34" "build-tools;34.0.0"
sdkmanager --licenses
```

Add to `~/.bashrc`:
```bash
export ANDROID_HOME=$HOME/android-sdk
export JAVA_HOME=$PREFIX/lib/jvm/java-17-openjdk
```

### Clone and build

```bash
git clone https://github.com/0x44616D69616E/Cairn.git
cd cairn
npm install
npx cap add android      # first time only
npm run fix-manifest     # ensures location permissions are present
npx cap sync android
cd android
./gradlew assembleDebug --no-daemon
```

The built APK will be at `android/app/build/outputs/apk/debug/app-debug.apk`.

### After any code change

```bash
npx cap sync android
npm run fix-manifest
cd android
./gradlew assembleDebug --no-daemon
```

`npm run fix-manifest` is idempotent and safe to run after every sync. It does three things, all of which `npx cap sync` would otherwise undo or never do:

1. Re-adds the location and storage permissions, which `cap sync` can silently drop from the generated Android manifest.
2. Generates `AllFilesAccessPlugin.java` and registers it, for the storage folder browser.
3. Generates `CompassSensorPlugin.java` and registers it, for the heading ribbon.

Both plugins are generated rather than hand-maintained, so they're safe to regenerate at any time. The script finds `MainActivity.java` by searching for it rather than deriving the path from `appId` — those two can legitimately disagree if the Android project was generated before an app rename.

## Before you go outside: download your region

1. Open the app with a connection (needed for this step only).
2. Tap the menu → Download, search for the place you're headed, select it.
3. Pick a zoom range and which layers you want (satellite is by far the largest, leave it unchecked if you just want topo + trail to save space).
4. Tap Start Download and wait for it to finish.

After that, airplane mode works fine: map, GPS position, flags, routes, and recording all keep working with zero signal. Weather radar is the one layer that needs a live connection by nature.

## Project structure

```
www/
  index.html              - all UI markup (sheets, dialogs, status pills)
  css/style.css            - design system
  js/
    app.js                  - main wiring: map, layers, flags, routes, tracks
    layers.js                - registry of every map layer source
    tileCache.js               - offline tile caching (IndexedDB) + region downloads
    dataStore.js                 - IndexedDB for waypoints/routes/tracks/sessions
    radarPlayback.js               - weather radar frame fetching + playback
    boundariesLayer.js                - bundled country/state borders (vector, offline)
    storage.js                          - backup/restore via Capacitor Filesystem
    gps.js                                - Capacitor Geolocation wrapper
    compassHeading.js                      - device magnetometer heading
    geocoding.js                             - Nominatim place search
    icons.js                                  - SVG icon set + flag icon types
    debugOverlay.js                            - on-screen debug log (Settings toggle)
  data/boundaries/          - bundled country/state GeoJSON
scripts/
  ensure-manifest-permissions.js  - re-adds permissions cap sync can drop
  ensure-storage-plugin.js         - generates + registers AllFilesAccessPlugin.java
  ensure-compass-plugin.js          - generates + registers CompassSensorPlugin.java
  lib/patchMainActivity.js           - shared MainActivity registration helper
```

## Installing the APK

Download the latest APK from [Releases](https://github.com/0x44616D69616E/Cairn/releases/latest), or grab v1.1.0 directly [here](https://github.com/0x44616D69616E/Cairn/releases/download/v1.1.0/cairn-v1.1.0.apk).

Cairn isn't distributed through the Play Store, so Android shows two separate warnings the first time you install it:

1. A basic "install from unknown sources" permission prompt. Tap Settings on that screen, allow installs from the app you used to open the file, then go back and tap the file again.
2. A Google Play Protect warning saying it hasn't seen an app from this developer before. This is a "no prior history" flag, not a virus scan result. Tap "Install anyway."

Full step-by-step with screenshots is on [the website](https://freemaps.org).

## Known issues

See [GitHub Issues](https://github.com/0x44616D69616E/Cairn/issues) for the current list.

## License

MIT, see [LICENSE](LICENSE). Provided as-is, with no warranty; see the Terms of Use on the website for the full disclaimer that applies to using the compiled app.

## Support

Cairn is free with no ads and no subscription. If you want to support the project, there's a [Ko-fi](https://ko-fi.com/corruptedwizards). Bug reports and feature requests through GitHub Issues are just as valuable and always welcome.

## Credits

- Developed by [0x44616D69616E](https://github.com/0x44616D69616E)
- App icon: "Cairn" from the [Temaki icon set](https://www.figma.com/community/file/1179584099185267918) by Bryan Housel, CC0 license
- Map data: OpenTopoMap (CC-BY-SA), Esri/Maxar/Earthstar Geographics, Waymarked Trails, OpenStreetMap contributors, USGS/BLM, RainViewer, US Census Bureau, Natural Earth
- Built with [Leaflet](https://leafletjs.com/), [leaflet-rotate](https://github.com/fnicollier/Leaflet.Rotate), and [Capacitor](https://capacitorjs.com/)
