// dataStore.js
//
// Persists waypoints ("flags"), planned routes, and recorded GPS tracks
// on-device. Uses IndexedDB (same DB as tiles, separate object stores)
// so everything lives locally with no account/server/cloud dependency.
// Includes GPX export so data can be backed up or moved into another
// app (Gaia, CalTopo, etc.) if wanted - one-way door out, never locked in.

const DB_NAME = 'offline-topo-data';
const DB_VERSION = 2;
const STORES = ['waypoints', 'routes', 'tracks', 'sessions'];

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const store of STORES) {
        if (!db.objectStoreNames.contains(store)) {
          db.createObjectStore(store, { keyPath: 'id' });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

async function putRecord(store, record) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(record);
    tx.oncomplete = () => resolve(record);
    tx.onerror = () => reject(tx.error);
  });
}

async function getAll(store) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function deleteRecord(store, id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// --- Sessions ---
// A "session" is a named snapshot of the CURRENT waypoints/routes/tracks at
// the moment you save it. Deliberately does NOT touch downloaded map tile
// data at all - that lives in a completely separate IndexedDB database
// (see tileCache.js) specifically so map downloads always persist
// regardless of what happens to session data.
export async function saveSession(name) {
  const [waypoints, routes, tracks] = await Promise.all([getAll('waypoints'), getAll('routes'), getAll('tracks')]);
  return putRecord('sessions', {
    id: uid(), name, waypoints, routes, tracks, savedAt: Date.now()
  });
}

export async function getSessions() {
  const sessions = await getAll('sessions');
  return sessions.sort((a, b) => b.savedAt - a.savedAt);
}

export async function deleteSession(id) {
  return deleteRecord('sessions', id);
}

// Wipes current working waypoints/routes/tracks. Used by "New Session"
// (after the user has confirmed) and internally by loadSession before
// restoring a snapshot. Map tiles are never touched by this.
export async function clearCurrentData() {
  const db = await openDB();
  await Promise.all(['waypoints', 'routes', 'tracks'].map(store => new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  })));
}

export async function loadSession(id) {
  const db = await openDB();
  const session = await new Promise((resolve, reject) => {
    const tx = db.transaction('sessions', 'readonly');
    const req = tx.objectStore('sessions').get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  if (!session) throw new Error('Session not found');

  await clearCurrentData();
  await Promise.all([
    ...session.waypoints.map(w => putRecord('waypoints', w)),
    ...session.routes.map(r => putRecord('routes', r)),
    ...session.tracks.map(t => putRecord('tracks', t))
  ]);
  return session;
}

// Quick check used to decide whether "New Session" needs to warn about
// losing unsaved work.
export async function hasAnyCurrentData() {
  const [waypoints, routes, tracks] = await Promise.all([getAll('waypoints'), getAll('routes'), getAll('tracks')]);
  return waypoints.length > 0 || routes.length > 0 || tracks.length > 0;
}

// --- Waypoints ---
// Acts as an upsert: pass an object with an existing `id` to update it in
// place (used for renaming and renumbering), or omit `id` to create a new
// flag with a fresh one.
export async function saveWaypoint({ id, lat, lng, name, notes, iconType, createdAt, boundRouteId, routeDistance }) {
  return putRecord('waypoints', {
    id: id || uid(),
    lat, lng, name, notes,
    iconType: iconType || 'flag', // default for backward compatibility with flags saved before this feature existed
    createdAt: createdAt || Date.now(),
    // boundRouteId/routeDistance: which route (if any) this flag is bound
    // to, and its distance-along-that-route - undefined for the vast
    // majority of flags that were never bound. routeDistance is what lets
    // "next waypoint" ordering during navigation just be a sort/compare,
    // instead of re-projecting every bound flag onto the route on every
    // GPS tick.
    boundRouteId: boundRouteId ?? null,
    routeDistance: typeof routeDistance === 'number' ? routeDistance : null
  });
}
export async function getWaypoints() { return getAll('waypoints'); }
export async function deleteWaypoint(id) { return deleteRecord('waypoints', id); }

// --- Planned routes ---
// Upsert: pass an existing `id` to update a route in place (used when
// loading a saved route back into edit mode and re-finishing it), or omit
// it to create a new one.
export async function saveRoute({ id, name, points, createdAt }) {
  // points = [{lat, lng}, ...]
  return putRecord('routes', { id: id || uid(), name, points, createdAt: createdAt || Date.now() });
}
export async function getRoutes() { return getAll('routes'); }
export async function deleteRoute(id) { return deleteRecord('routes', id); }

// --- Recorded GPS tracks ---
export async function saveTrack({ id, name, points, startedAt, endedAt, createdAt }) {
  // points = [{lat, lng, altitude, timestamp}, ...]
  return putRecord('tracks', { id: id || uid(), name, points, startedAt, endedAt, createdAt: createdAt || Date.now() });
}
export async function getTracks() { return getAll('tracks'); }
export async function deleteTrack(id) { return deleteRecord('tracks', id); }

// --- GPX export (works for routes or tracks) ---
export function toGPX({ name, points }) {
  const pointTags = points
    .map(p => `      <trkpt lat="${p.lat}" lon="${p.lng}">${p.altitude ? `<ele>${p.altitude}</ele>` : ''}</trkpt>`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="OfflineTopo">
  <trk>
    <name>${escapeXml(name)}</name>
    <trkseg>
${pointTags}
    </trkseg>
  </trk>
</gpx>`;
}

function escapeXml(str) {
  return String(str).replace(/[<>&'"]/g, (c) => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;'
  }[c]));
}
