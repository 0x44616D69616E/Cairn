// icons.js
// Clean monoline SVG icon set, 24x24 viewBox, stroke-based, uses currentColor
// so icons inherit whatever color their containing button/element has.
// Replaces emoji throughout the UI.

export const ICONS = {
  flag: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3v18"/><path d="M5 4h11l-2.5 4L16 12H5"/></svg>`,

  route: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="6" r="2.2"/><circle cx="19" cy="18" r="2.2"/><path d="M6.8 7.6C10 11 13 9 15 12s2 4.5 2.2 4.4"/></svg>`,

  record: `<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="7"/></svg>`,

  stop: `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="7" y="7" width="10" height="10" rx="1.5"/></svg>`,

  folder: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a1 1 0 0 1 1-1h4.5l1.5 2H20a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7Z"/></svg>`,

  layers: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 3 8l9 5 9-5-9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 16 9 5 9-5"/></svg>`,

  download: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11"/><path d="m7 11 5 5 5-5"/><path d="M5 20h14"/></svg>`,

  search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m20 20-4.3-4.3"/></svg>`,

  close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>`,

  locate: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="7"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>`,

  settings: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82A1.65 1.65 0 0 0 3 13.09H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/><circle cx="12" cy="12" r="3"/></svg>`,

  trash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/></svg>`,

  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5 9-10"/></svg>`,

  chevronDown: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`,

  chevronUp: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>`,

  menu: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>`,

  edit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16v4Z"/></svg>`,

  gripHandle: `<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>`,

  undo: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M9 7 4 12l5 5"/><path d="M4 12h11a5 5 0 0 1 0 10h-1"/></svg>`,

  redo: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="m15 7 5 5-5 5"/><path d="M20 12H9a5 5 0 0 0 0 10h1"/></svg>`,

  play: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z"/></svg>`,

  flagPointWater: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8 8 5 11.5 5 15a7 7 0 0 0 14 0c0-3.5-3-7-7-13Z"/></svg>`,

  flagPointShelter: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></svg>`,

  flagPointPower: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2 4 14h6l-1 8 9-12h-6z"/></svg>`,

  flagPointPin: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7Z"/><circle cx="12" cy="9" r="2.5" fill="#171d26"/></svg>`,

  flagPointStar: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/></svg>`,

  flagPointChest: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="10" width="18" height="10" rx="1.5"/><path d="M3 10a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4"/><path d="M9 14h6"/></svg>`,

  flagPointDanger: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2 1 21h22Z"/><rect x="11" y="9" width="2" height="6" fill="#171d26"/><rect x="11" y="16.5" width="2" height="2" fill="#171d26"/></svg>`,

  flagPointFood: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 2v7a2 2 0 0 0 4 0V2"/><path d="M9 9v13"/><path d="M17 2c-1.5 0-3 1.5-3 4v4h3v10"/></svg>`,

  flagPointCampfire: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2c1 3-2 4-2 7a2 2 0 0 0 4 0c1 1 2 2.5 2 4.5A6 6 0 0 1 4 13.5C4 9 8 7 12 2Z"/></svg>`,

  flagPointPhoto: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="14" rx="2"/><circle cx="12" cy="13" r="4"/><path d="M8 6l1.5-2h5L16 6"/></svg>`,

  flagPointParking: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 16V7h3.5a3 3 0 0 1 0 6H9"/></svg>`,

  flagPointFlag: `<svg viewBox="0 0 24 24"><path d="M6 2v20" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/><path d="M6 3 19 8l-13 5Z" fill="currentColor"/></svg>`,

  flagPointTent: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 2 20h20Z"/><path d="M9.5 20 12 8l2.5 12"/></svg>`,

  refresh: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/></svg>`,

  sync: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"/><path d="M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>`
};

// Every selectable flag "type" for the flag-mode icon picker, mapping to
// the icon keys above and a color to render them in on the map.
export const FLAG_TYPES = [
  { id: 'flag', label: 'Flag', icon: 'flagPointFlag', color: '#e6484f' },
  { id: 'pin', label: 'Pin', icon: 'flagPointPin', color: '#4c8bf5' },
  { id: 'water', label: 'Water', icon: 'flagPointWater', color: '#2fb6d8' },
  { id: 'shelter', label: 'Shelter', icon: 'flagPointShelter', color: '#c98a4b' },
  { id: 'tent', label: 'Tent/camp', icon: 'flagPointTent', color: '#e0955f' },
  { id: 'campfire', label: 'Campfire', icon: 'flagPointCampfire', color: '#ff8a3d' },
  { id: 'food', label: 'Food/Water source', icon: 'flagPointFood', color: '#5fbf6a' },
  { id: 'power', label: 'Power', icon: 'flagPointPower', color: '#e8c93c' },
  { id: 'parking', label: 'Parking/trailhead', icon: 'flagPointParking', color: '#8a97a8' },
  { id: 'photo', label: 'Photo spot', icon: 'flagPointPhoto', color: '#b06fe0' },
  { id: 'danger', label: 'Danger/hazard', icon: 'flagPointDanger', color: '#e6484f' },
  { id: 'star', label: 'Star/favorite', icon: 'flagPointStar', color: '#f2c94c' },
  { id: 'chest', label: 'Cache/storage', icon: 'flagPointChest', color: '#a97c50' }
];

// Populates every element with a data-icon attribute with the matching
// SVG markup. Call once on startup.
export function mountIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((el) => {
    const name = el.getAttribute('data-icon');
    if (ICONS[name]) el.innerHTML = ICONS[name];
  });
}
