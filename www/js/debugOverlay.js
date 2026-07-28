// debugOverlay.js
//
// Since this app is being built and tested entirely on-device (no PC/Chrome
// remote debugging attached), silent JS errors are invisible by default -
// they show up in a desktop devtools console that doesn't exist here.
// This module catches errors and unhandled promise rejections and displays
// them directly on screen so problems are actually visible while testing.
//
// Off by default for normal use - toggled from Settings ("Debug mode").
// When off, nothing is appended to the DOM at all (not just hidden), so it
// costs nothing at runtime for everyday use.

const CHEVRON_DOWN = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`;
const TRASH = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/></svg>`;

const overlay = document.createElement('div');
overlay.id = 'debug-overlay';
overlay.style.cssText = `
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 9999;
  background: rgba(120,0,0,0.94); color: #fff; font-family: "SF Mono", "Roboto Mono", monospace;
  font-size: 11px; display: none;
`;

const header = document.createElement('div');
header.style.cssText = `
  display: flex; justify-content: space-between; align-items: center;
  padding: 6px 10px; background: rgba(80,0,0,0.97); cursor: pointer;
`;
header.innerHTML = `<span>Debug log</span><span style="display:flex; align-items:center; gap:10px;">
  <span id="debug-clear-btn" style="display:flex; cursor:pointer;">${TRASH}</span>
  <span id="debug-toggle-icon" style="display:flex; transition: transform 0.15s ease;">${CHEVRON_DOWN}</span>
</span>`;

const body = document.createElement('div');
body.id = 'debug-overlay-body';
body.style.cssText = `max-height: 40vh; overflow-y: auto; padding: 6px;`;

let collapsed = false;
header.addEventListener('click', () => {
  collapsed = !collapsed;
  body.style.display = collapsed ? 'none' : 'block';
  document.getElementById('debug-toggle-icon').style.transform = collapsed ? 'rotate(-90deg)' : 'rotate(0deg)';
});

overlay.appendChild(header);
overlay.appendChild(body);
document.body.appendChild(overlay);

document.getElementById('debug-clear-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  body.innerHTML = '';
});

let entryCount = 0;
let debugEnabled = localStorage.getItem('debugMode') === 'true'; // off by default

export function setDebugEnabled(on) {
  debugEnabled = on;
  localStorage.setItem('debugMode', on ? 'true' : 'false');
  if (!on) overlay.style.display = 'none';
  else if (entryCount > 0) overlay.style.display = 'block';
}

export function isDebugEnabled() {
  return debugEnabled;
}

export function logError(message) {
  entryCount++;
  if (!debugEnabled) return;
  overlay.style.display = 'block';
  const line = document.createElement('div');
  line.textContent = `[${entryCount}] ${message}`;
  line.style.borderBottom = '1px solid rgba(255,255,255,0.2)';
  line.style.padding = '2px 0';
  body.appendChild(line);
  body.scrollTop = body.scrollHeight;
}

export function logInfo(message) {
  entryCount++;
  if (!debugEnabled) return;
  overlay.style.display = 'block';
  const line = document.createElement('div');
  line.textContent = `[${entryCount}] ${message}`;
  line.style.color = '#9f9';
  line.style.padding = '2px 0';
  body.appendChild(line);
  body.scrollTop = body.scrollHeight;
}

window.addEventListener('error', (e) => {
  logError(`JS Error: ${e.message} (${e.filename}:${e.lineno})`);
});

window.addEventListener('unhandledrejection', (e) => {
  logError(`Promise rejection: ${e.reason}`);
});
