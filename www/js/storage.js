// storage.js
//
// Handles the on-device "storage folder" setup and export/import of all
// app data. Two different kinds of storage are deliberately kept separate
// here, and it's worth being upfront about the distinction:
//
// 1. LIVE data (map tiles, flags, routes, tracks, sessions, layer presets,
//    settings) stays in IndexedDB/localStorage, which is what the browser
//    engine actually needs for fast reads while the map is in active use.
//    Map tiles alone can be hundreds of MB - that's not something a plain
//    text/JSON file store could handle responsively.
// 2. This module adds an EXPORT/BACKUP path on top of that: writing a
//    single JSON snapshot of everything except the map tiles themselves
//    (which stay cached from their original re-downloadable sources) to a
//    real file in the folder the user chooses, and reading it back in.
//    That's what "setting up storage" means in Settings - establishing
//    where backups go, not relocating the live app data itself.

import * as Store from './dataStore.js';

let CapFilesystem = null;
let CapAllFilesAccess = null;
try {
  // eslint-disable-next-line no-undef
  CapFilesystem = Capacitor?.Plugins?.Filesystem || null;
  // eslint-disable-next-line no-undef
  CapAllFilesAccess = Capacitor?.Plugins?.AllFilesAccess || null;
} catch (e) {
  CapFilesystem = null;
  CapAllFilesAccess = null;
}

// Renamed from 'Cairn' in the Datum rebrand. NOTE: this changes where
// backups are written. Anyone who already had backups in a "Cairn" folder
// will still have them - untouched, on disk - but the app will now look in
// "Datum" and won't list them. Moving the old files across (or re-picking
// the folder) is the migration.
export const STORAGE_DIR = 'Datum'; // subfolder created under wherever the user picks

export function isFilesystemAvailable() {
  return !!CapFilesystem;
}

// ---------- All Files Access (needed only for the real folder browser -
// the Documents/Downloads choice below works without it) ----------
export function isAllFilesAccessPluginAvailable() {
  return !!CapAllFilesAccess;
}

export async function isAllFilesAccessGranted() {
  if (!CapAllFilesAccess) return false;
  const res = await CapAllFilesAccess.isGranted();
  return !!res.granted;
}

export async function requestAllFilesAccess() {
  if (!CapAllFilesAccess) throw new Error('AllFilesAccess plugin not available - run "npm run fix-manifest" and rebuild.');
  await CapAllFilesAccess.requestAccess(); // sends the user to a system Settings screen; resolves immediately, doesn't wait for their choice
}

// ---------- Real folder browsing, once All Files Access is granted -
// lists real subfolders under the external storage root. ----------
export async function listFolders(relativePath) {
  if (!CapFilesystem) throw new Error('Filesystem access is not available in this environment.');
  const res = await CapFilesystem.readdir({ path: relativePath, directory: 'EXTERNAL_STORAGE' });
  return res.files.filter(f => f.type === 'directory').map(f => f.name).sort((a, b) => a.localeCompare(b));
}

// ---------- Storage location setup and backup export/import ----------
// `relativePath` is the folder the user browsed to and picked (relative to
// the external storage root) - '' means the storage root itself. Kept
// optional so the older Documents/Downloads dialog (which only ever
// passes a `directory` constant, no sub-path) still works unchanged.
function backupDir(relativePath) {
  return relativePath ? `${relativePath}/${STORAGE_DIR}` : STORAGE_DIR;
}

export async function setupStorage(directory, relativePath = '') {
  if (!CapFilesystem) throw new Error('Filesystem access is not available in this environment.');
  await CapFilesystem.requestPermissions();
  const dir = backupDir(relativePath);
  try {
    await CapFilesystem.mkdir({ path: dir, directory, recursive: true });
  } catch (e) {
    // mkdir throws if the folder already exists - that's fine, not a real error.
    if (!/exist/i.test(e.message || '')) throw e;
  }
  // Write a small marker file so a future export/import has something to
  // confirm access against, and so the user can see the folder is real by
  // browsing to it themselves.
  await CapFilesystem.writeFile({
    path: `${dir}/README.txt`,
    data: 'This folder holds Datum app data backups (flags, routes, tracks, sessions, layer presets, settings).\nMap tiles are not stored here - they stay cached on the device and can always be re-downloaded from Settings.',
    directory,
    encoding: 'utf8'
  });
  localStorage.setItem('storageConfigured', 'true');
  localStorage.setItem('storageDirectory', directory);
  localStorage.setItem('storageRelativePath', relativePath);
  return true;
}

export function getConfiguredDirectory() {
  return localStorage.getItem('storageDirectory') || 'DOCUMENTS';
}

export function getConfiguredRelativePath() {
  return localStorage.getItem('storageRelativePath') || '';
}

export function isStorageConfigured() {
  return localStorage.getItem('storageConfigured') === 'true';
}

async function gatherAllData() {
  const [waypoints, routes, tracks, sessions] = await Promise.all([
    Store.getWaypoints(), Store.getRoutes(), Store.getTracks(), Store.getSessions()
  ]);
  return {
    exportedAt: new Date().toISOString(),
    waypoints, routes, tracks, sessions,
    layerStack: JSON.parse(localStorage.getItem('layerStack') || 'null'),
    layerPresets: JSON.parse(localStorage.getItem('layerPresets') || '[]'),
    savedRegions: JSON.parse(localStorage.getItem('savedRegions') || '[]'),
    debugMode: localStorage.getItem('debugMode') === 'true'
  };
}

export async function exportAllData() {
  if (!CapFilesystem) throw new Error('Filesystem access is not available in this environment.');
  const data = await gatherAllData();
  const filename = `datum-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  await CapFilesystem.writeFile({
    path: `${backupDir(getConfiguredRelativePath())}/${filename}`,
    data: JSON.stringify(data, null, 2),
    directory: getConfiguredDirectory(),
    encoding: 'utf8'
  });
  return filename;
}

export async function importAllData(filename) {
  if (!CapFilesystem) throw new Error('Filesystem access is not available in this environment.');
  const res = await CapFilesystem.readFile({
    path: `${backupDir(getConfiguredRelativePath())}/${filename}`,
    directory: getConfiguredDirectory(),
    encoding: 'utf8'
  });
  const data = JSON.parse(res.data);

  for (const wp of data.waypoints || []) await Store.saveWaypoint(wp);
  for (const r of data.routes || []) await Store.saveRoute(r);
  for (const t of data.tracks || []) await Store.saveTrack(t);
  // Sessions are saved as named snapshots of current data via Store.saveSession(name),
  // which snapshots whatever is currently loaded - restoring a session record
  // directly isn't supported by that API, so sessions from an import are
  // informational only unless re-saved after loading their data.

  if (data.layerStack) localStorage.setItem('layerStack', JSON.stringify(data.layerStack));
  if (data.layerPresets) localStorage.setItem('layerPresets', JSON.stringify(data.layerPresets));
  if (data.savedRegions) localStorage.setItem('savedRegions', JSON.stringify(data.savedRegions));

  return data;
}

export async function listBackupFiles() {
  if (!CapFilesystem) return [];
  try {
    const res = await CapFilesystem.readdir({ path: backupDir(getConfiguredRelativePath()), directory: getConfiguredDirectory() });
    return res.files.map(f => f.name).filter(n => n.endsWith('.json')).sort().reverse();
  } catch (e) {
    return [];
  }
}
