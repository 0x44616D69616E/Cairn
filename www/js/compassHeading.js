// compassHeading.js
//
// The GPS marker's previous heading source was `position.coords.heading`,
// which is course-over-ground computed from movement between GPS fixes.
// That has two real problems: it requires you to actually be moving to
// produce a value at all, and it only updates as fast as GPS fixes arrive
// (seconds apart) - which reads as "laggy" compared to how fast you can
// turn a phone in your hand.
//
// This module instead reads the device's actual magnetometer/orientation
// sensor directly via deviceorientation events, which fire at a much
// higher rate (tens of times per second) and work whether you're standing
// still or moving. This is the same sensor category a real compass app
// uses, and the same one leaflet-rotate's own CompassBearing handler taps
// into internally.

let onHeadingCallback = null;
let listening = false;

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

export function startListening(onHeading) {
  onHeadingCallback = onHeading;
  if (listening) return;

  // Prefer the "absolute" event (referenced to true/magnetic north) where
  // available; fall back to plain deviceorientation otherwise. Both are
  // supported without any special permission prompt on Android - the
  // permission-prompt requirement (DeviceOrientationEvent.requestPermission)
  // is an iOS 13+ thing, harmless to skip on Android.
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

export function stopListening() {
  if (listening === 'absolute') {
    window.removeEventListener('deviceorientationabsolute', handleOrientation, true);
  } else if (listening === 'relative') {
    window.removeEventListener('deviceorientation', handleOrientation, true);
  }
  listening = false;
}
