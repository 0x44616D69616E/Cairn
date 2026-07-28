// radarPlayback.js
//
// Weather radar needs different handling than every other layer: it has
// multiple time frames (past + short-term forecast), and switching frames
// means the SAME z/x/y tile coordinate shows completely different imagery
// depending on which frame is selected. The generic offline tile cache
// (keyed only by layerId/z/x/y) would serve a stale frame's tile for a
// newly-selected frame, so radar deliberately bypasses that cache entirely
// and uses a plain Leaflet tile layer whose URL gets swapped via setUrl()
// when the frame changes. This is also correct behavior for a layer that
// can never usefully be "offline" anyway - old radar tells you nothing.

let frameListCache = null;
let frameListFetchedAt = 0;
const TEN_MIN = 10 * 60 * 1000;

export async function getFrameList() {
  if (frameListCache && Date.now() - frameListFetchedAt < TEN_MIN) {
    return frameListCache;
  }
  const res = await fetch('https://api.rainviewer.com/public/weather-maps.json');
  if (!res.ok) throw new Error('RainViewer frame list fetch failed');
  const data = await res.json();
  const past = (data.radar && data.radar.past) || [];
  const nowcast = (data.radar && data.radar.nowcast) || [];
  const frames = [...past, ...nowcast].map(f => ({ ...f, isForecast: false }));
  for (let i = past.length; i < frames.length; i++) frames[i].isForecast = true;
  if (!frames.length) throw new Error('No RainViewer radar frames available');

  // Satellite infrared (cloud cover) frames - confirmed present in
  // RainViewer's free public API (no key required, same endpoint as
  // radar). The exact tile URL format for this specific product wasn't
  // independently confirmed the way the radar one was, so it's built
  // using the same scheme RainViewer's own published radar examples use -
  // worth verifying it actually renders once tested live.
  const satFrames = (data.satellite && data.satellite.infrared) || [];

  frameListCache = { host: data.host, frames, satFrames };
  frameListFetchedAt = Date.now();
  return frameListCache;
}

export function frameUrlTemplate(host, frame) {
  // 256px tiles, color scheme 2 (their default "Universal Blue"),
  // 1_1 = smoothed with snow shown separately.
  return `${host}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`;
}

export function satelliteUrlTemplate(host, frame) {
  // Infrared satellite tiles - grayscale cloud imagery, no reflectivity
  // color scheme needed.
  return `${host}${frame.path}/256/{z}/{x}/{y}/0/0_0.png`;
}

export function buildRadarLayer(L, host, frame, opacity) {
  return L.tileLayer(frameUrlTemplate(host, frame), {
    opacity,
    minNativeZoom: 0,
    maxNativeZoom: 7,
    maxZoom: 18,
    className: 'radar-frame-tile', // see style.css - disables the default fade transition
    attribution: 'RainViewer'
  });
}

export function buildSatelliteLayer(L, host, frame, opacity) {
  return L.tileLayer(satelliteUrlTemplate(host, frame), {
    opacity,
    maxNativeZoom: 7,
    maxZoom: 18,
    attribution: 'RainViewer'
  });
}

export function formatFrameTime(frame) {
  const d = new Date(frame.time * 1000);
  const timeStr = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return frame.isForecast ? `${timeStr} (forecast)` : timeStr;
}
