// app.js - main entry point, wires everything together.

import { LAYER_SOURCES, DEFAULT_LAYER_STACK, PRESETS } from './layers.js';
import { createOfflineTileLayer, downloadRegion, deleteTilesInRegion, deleteAllTiles, getTileCacheStats, estimateStorageUsage } from './tileCache.js';
import { buildBordersLayer } from './boundariesLayer.js';
import * as Radar from './radarPlayback.js';
import * as GPS from './gps.js';
import * as Store from './dataStore.js';
import * as Geocode from './geocoding.js';
import * as Compass from './compassHeading.js';
import { logInfo, logError, setDebugEnabled, isDebugEnabled } from './debugOverlay.js';
import { mountIcons, ICONS, FLAG_TYPES } from './icons.js';
import * as Storage from './storage.js';

mountIcons();
logInfo('app.js loaded and running');

// ---------- Overlay system (sheets + dialogs share one backdrop) ----------
const backdrop = document.getElementById('backdrop');

function openOverlay(id) {
  document.querySelectorAll('.sheet, .dialog').forEach((el) => el.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
  backdrop.classList.remove('hidden');
  requestAnimationFrame(() => backdrop.classList.add('visible'));
}
function closeOverlay(id) {
  document.getElementById(id).classList.add('hidden');
  backdrop.classList.remove('visible');
  setTimeout(() => backdrop.classList.add('hidden'), 200);
}
function toggleSheet(id) {
  const el = document.getElementById(id);
  if (el.classList.contains('hidden')) openOverlay(id);
  else closeOverlay(id);
}
backdrop.onclick = () => {
  document.querySelectorAll('.sheet, .dialog').forEach((el) => {
    if (!el.classList.contains('hidden')) closeOverlay(el.id);
  });
};
document.querySelectorAll('.sheet-close').forEach((btn) => {
  btn.onclick = () => closeOverlay(btn.dataset.target);
});

document.getElementById('btn-layers').onclick = () => toggleSheet('sheet-layers');
document.getElementById('btn-download').onclick = () => { toggleSheet('sheet-download'); renderRegionsList('saved-map-regions-list-download', 'tile-cache-stats-download'); };
document.getElementById('btn-data').onclick = () => { toggleSheet('sheet-data'); renderDataPanel(); };
document.getElementById('btn-settings').onclick = () => toggleSheet('sheet-settings');

// ---------- FAB menu collapse ----------
// All the action buttons live behind one toggle - tap to expand, tap
// again (or tap the toggle again) to collapse.
let fabMenuOpen = false;
document.getElementById('btn-fab-menu').onclick = () => {
  fabMenuOpen = !fabMenuOpen;
  document.getElementById('fab-menu-items').classList.toggle('hidden', !fabMenuOpen);
  document.getElementById('btn-fab-menu').classList.toggle('active', fabMenuOpen);
};

// ---------- Settings ----------
const debugToggle = document.getElementById('toggle-debug-mode');
debugToggle.checked = isDebugEnabled();
debugToggle.addEventListener('change', () => setDebugEnabled(debugToggle.checked));

// ---------- Storage setup + backup/restore ----------
function refreshStorageUI() {
  const statusText = document.getElementById('storage-status-text');
  const backupActions = document.getElementById('storage-backup-actions');
  if (!Storage.isFilesystemAvailable()) {
    statusText.textContent = 'Storage setup isn\'t available in this environment.';
    return;
  }
  if (Storage.isStorageConfigured()) {
    const dirLabel = Storage.getConfiguredDirectory() === 'DOCUMENTS' ? 'Documents' : 'Downloads';
    statusText.textContent = `Storage is set up (${dirLabel}/Cairn). Map tiles stay cached separately and aren't part of backups - they can always be re-downloaded.`;
    backupActions.classList.remove('hidden');
    refreshBackupFilesList();
  } else {
    statusText.textContent = 'Not set up yet. This creates a Documents/Cairn folder for backing up your flags, routes, tracks, and settings.';
    backupActions.classList.add('hidden');
  }
}

async function refreshBackupFilesList() {
  const listEl = document.getElementById('backup-files-list');
  const files = await Storage.listBackupFiles();
  listEl.innerHTML = '';
  if (!files.length) { listEl.innerHTML = '<li>No backups yet.</li>'; return; }
  files.forEach((filename) => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${filename}</span>`;
    const importBtn = document.createElement('button');
    importBtn.textContent = 'Restore';
    importBtn.onclick = async () => {
      const ok = await askConfirm('Restore this backup?', `This adds the flags, routes, and tracks from "${filename}" to what's already on this device (it won't delete anything current).`);
      if (!ok) return;
      try {
        await Storage.importAllData(filename);
        await redrawAllDataFromStore();
        layerStack = loadLayerStack();
        renderLayerManagerUI();
        applyLayerStack();
        updateMapOverlays();
        renderLayerPresetsList();
        logInfo(`Backup "${filename}" restored.`);
      } catch (e) {
        logError(`Failed to restore backup: ${e.message}`);
      }
    };
    li.appendChild(importBtn);
    listEl.appendChild(li);
  });
}

function askStorageFolder() {
  return new Promise((resolve) => {
    openOverlay('dialog-storage-folder');
    const docsBtn = document.getElementById('btn-folder-documents');
    const dlBtn = document.getElementById('btn-folder-downloads');
    const cleanup = () => { docsBtn.onclick = null; dlBtn.onclick = null; closeOverlay('dialog-storage-folder'); };
    docsBtn.onclick = () => { cleanup(); resolve('DOCUMENTS'); };
    dlBtn.onclick = () => { cleanup(); resolve('EXTERNAL_STORAGE'); };
  });
}

document.getElementById('btn-setup-storage').onclick = async () => {
  const directory = await askStorageFolder();
  try {
    await Storage.setupStorage(directory);
    logInfo(`Storage set up at ${directory === 'DOCUMENTS' ? 'Documents' : 'Downloads'}/Cairn.`);
    refreshStorageUI();
  } catch (e) {
    logError(`Failed to set up storage: ${e.message}`);
  }
};

document.getElementById('btn-export-backup').onclick = async () => {
  try {
    const filename = await Storage.exportAllData();
    logInfo(`Backup saved: ${filename}`);
    refreshBackupFilesList();
  } catch (e) {
    logError(`Failed to export backup: ${e.message}`);
  }
};

document.getElementById('btn-import-backup').onclick = () => refreshBackupFilesList();

refreshStorageUI();

// ---------- First-launch onboarding ----------
if (!localStorage.getItem('onboardingSeen')) {
  localStorage.setItem('onboardingSeen', 'true');
  openOverlay('dialog-onboarding-offline');
}
document.getElementById('btn-onboarding-offline-ok').onclick = () => {
  closeOverlay('dialog-onboarding-offline');
  if (!Storage.isStorageConfigured()) {
    setTimeout(() => openOverlay('dialog-onboarding-storage'), 250);
  }
};
document.getElementById('btn-onboarding-storage-later').onclick = () => closeOverlay('dialog-onboarding-storage');
document.getElementById('btn-onboarding-storage-setup').onclick = async () => {
  closeOverlay('dialog-onboarding-storage');
  const directory = await askStorageFolder();
  try {
    await Storage.setupStorage(directory);
    logInfo(`Storage set up at ${directory === 'DOCUMENTS' ? 'Documents' : 'Downloads'}/Cairn.`);
    refreshStorageUI();
  } catch (e) {
    logError(`Failed to set up storage: ${e.message}`);
  }
};

// ---------- In-app prompts (replace window.prompt/confirm) ----------
function askName(title, defaultValue) {
  return new Promise((resolve) => {
    document.getElementById('name-prompt-title').textContent = title;
    const input = document.getElementById('name-prompt-input');
    input.value = defaultValue;
    openOverlay('dialog-name-prompt');
    const confirmBtn = document.getElementById('btn-name-prompt-confirm');
    const cancelBtn = document.getElementById('btn-name-prompt-cancel');
    const cleanup = () => { confirmBtn.onclick = null; cancelBtn.onclick = null; closeOverlay('dialog-name-prompt'); };
    confirmBtn.onclick = () => { const v = input.value.trim() || defaultValue; cleanup(); resolve(v); };
    cancelBtn.onclick = () => { cleanup(); resolve(null); };
  });
}

function askConfirm(title, message) {
  return new Promise((resolve) => {
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-message').textContent = message;
    openOverlay('dialog-confirm');
    const yesBtn = document.getElementById('btn-confirm-yes');
    const noBtn = document.getElementById('btn-confirm-no');
    const cleanup = () => { yesBtn.onclick = null; noBtn.onclick = null; closeOverlay('dialog-confirm'); };
    yesBtn.onclick = () => { cleanup(); resolve(true); };
    noBtn.onclick = () => { cleanup(); resolve(false); };
  });
}

// ---------- Map init ----------
const map = L.map('map', {
  zoomControl: false,
  rotate: true,
  touchRotate: true,
  rotateControl: false
}).setView([20, 0], 2);

L.control.scale({ position: 'bottomleft', imperial: true, metric: true }).addTo(map);

let hasCenteredOnFirstFix = false;

// ---------- Generalized layer manager ----------
// Every layer - tile-based (satellite/topo/trail/landOwnership/weatherRadar)
// or vector (borders) - is represented as { id, on, opacity } in an ordered
// array. Array position 0 = rendered on top. Persisted so your order and
// opacity choices survive an app restart. Adding a brand new layer in the
// future only requires an entry in layers.js - this manager and its UI
// don't need any per-layer code.
function loadLayerStack() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem('layerStack')); } catch (e) { /* ignore */ }
  if (!Array.isArray(saved)) saved = JSON.parse(JSON.stringify(DEFAULT_LAYER_STACK));

  // Reconcile with the registry - pick up newly-added layer types for
  // existing users, and drop any that no longer exist.
  const existingIds = new Set(saved.map(l => l.id));
  DEFAULT_LAYER_STACK.forEach((defaultEntry) => {
    if (!existingIds.has(defaultEntry.id)) saved.push({ ...defaultEntry });
  });
  return saved.filter(l => LAYER_SOURCES[l.id]);
}
function saveLayerStack() {
  localStorage.setItem('layerStack', JSON.stringify(layerStack));
}

let layerStack = loadLayerStack();
const activeLeafletLayers = {}; // id -> leaflet layer instance, built lazily and reused

// ---------- Weather radar playback state ----------
// Previous versions of this used two alternating tile layers (one visible,
// one preloading invisibly) to avoid a blank flash when switching frames.
// That kept producing an intermittent "blank every other frame" bug that
// resisted fixing blind - the failure mode of relying on opacity swaps
// and z-order between two live layer instances has too many moving parts
// to verify without live testing. This is a simpler, more robust design:
// ONE tile layer, and before switching its URL, the target frame's tiles
// for the current viewport are explicitly pre-fetched with plain fetch()
// calls. Since those requests hit the same CDN URLs the tile layer will
// request moments later, they land in the browser's normal HTTP cache, so
// the actual .setUrl() swap resolves instantly instead of waiting on the
// network - without needing a second layer instance at all.
// Every past/nowcast frame gets its OWN Leaflet tile layer, all built and
// added to the map (at opacity 0, except whichever is current) the first
// time the radar layer is turned on. Cycling frames afterward is pure
// opacity toggling between already-loaded layers - no setUrl(), no
// preload-then-swap dance, no DOM tile churn at all during playback. That
// dance is what kept causing the flicker/blank-frame behavior in earlier
// attempts; this sidesteps it entirely once the one-time upfront load
// finishes. The tradeoff is a heavier initial load (every frame's tiles
// for the current view, not just one), which is a fair trade for genuinely
// flicker-free cycling afterward.
let radarFrameList = null;
let radarFrameIndex = null;
let radarPlaying = false;
let radarPlayTimer = null;
let radarLayers = []; // one tile layer per frame, index-aligned with radarFrameList.frames
let radarLayersBuilt = false;
let radarLayersFullyLoaded = false; // true only once every layer has actually finished loading its tiles

let radarFrameListPromise = null;

async function ensureRadarFrameList() {
  if (radarFrameList) return radarFrameList;
  if (!radarFrameListPromise) {
    radarFrameListPromise = Radar.getFrameList().then((list) => {
      radarFrameList = list;
      const pastCount = list.frames.filter(f => !f.isForecast).length;
      radarFrameIndex = Math.max(0, pastCount - 1);
      return list;
    });
  }
  return radarFrameListPromise;
}

async function getOrBuildLeafletLayer(id) {
  if (activeLeafletLayers[id]) return activeLeafletLayers[id];
  const source = LAYER_SOURCES[id];
  const entry = layerStack.find(l => l.id === id);
  const opacity = entry ? entry.opacity : 1;

  let layer;
  if (source.isVectorBorders) {
    layer = await buildBordersLayer(L, opacity);
  } else if (source.isRadarPlayback) {
    await ensureRadarFrameList();
    if (!radarLayersBuilt) {
      radarLayers = radarFrameList.frames.map((frame, i) =>
        Radar.buildRadarLayer(L, radarFrameList.host, frame, i === radarFrameIndex ? opacity : 0)
      );
      radarLayersBuilt = true;
    }
    layer = radarLayers[radarFrameIndex];
  } else if (source.isCloudSatellite) {
    await ensureRadarFrameList();
    const satFrames = radarFrameList.satFrames || [];
    if (!satFrames.length) throw new Error('No satellite frames available from RainViewer.');
    const latest = satFrames[satFrames.length - 1];
    layer = Radar.buildSatelliteLayer(L, radarFrameList.host, latest, opacity);
  } else {
    layer = createOfflineTileLayer(L, source, opacity);
  }

  activeLeafletLayers[id] = layer;
  return layer;
}

// Waits for every radar frame layer to actually finish loading its tiles
// (Leaflet's 'load' event, with a per-layer timeout fallback so one slow
// tile can't hang the whole thing indefinitely). This has to happen BEFORE
// cycling is allowed - the ghosting bug was exactly this: a hidden layer
// could still be mid-load when it became the current one, so its tiles
// faded in individually as they arrived instead of all appearing at once.
//
// The `_loading` check has a real race: reading it synchronously right
// after the layer is created can read false simply because Leaflet's
// (async) tile loading hasn't started yet - not because it already
// finished - which would let cycling begin before that layer's tiles
// actually exist. Attaching the 'load' listener FIRST, then giving
// Leaflet a moment to actually start loading before checking, closes
// that gap.
async function waitForAllRadarLayersLoaded() {
  const waits = radarLayers.map((layer) => new Promise((resolve) => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    layer.once('load', finish);
    setTimeout(finish, 4000); // don't let one hung tile block the rest forever
    // Give Leaflet a tick to actually start loading before trusting
    // `_loading` as a signal that this layer has nothing to wait for.
    setTimeout(() => { if (!layer._loading) finish(); }, 50);
  }));
  await Promise.all(waits);
  radarLayersFullyLoaded = true;
  updateRadarPlaybackUI();
}

function setRadarFrame(index) {
  if (!radarFrameList || !radarLayersBuilt || !radarLayersFullyLoaded) return;
  const clamped = Math.max(0, Math.min(radarFrameList.frames.length - 1, index));
  const currentOpacity = (layerStack.find(l => l.id === 'weatherRadar') || {}).opacity ?? 1;

  radarLayers.forEach((layer, i) => {
    if (i !== clamped) layer.setOpacity(0);
  });
  radarFrameIndex = clamped;
  radarLayers[radarFrameIndex].setOpacity(currentOpacity);
  activeLeafletLayers.weatherRadar = radarLayers[radarFrameIndex];
  updateRadarPlaybackUI();
}

function updateRadarPlaybackUI() {
  const timeEl = document.getElementById('radar-frame-time');
  const playBtn = document.getElementById('btn-radar-play');
  if (!timeEl || !radarFrameList) return;
  if (!radarLayersFullyLoaded) {
    timeEl.textContent = 'Loading…';
    document.getElementById('btn-radar-play').classList.add('disabled');
    document.getElementById('btn-radar-prev').classList.add('disabled');
    document.getElementById('btn-radar-next').classList.add('disabled');
    return;
  }
  document.getElementById('btn-radar-play').classList.remove('disabled');
  document.getElementById('btn-radar-prev').classList.remove('disabled');
  document.getElementById('btn-radar-next').classList.remove('disabled');
  const frame = radarFrameList.frames[radarFrameIndex];
  timeEl.textContent = Radar.formatFrameTime(frame);
  if (playBtn) playBtn.innerHTML = radarPlaying ? ICONS.stop : ICONS.play;
}

function scheduleNextRadarFrame() {
  radarPlayTimer = setTimeout(() => {
    if (!radarPlaying) return;
    let next = radarFrameIndex + 1;
    if (next >= radarFrameList.frames.length) next = 0; // loop
    setRadarFrame(next);
    if (radarPlaying) scheduleNextRadarFrame();
  }, 300);
}

function toggleRadarPlayback() {
  radarPlaying = !radarPlaying;
  if (radarPlaying) {
    scheduleNextRadarFrame();
  } else if (radarPlayTimer) {
    clearTimeout(radarPlayTimer);
    radarPlayTimer = null;
  }
  updateRadarPlaybackUI();
}

function stopRadarPlaybackIfRunning() {
  if (radarPlaying) {
    radarPlaying = false;
    if (radarPlayTimer) clearTimeout(radarPlayTimer);
    radarPlayTimer = null;
  }
}

async function applyLayerStack() {
  for (const entry of layerStack) {
    let layer;
    try {
      layer = await getOrBuildLeafletLayer(entry.id);
    } catch (e) {
      logError(`Failed to build layer "${entry.id}": ${e.message}`);
      continue;
    }
    if (entry.on) {
      if (layer.setOpacity) layer.setOpacity(entry.opacity);
      else if (layer.eachLayer) layer.eachLayer(l => l.setStyle && l.setStyle({ opacity: entry.opacity }));
      if (!map.hasLayer(layer)) layer.addTo(map);
      // Radar keeps one hidden tile layer per frame so cycling never needs
      // to touch the network/DOM again after the first load - all of them
      // need to be attached to the map (even the hidden ones), not just
      // the currently-visible one the generic system above knows about.
      if (entry.id === 'weatherRadar' && radarLayersReady) {
        radarLayers.forEach((rl) => { if (!map.hasLayer(rl)) rl.addTo(map); });
      }
    } else if (map.hasLayer(layer)) {
      map.removeLayer(layer);
      if (entry.id === 'weatherRadar' && radarLayersReady) {
        radarLayers.forEach((rl) => { if (map.hasLayer(rl)) map.removeLayer(rl); });
      }
    }
  }
  // Enforce z-order: array[0] should end up frontmost. Processing back-to-
  // front and calling bringToFront() means index 0 is called last, so it
  // wins - avoids a full remove/re-add just to reorder.
  for (let i = layerStack.length - 1; i >= 0; i--) {
    const entry = layerStack[i];
    if (!entry.on) continue;
    const layer = activeLeafletLayers[entry.id];
    if (!layer) continue;
    if (layer.bringToFront) layer.bringToFront();
    else if (layer.eachLayer) layer.eachLayer(l => l.bringToFront && l.bringToFront());
  }
}

// ---------- BLM legend (fetched live from BLM's own ArcGIS service, so it's
// always accurate and never goes stale if they change their symbology) ----------
let blmLegendCache = null;
async function fetchBlmLegend() {
  if (blmLegendCache) return blmLegendCache;
  const url = 'https://gis.blm.gov/arcgis/rest/services/lands/BLM_Natl_SMA_Cached_with_PriUnk/MapServer/legend?f=pjson';
  const res = await fetch(url);
  if (!res.ok) throw new Error('BLM legend fetch failed');
  const data = await res.json();
  // This service publishes the SAME categories twice: an "overview" tier
  // (minScale > 0, used when zoomed out) where every single category
  // shares one identical placeholder swatch image, and a "detail" tier
  // (minScale === 0) with the real, distinct color per category. The bug
  // here was deduping by name and keeping whichever came first in the
  // array - which was always the overview tier's identical placeholder,
  // so every legend row rendered the same generic icon. Filtering to
  // minScale === 0 first picks the tier with real colors.
  const seen = new Set();
  const items = [];
  for (const layer of data.layers) {
    if (layer.minScale !== 0) continue;
    const name = layer.layerName;
    if (seen.has(name) || name === 'Surface Management Agency') continue;
    seen.add(name);
    const legendEntry = layer.legend && layer.legend[0];
    if (legendEntry) items.push({ label: name, imageData: legendEntry.imageData, contentType: legendEntry.contentType });
  }
  blmLegendCache = items;
  return items;
}

function renderLegendSwatches(container, items) {
  container.innerHTML = '';
  items.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'legend-row';
    // Rendered larger than the source swatch (which BLM serves at ~20x20)
    // and without smoothing, so any pattern fill (stripes, checkers) used
    // for a category is actually legible instead of blurring into a
    // solid-looking blob at a tiny size.
    row.innerHTML = `<img src="data:${item.contentType};base64,${item.imageData}" width="28" height="28" style="image-rendering: pixelated; border-radius: 3px;" /><span>${item.label}</span>`;
    container.appendChild(row);
  });
}

// Real RGBA stops sampled directly from RainViewer's own published color
// table for the "Universal Blue" scheme (the one this app's tile URL
// actually requests) at https://www.rainviewer.com/files/rainviewer_api_colors_table.csv -
// not a guess. dBZ intensity thresholds (light/moderate/heavy/hail) match
// standard meteorological convention (NWS/mesonet references).
const RADAR_GRADIENT_STOPS = [
  { dbz: 0, color: '#827b69' },
  { dbz: 15, color: '#88ddee' },
  { dbz: 20, color: '#00a3e0' },
  { dbz: 30, color: '#005588' },
  { dbz: 35, color: '#ffee00' },
  { dbz: 40, color: '#ffaa00' },
  { dbz: 45, color: '#ff4400' },
  { dbz: 50, color: '#c10000' },
  { dbz: 55, color: '#ffaaff' },
  { dbz: 65, color: '#ffffff' }
];
const RADAR_DBZ_MIN = 0;
const RADAR_DBZ_MAX = 65;

function renderRadarLegend(container) {
  container.innerHTML = '';

  const gradientCss = RADAR_GRADIENT_STOPS
    .map(s => `${s.color} ${((s.dbz - RADAR_DBZ_MIN) / (RADAR_DBZ_MAX - RADAR_DBZ_MIN) * 100).toFixed(0)}%`)
    .join(', ');

  const bar = document.createElement('div');
  bar.className = 'radar-gradient-bar';
  bar.style.background = `linear-gradient(to right, ${gradientCss})`;
  container.appendChild(bar);

  const labels = document.createElement('div');
  labels.className = 'radar-gradient-labels';
  labels.innerHTML = `<span>Light</span><span>Moderate</span><span>Heavy</span><span>Hail</span>`;
  container.appendChild(labels);
}

function renderLayerManagerUI() {
  const container = document.getElementById('layer-manager-list');
  container.innerHTML = '';
  layerStack.forEach((entry) => {
    const source = LAYER_SOURCES[entry.id];
    const row = document.createElement('div');
    row.className = 'layer-row';
    row.dataset.id = entry.id;
    row.innerHTML = `
      <button class="icon-btn tiny drag-handle" data-icon="gripHandle" data-id="${entry.id}"></button>
      <label><input type="checkbox" ${entry.on ? 'checked' : ''} data-id="${entry.id}" data-role="toggle" /> ${source.label}</label>
      <input type="range" min="0" max="100" value="${Math.round(entry.opacity * 100)}" data-id="${entry.id}" data-role="opacity" />
    `;
    container.appendChild(row);
  });
  mountIcons(container);

  container.querySelectorAll('[data-role="toggle"]').forEach(cb => cb.onchange = () => setLayerOn(cb.dataset.id, cb.checked));
  container.querySelectorAll('[data-role="opacity"]').forEach(sl => sl.oninput = () => setLayerOpacity(sl.dataset.id, sl.value / 100));
  container.querySelectorAll('.drag-handle').forEach(handle => {
    handle.addEventListener('pointerdown', (e) => startDrag(e, handle.dataset.id));
  });
}

// Press-and-hold drag reordering. Only the grip handle triggers this (not
// the whole row), so it doesn't fight with tapping the checkbox or
// dragging the opacity slider. Uses Pointer Events so the same code
// handles touch and mouse identically.
//
// Key idea: the dragged row is always placed at a stable ABSOLUTE target
// position (its position when the drag started, plus total pointer
// movement since then) - never at a relative offset from wherever it
// happens to sit in the DOM right now. That distinction is what actually
// fixes the jump: every time a reorder moves the row to a different index,
// its NATURAL (untransformed) position in the list changes too, so
// reapplying the same relative delta landed it in the wrong place. Instead,
// every move event measures the row's current natural position fresh and
// computes exactly the transform needed to land it back at the stable
// absolute target - regardless of how many times reordering has moved it
// underneath.
let dragState = null;

function startDrag(e, id) {
  e.preventDefault();
  const container = document.getElementById('layer-manager-list');
  const row = container.querySelector(`.layer-row[data-id="${id}"]`);
  const startRect = row.getBoundingClientRect();

  dragState = {
    id,
    container,
    pointerId: e.pointerId,
    startClientY: e.clientY,
    startTop: startRect.top, // the row's natural top at the very start of the drag - fixed for the whole gesture
    row,
    originalRects: new Map()
  };
  container.querySelectorAll('.layer-row').forEach((r) => {
    dragState.originalRects.set(r.dataset.id, r.getBoundingClientRect());
  });

  row.classList.add('dragging');
  row.setPointerCapture(e.pointerId);
  row.addEventListener('pointermove', onDragMove);
  row.addEventListener('pointerup', onDragEnd);
  row.addEventListener('pointercancel', onDragEnd);
}

function onDragMove(e) {
  if (!dragState || e.pointerId !== dragState.pointerId) return;

  const desiredTop = dragState.startTop + (e.clientY - dragState.startClientY);
  const currentIdx = layerStack.findIndex(l => l.id === dragState.id);
  const desiredMid = desiredTop + dragState.row.offsetHeight / 2;

  let targetIdx = 0;
  for (const entry of layerStack) {
    if (entry.id === dragState.id) continue;
    const rect = dragState.originalRects.get(entry.id);
    if (!rect) continue;
    if (desiredMid > rect.top + rect.height / 2) targetIdx++;
  }

  if (targetIdx !== currentIdx) {
    const [moved] = layerStack.splice(currentIdx, 1);
    layerStack.splice(targetIdx, 0, moved);
    renderLayerManagerUI();

    const newRow = dragState.container.querySelector(`.layer-row[data-id="${dragState.id}"]`);
    newRow.classList.add('dragging');
    newRow.setPointerCapture(dragState.pointerId);
    newRow.addEventListener('pointermove', onDragMove);
    newRow.addEventListener('pointerup', onDragEnd);
    newRow.addEventListener('pointercancel', onDragEnd);
    dragState.row = newRow;

    dragState.originalRects.clear();
    dragState.container.querySelectorAll('.layer-row').forEach((r) => {
      dragState.originalRects.set(r.dataset.id, r.getBoundingClientRect());
    });
  }

  // Always reconcile against the row's ACTUAL current natural position
  // (measured fresh, with transform cleared) rather than trusting any
  // previously-applied offset - this is what stays correct across any
  // number of reorders instead of drifting.
  dragState.row.style.transform = '';
  const naturalTop = dragState.row.getBoundingClientRect().top;
  dragState.row.style.transform = `translateY(${desiredTop - naturalTop}px)`;
}

function onDragEnd(e) {
  if (!dragState || e.pointerId !== dragState.pointerId) return;
  dragState.row.classList.remove('dragging');
  dragState.row.style.transform = '';
  dragState.row.removeEventListener('pointermove', onDragMove);
  dragState.row.removeEventListener('pointerup', onDragEnd);
  dragState.row.removeEventListener('pointercancel', onDragEnd);
  dragState = null;
  saveLayerStack();
  applyLayerStack();
}
function setLayerOn(id, on) {
  layerStack.find(l => l.id === id).on = on;
  if (id === 'weatherRadar' && !on) stopRadarPlaybackIfRunning();
  saveLayerStack();
  renderLayerManagerUI();
  applyLayerStack();
  updateMapOverlays();
}
function setLayerOpacity(id, opacity) {
  layerStack.find(l => l.id === id).opacity = opacity;
  saveLayerStack();
  applyLayerStack();
}

// Shows/hides the floating map-overlay legends and radar controls based on
// current layer state, and populates them the first time each becomes
// visible. Called on startup and whenever a layer is toggled, so these
// stay in sync with the map regardless of which sheet (if any) is open.
// Legends are always shown at full opacity, independent of the layer's
// own transparency slider - they're a reference key, not part of the map
// imagery itself.
function updateMapOverlays() {
  const radarEntry = layerStack.find(l => l.id === 'weatherRadar');
  const radarOverlay = document.getElementById('map-overlay-radar');
  if (radarEntry && radarEntry.on) {
    radarOverlay.classList.remove('hidden');
    renderRadarLegend(document.getElementById('radar-legend'));
    updateRadarPlaybackUI(); // shows "Loading…" immediately if not ready yet
    (async () => {
      try {
        await ensureRadarFrameList();
        await getOrBuildLeafletLayer('weatherRadar'); // builds all frame layers if not already built
        await applyLayerStack(); // attaches them to the map so their tiles actually start loading
        if (!radarLayersFullyLoaded) await waitForAllRadarLayersLoaded();
        else updateRadarPlaybackUI();
      } catch (e) {
        logError(`Failed to load radar frames: ${e.message}`);
      }
    })();
  } else {
    radarOverlay.classList.add('hidden');
  }

  const blmEntry = layerStack.find(l => l.id === 'landOwnership');
  const blmOverlay = document.getElementById('map-overlay-blm');
  if (blmEntry && blmEntry.on) {
    blmOverlay.classList.remove('hidden');
    const legendEl = document.getElementById('blm-legend');
    fetchBlmLegend()
      .then(items => renderLegendSwatches(legendEl, items))
      .catch(e => { legendEl.textContent = 'Legend unavailable.'; logError(`Failed to load BLM legend: ${e.message}`); });
  } else {
    blmOverlay.classList.add('hidden');
  }
}

document.getElementById('btn-radar-play').onclick = toggleRadarPlayback;
document.getElementById('btn-radar-prev').onclick = () => { stopRadarPlaybackIfRunning(); setRadarFrame(radarFrameIndex - 1); };
document.getElementById('btn-radar-next').onclick = () => { stopRadarPlaybackIfRunning(); setRadarFrame(radarFrameIndex + 1); };

document.querySelectorAll('.map-overlay-header').forEach((header) => {
  header.onclick = () => {
    document.getElementById(header.dataset.target).classList.toggle('collapsed');
  };
});

renderLayerManagerUI();
applyLayerStack();
updateMapOverlays();

function applyPreset(preset) {
  for (const id of Object.keys(preset)) {
    const entry = layerStack.find(l => l.id === id);
    if (!entry) continue;
    if (typeof preset[id].on === 'boolean') entry.on = preset[id].on;
    if (typeof preset[id].opacity === 'number') entry.opacity = preset[id].opacity;
  }
  saveLayerStack();
  renderLayerManagerUI();
  applyLayerStack();
}

// Built-in quick presets, shown at the top of the same unified list as
// the user's own saved presets (not as separate standalone buttons).
const BUILT_IN_PRESETS = [
  { name: 'Satellite only', preset: PRESETS.satelliteOnly },
  { name: 'Topo only', preset: PRESETS.topoOnly },
  { name: 'Hybrid', preset: PRESETS.hybrid }
];

// ---------- User-saved layer presets (full stack: order, visibility, opacity) ----------
function getSavedLayerPresets() {
  try { return JSON.parse(localStorage.getItem('layerPresets') || '[]'); } catch (e) { return []; }
}
function saveLayerPresetsToStorage(presets) {
  localStorage.setItem('layerPresets', JSON.stringify(presets));
}

function renderLayerPresetsList() {
  const targetIds = ['saved-layer-presets-list', 'saved-layer-presets-list-data'];
  const presets = getSavedLayerPresets();

  targetIds.forEach((targetId) => {
    const listEl = document.getElementById(targetId);
    if (!listEl) return;
    listEl.innerHTML = '';

    BUILT_IN_PRESETS.forEach(({ name, preset }) => {
      const li = document.createElement('li');
      li.innerHTML = `<span>${name}<br><small>Built-in</small></span>`;
      const actions = document.createElement('span');
      actions.className = 'item-actions';
      const loadBtn = document.createElement('button');
      loadBtn.textContent = 'Load';
      loadBtn.onclick = () => applyPreset(preset);
      actions.appendChild(loadBtn);
      li.appendChild(actions);
      listEl.appendChild(li);
    });

    presets.forEach((preset, index) => {
      const li = document.createElement('li');
      const onLabels = preset.stack.filter(e => e.on).length;
      li.innerHTML = `<span>${preset.name}<br><small>${onLabels} layer(s) on</small></span>`;
      const actions = document.createElement('span');
      actions.className = 'item-actions';
      const loadBtn = document.createElement('button');
      loadBtn.textContent = 'Load';
      loadBtn.onclick = () => {
        layerStack = JSON.parse(JSON.stringify(preset.stack)).filter(l => LAYER_SOURCES[l.id]);
        // Pick up any layer types added since this preset was saved, so an
        // older preset doesn't silently hide brand-new layers forever.
        DEFAULT_LAYER_STACK.forEach((d) => { if (!layerStack.find(l => l.id === d.id)) layerStack.push({ ...d }); });
        saveLayerStack();
        renderLayerManagerUI();
        applyLayerStack();
        updateMapOverlays();
        logInfo(`Layer preset "${preset.name}" loaded.`);
      };
      const delBtn = document.createElement('button');
      delBtn.textContent = 'Delete';
      delBtn.className = 'danger';
      delBtn.onclick = async () => {
        const ok = await askConfirm('Delete preset?', `Delete layer preset "${preset.name}"?`);
        if (!ok) return;
        const updated = getSavedLayerPresets().filter((_, i) => i !== index);
        saveLayerPresetsToStorage(updated);
        renderLayerPresetsList();
      };
      actions.appendChild(loadBtn);
      actions.appendChild(delBtn);
      li.appendChild(actions);
      listEl.appendChild(li);
    });
  });
}
renderLayerPresetsList();

document.getElementById('btn-save-layer-preset').onclick = async () => {
  const name = await askName('Save layer preset as', `Preset ${getSavedLayerPresets().length + 1}`);
  if (name === null) return;
  const presets = getSavedLayerPresets();
  presets.push({ name, stack: JSON.parse(JSON.stringify(layerStack)) });
  saveLayerPresetsToStorage(presets);
  renderLayerPresetsList();
  logInfo(`Layer preset "${name}" saved.`);
};

// ---------- Compass / map rotation ----------
// The needle SVG is drawn with "N" at 0deg (12 o'clock) by construction.
// NOTE: the rotation sign here was flipped from the previous version after
// live testing showed the needle rotating WITH the map instead of staying
// pointed at true north - leaflet-rotate's bearing sign convention turned
// out to be the opposite of what was assumed. If this still looks wrong,
// that hypothesis is now ruled out and it's worth checking the needle SVG
// orientation itself next.
const compassNeedle = document.getElementById('compass-needle');
let continuousNeedleRotation = 0;

function updateCompassDisplay() {
  const rawBearingDeg = map.getBearing ? map.getBearing() : 0;
  let delta = rawBearingDeg - (continuousNeedleRotation % 360);
  delta = ((delta + 180) % 360 + 360) % 360 - 180;
  continuousNeedleRotation += delta;
  compassNeedle.style.transform = `rotate(${continuousNeedleRotation}deg)`;
}
map.on('rotate', updateCompassDisplay);
updateCompassDisplay();

document.getElementById('btn-compass').onclick = () => {
  if (map.setBearing) {
    map.setBearing(0);
    logInfo('Map reset to north-up.');
  }
};

// ---------- GPS / live position with real-time heading arrow ----------
let myMarker = null;
let followMe = true;

const headingArrowIcon = L.divIcon({
  className: '',
  html: `<div style="
    width: 0; height: 0;
    border-left: 9px solid transparent;
    border-right: 9px solid transparent;
    border-bottom: 20px solid #4c8bf5;
    filter: drop-shadow(0 0 2px rgba(0,0,0,0.6));
  "></div>`,
  iconSize: [18, 20],
  iconAnchor: [9, 14]
});

