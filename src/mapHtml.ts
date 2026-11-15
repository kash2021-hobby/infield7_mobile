export type MapPerson = {
  userId: string;
  person: string;
  lat: number;
  lng: number;
  site: string | null;
  status?: "onsite" | "field" | "alert";
};

export type MapSite = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radiusM: number;
};

const OSM_STYLE_JS = `{
  version: 8,
  sources: { osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256 } },
  layers: [{ id: "osm", type: "raster", source: "osm" }]
}`;

export function fenceHtml(site: MapSite) {
  const data = JSON.stringify(site).replace(/</g, "\\u003c");
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<link href="https://unpkg.com/maplibre-gl@5.6.1/dist/maplibre-gl.css" rel="stylesheet" />
<style>
html, body, #map { margin: 0; height: 100%; background: #EFEAE0; }
#label {
  position: absolute; left: 50%; top: 46%; transform: translate(40px, -12px);
  padding: 4px 8px; border-radius: 999px; background: #1C2430; color: #fff;
  font-family: ui-monospace, monospace; font-size: 11px; font-weight: 600; z-index: 2; pointer-events: none;
}
</style>
</head>
<body>
<div id="map"></div>
<div id="label">${site.radiusM} m</div>
<script src="https://unpkg.com/maplibre-gl@5.6.1/dist/maplibre-gl.js"></script>
<script>
const site = ${data};
let pin = { lat: site.lat, lng: site.lng };
const map = new maplibregl.Map({
  container: "map",
  style: {
    version: 8,
    sources: { osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256 } },
    layers: [{ id: "osm", type: "raster", source: "osm" }]
  },
  center: [site.lng, site.lat],
  zoom: 15,
});
function ring(lat, lng, radiusM) {
  const points = [];
  const earth = 6378137;
  for (let i = 0; i <= 64; i++) {
    const bearing = (i / 64) * Math.PI * 2;
    const lat1 = lat * Math.PI / 180;
    const lng1 = lng * Math.PI / 180;
    const d = radiusM / earth;
    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(bearing));
    const lng2 = lng1 + Math.atan2(Math.sin(bearing) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
    points.push([lng2 * 180 / Math.PI, lat2 * 180 / Math.PI]);
  }
  return points;
}
function fence(radiusM) {
  return {
    type: "FeatureCollection",
    features: [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring(pin.lat, pin.lng, radiusM)] } }],
  };
}
let radius = site.radiusM;
const marker = new maplibregl.Marker({ color: "#1C2430", draggable: true }).setLngLat([site.lng, site.lat]).addTo(map);
function paint() {
  const source = map.getSource("fences");
  if (source) source.setData(fence(radius));
  const label = document.getElementById("label");
  if (label) label.textContent = radius + " m";
}
marker.on("dragend", () => {
  const next = marker.getLngLat();
  pin = { lat: next.lat, lng: next.lng };
  paint();
  window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: "pin", lat: Number(next.lat.toFixed(6)), lng: Number(next.lng.toFixed(6)) }));
});
map.on("load", () => {
  map.addSource("fences", { type: "geojson", data: fence(site.radiusM) });
  map.addLayer({ id: "fence-fill", type: "fill", source: "fences", paint: { "fill-color": "#3DDC6A", "fill-opacity": 0.18 } });
  map.addLayer({ id: "fence-line", type: "line", source: "fences", paint: { "line-color": "#0E7A3D", "line-width": 2, "line-dasharray": [2, 2] } });
});
window.setRadius = (meters) => {
  radius = meters;
  paint();
};
window.setPin = (lat, lng) => {
  pin = { lat, lng };
  marker.setLngLat([lng, lat]);
  map.flyTo({ center: [lng, lat], zoom: 15 });
  paint();
};
</script>
</body>
</html>`;
}

export function mapHtml(people: MapPerson[], sites: MapSite[]) {
  const data = JSON.stringify({ people, sites }).replace(/</g, "\\u003c");
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
<link href="https://unpkg.com/maplibre-gl@5.6.1/dist/maplibre-gl.css" rel="stylesheet" />
<style>
html, body, #map { margin: 0; height: 100%; background: #EFEAE0; }
.pin {
  width: 28px; height: 28px; border-radius: 50%;
  border: 3px solid #fff; box-shadow: 0 2px 8px rgba(0,0,0,.25);
  color: #1C2430; font: 700 11px sans-serif;
  display: flex; align-items: center; justify-content: center;
}
.pin.onsite { background: #3DDC6A; }
.pin.field { background: #E2B043; }
.pin.alert { background: #D4533E; color: #fff; }
</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/maplibre-gl@5.6.1/dist/maplibre-gl.js"></script>
<script>
const data = ${data};
const map = new maplibregl.Map({
  container: "map",
  style: ${OSM_STYLE_JS},
  center: data.sites[0] ? [data.sites[0].lng, data.sites[0].lat] : [77.5946, 12.9716],
  zoom: 12,
});
const markers = {};
function ring(lat, lng, radiusM) {
  const points = [];
  const earth = 6378137;
  for (let i = 0; i <= 64; i++) {
    const bearing = (i / 64) * Math.PI * 2;
    const lat1 = lat * Math.PI / 180;
    const lng1 = lng * Math.PI / 180;
    const d = radiusM / earth;
    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(bearing));
    const lng2 = lng1 + Math.atan2(Math.sin(bearing) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
    points.push([lng2 * 180 / Math.PI, lat2 * 180 / Math.PI]);
  }
  return points;
}
function initials(name) {
  return (name || "?").split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}
map.on("load", () => {
  map.addSource("fences", {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: data.sites.map((site) => ({
        type: "Feature",
        properties: { id: site.id, name: site.name },
        geometry: { type: "Polygon", coordinates: [ring(site.lat, site.lng, site.radiusM)] },
      })),
    },
  });
  map.addLayer({ id: "fence-fill", type: "fill", source: "fences", paint: { "fill-color": "#3DDC6A", "fill-opacity": 0.12 } });
  map.addLayer({ id: "fence-line", type: "line", source: "fences", paint: { "line-color": "#0E7A3D", "line-width": 2, "line-dasharray": [2, 2] } });
  map.on("click", "fence-fill", (event) => {
    const id = event.features && event.features[0] && event.features[0].properties && event.features[0].properties.id;
    if (id) window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: "site", id }));
  });
  map.on("mouseenter", "fence-fill", () => { map.getCanvas().style.cursor = "pointer"; });
  map.on("mouseleave", "fence-fill", () => { map.getCanvas().style.cursor = ""; });
  for (const site of data.sites) {
    const el = document.createElement("div");
    el.className = "pin onsite";
    el.style.width = "52px";
    el.style.borderRadius = "999px";
    el.style.background = "#1C2430";
    el.style.color = "#fff";
    el.style.zIndex = "6";
    el.textContent = "Site";
    el.onclick = () => window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: "site", id: site.id }));
    new maplibregl.Marker({ element: el }).setLngLat([site.lng, site.lat]).addTo(map);
  }
  for (const person of data.people) {
    const el = document.createElement("div");
    el.className = "pin " + (person.status || "onsite");
    el.textContent = initials(person.person);
    el.onclick = () => window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: "person", id: person.userId }));
    markers[person.userId] = new maplibregl.Marker({ element: el }).setLngLat([person.lng, person.lat]).addTo(map);
  }
});
window.focusPerson = (userId) => {
  const marker = markers[userId];
  if (!marker) return;
  map.flyTo({ center: marker.getLngLat(), zoom: 15 });
};
window.focusSite = (lng, lat) => {
  map.flyTo({ center: [lng, lat], zoom: 16 });
};
window.fitAll = () => {
  const bounds = new maplibregl.LngLatBounds();
  let any = false;
  for (const site of data.sites) { bounds.extend([site.lng, site.lat]); any = true; }
  for (const person of data.people) { bounds.extend([person.lng, person.lat]); any = true; }
  if (any) map.fitBounds(bounds, { padding: 72, maxZoom: 15 });
};
window.zoomIn = () => map.zoomIn();
</script>
</body>
</html>`;
}

