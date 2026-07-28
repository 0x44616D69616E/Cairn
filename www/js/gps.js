// gps.js
//
// Wraps location access so the rest of the app doesn't care whether it's
// running inside the Capacitor native shell (real GPS chip access via the
// Geolocation plugin) or in a plain browser during development (falls back
// to the standard Web Geolocation API). Both read the actual hardware GPS,
// not network-based location, when available - critical for the "works
// with zero signal" requirement.

let watchId = null;
let onUpdateCallback = null;
let CapGeo = null;

// Capacitor's plugin registers itself globally at runtime inside the
// native shell. We try to grab it, and silently fall back to the browser
// API if it's not present (e.g. running this in a desktop browser to test
// the UI).
try {
  // eslint-disable-next-line no-undef
  CapGeo = Capacitor?.Plugins?.Geolocation || null;
} catch (e) {
  CapGeo = null;
}

export function startWatching(onUpdate) {
  onUpdateCallback = onUpdate;

  if (CapGeo) {
    // Wrapped in try/catch deliberately: a single uncaught error here would
    // otherwise stop every remaining line of app.js from executing (this is
    // exactly what happened before - a crash here silently killed flags,
    // routes, tracking, and downloads too, since none of that wiring code
    // ever got a chance to run).
    try {
      const result = CapGeo.watchPosition(
        { enableHighAccuracy: true, timeout: 10000 },
        (position, err) => {
          if (err) {
            onUpdate({ error: err.message || String(err) });
            return;
          }
          if (position) emit(position);
        }
      );

      // Some Capacitor plugin registration paths don't return a real
      // Promise from watchPosition depending on how the bridge proxy is
      // set up - only chain .then if we actually got a thenable back.
      if (result && typeof result.then === 'function') {
        result.then((id) => { watchId = id; }).catch((e) => {
          onUpdate({ error: `watchPosition setup failed: ${e.message || e}` });
        });
      }
    } catch (e) {
      onUpdate({ error: `Geolocation plugin error: ${e.message || e}` });
    }
  } else if (navigator.geolocation) {
    watchId = navigator.geolocation.watchPosition(
      (position) => emit(position),
      (err) => onUpdate({ error: err.message }),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 }
    );
  } else {
    onUpdate({ error: 'No geolocation available on this device.' });
  }
}

function emit(position) {
  const { latitude, longitude, accuracy, altitude, speed, heading } = position.coords;
  onUpdateCallback({
    lat: latitude,
    lng: longitude,
    accuracy,
    altitude,
    speed,
    heading,
    timestamp: position.timestamp
  });
}

export function stopWatching() {
  if (CapGeo && watchId != null) {
    CapGeo.clearWatch({ id: watchId });
  } else if (navigator.geolocation && watchId != null) {
    navigator.geolocation.clearWatch(watchId);
  }
  watchId = null;
}

// Haversine distance in miles between two {lat, lng} points - used for
// route planning distance and track recording stats.
export function distanceMiles(a, b) {
  const R = 3958.8;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function toRad(deg) {
  return (deg * Math.PI) / 180;
}