let currentHeadingDeg = 0;
function applyHeadingToMarker() {
  if (!myMarker || !myMarker.setRotation) return;
  myMarker.setRotation(currentHeadingDeg * Math.PI / 180);
}

// Accuracy circle - only shown when the fix is poor (above threshold),
// since a precise-looking dot is misleading when GPS accuracy is actually
// tens of meters wide (common indoors, in canyons, under tree cover).
const ACCURACY_SHOW_THRESHOLD_M = 20;
let accuracyCircle = null;

function updateAccuracyCircle(pos) {
  if (typeof pos.accuracy !== 'number' || pos.accuracy <= ACCURACY_SHOW_THRESHOLD_M) {
    if (accuracyCircle) { map.removeLayer(accuracyCircle); accuracyCircle = null; }
    return;
  }
  if (!accuracyCircle) {
    accuracyCircle = L.circle([pos.lat, pos.lng], {
      radius: pos.accuracy,
      color: '#4c8bf5', weight: 1, fillColor: '#4c8bf5', fillOpacity: 0.12
    }).addTo(map);
  } else {
    accuracyCircle.setLatLng([pos.lat, pos.lng]);
    accuracyCircle.setRadius(pos.accuracy);
  }
}

const sensorMode = Compass.startListening((headingDeg) => {
  currentHeadingDeg = headingDeg;
  applyHeadingToMarker();
});
logInfo(sensorMode ? `Compass sensor active (${sensorMode}).` : 'No compass sensor available - heading will only update from GPS movement.');

