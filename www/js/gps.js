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

function startWatchInternal() {
  if (CapGeo) {
    // Wrapped in try/catch deliberately: a single uncaught error here would
    // otherwise stop every remaining line of app.js from executing (this is
    // exactly what happened before - a crash here silently killed flags,
    // routes, tracking, and downloads too, since none of that wiring code
    // ever got a chance to run).
    try {
      const result = CapGeo.watchPosition(
        // maximumAge caps how old a fix Android's location provider is
        // allowed to hand back before it's expected to get a fresh one -
        // matching the web fallback below, which already had this. Without
        // it here, the native path was technically free to occasionally
        // serve a slightly-stale cached fix instead of a live one.
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 2000 },
        (position, err) => {
          if (err) {
            notifyUpdate({ error: err.message || String(err) });
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
          notifyUpdate({ error: `watchPosition setup failed: ${e.message || e}` });
        });
      }
    } catch (e) {
      notifyUpdate({ error: `Geolocation plugin error: ${e.message || e}` });
    }
  } else if (navigator.geolocation) {
    watchId = navigator.geolocation.watchPosition(
      (position) => emit(position),
      (err) => notifyUpdate({ error: err.message }),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 }
    );
  } else {
    notifyUpdate({ error: 'No geolocation available on this device.' });
  }
}

function notifyUpdate(payload) {
  if (onUpdateCallback) onUpdateCallback(payload);
}

export function startWatching(onUpdate) {
  onUpdateCallback = onUpdate;
  startWatchInternal();
}

// Tears down the current watch and starts a fresh one - a "resync" button
// for GPS position drift. Whether this actually helps depends on what's
// causing the drift: it gives the location provider a clean slate to
// reacquire from (can help if it's gotten stuck on stale internal
// averaging), but it can't do anything about real signal conditions
// (tree cover, canyon walls, being between buildings) - that's physical,
// not a state that restarting clears.
export function resync() {
  stopWatching();
  startWatchInternal();
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

// Formats a distance (in miles, this module's base unit throughout) for
// display, switching to the smaller unit (feet/meters) for short distances
// instead of always showing miles/km - "140 ft" reads a lot better than
// "0.03 mi" for a single short route segment. The metric crossover at
// 1000m is the obvious one (that's what makes it a kilometer); the
// imperial crossover at 528ft (0.1 mi) is a common convention in mapping
// apps for the same reason, there's no exact equivalent "clean" number.
export function formatDistance(miles, useMetric) {
  if (useMetric) {
    const meters = miles * 1609.344;
    if (meters < 1000) return `${Math.round(meters)} m`;
    return `${(meters / 1000).toFixed(2)} km`;
  }
  const feet = miles * 5280;
  if (feet < 528) return `${Math.round(feet)} ft`;
  return `${miles.toFixed(2)} mi`;
}

function toRad(deg) {
  return (deg * Math.PI) / 180;
}