export function visitsHtml(stops: { lat: number; lng: number; label: string }[]) {
  const data = JSON.stringify(stops).replace(/</g, "\\u003c");
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
<link href="https://unpkg.com/maplibre-gl@5.6.1/dist/maplibre-gl.css" rel="stylesheet" />
<style>
html, body, #map { margin: 0; height: 100%; background: #EFEAE0; }
.pin {
  width: 28px; height: 28px; border-radius: 50%;
  border: 3px solid #fff; box-shadow: 0 2px 8px rgba(0,0,0,.25);
  background: #3DDC6A; color: #1C2430; font: 700 12px sans-serif;
  display: flex; align-items: center; justify-content: center;
}
</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/maplibre-gl@5.6.1/dist/maplibre-gl.js"></script>
<script>
const stops = ${data};
const map = new maplibregl.Map({
  container: "map",
  style: ${OSM_STYLE_JS},
  center: stops[0] ? [stops[0].lng, stops[0].lat] : [77.5946, 12.9716],
  zoom: 12,
});
map.on("load", () => {
  if (stops.length > 1) {
    map.addSource("route", {
      type: "geojson",
      data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: stops.map((s) => [s.lng, s.lat]) } },
    });
    map.addLayer({ id: "route", type: "line", source: "route", paint: { "line-color": "#0E7A3D", "line-width": 3, "line-dasharray": [2, 1] } });
  }
  const bounds = new maplibregl.LngLatBounds();
  for (const stop of stops) {
    const el = document.createElement("div");
    el.className = "pin";
    el.textContent = stop.label;
    new maplibregl.Marker({ element: el }).setLngLat([stop.lng, stop.lat]).addTo(map);
    bounds.extend([stop.lng, stop.lat]);
  }
  if (stops.length > 1) map.fitBounds(bounds, { padding: 40, maxZoom: 14 });
});
</script>
</body>
</html>`;
}