GPS.startWatching((pos) => {
  if (pos.error) {
    document.getElementById('gps-status').textContent = `GPS: ${pos.error}`;
    logError(`GPS error: ${pos.error}`);
    return;
  }
  document.getElementById('gps-status').textContent = 'GPS locked';

  if (!sensorMode && typeof pos.heading === 'number' && !isNaN(pos.heading)) {
    currentHeadingDeg = pos.heading;
  }

  if (!myMarker) {
    myMarker = L.marker([pos.lat, pos.lng], { icon: headingArrowIcon, rotation: 0, rotateWithView: true }).addTo(map);
    applyHeadingToMarker();
    logInfo(`First GPS fix received: ${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}`);
  } else {
    myMarker.setLatLng([pos.lat, pos.lng]);
  }
  updateAccuracyCircle(pos);

  if (!hasCenteredOnFirstFix) {
    hasCenteredOnFirstFix = true;
    map.setView([pos.lat, pos.lng], 14);
  } else if (followMe) {
    map.panTo([pos.lat, pos.lng]);
  }

  if (recording) recordPoint(pos);
});

document.getElementById('btn-locate').onclick = () => {
  followMe = true;
  if (myMarker) map.panTo(myMarker.getLatLng());
  else logError('No GPS fix yet - check location permission is granted.');
};
map.on('dragstart', () => { followMe = false; });

