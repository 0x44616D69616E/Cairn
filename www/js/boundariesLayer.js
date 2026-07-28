// boundariesLayer.js
//
// Builds the "Borders (states & countries)" layer from bundled GeoJSON
// (not a tile source - real vector data shipped with the app itself, so
// it works fully offline from first launch). Kept in its own module so
// app.js's generalized layer manager can treat it uniformly alongside
// the tile-based layers via a single async "build this layer" call.

let cachedLayer = null;
let loadPromise = null;

export async function buildBordersLayer(L, opacity) {
  if (cachedLayer) {
    cachedLayer.eachLayer((l) => l.setStyle && l.setStyle({ opacity }));
    return cachedLayer;
  }
  if (!loadPromise) {
    loadPromise = (async () => {
      const [countriesRes, statesRes] = await Promise.all([
        fetch('data/boundaries/world-countries.geojson'),
        fetch('data/boundaries/us-states.geojson')
      ]);
      const [countries, states] = await Promise.all([countriesRes.json(), statesRes.json()]);
      const style = { color: '#e8e8e8', weight: 1, opacity, fill: false };
      cachedLayer = L.layerGroup([
        L.geoJSON(countries, { style: { ...style, weight: 1.4 } }),
        L.geoJSON(states, { style })
      ]);
      return cachedLayer;
    })();
  }
  return loadPromise;
}
