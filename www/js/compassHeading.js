// compassHeading.js
//
// Two heading sources, tried in order:
//
// 1. CompassSensorPlugin (native) - Android's TYPE_ROTATION_VECTOR sensor
//    (accel+gyro+magnetometer, fused and drift-corrected at the OS level),
//    true-north-corrected via GeomagneticField, lightly smoothed. Needs a
//    rebuild to exist at all (see scripts/ensure-compass-plugin.js) - on
//    a build from before that, or in a browser/dev environment, it just
//    won't be present, and this module quietly falls through to:
//
// 2. deviceorientation/deviceorientationabsolute (web) - magnetic heading
//    only (no true-north correction, since that needs the World Magnetic
//    Model, which isn't something to reimplement in JS), no smoothing,
//    and on some Android/WebView combinations may silently be the weaker
//    "relative" flavor instead of the properly north-referenced
//    "absolute" one. Kept as a fallback so the app still has *a* compass
//    even on a build that hasn't picked up the native plugin yet.

let onHeadingCallback = null;
let onAccuracyCallback = null;
let listening = false;
let nativePluginHandle = null;

let CapCompass = null;
try {
  // eslint-disable-next-line no-undef
  CapCompass = Capacitor?.Plugins?.CompassSensor || null;
} catch (e) {
  CapCompass = null;
}

function handleOrientation(event) {
  let heading;

  if (typeof event.webkitCompassHeading === 'number') {
    // iOS Safari/WebView - already a compass heading (0 = north), no math needed.
    heading = event.webkitCompassHeading;
  } else if (typeof event.alpha === 'number') {
    // Standard DeviceOrientation - alpha is rotation around the Z axis.
    // For an "absolute" event this is already referenced to true/magnetic
    // north; for a plain (non-absolute) event on some Android devices it's
    // referenced to whatever orientation the device started at, which is
    // less reliable but still far more responsive than GPS course.
    heading = 360 - event.alpha;
  } else {
    return; // no usable heading data in this event
  }

  heading = ((heading % 360) + 360) % 360; // normalize to 0-360
  if (onHeadingCallback) onHeadingCallback(heading);
}

// `onAccuracy` is optional and only ever fires from the native plugin -
// the web fallback has no equivalent signal, so it's simply never called
// in that case rather than faked.
//
// Genuinely async (unlike the old version) because whether the native
// plugin is actually usable can only be known after an async isAvailable()
// check - returning a guessed answer synchronously and correcting it
// later would mean the "which mode is active" log line in app.js could
// end up flatly wrong for a moment, which isn't worth the tradeoff.
export async function startListening(onHeading, onAccuracy) {
  onHeadingCallback = onHeading;
  onAccuracyCallback = onAccuracy || null;
  if (listening) return listening;

  if (CapCompass) {
    try {
      const res = await CapCompass.isAvailable();
      if (res.available) {
        nativePluginHandle = await CapCompass.addListener('headingUpdate', (data) => {
          if (onHeadingCallback) onHeadingCallback(data.heading);
          if (onAccuracyCallback) onAccuracyCallback(data.accuracy);
        });
        await CapCompass.start();
        listening = 'native';
        return listening;
      }
    } catch (e) {
      // fall through to the web listener below
    }
  }

  return startWebListening();
}

function startWebListening() {
  if ('ondeviceorientationabsolute' in window) {
    window.addEventListener('deviceorientationabsolute', handleOrientation, true);
    listening = 'absolute';
  } else if ('ondeviceorientation' in window) {
    window.addEventListener('deviceorientation', handleOrientation, true);
    listening = 'relative';
  } else {
    listening = false;
  }
  return listening;
}

// Feeds a GPS fix through to the native plugin for its true-north
// (declination) correction - a no-op on the web fallback, which doesn't
// do that correction at all. Safe to call on every GPS update; cheap.
export function updateLocation(lat, lng, altitude) {
  if (CapCompass) {
    CapCompass.updateLocation({ latitude: lat, longitude: lng, altitude: altitude || 0 });
  }
}

export async function stopListening() {
  if (listening === 'native') {
    if (CapCompass) await CapCompass.stop();
    if (nativePluginHandle) { await nativePluginHandle.remove(); nativePluginHandle = null; }
  } else if (listening === 'absolute') {
    window.removeEventListener('deviceorientationabsolute', handleOrientation, true);
  } else if (listening === 'relative') {
    window.removeEventListener('deviceorientation', handleOrientation, true);
  }
  listening = false;
}