// ---------- Universal place search (top bar) ----------
document.getElementById('btn-search').onclick = runTopSearch;
document.getElementById('search-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') runTopSearch();
});

async function runTopSearch() {
  const query = document.getElementById('search-input').value;
  if (!query.trim()) return;
  const resultsBox = document.getElementById('search-results');
  resultsBox.innerHTML = '<div class="result-item">Searching…</div>';
  resultsBox.classList.remove('hidden');
  try {
    const results = await Geocode.search(query);
    if (!results.length) { resultsBox.innerHTML = '<div class="result-item">No results found.</div>'; return; }
    resultsBox.innerHTML = '';
    results.forEach((r) => {
      const item = document.createElement('div');
      item.className = 'result-item';
      item.textContent = r.label;
      item.onclick = () => { map.setView([r.lat, r.lng], 13); resultsBox.classList.add('hidden'); };
      resultsBox.appendChild(item);
    });
  } catch (e) {
    logError(`Search failed: ${e.message}`);
    resultsBox.innerHTML = '<div class="result-item">Search failed - check connection.</div>';
  }
}

// ---------- Flags: tap-to-place with auto-numbering, selectable icons, undo/redo ----------
let flagModeActive = false;
const flagMarkers = new Map();
const DEFAULT_NAME_RE = /^Flag (\d+)$/;
let currentFlagIconType = 'flag';
let flagUndoStack = []; // { type: 'add'|'delete', wp }
let flagRedoStack = [];

