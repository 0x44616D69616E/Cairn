// geocoding.js
//
// Universal location search - works for ANY place on Earth, not tied to
// any specific region. Uses Nominatim, OpenStreetMap's free geocoding
// service (no API key required for reasonable personal-use volume).
//
// Also handles raw "lat,lng" input directly, so pasting coordinates works
// without needing a network request at all - useful if you already know
// exactly where you're going.

export async function search(query) {
  const trimmed = query.trim();

  // Direct "lat,lng" or "lat, lng" input - no network needed.
  const coordMatch = trimmed.match(/^(-?\d+(\.\d+)?)\s*,\s*(-?\d+(\.\d+)?)$/);
  if (coordMatch) {
    const lat = parseFloat(coordMatch[1]);
    const lng = parseFloat(coordMatch[3]);
    return [{ label: `${lat.toFixed(6)}, ${lng.toFixed(6)}`, lat, lng, bbox: null, placeType: 'coordinate' }];
  }

  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=6&q=${encodeURIComponent(trimmed)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Search failed (${res.status})`);
  const results = await res.json();

  return results.map(r => ({
    label: r.display_name,
    lat: parseFloat(r.lat),
    lng: parseFloat(r.lon),
    // Nominatim always returns this for named places (cities, counties,
    // states, countries) - [south, north, west, east] as strings.
    bbox: r.boundingbox ? {
      south: parseFloat(r.boundingbox[0]),
      north: parseFloat(r.boundingbox[1]),
      west: parseFloat(r.boundingbox[2]),
      east: parseFloat(r.boundingbox[3])
    } : null,
    placeType: r.type,      // e.g. "city", "county", "state", "country"
    placeClass: r.class     // e.g. "boundary", "place"
  }));
}
