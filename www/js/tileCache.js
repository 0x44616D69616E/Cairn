// tileCache.js
//
// This is the core of "works 100% offline". We store downloaded tiles as
// binary blobs in IndexedDB (keyed by layerId/z/x/y), and provide a custom
// Leaflet tile layer that:
//   1. Checks IndexedDB first for a given tile.
//   2. If found, serves it from cache instantly (works with zero signal).
//   3. If not found AND we have a connection, fetches from network and
//      caches it for next time.
//   4. If not found and no connection, shows a blank/placeholder tile
//      rather than erroring out.
//
// IndexedDB (not localStorage) is used because it can hold large binary
// data (tiles are PNG/JPEG blobs) well beyond localStorage's ~5MB limit -
// realistic regions will be hundreds of MB to a few GB.

const DB_NAME = 'offline-topo-tiles';
const DB_VERSION = 1;
const STORE_NAME = 'tiles';

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        // key = "layerId/z/x/y"
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tileKey(layerId, z, x, y) {
  return `${layerId}/${z}/${x}/${y}`;
}

export async function getTileBlob(layerId, z, x, y) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(tileKey(layerId, z, x, y));
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function putTileBlob(layerId, z, x, y, blob) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(blob, tileKey(layerId, z, x, y));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function countTilesForLayer(layerId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAllKeys();
    req.onsuccess = () => {
      const count = req.result.filter(k => k.startsWith(layerId + '/')).length;
      resolve(count);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteTile(layerId, z, x, y) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(tileKey(layerId, z, x, y));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteAllTiles() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Deletes exactly the tiles that a specific saved region's download would
// have created (same bbox/zoom/layers math as downloadRegion below), so
// deleting "just this region" doesn't touch tiles belonging to any other
// downloaded area.
export async function deleteTilesInRegion({ bbox, minZoom, maxZoom, layerIds }, onProgress) {
  let deleted = 0;
  let total = 0;
  for (let z = minZoom; z <= maxZoom; z++) {
    const min = latLngToTile(bbox.north, bbox.west, z);
    const max = latLngToTile(bbox.south, bbox.east, z);
    total += (max.x - min.x + 1) * (max.y - min.y + 1) * layerIds.length;
  }

  for (let z = minZoom; z <= maxZoom; z++) {
    const min = latLngToTile(bbox.north, bbox.west, z);
    const max = latLngToTile(bbox.south, bbox.east, z);
    for (let x = min.x; x <= max.x; x++) {
      for (let y = min.y; y <= max.y; y++) {
        for (const layerId of layerIds) {
          await deleteTile(layerId, z, x, y);
          deleted++;
          if (onProgress) onProgress(deleted, total);
        }
      }
    }
  }
  return deleted;
}

export async function getTileCacheStats() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAllKeys();
    req.onsuccess = () => {
      const counts = {};
      for (const key of req.result) {
        const layerId = key.split('/')[0];
        counts[layerId] = (counts[layerId] || 0) + 1;
      }
      resolve(counts);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function estimateStorageUsage() {
  if (navigator.storage && navigator.storage.estimate) {
    const { usage, quota } = await navigator.storage.estimate();
    return { usageMB: (usage / 1e6).toFixed(1), quotaMB: (quota / 1e6).toFixed(1) };
  }
  return { usageMB: '?', quotaMB: '?' };
}

// --- Custom Leaflet layer that reads/writes through the cache above ---
// Leaflet's GridLayer.extend() lets us override how a single tile is
// created, which is exactly the hook point we need.
export function createOfflineTileLayer(L, source, opacity) {
  const OfflineLayer = L.GridLayer.extend({
    createTile: function (coords, done) {
      const tile = document.createElement('img');
      tile.setAttribute('role', 'presentation');

      const { z, x, y } = coords;
      const layerId = source.id;

      getTileBlob(layerId, z, x, y).then((cachedBlob) => {
        if (cachedBlob) {
          tile.src = URL.createObjectURL(cachedBlob);
          done(null, tile);
          return;
        }

        // Not cached - try the network (only works if online). One retry
        // on a transient-looking failure (server error / rate limit)
        // before giving up - a single blip from a slow government GIS
        // server shouldn't mean a tile silently stays blank forever.
        const attemptFetch = (attempt) =>
          buildTileUrl(source, z, x, y)
            .then((url) => fetch(url))
            .then((res) => {
              if (!res.ok) {
                const err = new Error(`HTTP ${res.status} ${res.statusText || ''}`.trim());
                err.status = res.status;
                throw err;
              }
              return res.blob();
            })
            .catch((err) => {
              const retryable = attempt === 0 && (!err.status || err.status >= 500 || err.status === 429);
              if (retryable) {
                return new Promise((resolve) => setTimeout(resolve, 700)).then(() => attemptFetch(1));
              }
              throw err;
            });

        attemptFetch(0)
          .then((blob) => {
            putTileBlob(layerId, z, x, y, blob); // cache for next time
            tile.src = URL.createObjectURL(blob);
            done(null, tile);
          })
          .catch((err) => {
            // Offline and not cached: leave a transparent tile instead of
            // a broken image icon. Still worth knowing about while testing -
            // the real status/error is what actually lets this be diagnosed
            // later, unlike a generic "tile fetch failed" for every case.
            import('./debugOverlay.js').then(({ logError }) =>
              logError(`Live tile fetch failed (${layerId} z${z}): ${err.message}`)
            );
            done(null, tile);
          });
      });

      return tile;
    }
  });

  const options = {
    opacity,
    maxZoom: source.maxZoom || 18,
    attribution: source.attribution
  };
  if (source.maxNativeZoom) options.maxNativeZoom = source.maxNativeZoom;

  return new OfflineLayer(options);
}

function tileToBBox3857(z, x, y) {
  // Standard slippy-map tile -> Web Mercator (EPSG:3857) meters, needed to
  // build an ArcGIS "export" image request for a specific tile's extent.
  const EARTH_CIRCUMFERENCE = 40075016.6856;
  const originShift = EARTH_CIRCUMFERENCE / 2;
  const tileSize = EARTH_CIRCUMFERENCE / Math.pow(2, z);
  const minX = x * tileSize - originShift;
  const maxX = (x + 1) * tileSize - originShift;
  const maxY = originShift - y * tileSize;
  const minY = originShift - (y + 1) * tileSize;
  return { minX, minY, maxX, maxY };
}

async function buildTileUrl(source, z, x, y) {
  if (source.isArcGISExport) {
    const { minX, minY, maxX, maxY } = tileToBBox3857(z, x, y);
    return source.url.replace('{bbox}', `${minX},${minY},${maxX},${maxY}`);
  }

  let url = source.url;
  if (source.subdomains) {
    const s = source.subdomains[(x + y) % source.subdomains.length];
    url = url.replace('{s}', s);
  }
  return url.replace('{z}', z).replace('{x}', x).replace('{y}', y);
}

import { LAYER_SOURCES } from './layers.js';

// --- Bulk download for a bounding box + zoom range (used by download.js) ---
// Iterates every tile coordinate in range, fetches it, and stores it.
// Reports progress via the onProgress callback so the UI can show a bar.
export async function downloadRegion({ bbox, minZoom, maxZoom, layerIds, onProgress, onDone }) {
  const tileList = [];
  for (let z = minZoom; z <= maxZoom; z++) {
    const min = latLngToTile(bbox.north, bbox.west, z);
    const max = latLngToTile(bbox.south, bbox.east, z);
    for (let x = min.x; x <= max.x; x++) {
      for (let y = min.y; y <= max.y; y++) {
        for (const layerId of layerIds) {
          tileList.push({ layerId, z, x, y });
        }
      }
    }
  }

  let done = 0;
  const total = tileList.length;

  // Simple sequential-ish download with limited concurrency so we don't
  // hammer the tile servers or the phone's radio.
  const CONCURRENCY = 6;
  let index = 0;

  const { logError } = await import('./debugOverlay.js');

  async function worker() {
    while (index < tileList.length) {
      const item = tileList[index++];
      try {
        await downloadSingleTile(item);
      } catch (e) {
        // One bad tile (rate limit, edge-of-range 404, network hiccup)
        // shouldn't kill the whole region download - log it visibly and
        // keep going.
        logError(`Tile skipped: ${e.message}`);
      }
      done++;
      onProgress(done, total);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  onDone(total);
}

async function downloadSingleTile({ layerId, z, x, y }) {
  const existing = await getTileBlob(layerId, z, x, y);
  if (existing) return; // already have it

  const source = Object.values(LAYER_SOURCES).find(s => s.id === layerId);
  if (!source) {
    throw new Error(`No layer source found for id "${layerId}"`);
  }

  const url = await buildTileUrl(source, z, x, y);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Tile fetch failed (${res.status}) for ${layerId} z${z}/x${x}/y${y}`);
  }
  const blob = await res.blob();
  await putTileBlob(layerId, z, x, y, blob);
}

function latLngToTile(lat, lng, z) {
  const x = Math.floor(((lng + 180) / 360) * Math.pow(2, z));
  const y = Math.floor(
    ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) *
      Math.pow(2, z)
  );
  return { x, y };
}