function nextDefaultFlagNumber(existingWaypoints) {
  const used = existingWaypoints.map(w => (DEFAULT_NAME_RE.exec(w.name) || [])[1]).filter(Boolean).map(Number);
  return used.length ? Math.max(...used) + 1 : 1;
}

function flagTypeById(id) {
  return FLAG_TYPES.find(t => t.id === id) || FLAG_TYPES[0];
}

function buildFlagDivIcon(iconType) {
  const type = flagTypeById(iconType);
  return L.divIcon({
    className: '',
    html: `<div style="
      width: 30px; height: 30px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg);
      background: ${type.color}; border: 2px solid #171d26; box-shadow: 0 2px 6px rgba(0,0,0,0.5);
      display: flex; align-items: center; justify-content: center;
    "><div style="transform: rotate(45deg); width: 16px; height: 16px; color: #fff;">${ICONS[type.icon]}</div></div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 30]
  });
}

function renderIconPicker(container, selectedId, onSelect) {
  container.innerHTML = '';
  FLAG_TYPES.forEach((type) => {
    const btn = document.createElement('button');
    btn.className = 'icon-picker-btn' + (type.id === selectedId ? ' selected' : '');
    btn.title = type.label;
    btn.style.color = type.color;
    btn.innerHTML = ICONS[type.icon];
    btn.onclick = () => onSelect(type.id);
    container.appendChild(btn);
  });
}

// Icon picker for NEW flags (shown in the flag-mode status pill)
function refreshNewFlagIconPicker() {
  renderIconPicker(document.getElementById('flag-type-picker'), currentFlagIconType, (id) => {
    currentFlagIconType = id;
    document.getElementById('btn-flag-icon-toggle').textContent = `Icon: ${flagTypeById(id).label}`;
    refreshNewFlagIconPicker();
  });
}
refreshNewFlagIconPicker();
document.getElementById('btn-flag-icon-toggle').onclick = () => {
  document.getElementById('flag-type-picker').classList.toggle('hidden');
};

function setFlagMode(on) {
  flagModeActive = on;
  document.getElementById('btn-waypoint').classList.toggle('active', on);
  document.getElementById('flag-status-pill').classList.toggle('hidden', !on);
  if (!on) document.getElementById('flag-type-picker').classList.add('hidden');
  if (on && planningRoute) cancelRoutePlanning();
  updateZoomLock();
  logInfo(on ? 'Flag mode ON - tap the map to drop flags.' : 'Flag mode off.');
}
document.getElementById('btn-waypoint').onclick = () => setFlagMode(!flagModeActive);

function updateFlagUndoRedoButtons() {
  document.getElementById('btn-undo-flag').classList.toggle('disabled', flagUndoStack.length === 0);
  document.getElementById('btn-redo-flag').classList.toggle('disabled', flagRedoStack.length === 0);
}
updateFlagUndoRedoButtons();

document.getElementById('btn-undo-flag').onclick = async () => {
  const action = flagUndoStack.pop();
  if (!action) return;
  try {
    if (action.type === 'add') {
      await Store.deleteWaypoint(action.wp.id);
      const marker = flagMarkers.get(action.wp.id);
      if (marker) { map.removeLayer(marker); flagMarkers.delete(action.wp.id); }
      await renumberDefaultFlags();
    } else {
      await Store.saveWaypoint(action.wp);
      drawWaypointMarker(action.wp);
      await renumberDefaultFlags();
    }
    flagRedoStack.push(action);
    updateFlagUndoRedoButtons();
    logInfo('Flag action undone.');
  } catch (e) {
    logError(`Failed to undo flag action: ${e.message}`);
  }
};

document.getElementById('btn-redo-flag').onclick = async () => {
  const action = flagRedoStack.pop();
  if (!action) return;
  try {
    if (action.type === 'add') {
      await Store.saveWaypoint(action.wp);
      drawWaypointMarker(action.wp);
      await renumberDefaultFlags();
    } else {
      await Store.deleteWaypoint(action.wp.id);
      const marker = flagMarkers.get(action.wp.id);
      if (marker) { map.removeLayer(marker); flagMarkers.delete(action.wp.id); }
      await renumberDefaultFlags();
    }
    flagUndoStack.push(action);
    updateFlagUndoRedoButtons();
    logInfo('Flag action redone.');
  } catch (e) {
    logError(`Failed to redo flag action: ${e.message}`);
  }
};

function drawWaypointMarker(wp) {
  const marker = L.marker([wp.lat, wp.lng], { icon: buildFlagDivIcon(wp.iconType) }).addTo(map);
  marker.bindTooltip(wp.name, { permanent: false });
  marker.on('click', () => {
    if (planningRoute) {
      addRoutePoint({ lat: wp.lat, lng: wp.lng });
      logInfo(`Route point ${routePoints.length} added from flag "${wp.name}".`);
      return;
    }
    openEditFlagDialog(wp, marker);
  });
  flagMarkers.set(wp.id, marker);
  return marker;
}

let editingFlag = null;
let editingFlagIconType = 'flag';

function openEditFlagDialog(wp, marker) {
  editingFlag = { wp, marker };
  editingFlagIconType = wp.iconType || 'flag';
  document.getElementById('wp-name').value = wp.name;
  document.getElementById('wp-notes').value = wp.notes || '';
  refreshEditFlagIconPicker();
  openOverlay('dialog-waypoint');
}

function refreshEditFlagIconPicker() {
  renderIconPicker(document.getElementById('wp-icon-picker'), editingFlagIconType, (id) => {
    editingFlagIconType = id;
    refreshEditFlagIconPicker();
  });
}

document.getElementById('btn-save-waypoint').onclick = async () => {
  if (!editingFlag) return;
  const newName = document.getElementById('wp-name').value.trim() || editingFlag.wp.name;
  const newNotes = document.getElementById('wp-notes').value;
  try {
    const updated = { ...editingFlag.wp, name: newName, notes: newNotes, iconType: editingFlagIconType };
    await Store.saveWaypoint(updated);
    editingFlag.marker.setTooltipContent(newName);
    editingFlag.marker.setIcon(buildFlagDivIcon(editingFlagIconType));
    logInfo(`Flag "${newName}" saved.`);
  } catch (e) {
    logError(`Failed to save flag: ${e.message}`);
  }
  closeOverlay('dialog-waypoint');
  editingFlag = null;
};

document.getElementById('btn-delete-waypoint').onclick = async () => {
  if (!editingFlag) return;
  const { wp, marker } = editingFlag;
  try {
    await Store.deleteWaypoint(wp.id);
    map.removeLayer(marker);
    flagMarkers.delete(wp.id);
    flagUndoStack.push({ type: 'delete', wp });
    flagRedoStack = [];
    updateFlagUndoRedoButtons();
    logInfo(`Flag "${wp.name}" deleted.`);
    await renumberDefaultFlags();
  } catch (e) {
    logError(`Failed to delete flag: ${e.message}`);
  }
  closeOverlay('dialog-waypoint');
  editingFlag = null;
};

async function renumberDefaultFlags() {
  const all = await Store.getWaypoints();
  const defaultOnes = all.filter(w => DEFAULT_NAME_RE.test(w.name)).sort((a, b) => a.createdAt - b.createdAt);
  for (let i = 0; i < defaultOnes.length; i++) {
    const desiredName = `Flag ${i + 1}`;
    if (defaultOnes[i].name !== desiredName) {
      const updated = { ...defaultOnes[i], name: desiredName };
      await Store.saveWaypoint(updated);
      const marker = flagMarkers.get(updated.id);
      if (marker) marker.setTooltipContent(desiredName);
    }
  }
}

// ---------- Unified data layer redraw ----------
let sessionOverlayLines = [];

function clearAllDataLayers() {
  flagMarkers.forEach(m => map.removeLayer(m));
  flagMarkers.clear();
  sessionOverlayLines.forEach(l => map.removeLayer(l));
  sessionOverlayLines = [];
}

async function redrawAllDataFromStore() {
  clearAllDataLayers();
  try {
    const [waypoints, routes, tracks] = await Promise.all([Store.getWaypoints(), Store.getRoutes(), Store.getTracks()]);
    waypoints.forEach(drawWaypointMarker);
    routes.forEach((r) => {
      let dist = 0;
      for (let i = 1; i < r.points.length; i++) dist += GPS.distanceMiles(r.points[i - 1], r.points[i]);
      const latlngs = r.points.map(p => [p.lat, p.lng]);
      const popupHtml = `<b>${r.name}</b><br>${dist.toFixed(2)} mi`;
      // A visible thin line plus an invisible wide one underneath sharing
      // the same popup - the thin line matches the line's real weight
      // visually, but taps register over a much wider margin around it
      // (Leaflet's hit-test area otherwise matches the visual line weight
      // almost exactly, which is what made these hard to tap).
      const hitLine = L.polyline(latlngs, { color: '#000', weight: 22, opacity: 0 }).bindPopup(popupHtml);
      const visibleLine = L.polyline(latlngs, { color: '#ffb703', weight: 3, dashArray: '6,6' }).bindPopup(popupHtml);
      hitLine.addTo(map);
      visibleLine.addTo(map);
      sessionOverlayLines.push(hitLine, visibleLine);
    });
    tracks.forEach((t) => {
      let dist = 0;
      for (let i = 1; i < t.points.length; i++) dist += GPS.distanceMiles(t.points[i - 1], t.points[i]);
      const latlngs = t.points.map(p => [p.lat, p.lng]);
      const popupHtml = `<b>${t.name}</b><br>${dist.toFixed(2)} mi`;
      const hitLine = L.polyline(latlngs, { color: '#000', weight: 22, opacity: 0 }).bindPopup(popupHtml);
      const visibleLine = L.polyline(latlngs, { color: '#e6484f', weight: 3 }).bindPopup(popupHtml);
      hitLine.addTo(map);
      visibleLine.addTo(map);
      sessionOverlayLines.push(hitLine, visibleLine);
    });
    logInfo(`Loaded ${waypoints.length} flag(s), ${routes.length} route(s), ${tracks.length} track(s).`);
  } catch (e) {
    logError(`Failed to load saved data: ${e.message}`);
  }
}
redrawAllDataFromStore();

// ---------- Route planning ----------
let planningRoute = false;
let routePoints = [];
let routeRedoStack = []; // points popped by Undo, restorable by Redo until a new point is added
let routeLine = null;
let routeLineHitbox = null;
let editingRouteId = null;

function startRoutePlanning(prefillPoints = [], existingId = null) {
  if (flagModeActive) setFlagMode(false);
  planningRoute = true;
  editingRouteId = existingId;
  routePoints = [...prefillPoints];
  routeRedoStack = [];
  if (routeLine) { map.removeLayer(routeLine); routeLine = null; }
  if (routeLineHitbox) { map.removeLayer(routeLineHitbox); routeLineHitbox = null; }
  if (routePoints.length) updateRouteLine();
  updateUndoRedoButtons();
  document.getElementById('route-status-pill').classList.remove('hidden');
  document.getElementById('btn-route').classList.add('active');
  updateZoomLock();
  logInfo(existingId ? 'Editing saved route - tap the map or a flag to add points, Finish to re-save.' : 'Route planning started - tap the map or a flag to add points.');
}

function cancelRoutePlanning() {
  planningRoute = false;
  editingRouteId = null;
  routeRedoStack = [];
  document.getElementById('btn-route').classList.remove('active');
  updateZoomLock();
  if (routeLine) { map.removeLayer(routeLine); routeLine = null; }
  if (routeLineHitbox) { map.removeLayer(routeLineHitbox); routeLineHitbox = null; }
  document.getElementById('route-status-pill').classList.add('hidden');
}

// Tapping the route FAB while already in route mode now cancels it - the
// same as tapping the explicit Cancel button - instead of just re-starting
// a fresh empty route every time.
document.getElementById('btn-route').onclick = () => {
  if (planningRoute) cancelRoutePlanning();
  else startRoutePlanning();
};

function updateUndoRedoButtons() {
  document.getElementById('btn-undo-route').classList.toggle('disabled', routePoints.length === 0);
  document.getElementById('btn-redo-route').classList.toggle('disabled', routeRedoStack.length === 0);
}

function addRoutePoint(point) {
  routePoints.push(point);
  routeRedoStack = []; // a fresh point invalidates any pending redo history
  updateRouteLine();
  updateUndoRedoButtons();
}

document.getElementById('btn-undo-route').onclick = () => {
  if (!routePoints.length) return;
  routeRedoStack.push(routePoints.pop());
  updateRouteLine();
  updateUndoRedoButtons();
  logInfo(`Route point undone (${routePoints.length} remaining).`);
};
document.getElementById('btn-redo-route').onclick = () => {
  if (!routeRedoStack.length) return;
  routePoints.push(routeRedoStack.pop());
  updateRouteLine();
  updateUndoRedoButtons();
  logInfo(`Route point redone (${routePoints.length} total).`);
};

function updateRouteLine() {
  if (routeLine) map.removeLayer(routeLine);
  if (routeLineHitbox) map.removeLayer(routeLineHitbox);
  let dist = 0;
  for (let i = 1; i < routePoints.length; i++) dist += GPS.distanceMiles(routePoints[i - 1], routePoints[i]);
  const latlngs = routePoints.map(p => [p.lat, p.lng]);
  const popupHtml = `${dist.toFixed(2)} mi`;
  routeLineHitbox = L.polyline(latlngs, { color: '#000', weight: 22, opacity: 0 }).bindPopup(popupHtml).addTo(map);
  routeLine = L.polyline(latlngs, { color: '#ffb703', weight: 4 }).bindPopup(popupHtml).addTo(map);
  document.getElementById('route-distance').textContent = `${dist.toFixed(2)} mi`;
}

document.getElementById('btn-finish-route').onclick = async () => {
  if (routePoints.length < 2) { logError('Need at least 2 points to save a route - tap the map more before finishing.'); return; }
  const name = await askName('Name this route', 'My Route');
  if (name === null) return;
  try {
    await Store.saveRoute({ id: editingRouteId, name, points: routePoints });
    logInfo(editingRouteId ? `Route "${name}" updated with ${routePoints.length} points.` : `Route "${name}" saved with ${routePoints.length} points.`);
    await redrawAllDataFromStore();
  } catch (e) {
    logError(`Failed to save route: ${e.message}`);
  }
  cancelRoutePlanning();
};
document.getElementById('btn-cancel-route').onclick = cancelRoutePlanning;

// ---------- Single shared map-click handler (flags + route points) ----------
map.on('click', async (e) => {
  if (planningRoute) {
    addRoutePoint({ lat: e.latlng.lat, lng: e.latlng.lng });
    logInfo(`Route point ${routePoints.length} added.`);
    return;
  }
  if (flagModeActive) {
    try {
      const existing = await Store.getWaypoints();
      const num = nextDefaultFlagNumber(existing);
      const wp = await Store.saveWaypoint({ lat: e.latlng.lat, lng: e.latlng.lng, name: `Flag ${num}`, notes: '', iconType: currentFlagIconType });
      drawWaypointMarker(wp);
      flagUndoStack.push({ type: 'add', wp });
      flagRedoStack = [];
      updateFlagUndoRedoButtons();
      logInfo(`Flag "${wp.name}" dropped.`);
    } catch (err) {
      logError(`Failed to drop flag: ${err.message}`);
    }
  }
});

function updateZoomLock() {
  if (flagModeActive || planningRoute) map.doubleClickZoom.disable();
  else map.doubleClickZoom.enable();
}
updateZoomLock();

// ---------- Track recording ----------
let recording = false;
let trackPoints = [];
let trackLine = null;
let trackStart = null;

document.getElementById('btn-record').onclick = () => {
  if (recording) stopRecordingFlow();
  else openOverlay('dialog-start-record');
};
document.getElementById('btn-start-record-yes').onclick = () => { closeOverlay('dialog-start-record'); startRecording(); };
document.getElementById('btn-start-record-no').onclick = () => closeOverlay('dialog-start-record');

function startRecording() {
  recording = true;
  trackPoints = [];
  trackStart = Date.now();
  const btn = document.getElementById('btn-record');
  btn.classList.add('recording');
  btn.innerHTML = ICONS.stop;
  document.getElementById('record-status-pill').classList.remove('hidden');
  logInfo('Track recording started.');
}

function recordPoint(pos) {
  trackPoints.push({ lat: pos.lat, lng: pos.lng, altitude: pos.altitude, timestamp: pos.timestamp });
  if (trackLine) map.removeLayer(trackLine);
  trackLine = L.polyline(trackPoints.map(p => [p.lat, p.lng]), { color: '#e6484f', weight: 4 }).addTo(map);
  let dist = 0;
  for (let i = 1; i < trackPoints.length; i++) dist += GPS.distanceMiles(trackPoints[i - 1], trackPoints[i]);
  const elapsedSec = Math.floor((Date.now() - trackStart) / 1000);
  const mm = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
  const ss = String(elapsedSec % 60).padStart(2, '0');
  document.getElementById('record-stats').textContent = `${dist.toFixed(2)} mi · ${mm}:${ss}`;
}

async function stopRecordingFlow() {
  recording = false;
  const btn = document.getElementById('btn-record');
  btn.classList.remove('recording');
  btn.innerHTML = ICONS.record;
  document.getElementById('record-status-pill').classList.add('hidden');
  if (trackLine) { map.removeLayer(trackLine); trackLine = null; }

  if (trackPoints.length < 2) { logInfo('Recording stopped - not enough points to save.'); return; }
  const name = await askName('Name this track', new Date().toLocaleDateString());
  if (name === null) { logInfo('Track discarded.'); return; }
  try {
    await Store.saveTrack({ name, points: trackPoints, startedAt: trackStart, endedAt: Date.now() });
    await redrawAllDataFromStore();
    logInfo(`Track "${name}" saved with ${trackPoints.length} points.`);
  } catch (e) {
    logError(`Failed to save track: ${e.message}`);
  }
}

// ---------- Region download ----------
let selectedRegion = null;

function renderDownloadLayerChecks() {
  const container = document.getElementById('download-layer-checks');
  container.innerHTML = '';
  Object.values(LAYER_SOURCES).filter(s => s.downloadable).forEach((s) => {
    const label = document.createElement('label');
    label.innerHTML = `<input type="checkbox" checked data-dl-id="${s.id}" /> ${s.label}`;
    container.appendChild(label);
  });
  container.querySelectorAll('input').forEach(cb => cb.addEventListener('input', updateEstimate));
}
renderDownloadLayerChecks();

document.getElementById('btn-region-search').onclick = runRegionSearch;
document.getElementById('region-search-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') runRegionSearch();
});

async function runRegionSearch() {
  const query = document.getElementById('region-search-input').value;
  if (!query.trim()) return;
  const resultsBox = document.getElementById('region-search-results');
  resultsBox.innerHTML = '<div class="result-item">Searching…</div>';
  try {
    const results = await Geocode.search(query);
    const withBbox = results.filter(r => r.bbox);
    if (!withBbox.length) { resultsBox.innerHTML = '<div class="result-item">No downloadable area found for that search.</div>'; return; }
    resultsBox.innerHTML = '';
    withBbox.forEach((r) => {
      const item = document.createElement('div');
      item.className = 'result-item';
      item.innerHTML = `${r.label}<span class="result-type">${r.placeType || ''}</span>`;
      item.onclick = () => selectRegion(r);
      resultsBox.appendChild(item);
    });
  } catch (e) {
    logError(`Region search failed: ${e.message}`);
    resultsBox.innerHTML = '<div class="result-item">Search failed - check connection.</div>';
  }
}

function selectRegion(result) {
  selectedRegion = result;
  document.getElementById('region-selected-name').textContent = result.label;
  document.getElementById('region-selected-info').classList.remove('hidden');
  document.getElementById('region-search-results').innerHTML = '';
  const b = result.bbox;
  map.fitBounds([[b.south, b.west], [b.north, b.east]]);
  updateEstimate();
  logInfo(`Region selected: ${result.label}`);
}

function updateEstimate() {
  if (!selectedRegion) return;
  const bbox = selectedRegion.bbox;
  const minZ = +document.getElementById('zoom-min').value;
  const maxZ = +document.getElementById('zoom-max').value;
  let count = 0;
  for (let z = minZ; z <= maxZ; z++) count += tilesInBboxAtZoom(bbox, z);
  const layerCount = document.querySelectorAll('#download-layer-checks input:checked').length;
  document.getElementById('estimate-readout').textContent =
    `Estimated tiles: ~${(count * layerCount).toLocaleString()} (roughly ${((count * layerCount * 15) / 1024).toFixed(0)} MB)`;
}

function tilesInBboxAtZoom(bbox, z) {
  const n = Math.pow(2, z);
  const x1 = Math.floor(((bbox.west + 180) / 360) * n);
  const x2 = Math.floor(((bbox.east + 180) / 360) * n);
  const y1 = Math.floor(((1 - Math.log(Math.tan(bbox.north * Math.PI / 180) + 1 / Math.cos(bbox.north * Math.PI / 180)) / Math.PI) / 2) * n);
  const y2 = Math.floor(((1 - Math.log(Math.tan(bbox.south * Math.PI / 180) + 1 / Math.cos(bbox.south * Math.PI / 180)) / Math.PI) / 2) * n);
  return Math.abs(x2 - x1 + 1) * Math.abs(y2 - y1 + 1);
}

document.getElementById('zoom-min').addEventListener('input', updateEstimate);
document.getElementById('zoom-max').addEventListener('input', updateEstimate);

document.getElementById('btn-start-download').onclick = async () => {
  if (!selectedRegion) { logError('Search and select a place first.'); return; }
  const layerIds = Array.from(document.querySelectorAll('#download-layer-checks input:checked')).map(cb => cb.dataset.dlId);
  if (!layerIds.length) { logError('Pick at least one layer to download.'); return; }

  const minZoom = +document.getElementById('zoom-min').value;
  const maxZoom = +document.getElementById('zoom-max').value;

  // Reset to 0 every time - previously this only un-hid the bar without
  // resetting its fill, so a second download right after a first one
  // showed a stale full bar until the first progress event arrived.
  document.getElementById('progress-fill').style.width = '0%';
  document.getElementById('progress-text').textContent = '0%';
  document.getElementById('download-progress').classList.remove('hidden');
  logInfo(`Download started: "${selectedRegion.label}", layers=${layerIds.join(',')}, zoom ${minZoom}-${maxZoom}`);

  try {
    await downloadRegion({
      bbox: selectedRegion.bbox, minZoom, maxZoom, layerIds,
      onProgress: (done, total) => {
        const pct = Math.round((done / total) * 100);
        document.getElementById('progress-fill').style.width = pct + '%';
        document.getElementById('progress-text').textContent = `${pct}% (${done}/${total})`;
      },
      onDone: (total) => {
        document.getElementById('progress-text').textContent = `Done - ${total} tiles cached`;
        logInfo(`Download finished: ${total} tiles.`);
        saveRegionRecord({ name: selectedRegion.label, bbox: selectedRegion.bbox, minZoom, maxZoom, layerIds });
        renderRegionsList('saved-map-regions-list-download', 'tile-cache-stats-download');
      }
    });
  } catch (e) {
    logError(`Download failed: ${e.message}`);
  }
};

function saveRegionRecord(region) {
  const regions = JSON.parse(localStorage.getItem('savedRegions') || '[]');
  regions.push({ ...region, savedAt: Date.now() });
  localStorage.setItem('savedRegions', JSON.stringify(regions));
}
function getSavedRegions() {
  return JSON.parse(localStorage.getItem('savedRegions') || '[]');
}
function removeSavedRegionRecord(savedAt) {
  const regions = getSavedRegions().filter(r => r.savedAt !== savedAt);
  localStorage.setItem('savedRegions', JSON.stringify(regions));
}

// Shared renderer - used by BOTH the Download sheet and the Data sheet, so
// downloaded areas and their delete controls show up in both places
// without duplicating the logic.
async function renderRegionsList(listElId, statsElId) {
  try {
    const stats = await getTileCacheStats();
    const totalTiles = Object.values(stats).reduce((a, b) => a + b, 0);
    const usage = await estimateStorageUsage();
    const statsEl = document.getElementById(statsElId);
    if (statsEl) {
      statsEl.textContent = totalTiles > 0
        ? `All cached tiles (downloads + browsing): ${totalTiles} total · ~${usage.usageMB} MB used on device`
        : 'No cached map tiles yet.';
    }
  } catch (e) {
    logError(`Failed to read tile cache stats: ${e.message}`);
  }

  const regions = getSavedRegions();
  const listEl = document.getElementById(listElId);
  if (!listEl) return;
  listEl.innerHTML = '';
  if (!regions.length) listEl.innerHTML = '<li>No downloaded areas yet.</li>';
  regions.forEach((region) => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${region.name}<br><small>${new Date(region.savedAt).toLocaleDateString()} · zoom ${region.minZoom}-${region.maxZoom} · ${region.layerIds.join(', ')}</small></span>`;
    const delBtn = document.createElement('button');
    delBtn.textContent = 'Delete';
    delBtn.className = 'danger';
    delBtn.onclick = async () => {
      const ok = await askConfirm('Delete downloaded area?', `Delete all downloaded tiles for "${region.name}"? You'll need to re-download to view this area offline again.`);
      if (!ok) return;
      try {
        const count = await deleteTilesInRegion(region);
        removeSavedRegionRecord(region.savedAt);
        logInfo(`Deleted ${count} tiles for "${region.name}".`);
        renderRegionsList('saved-map-regions-list-download', 'tile-cache-stats-download');
        renderRegionsList('saved-map-regions-list', 'tile-cache-stats');
      } catch (e) {
        logError(`Failed to delete region tiles: ${e.message}`);
      }
    };
    li.appendChild(delBtn);
    listEl.appendChild(li);
  });
}

async function deleteAllMapDataFlow() {
  const ok = await askConfirm('Delete ALL downloaded map data?', 'This deletes every downloaded map area on this device. Your flags, routes, tracks, and sessions are not affected. This cannot be undone.');
  if (!ok) return;
  try {
    await deleteAllTiles();
    localStorage.removeItem('savedRegions');
    logInfo('All downloaded map data deleted.');
    renderRegionsList('saved-map-regions-list-download', 'tile-cache-stats-download');
    renderRegionsList('saved-map-regions-list', 'tile-cache-stats');
  } catch (e) {
    logError(`Failed to delete all map data: ${e.message}`);
  }
}
document.getElementById('btn-delete-all-maps').onclick = deleteAllMapDataFlow;
document.getElementById('btn-delete-all-maps-download').onclick = deleteAllMapDataFlow;

// ---------- Sessions & Data sheet ----------
let currentSessionName = null;

async function renderDataPanel() {
  document.getElementById('current-session-label').textContent = currentSessionName || 'Unsaved';
  renderLayerPresetsList();

  try {
    const sessions = await Store.getSessions();
    const sessionsList = document.getElementById('saved-sessions-list');
    sessionsList.innerHTML = '';
    sessions.forEach((s) => {
      const li = document.createElement('li');
      li.innerHTML = `<span>${s.name}<br><small>${new Date(s.savedAt).toLocaleString()} · ${s.waypoints.length} flags, ${s.routes.length} routes, ${s.tracks.length} tracks</small></span>`;
      const actions = document.createElement('span');
      actions.className = 'item-actions';
      const loadBtn = document.createElement('button');
      loadBtn.textContent = 'Load';
      loadBtn.onclick = () => loadSessionFlow(s);
      const delBtn = document.createElement('button');
      delBtn.textContent = 'Delete';
      delBtn.className = 'danger';
      delBtn.onclick = async () => {
        const ok = await askConfirm('Delete session?', `Delete saved session "${s.name}"? This can't be undone.`);
        if (ok) { await Store.deleteSession(s.id); logInfo(`Session "${s.name}" deleted.`); renderDataPanel(); }
      };
      actions.appendChild(loadBtn);
      actions.appendChild(delBtn);
      li.appendChild(actions);
      sessionsList.appendChild(li);
    });
  } catch (e) {
    logError(`Failed to list sessions: ${e.message}`);
  }

  try {
    const routes = await Store.getRoutes();
    const routesList = document.getElementById('saved-routes-list');
    routesList.innerHTML = '';
    routes.forEach((r) => {
      let dist = 0;
      for (let i = 1; i < r.points.length; i++) dist += GPS.distanceMiles(r.points[i - 1], r.points[i]);
      const li = document.createElement('li');
      li.innerHTML = `<span>${r.name}<br><small>${dist.toFixed(2)} mi, ${r.points.length} points</small></span>`;
      const actions = document.createElement('span');
      actions.className = 'item-actions';
      const loadBtn = document.createElement('button');
      loadBtn.textContent = 'Load';
      loadBtn.onclick = () => {
        map.fitBounds(r.points.map(p => [p.lat, p.lng]));
        startRoutePlanning(r.points, r.id);
        closeOverlay('sheet-data');
        logInfo(`Loaded route "${r.name}" for editing - tap to add more points, or Finish to re-save.`);
      };
      const delBtn = document.createElement('button');
      delBtn.textContent = 'Delete';
      delBtn.className = 'danger';
      delBtn.onclick = async () => {
        const ok = await askConfirm('Delete route?', `Delete saved route "${r.name}"?`);
        if (ok) { await Store.deleteRoute(r.id); logInfo(`Route "${r.name}" deleted.`); await redrawAllDataFromStore(); renderDataPanel(); }
      };
      actions.appendChild(loadBtn);
      actions.appendChild(delBtn);
      li.appendChild(actions);
      routesList.appendChild(li);
    });
  } catch (e) {
    logError(`Failed to list routes: ${e.message}`);
  }

  renderRegionsList('saved-map-regions-list', 'tile-cache-stats');
}

document.getElementById('btn-save-session').onclick = async () => {
  const name = await askName('Save session as', currentSessionName || `Session ${new Date().toLocaleDateString()}`);
  if (name === null) return;
  try {
    await Store.saveSession(name);
    currentSessionName = name;
    logInfo(`Session "${name}" saved.`);
    renderDataPanel();
  } catch (e) {
    logError(`Failed to save session: ${e.message}`);
  }
};

document.getElementById('btn-new-session').onclick = async () => {
  const hasData = await Store.hasAnyCurrentData();
  if (hasData) {
    const ok = await askConfirm('Start new session?', 'You have unsaved flags, routes, or tracks. Starting a new session will clear them (downloaded map data is never affected). Save first from this menu if you want to keep them.');
    if (!ok) return;
  }
  try {
    await Store.clearCurrentData();
    clearAllDataLayers();
    currentSessionName = null;
    cancelRoutePlanning();
    if (recording) await stopRecordingFlow();
    setFlagMode(false);
    logInfo('New session started.');
    renderDataPanel();
  } catch (e) {
    logError(`Failed to start new session: ${e.message}`);
  }
};

async function loadSessionFlow(session) {
  const hasData = await Store.hasAnyCurrentData();
  if (hasData) {
    const ok = await askConfirm('Load session?', `Loading "${session.name}" will replace your current flags/routes/tracks (downloaded map data is never affected). Save your current work first if you want to keep it.`);
    if (!ok) return;
  }
  try {
    await Store.loadSession(session.id);
    await redrawAllDataFromStore();
    currentSessionName = session.name;
    logInfo(`Session "${session.name}" loaded.`);
    renderDataPanel();
  } catch (e) {
    logError(`Failed to load session: ${e.message}`);
  }
}
