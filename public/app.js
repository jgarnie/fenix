// Visor y planificador de restauración tras un incendio (común a todos los incendios)
// Los textos propios de cada incendio están en su fire.js (junto a su index.html). Todos los cálculos por píxel se hacen sobre data/grid.bin.gz (rejilla de 25 m generada
// por scripts/build_data.py). Ver la pestaña "Fuentes" para el método.

const $ = (s, el = document) => el.querySelector(s);
const fmt = (n, d = 0) => Number(n).toLocaleString('es-ES', { maximumFractionDigits: d, minimumFractionDigits: d });
const ha = (n) => `${fmt(n)} ha`;
const eur = (n) => n >= 1e6 ? `${fmt(n / 1e6, 2)} M€` : `${fmt(n / 1e3, 0)} k€`;
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

// ------------------------------------------------------------------ datos
const { ACT_INFO, EMERG, FIRE: F } = await import(new URL(`fire.js?v=${Date.now()}`, location.href));
const { POT_INFO } = await import(new URL(`series.js?v=${Date.now()}`, import.meta.url));
// publicada, los datos se sirven desde el repo fenix-data (sin historial); en local, desde la carpeta data/ de cada incendio
const DATA = location.hostname.endsWith('github.io') ? `${location.origin}/fenix-data/${F.dataDir}/data/` : 'data/';
const meta = await (await fetch(`${DATA}meta.json`)).json();
// grid.bin.gz: si el servidor ya lo descomprime (Content-Encoding), llega sin la cabecera gzip 1f 8b
let buf = new Uint8Array(await (await fetch(`${DATA}grid.bin.gz`)).arrayBuffer());
if (buf[0] === 0x1f && buf[1] === 0x8b) buf = new Uint8Array(await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
const { width: W, height: H, stats: S } = meta;
const N = W * H;
const G = Object.fromEntries(meta.layers.map((k, i) => [k, buf.subarray(i * N, (i + 1) * N)]));
const [montes, perimetro, parque, incendios, municipios, ceamZonas] = await Promise.all(
  ['montes', 'perimetro', 'parque_natural', 'incendios_previos', 'municipios', 'ceam_zonas'].map((f) => fetch(`${DATA}${f}.geojson`).then((r) => r.json())),
);
const PIX_HA = meta.pixel_ha;
const leg = meta.legends;
const PUBLIC = (o) => o >= 1 && o <= 3;
const FOREST = (v) => v !== 0 && v !== 10 && v !== 11 && v !== 12;
// fechas de las escenas Sentinel-2
const day = (d, year = true) => new Date(`${d}T12:00:00Z`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', ...(year && { year: 'numeric' }), timeZone: 'UTC' }).replace('sept', 'sep');
const month = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('es-ES', { month: 'short', timeZone: 'UTC' }).replace('sept', 'sep');
const span = (a, b) => (a.slice(0, 4) === b.slice(0, 4) ? `${day(a, false)} → ${day(b, false)}` : `${day(a)} → ${day(b)}`);
const SC = S.scenes;
const CEAM_DATE = SC[S.ceam_scene || 'ahora'];
const CEAM_YEARS = S.fire_year ? +CEAM_DATE.slice(0, 4) - S.fire_year : 0;  // años entre el incendio y la evaluación
const S2_YEARS = [...new Set(Object.values(SC).map((d) => d.slice(0, 4)))].join(', ');
const FIRES_TO = Math.max(...incendios.features.map((f) => f.properties.anyo));
const FIRES_RANGE = `${F.firesFrom}–${FIRES_TO}`;
const HAS_PN = S.pn_ha > 0;

// ------------------------------------------------------------------ paletas y textos
const C = {
  sev: { 1: '#4d9221', 2: '#fee08b', 3: '#fdae61', 4: '#f46d43', 5: '#a50026' },
  sevLbl: { 1: 'No quemado', 2: 'Baja', 3: 'Moderada-baja', 4: 'Moderada-alta', 5: 'Alta' },
  owner: { 0: '#bdbdbd', 1: '#2b83ba', 2: '#7b3294', 3: '#41b6c4', 4: '#fdae61' },
  veg: { 1: '#d95f02', 2: '#1b9e77', 3: '#66a61e', 4: '#a6d854', 5: '#00582a', 6: '#e6ab02', 7: '#1f78b4',
    8: '#b39ddb', 9: '#e1d5ee', 10: '#f5eeb0', 11: '#8c8c8c', 12: '#a6cee3', 13: '#8dd3c7',
    14: '#3f6e3a', 15: '#9c8c4a' },
  pot: Object.fromEntries(Object.entries(POT_INFO).map(([k, v]) => [k, v.color])),
  eros: { 1: '#ffffcc', 2: '#fed976', 3: '#fd8d3c', 4: '#bd0026' },
  act: { 1: '#1a9850', 2: '#fee08b', 3: '#d73027', 4: '#bf812d', 5: '#d9d9d9' },
  feas: { 1: '#d73027', 2: '#fee08b', 3: '#1a9850' },
  recur: { 1: '#fcbba1', 2: '#fb6a4a', 3: '#a50f15' },
  ceam: { 1: '#d73027', 2: '#fee08b', 3: '#1a9850' },
};

// ------------------------------------------------------------------ temas (capas raster)
const val = (k, i) => G[k][i];
const ndviDiff = (i) => (G.ndvi_n[i] - G.ndvi_a[i]) / 100;
const THEMES = {
  sev: { name: 'Severidad del fuego', desc: `dNBR Sentinel-2 (${span(SC.antes, SC.despues)})`, inside: true,
    color: (i) => C.sev[val('sev', i)], legend: () => cats(C.sev, C.sevLbl) },
  owner: { name: '¿Es monte público?', desc: 'Catálogo de montes de utilidad pública (GVA)', inside: false,
    color: (i) => (val('owner', i) ? C.owner[val('owner', i)] : null), legend: () => cats(C.owner, leg.owner, [1, 2, 3, 4]) },
  veg: { name: 'Vegetación antes del incendio', desc: 'Mapa Forestal de España 1:50.000', inside: false,
    color: (i) => C.veg[val('veg', i)], legend: () => cats(C.veg, leg.veg, used('veg')) },
  pot: { name: 'Vegetación que debería haber', desc: 'Mapa de Series de Vegetación de España (MITECO)', inside: false,
    color: (i) => C.pot[val('pot', i)], legend: () => cats(C.pot, Object.fromEntries(Object.entries(POT_INFO).map(([k, v]) => [k, v.corto])), used('pot')) },
  eros: { name: 'Riesgo de erosión', desc: 'Severidad × pendiente', inside: true,
    color: (i) => C.eros[val('eros', i)], legend: () => cats(C.eros, leg.eros) },
  act: { name: 'Actuación recomendada', desc: 'Modelo de decisión (pestaña Cómo)', inside: true,
    color: (i) => C.act[val('act', i)], legend: () => cats(C.act, Object.fromEntries(Object.entries(ACT_INFO).map(([k, v]) => [k, v.corto]))) },
  feas: { name: 'Viabilidad de recuperar la vegetación potencial', desc: 'Índice 0–100 (≈30 años)', inside: true,
    color: (i) => (G.feas[i] ? ramp(G.feas[i] / 100, ['#d73027', '#fc8d59', '#fee08b', '#91cf60', '#1a9850']) : null),
    legend: () => rampLegend(['#d73027', '#fc8d59', '#fee08b', '#91cf60', '#1a9850'], 'Baja', 'Alta') },
  regrow: { name: 'Rebrote observado', desc: `Cambio de NDVI ${span(SC.despues, SC.ahora)}`, inside: true,
    color: (i) => ramp((ndviDiff(i) + 0.15) / 0.3, ['#8c510a', '#d8b365', '#f6e8c3', '#c7eae5', '#5ab4ac', '#01665e']),
    legend: () => rampLegend(['#8c510a', '#d8b365', '#f6e8c3', '#c7eae5', '#5ab4ac', '#01665e'], 'Pierde verde', 'Rebrota') },
  recur: { name: `Incendios anteriores (${FIRES_RANGE})`, desc: 'Nº de veces que ya ardió', inside: false,
    color: (i) => (val('recur', i) ? C.recur[Math.min(3, val('recur', i))] : null),
    legend: () => cats(C.recur, { 1: '1 incendio previo', 2: '2 incendios', 3: '3 o más' }) },
  dry: { name: 'Sequedad antes del incendio', desc: 'Pérdida de humedad (NDMI) de abril a julio, como el análisis del CEAM', inside: false,
    color: (i) => (G.dndmi[i] ? ramp(((G.dndmi[i] - 100) / 100 + 0.2) / 0.25, DRY) : null),
    legend: () => rampLegend(DRY, 'Se secó mucho', 'Sin cambio') },
  ceam: { name: 'Criterio CEAM: ¿reforzar la regeneración?', desc: `Cobertura vegetal estimada el ${CEAM_DATE}; el CEAM lo evalúa a 1–2 años del incendio`, inside: true,
    color: (i) => C.ceam[G.ceam[i]],
    legend: () => `${cats(C.ceam, leg.ceam, [1, 2, 3])}<small class="muted">${CEAM_YEARS >= 1 ? `Medido ${CEAM_DATE}, ${CEAM_YEARS} años después del incendio, dentro del plazo en que lo evalúa el CEAM (1–2 años).` : `Medido ${CEAM_DATE}: aún es pronto. El CEAM evalúa entre 1 y 2 años después del incendio.`}</small>` },
};
const DRY = ['#8c510a', '#d8b365', '#f6e8c3', '#c7eae5', '#35978f'];
const NO_THEME = { name: 'Ninguna (solo imagen)', desc: 'Para comparar libremente las imágenes' };

function used(k) {
  const s = new Set();
  for (let i = 0; i < N; i++) if (G.inside[i]) s.add(G[k][i]);
  return [...s].filter(Boolean).sort((a, b) => a - b);
}
function ramp(t, stops) {
  t = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(t));
  const a = hex(stops[i]), b = hex(stops[i + 1]), f = t - i;
  return a.map((v, j) => Math.round(v + (b[j] - v) * f));
}
function cats(colors, labels, keys) {
  return (keys || Object.keys(colors)).map((k) => `<div class="it"><span class="sw" style="background:${colors[k]}"></span>${labels[k]}</div>`).join('');
}
function rampLegend(stops, a, b) {
  return `<div class="ramp" style="background:linear-gradient(90deg,${stops.join(',')})"></div><div class="ramp-lbl"><span>${a}</span><span>${b}</span></div>`;
}

// ------------------------------------------------------------------ mapa
const map = L.map('map', { zoomControl: false, attributionControl: true, minZoom: 9, maxZoom: 18 });
L.control.zoom({ position: 'bottomright' }).addTo(map);
const bounds = L.latLngBounds(meta.bounds);
const MOBILE = matchMedia('(max-width: 860px)');
// en móvil el panel tapa la parte inferior: centrar el incendio en la zona visible
map.fitBounds(bounds.pad(-0.05), MOBILE.matches ? { paddingTopLeft: [0, 60], paddingBottomRight: [0, innerHeight * 0.42] } : {});

for (const [name, z] of [['imgL', 300], ['imgR', 301], ['theme', 420], ['labels', 440], ['vec', 450]]) {
  map.createPane(name).style.zIndex = z;
}
map.getPane('vec').style.pointerEvents = 'none';
map.getPane('labels').style.pointerEvents = 'none';

L.tileLayer('https://www.ign.es/wmts/ign-base?layer=IGNBaseTodo&style=default&tilematrixset=GoogleMapsCompatible&Service=WMTS&Request=GetTile&Version=1.0.0&Format=image/png&TileMatrix={z}&TileCol={x}&TileRow={y}', {
  attribution: 'Base: <a href="https://www.scne.es">CC BY 4.0 scne.es</a>', maxZoom: 18,
}).addTo(map);
// nombres de pueblos, carreteras y ríos (capa transparente del IGN) por encima de las imágenes y capas temáticas
L.tileLayer('https://www.ign.es/wmts/ign-base?layer=IGNBaseOrto&style=default&tilematrixset=GoogleMapsCompatible&Service=WMTS&Request=GetTile&Version=1.0.0&Format=image/png&TileMatrix={z}&TileCol={x}&TileRow={y}', {
  pane: 'labels', maxZoom: 18, bounds, // solo sobre la zona del incendio: fuera, el mapa base ya tiene los nombres
}).addTo(map);

const IMAGES = {
  ...Object.fromEntries(F.images.map(([k, l]) => [k, { label: `${l} · ${day(SC[k])}`, src: `${DATA}s2_${k}.jpg` }])),
  ...Object.fromEntries(F.swir.map((k) => [`${k}_swir`, { label: `${F.images.find(([x]) => x === k)[1]} · falso color`, src: `${DATA}s2_${k}_swir.jpg` }])),
  pnoa: { label: F.pnoa, tiles: 'https://www.ign.es/wmts/pnoa-ma?layer=OI.OrthoimageCoverage&style=default&tilematrixset=GoogleMapsCompatible&Service=WMTS&Request=GetTile&Version=1.0.0&Format=image/jpeg&TileMatrix={z}&TileCol={x}&TileRow={y}' },
  // ortofotos históricas del PNOA (25 cm): mucho más detalle que Sentinel-2 (10 m), pero una sola fecha por vuelo
  ...Object.fromEntries((F.ortos || []).map((o) => [`orto${o.year}`, { label: `Ortofoto ${o.year} · ${o.label}`, wms: `PNOA${o.year}`, pre: o.pre }])),
  none: { label: 'Mapa base' },
};
const S2_ATTR = `Contiene datos modificados de <a href="https://www.copernicus.eu">Copernicus Sentinel</a> (${S2_YEARS})`;
function makeImage(key, pane) {
  const d = IMAGES[key];
  if (d.tiles) return L.tileLayer(d.tiles, { pane, maxZoom: 19, attribution: 'PNOA: <a href="https://www.scne.es">CC BY 4.0 scne.es</a>' });
  if (d.wms) return L.tileLayer.wms('https://www.ign.es/wms/pnoa-historico', { layers: d.wms, format: 'image/jpeg', pane, maxZoom: 19, attribution: 'PNOA: <a href="https://www.scne.es">CC BY 4.0 scne.es</a>' });
  if (d.src) return L.imageOverlay(d.src, bounds, { pane, attribution: S2_ATTR });
  return null;
}

const cmp = { on: true, left: 'antes', right: 'despues', x: 0.5, layers: {}, shown: {} };
// Con mucho zoom, Sentinel-2 se ve borroso: si hay ortofoto de la misma época (antes o después del
// incendio), se muestra en su lugar; al alejarse vuelve la imagen elegida.
const ORTO_ZOOM = 14;
function shownKey(side) {
  const k = cmp[side];
  const d = IMAGES[k];
  if (!d.src || map.getZoom() < ORTO_ZOOM) return k;
  const pre = SC[k.replace('_swir', '')] < SC.despues;
  return Object.keys(IMAGES).find((o) => IMAGES[o].wms && IMAGES[o].pre === pre) || k;
}
function setImage(side) {
  const pane = side === 'left' ? 'imgL' : 'imgR';
  if (cmp.layers[side]) map.removeLayer(cmp.layers[side]);
  cmp.shown[side] = shownKey(side);
  cmp.layers[side] = makeImage(cmp.shown[side], pane);
  if (cmp.layers[side] && (side === 'right' || cmp.on)) cmp.layers[side].addTo(map);
  updateLabels();
}
const lblL = Object.assign(document.createElement('div'), { className: 'cmp-label' });
const lblR = Object.assign(document.createElement('div'), { className: 'cmp-label' });
$('#mapwrap').append(lblL, lblR);
function updateLabels() {
  const lbl = (side) => { const k = cmp.shown[side] || cmp[side]; return IMAGES[k].label + (k !== cmp[side] ? ' (zoom)' : ''); };
  lblL.textContent = lbl('left');
  lblR.textContent = lbl('right');
  lblL.style.display = cmp.on ? '' : 'none';
}
function clip() {
  const size = map.getSize();
  const nw = map.containerPointToLayerPoint([0, 0]);
  const se = map.containerPointToLayerPoint(size);
  const x = nw.x + size.x * cmp.x;
  map.getPane('imgL').style.clip = cmp.on ? `rect(${nw.y}px, ${x}px, ${se.y}px, ${nw.x}px)` : '';
  map.getPane('imgR').style.clip = cmp.on ? `rect(${nw.y}px, ${se.x}px, ${se.y}px, ${x}px)` : '';
  $('#swipe').style.left = `${cmp.x * 100}%`;
  $('#swipe').classList.toggle('off', !cmp.on);
  lblL.style.left = '12px';
  lblL.style.right = 'auto';
  lblR.style.right = '60px';
  lblL.style.maxWidth = lblR.style.maxWidth = `${Math.max(80, size.x * 0.45)}px`;
}
map.on('move zoom resize viewreset', clip);
map.on('zoomend', () => {
  for (const side of ['left', 'right']) if (shownKey(side) !== cmp.shown[side]) setImage(side);
  clip();
});

for (const side of ['left', 'right']) {
  const sel = $(`#cmp-${side}`);
  sel.innerHTML = Object.entries(IMAGES).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');
  sel.value = cmp[side];
  sel.onchange = () => { cmp[side] = sel.value; setImage(side); clip(); };
}
$('#cmp-toggle').onclick = (e) => {
  cmp.on = !cmp.on;
  e.target.setAttribute('aria-pressed', cmp.on);
  if (cmp.layers.left) cmp.on ? cmp.layers.left.addTo(map) : map.removeLayer(cmp.layers.left);
  updateLabels();
  clip();
};
{
  const handle = $('#swipe .handle');
  let drag = false;
  handle.addEventListener('pointerdown', (e) => { drag = true; handle.setPointerCapture(e.pointerId); map.dragging.disable(); });
  handle.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const r = $('#map').getBoundingClientRect();
    cmp.x = Math.max(0.02, Math.min(0.98, (e.clientX - r.left) / r.width));
    clip();
  });
  const end = () => { drag = false; map.dragging.enable(); };
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
}
setImage('left');
setImage('right');
clip();

// --- capa temática
const canvas = Object.assign(document.createElement('canvas'), { width: W, height: H });
const ctx = canvas.getContext('2d');
const theme = { key: 'none', opacity: 0.75, scope: 'all', insideOnly: true };
let themeLayer = null;
function renderTheme() {
  // los parajes del CEAM y sus etiquetas solo se ven con la capa Criterio CEAM
  vecOn.ceam = theme.key === 'ceam';
  syncVec();
  if (themeLayer) { map.removeLayer(themeLayer); themeLayer = null; }
  const t = THEMES[theme.key];
  renderLegend();
  if (!t) return;
  const img = ctx.createImageData(W, H);
  const d = img.data;
  const inside = t.inside || theme.insideOnly;
  for (let i = 0; i < N; i++) {
    if (inside && !G.inside[i]) continue;
    if (theme.scope === 'public' && !PUBLIC(G.owner[i])) continue;
    if (theme.scope === 'pn' && !G.pn[i]) continue;
    let c = t.color(i);
    if (!c) continue;
    if (typeof c === 'string') c = hex(c);
    d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; d[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  themeLayer = L.imageOverlay(canvas.toDataURL(), bounds, {
    pane: 'theme', opacity: theme.opacity, className: 'pixelated',
    attribution: '© Unión Europea, Copernicus EMS · ICV/GVA · IGME-CSIC · MITECO · Copernicus DEM',
  }).addTo(map);
}
function renderLegend() {
  const t = THEMES[theme.key];
  const el = $('#legend');
  el.style.display = t ? '' : 'none';
  if (t) el.innerHTML = `<h4>${t.name}</h4>${t.legend()}`;
}

// --- vectores
const vec = {
  perimetro: L.geoJSON(perimetro, { pane: 'vec', style: { color: '#111', weight: 1.6, fill: false, dashArray: '1 0' } }),
  montes: L.geoJSON(montes, { pane: 'vec', style: (f) => ({ color: f.properties.owner === 4 ? '#e08214' : '#08519c', weight: 2, fillOpacity: 0, }) }),
  parque: L.geoJSON(parque, { pane: 'vec', style: { color: '#1b7837', weight: 2.2, dashArray: '6 5', fill: false } }),
  incendios: L.geoJSON(incendios, {
    pane: 'vec',
    style: (f) => ({ color: '#7f0000', weight: 1, fillColor: '#ef6548', fillOpacity: 0.12 + Math.min(0.3, (f.properties.anyo - 1993) / 100) }),
  }),
  municipios: L.geoJSON(municipios, {
    pane: 'vec',
    style: { color: '#5b5b5b', weight: 1.4, dashArray: '4 3', fill: false },
    // solo se etiquetan los municipios afectados; el mapa base ya nombra el resto
    onEachFeature: (f, l) => f.properties.ha_quemadas && l.bindTooltip(
      `${f.properties.nom_mun}<br><small>${fmt(f.properties.ha_quemadas)} ha quemadas</small>`,
      { permanent: true, direction: 'center', className: 'mun-label hit' }),
  }),
};
const CEAM_TAG = { mayor: ['#a50026', 'mayor severidad'], menor: ['#1a9850', 'menor severidad'], pendiente: ['#6b6b6b', 'pendiente de evaluar'] };
vec.ceam = L.geoJSON(ceamZonas, {
  pane: 'vec',
  pointToLayer: (f, ll) => L.circleMarker(ll, { radius: 7, color: '#fff', weight: 2, fillColor: CEAM_TAG[f.properties.ceam][0], fillOpacity: 1 })
    .bindTooltip(`${f.properties.nombre}<br><small>CEAM: ${CEAM_TAG[f.properties.ceam][1]}</small>`,
      { permanent: true, direction: 'right', offset: [8, 0], className: 'ceam-label' }),
});
const vecOn = { perimetro: true, montes: true, parque: HAS_PN, incendios: false, municipios: false, ceam: false };
function syncVec() { for (const k in vec) vecOn[k] ? vec[k].addTo(map) : map.removeLayer(vec[k]); }
syncVec();

// ------------------------------------------------------------------ consulta por punto
function pip(pt, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function inFeature(pt, g) {
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
  return polys.some((p) => pip(pt, p[0]) && !p.slice(1).some((h) => pip(pt, h)));
}
const P0 = L.CRS.EPSG3857.project(bounds.getSouthWest());
const P1 = L.CRS.EPSG3857.project(bounds.getNorthEast());
function pixelAt(latlng) {
  const p = L.CRS.EPSG3857.project(latlng);
  const x = Math.floor(((p.x - P0.x) / (P1.x - P0.x)) * W);
  const y = Math.floor(((P1.y - p.y) / (P1.y - P0.y)) * H);
  return x < 0 || y < 0 || x >= W || y >= H ? -1 : y * W + x;
}
let marker = null;
map.on('click', (e) => {
  const i = pixelAt(e.latlng);
  if (i < 0) return;
  if (marker) marker.setLatLng(e.latlng); else marker = L.circleMarker(e.latlng, { radius: 6, color: '#fff', weight: 2, fillColor: '#111', fillOpacity: 1, pane: 'vec' }).addTo(map);
  showInfo(i, e.latlng);
});

function pill(color, text) {
  const c = typeof color === 'string' ? hex(color) : color;
  const dark = c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114 > 160;
  return `<span class="pill" style="background:rgb(${c});color:${dark ? '#222' : '#fff'}">${text}</span>`;
}
function showInfo(i, ll) {
  const pt = [ll.lng, ll.lat];
  const monte = montes.features.find((f) => inFeature(pt, f.geometry));
  const fuegos = incendios.features.filter((f) => inFeature(pt, f.geometry)).map((f) => f.properties.anyo).sort();
  const inside = !!G.inside[i];
  const v = G.veg[i], p = G.pot[i], a = G.act[i], o = G.owner[i], s = G.sev[i], e = G.eros[i];
  const nd = (k) => fmt((G[k][i] - 100) / 100, 2);
  const pi = POT_INFO[p] || POT_INFO[7];
  const ai = ACT_INFO[a];
  const rows = [
    ['Estado', inside ? `Dentro del área quemada · ${pill(C.sev[s] || '#999', 'Severidad ' + (C.sevLbl[s] || 's/d').toLowerCase())}` : `Fuera del área quemada (${F.ems})`],
    ['dNBR', `${fmt((G.dnbr[i] - 100) / 100, 2)}`],
    ['NDVI', `${nd('ndvi_b')} antes → ${nd('ndvi_a')} después → ${nd('ndvi_n')} ahora`],
    ['Vegetación antes', v ? pill(C.veg[v], leg.veg[v]) : 's/d'],
    ['Propiedad', o ? `${pill(C.owner[o], leg.owner[o])}${monte ? `<br><small>${monte.properties.denominacion || ''} ${monte.properties.num_up ? '· nº ' + monte.properties.num_up : ''} · ${monte.properties.municipio}</small>` : ''}` : 'No catalogado como monte público (probablemente privado)'],
    ['Municipio', G.mun[i] ? meta.municipios[G.mun[i] - 1] : 's/d'],
    ...(HAS_PN ? [['Parque Natural', G.pn[i] ? `Sí · ${F.park}` : 'No']] : []),
    ['Sustrato', leg.sub[G.sub[i]] || 's/d'],
    ['Altitud · pendiente', `${fmt(G.elev[i] * 5)} m · ${fmt(G.slope[i])} %`],
    ['Incendios previos', fuegos.length ? fuegos.join(', ') : `Ninguno desde ${F.firesFrom}`],
    [`Sequedad ${month(SC.abril)} → ${month(SC.antes)}`, G.dndmi[i] ? `NDMI ${fmt((G.dndmi[i] - 100) / 100, 2)}` : 's/d'],
    ...(G.ceam[i] ? [['Criterio CEAM', `${pill(C.ceam[G.ceam[i]], leg.ceam[G.ceam[i]])}<br><small>Cobertura vegetal estimada: ${fmt(G.recov[i])} % (${CEAM_DATE}). El CEAM lo evalúa a 1–2 años del incendio.</small>`]] : []),
  ];
  let html = `<button class="close" aria-label="Cerrar">×</button><h3>${inside ? 'Punto afectado' : 'Punto consultado'}</h3><small>${ll.lat.toFixed(5)}, ${ll.lng.toFixed(5)}</small>`;
  html += `<dl>${rows.map(([k, x]) => `<dt>${k}</dt><dd>${x}</dd>`).join('')}</dl>`;
  if (p) {
    html += `<div class="act"><b>Debería haber:</b> ${pill(C.pot[p], pi.corto)}<br><small>${pi.codigo ? `Serie ${pi.codigo}: ` : ''}${pi.serie}</small>
      ${pi.especies ? `<p><b>Especies que la definen</b>${pi.especiesNota ? ` (${pi.especiesNota})` : ''}: <span class="species">${pi.especies}</span></p>` : ''}
      <small class="muted">Mapa de Series de Vegetación (MITECO); especies según la memoria de 2011. Ver Fuentes.</small></div>`;
  }
  if (inside && FOREST(v)) {
    html += `<div class="act"><b>Viabilidad de recuperar la vegetación potencial:</b> <span class="score">${G.feas[i]}</span>/100</div>`;
    if (e >= 3) html += `<div class="act" style="border-left:3px solid ${C.eros[e]}"><b>⚠ ${EMERG.corto}</b> (riesgo ${leg.eros[e].toLowerCase()})<ul>${EMERG.como.map((x) => `<li>${x}</li>`).join('')}</ul></div>`;
    if (ai && a !== 5) html += `<div class="act" style="border-left:3px solid ${C.act[a]}"><b>${ai.corto}</b><p>${ai.que}</p><ul>${ai.como.map((x) => `<li>${x}</li>`).join('')}</ul></div>`;
  }
  const el = $('#info');
  el.innerHTML = html;
  el.classList.remove('hidden');
  $('.close', el).onclick = () => { el.classList.add('hidden'); if (marker) { map.removeLayer(marker); marker = null; } };
}

// ------------------------------------------------------------------ pestañas
document.querySelectorAll('.tabs button').forEach((b) => (b.onclick = () => {
  document.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('active', x === b));
  document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x.id === `tab-${b.dataset.tab}`));
}));

function bars(obj, colors, total) {
  const entries = Object.entries(obj).filter(([, v]) => v > 0);
  const max = total || Math.max(...entries.map(([, v]) => v));
  return `<div class="bars">${entries.map(([k, v]) => {
    const c = colors ? colors(k) : '#888';
    return `<div class="bar"><div class="lbl"><span class="sw" style="background:${c}"></span><span title="${k}">${k}</span></div><div class="val">${ha(v)}</div><div class="track"><div class="fill" style="width:${(v / max) * 100}%;background:${c}"></div></div></div>`;
  }).join('')}</div>`;
}
const byLabel = (legend, colors) => (lbl) => colors[Object.keys(legend).find((k) => legend[k] === lbl)] || '#999';

// --- Resumen
const CEAM_REF = F.ceamRef;
function ceamTable() {
  const g = S.grid_ha, v = S.veg_before, q = S.sequedad;
  const pct = (x) => `${fmt((x / g) * 100)} %`;
  const rel = (a, b) => `${fmt(((b - a) / Math.abs(a)) * 100)} %`;
  const rows = [
    ['Superficie quemada', `${fmt(CEAM_REF.ha)} ha`, `${fmt(g)} ha`, 'Nosotros usamos lo que se ve quemado desde satélite (Copernicus); el CEAM, el perímetro.'],
    ['Dentro del Parque Natural', `${CEAM_REF.pn} %`, pct(S.pn_ha), ''],
    ['Parte del parque quemada', `${CEAM_REF.parque} %`, `${fmt((S.pn_ha / S.pn_total_ha) * 100)} %`, ''],
    ['Severidad más alta', `${CEAM_REF.muyAlta} % "muy alta"`, `${pct(S.severity.Alta || 0)} "alta"`, 'Umbrales distintos: nuestra clase "alta" (dNBR > 0,66) es más amplia.'],
    ['Pinar', `${CEAM_REF.pinar} %`, pct((v['Pinar de pino carrasco'] || 0) + (v['Pinar de rodeno (P. pinaster)'] || 0)), `Más ${pct(v['Bosque mixto pino + frondosas'] || 0)} de bosque mixto.`],
    ['Matorral', `${CEAM_REF.matorral} %`, pct((v.Matorral || 0) + (v['Pastizal-matorral'] || 0)), 'Cartografías distintas: el Mapa Forestal clasifica como bosque mucho pinar ralo.'],
    ['Alcornocal', `${CEAM_REF.alcornocal} %`, pct(v.Alcornocal || 0), ''],
    ['Pérdida de humedad abr → jul', `${CEAM_REF.ndmi} %`, rel(q.ndmi_abril, q.ndmi_julio), `NDMI medio ${fmt(q.ndmi_abril, 2)} → ${fmt(q.ndmi_julio, 2)} (4 abr → 3 jul).`],
    ['Pérdida de verdor abr → jul', `${CEAM_REF.ndvi} %`, rel(q.ndvi_abril, q.ndvi_julio), `NDVI medio ${fmt(q.ndvi_abril, 2)} → ${fmt(q.ndvi_julio, 2)}; depende mucho de las fechas exactas.`],
  ];
  const zonas = ceamZonas.features.map((f) => {
    const p = f.properties;
    const d = p.dnbr_500m;
    const ok = p.ceam === 'mayor' ? d >= 0.44 : p.ceam === 'menor' ? d < 0.44 : null;
    return `<tr><td>${p.nombre}</td><td>${CEAM_TAG[p.ceam][1]}</td><td>${d == null ? 's/d' : fmt(d, 2)}</td><td>${ok == null ? '—' : ok ? '✓ coincide' : '✗ no coincide'}</td></tr>`;
  }).join('');
  return `<table><thead><tr><th>Dato</th><th>CEAM</th><th>Esta app</th></tr></thead><tbody>
      ${rows.map(([a, b, c, n]) => `<tr><td>${a}${n ? `<br><small class="muted">${n}</small>` : ''}</td><td>${b}</td><td>${c}</td></tr>`).join('')}
    </tbody></table>
    <h3>Zonas que cita el CEAM</h3>
    <table><thead><tr><th>Paraje</th><th>CEAM</th><th>dNBR medio (500 m)</th><th></th></tr></thead><tbody>${zonas}</tbody></table>
    <p class="muted">"Coincide" si nuestra severidad media alrededor del paraje es moderada-alta o alta (dNBR ≥ 0,44) donde el CEAM indica mayor severidad,
    y menor donde indica menor severidad. Algunos parajes son zonas amplias y aquí se representan con un punto del Nomenclátor del IGN.
    Las cifras del CEAM son provisionales y proceden de su nota de agosto de 2026.</p>`;
}
// evolución del verdor año a año (solo si hay escenas posteriores, como en Bejís)
function recoveryTable() {
  const q = S.ndvi_serie, r = S.ndvi_serie_ref;
  if (!q || Object.keys(q).length < 4) return '';
  const base = q[SC.despues];
  const rows = Object.keys(q).map((k) => {
    const yrs = +k.slice(0, 4) - S.fire_year;
    const rec = k === SC.antes ? null : Math.max(0, Math.min(1, (q[k] - base) / (r[k] - base)));
    const lbl = k === SC.antes ? 'Antes del incendio' : k === SC.despues ? 'Tras el incendio' : `${yrs} año${yrs > 1 ? 's' : ''} después`;
    return `<tr><td>${lbl}<br><small class="muted">${day(k)}</small></td><td>${fmt(q[k], 2)}</td><td>${fmt(r[k], 2)}</td>
      <td>${rec == null ? '—' : `${fmt(rec * 100)} %<div class="track"><div class="fill" style="width:${rec * 100}%;background:#1a9850"></div></div>`}</td></tr>`;
  }).join('');
  return `<h2>¿Cuánto ha reverdecido?</h2>
    <table class="recov"><thead><tr><th>Imagen</th><th>NDVI quemado</th><th>NDVI sin quemar</th><th>Recuperado</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="muted">NDVI medio (verdor) de lo que ardió con severidad moderada-alta o alta, frente al monte que no ardió, en las mismas fechas.
    "Recuperado" es la parte de la diferencia que ya se ha cerrado desde el incendio. Que vuelva el verde no significa que haya vuelto el bosque:
    los primeros años son sobre todo matorral, hierba y rebrotes.</p>`;
}
{
  const sev = S.severity;
  const sevHigh = (sev['Moderada-alta'] || 0) + (sev.Alta || 0);
  const pine = (S.veg_before['Pinar de pino carrasco'] || 0) + (S.veg_before['Pinar de rodeno (P. pinaster)'] || 0) + (S.veg_before['Bosque mixto pino + frondosas'] || 0)
    + (S.veg_before['Pinar de montaña (P. nigra, P. sylvestris)'] || 0);
  const feas = S.feasibility;
  const feasOk = (feas['Alta (≥70)'] || 0) + (feas['Media (45–70)'] || 0);
  const potLabels = Object.fromEntries(Object.entries(leg.pot).map(([k, v]) => [v, POT_INFO[k]?.corto || v]));
  const potShort = Object.fromEntries(Object.entries(S.potential).map(([k, v]) => [potLabels[k] || k, v]));
  const T = S.arboles;
  const mill = (n) => `${fmt(n / 1e6, 1)} M`;
  const mun = Object.fromEntries(Object.entries(S.municipios || {}).map(([k, v]) => [k, v.total]));
  $('#tab-resumen').innerHTML = `
    <div class="kpis">
      <div class="kpi accent"><b>${F.official.value}</b><span>${F.official.label}</span></div>
      <div class="kpi"><b>${ha(S.ems_ha)}</b><span>área quemada cartografiada por satélite (Copernicus ${F.ems})</span></div>
      <div class="kpi"><b>${ha(S.forest_ha)}</b><span>de esa área era forestal (${fmt((S.forest_ha / S.grid_ha) * 100)} %)</span></div>
      ${HAS_PN ? `<div class="kpi"><b>${ha(S.pn_ha)}</b><span>dentro del Parque Natural de la ${F.park}</span></div>` : ''}
      <div class="kpi accent"><b>${ha(S.public_ha)}</b><span>es monte público catalogado (${fmt((S.public_ha / S.grid_ha) * 100, 1)} %)</span></div>
      <div class="kpi"><b>${ha(S.recurrent_ha)}</b><span>ya había ardido al menos una vez desde ${F.firesFrom}</span></div>
      ${T ? `<div class="kpi accent"><b>≈ ${mill(T.total)} árboles</b><span>en la zona quemada (entre ${mill(T.total_ci90[0])} y ${mill(T.total_ci90[1])})</span></div>
      <div class="kpi accent"><b>≈ ${mill(T.muertos)} muertos</b><span>${F.arbolesNota}</span></div>` : ''}
    </div>
    <div class="callout">
      <b>En pocas palabras.</b> El ${fmt((sevHigh / S.grid_ha) * 100)} % del área ardió con severidad moderada-alta o alta.
      Antes dominaban los pinares (${ha(pine)}), pero en la mayor parte de este terreno la vegetación natural sería
      ${F.potential}. Es viable recuperar esa vegetación en
      <b>${ha(feasOk)}</b> (${fmt((feasOk / S.forest_ha) * 100)} % del área forestal), parte de forma natural y parte con ayuda.
      ${S.public_ha / S.grid_ha < 0.1 ? 'Casi todo es <b>propiedad privada</b>, así que el plan depende de acuerdos con propietarios.'
        : `El ${fmt((S.public_ha / S.grid_ha) * 100)} % es <b>monte público</b>, donde la Generalitat puede actuar directamente; en el resto, sobre todo privado, hacen falta acuerdos con los propietarios.`}
      ${F.calloutExtra ? F.calloutExtra(S, ha) : ''}
    </div>
    <h2>Severidad del fuego</h2>
    ${bars(sev, byLabel(C.sevLbl, C.sev))}
    <h2>Qué había antes</h2>
    ${bars(S.veg_before, byLabel(leg.veg, C.veg))}
    <h2>Qué debería haber (vegetación potencial)</h2>
    ${bars(potShort, (k) => C.pot[Object.keys(POT_INFO).find((i) => POT_INFO[i].corto === k)])}
    <h2>Por municipio</h2>
    ${bars(mun, () => '#7a6a5a')}
    <p class="muted">${F.munNota || 'Superficie vista quemada por satélite; las cifras oficiales por municipio suelen ser mayores porque usan el perímetro exterior.'}</p>
    ${T ? `<h2>¿Cuántos árboles ardieron?</h2>
    <table><thead><tr><th>Tipo de bosque</th><th>ha</th><th>árboles/ha</th><th>árboles</th></tr></thead><tbody>
      ${Object.entries(T.por_clase).filter(([, c]) => c.arboles > 0).map(([k, c]) => `<tr><td>${k}</td><td>${fmt(c.ha)}</td><td>${fmt(c.pies_ha)}</td><td>${fmt(c.arboles)}</td></tr>`).join('')}
    </tbody><tfoot><tr><td>Total</td><td></td><td></td><td>${fmt(T.total)}</td></tr></tfoot></table>
    <p class="muted">Árboles con tronco de al menos 7,5 cm de diámetro, según ${T.parcelas_dentro} parcelas del Inventario Forestal Nacional
    (IFN3, medidas en 2006) que caen dentro del área quemada. De ellos, unos ${mill(T.muertos_coniferas)} pinos habrían muerto (no rebrotan)
    y unas ${fmt(T.muertos_frondosas / 1e3)} mil frondosas; el resto de frondosas (${mill(T.frondosas - T.muertos_frondosas)}) debería rebrotar.
    No incluye árboles jóvenes ni dispersos en el matorral.${T.ha_ardidas_tras_ifn ? ` Tampoco cuenta ${ha(T.ha_ardidas_tras_ifn)} que volvieron
    a arder después del inventario (sobre todo en el incendio de Andilla de 2012): allí solo había regenerado joven.` : ''} Ver método en Fuentes.</p>` : ''}
    ${recoveryTable()}
    ${CEAM_REF ? `<h2>Comparación con el CEAM</h2>${ceamTable()}` : ''}
    <h2>¿De quién es?</h2>
    ${bars(S.owner, byLabel(leg.owner, C.owner))}
    <h2>¿Es posible recuperarlo?</h2>
    ${bars(feas, byLabel(leg.feas, C.feas))}
    <p class="muted">Viabilidad de llegar a la vegetación potencial en ~30 años, combinando severidad, capacidad de rebrote
    de lo que había, incendios previos, pendiente y el rebrote ya visible por satélite. Pulsa cualquier punto del mapa para ver su ficha.</p>
  `;
}

// --- Mapa (capas)
{
  const opts = { none: NO_THEME, ...THEMES };
  $('#tab-capas').innerHTML = `
    <h2>Capa de análisis</h2>
    <div class="layer-list">${Object.entries(opts).map(([k, t]) => `
      <label class="layer-opt ${k === theme.key ? 'active' : ''}" data-k="${k}">
        <input type="radio" name="theme" value="${k}" ${k === theme.key ? 'checked' : ''}>
        <div><b>${t.name}</b><small class="muted">${t.desc}</small></div>
      </label>`).join('')}</div>
    <div class="row"><label>Opacidad <input type="range" id="op" min="0" max="1" step="0.05" value="${theme.opacity}"></label></div>
    <h3>Mostrar solo</h3>
    <div class="seg" id="scope">
      <button class="chip on" data-s="all">Todo</button>
      <button class="chip" data-s="public">Monte público</button>
      ${HAS_PN ? '<button class="chip" data-s="pn">Parque Natural</button>' : ''}
    </div>
    <div class="row"><label><input type="checkbox" id="insideOnly" checked> Solo dentro del área quemada</label></div>
    <h2>Límites</h2>
    <div class="row" style="flex-direction:column;align-items:flex-start;gap:6px">
      <label><input type="checkbox" data-v="perimetro" checked> Área quemada (Copernicus EMS)</label>
      <label><input type="checkbox" data-v="montes" checked> Montes de utilidad pública <span class="sw" style="background:#08519c"></span></label>
      ${HAS_PN ? `<label><input type="checkbox" data-v="parque" checked> Parque Natural ${F.park} <span class="sw" style="background:#1b7837"></span></label>` : ''}
      <label><input type="checkbox" data-v="municipios"> Términos municipales <span class="sw" style="background:#5b5b5b"></span></label>
      <label><input type="checkbox" data-v="incendios"> Incendios ${FIRES_RANGE} <span class="sw" style="background:#ef6548"></span></label>
    </div>
    <h2>Imágenes</h2>
    <p class="muted">Usa los selectores de la parte superior del mapa y arrastra la barra central para comparar.
    El <b>falso color</b> (SWIR-NIR-rojo) muestra lo quemado en rojo oscuro y la vegetación viva en verde.</p>
    <div class="seg">
      ${F.presets.map(([p, l]) => `<button class="chip" data-p="${p}">${l}</button>`).join('')}
    </div>
  `;
  document.querySelectorAll('input[name=theme]').forEach((r) => (r.onchange = () => {
    theme.key = r.value;
    document.querySelectorAll('.layer-opt').forEach((x) => x.classList.toggle('active', x.dataset.k === r.value));
    renderTheme();
  }));
  $('#op').oninput = (e) => { theme.opacity = +e.target.value; themeLayer?.setOpacity(theme.opacity); };
  document.querySelectorAll('#scope .chip').forEach((b) => (b.onclick = () => {
    theme.scope = b.dataset.s;
    document.querySelectorAll('#scope .chip').forEach((x) => x.classList.toggle('on', x === b));
    renderTheme();
  }));
  $('#insideOnly').onchange = (e) => { theme.insideOnly = e.target.checked; renderTheme(); };
  document.querySelectorAll('[data-v]').forEach((c) => (c.onchange = () => { vecOn[c.dataset.v] = c.checked; syncVec(); }));
  document.querySelectorAll('[data-p]').forEach((b) => (b.onclick = () => {
    const [l, r] = b.dataset.p.split('|');
    Object.assign(cmp, { left: l, right: r });
    $('#cmp-left').value = l; $('#cmp-right').value = r;
    if (!cmp.on) $('#cmp-toggle').click();
    setImage('left'); setImage('right'); clip();
  }));
}

// --- Plan
// Precios unitarios: Tarifas forestales de la Junta de Extremadura, actualización 2024
// (precios de ejecución material). La Generalitat Valenciana no publica su tabla unitaria.
const TARIFA = 'Tarifas forestales Junta de Extremadura 2024';
const DESGLOSE = {
  emerg: [['C.4.06', 'Corta y apilado de árboles y restos formando fajinas cada 10 m', '1 ha', 2203.64]],
  1: [['G.2.09', 'Parcela de inventario con GPS (1 cada 10 ha, 3 campañas)', '0,3 ud', 0.3 * 55.64]],
  2: [
    ['C.1.01', 'Apertura de hoyo manual, pendiente <50 %, <700 hoyos/ha', '500 hoyos', 0.5 * 2239.42],
    ['C.2.21', 'Planta de Quercus en envase y plantación, con 20 % de reposición de marras', '500 ud', 500 * 2.24],
    ['C.3.87', 'Protector de malla rígida 90 mm × 60 cm colocado', '500 ud', 500 * 1.77],
  ],
  3: [
    ['C.1.02', 'Apertura de hoyo manual, pendiente <50 %, >700 hoyos/ha', '1.000 hoyos', 2035.60],
    ['C.2.21 / C.2.22', 'Planta de Quercus u otras frondosas y plantación, con 20 % de marras', '1.000 ud', 1000 * 2.24],
    ['C.3.87', 'Protector de malla rígida 90 mm × 60 cm colocado', '1.000 ud', 1000 * 1.77],
    ['C3.118', 'Un riego de apoyo el primer verano (distancia <3 km)', '1.000 plantas', 917.67],
  ],
  4: [],
};
const RECARGO = {
  pem: { f: 1, lbl: 'Ejecución material (solo tarifa)' },
  vaersa: { f: 1.0747, lbl: 'Encargo a VAERSA (+5,16 % GG +2,31 % CI, sin IVA)' },
  licita: { f: 1.19 * 1.21, lbl: 'Contrato licitado (+13 % GG +6 % BI, +21 % IVA)' },
};
const plan = {
  scope: 'mixto',
  cost: { emerg: EMERG.coste, 1: ACT_INFO[1].coste, 2: ACT_INFO[2].coste, 3: ACT_INFO[3].coste, 4: ACT_INFO[4].coste },
  budget: F.plan.budget,
  recargo: 'vaersa',
};
function planAreas() {
  const r = { emerg: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
  for (let i = 0; i < N; i++) {
    if (!G.inside[i]) continue;
    const pub = PUBLIC(G.owner[i]);
    const longTerm = plan.scope === 'todo' || pub;
    const emerg = plan.scope !== 'publico' || pub;
    if (emerg && G.eros[i] >= 3) r.emerg += PIX_HA;
    const a = G.act[i];
    if (longTerm && a >= 1 && a <= 4) r[a] += PIX_HA;
  }
  return r;
}
function renderPlan() {
  const A = planAreas();
  const rows = [['emerg', EMERG.corto], [1, ACT_INFO[1].corto], [2, ACT_INFO[2].corto], [3, ACT_INFO[3].corto], [4, ACT_INFO[4].corto]].map(([k, n]) => [k, n, F.plan.when[k]]);
  let total = 0;
  const body = rows.map(([k, name, when]) => {
    const t = A[k] * plan.cost[k] * RECARGO[plan.recargo].f;
    total += t;
    const sw = k === 'emerg' ? C.eros[4] : C.act[k];
    return `<tr><td><span class="sw" style="display:inline-block;background:${sw};vertical-align:-1px"></span> ${name}<br><small class="muted">${when}</small></td>
      <td>${fmt(A[k])}</td><td><input type="number" min="0" step="100" data-c="${k}" value="${plan.cost[k]}"></td><td>${eur(t)}</td></tr>`;
  }).join('');
  const pct = Math.min(100, (plan.budget / total) * 100);
  $('#plan-table').innerHTML = `<table><thead><tr><th>Actuación</th><th>ha</th><th>€/ha</th><th>Coste</th></tr></thead>
    <tbody>${body}</tbody><tfoot><tr><td>Total</td><td></td><td></td><td>${eur(total)}</td></tr></tfoot></table>
    <div class="row"><label>Forma de ejecución <select id="recargo">${Object.entries(RECARGO).map(([k, r]) => `<option value="${k}" ${k === plan.recargo ? 'selected' : ''}>${r.lbl}</option>`).join('')}</select></label></div>
    <div class="budget"><p>Presupuesto de referencia: <input type="number" id="budget" step="100000" min="0" value="${plan.budget}" style="width:110px"> €
    → cubre el <b>${fmt(pct)} %</b> de este escenario${total > plan.budget ? `; faltarían <b>${eur(total - plan.budget)}</b>` : ''}.</p>
    <div class="track"><div class="fill" style="width:${pct}%"></div></div></div>`;
  document.querySelectorAll('[data-c]').forEach((inp) => (inp.onchange = () => { plan.cost[inp.dataset.c] = +inp.value || 0; renderPlan(); }));
  $('#budget').onchange = (e) => { plan.budget = +e.target.value || 0; renderPlan(); };
  $('#recargo').onchange = (e) => { plan.recargo = e.target.value; renderPlan(); };
}
{
  const ac = S.actions;
  const k = (n) => ac[ACT_INFO[n] && leg.act[n]] || { total: 0, publico: 0, privado: 0 };
  $('#tab-plan').innerHTML = `
    <h2>¿Cuánto se puede hacer y cuánto cuesta?</h2>
    <p>Cada píxel quemado tiene asignada una actuación (capa <i>Actuación recomendada</i>). Los €/ha por defecto se han calculado con
    precios unitarios oficiales (${TARIFA}); puedes cambiarlos. Abajo tienes el desglose de cada uno.</p>
    <div class="seg" id="pscope">
      <button class="chip" data-s="publico">Solo monte público</button>
      <button class="chip on" data-s="mixto">Público + erosión urgente en privado</button>
      <button class="chip" data-s="todo">Todo el área quemada</button>
    </div>
    <div id="plan-table"></div>
    <p class="muted">${F.plan.ref}</p>
    <h2>De dónde salen los €/ha</h2>
    ${[['emerg', EMERG], [1, ACT_INFO[1]], [2, ACT_INFO[2]], [3, ACT_INFO[3]]].map(([key, a]) => {
      const d = DESGLOSE[key];
      const tot = d.reduce((x, r) => x + r[3], 0);
      return `<details><summary>${a.corto}: ${fmt(tot)} €/ha</summary><table><thead><tr><th>Partida</th><th>Cantidad/ha</th><th>€/ha</th></tr></thead><tbody>
        ${d.map(([cod, desc, q, v]) => `<tr><td><small class="muted">${cod}</small> ${desc}</td><td>${q}</td><td>${fmt(v)}</td></tr>`).join('')}
        </tbody></table></details>`;
    }).join('')}
    <p class="muted">Contraste con otras fuentes: el Colegio de Ingenieros de Montes da 1.500–4.000 €/ha para fajinas y albarradas y
    3.000–5.000 €/ha para reforestar; la Xunta de Galicia subvenciona 4.230 €/ha la plantación de frondosas a ≥1.000 pies/ha.
    No incluido: acolchado con paja, retirada de madera quemada (C.4/B.1.16: 1.987 €/ha), cerramientos frente al ganado ni clareos futuros del pinar (663–1.737 €/ha).
    Los jornales de Extremadura (peón 11,08 €/h) pueden ser algo más bajos que en Castellón.</p>
    <h2>Superficie por actuación y propiedad</h2>
    <table><thead><tr><th>Actuación</th><th>Público</th><th>Privado</th></tr></thead><tbody>
      ${[1, 2, 3, 4].map((n) => `<tr><td>${ACT_INFO[n].corto}</td><td>${fmt(k(n).publico)}</td><td>${fmt(k(n).privado)}</td></tr>`).join('')}
    </tbody></table>
    <div class="callout"><b>El reto es la propiedad.</b> Solo el ${fmt((S.public_ha / S.grid_ha) * 100, 1)} % del área quemada es monte público catalogado.
    Para actuar en el resto hacen falta herramientas para propietarios privados:
    <ul>
      <li><b>Declaración de zona de actuación urgente</b> para trabajos de emergencia (erosión) en cualquier propiedad.</li>
      <li><b>Convenios o consorcios</b> entre la Generalitat y los propietarios para ejecutar la restauración.</li>
      <li><b>Agrupaciones de propietarios</b> y <b>custodia del territorio</b> (asociaciones, fundaciones) para gestionar fincas pequeñas.</li>
      <li><b>Ayudas FEADER/PAC</b> a la reforestación y a la recuperación de cultivos de secano como mosaico cortafuegos.</li>
      <li><b>Mercado voluntario de carbono y patrocinio</b> (Registro de huella de carbono del MITECO) para financiar plantaciones.</li>
    </ul></div>
  `;
  document.querySelectorAll('#pscope .chip').forEach((b) => (b.onclick = () => {
    plan.scope = b.dataset.s;
    document.querySelectorAll('#pscope .chip').forEach((x) => x.classList.toggle('on', x === b));
    renderPlan();
  }));
  renderPlan();
}

// --- Cómo
{
  const act = (a) => `<details><summary><span class="sw" style="display:inline-block;background:${a === EMERG ? C.eros[4] : C.act[Object.keys(ACT_INFO).find((k) => ACT_INFO[k] === a)]}"></span> ${a.corto}</summary><p>${a.que}</p><ul>${a.como.map((x) => `<li>${x}</li>`).join('')}</ul></details>`;
  $('#tab-como').innerHTML = `
    <div class="callout"><b>Protocolo de la Fundación CEAM</b> (manual Postfire-DSS). Las actuaciones de emergencia para conservar el suelo
    y regular el agua se hacen en las primeras semanas o meses, antes de las lluvias fuertes de otoño. El refuerzo de la regeneración se plantea
    generalmente <b>entre uno y dos años después del incendio</b>, cuando se puede comprobar qué rebrota:
    <ul>
      <li>Si las especies leñosas rebrotadoras cubren <b>más del 60 %</b> del terreno, la regeneración es favorable y normalmente no hace falta reforzarla.</li>
      <li><b>Entre el 30 y el 60 %</b>, cada decisión se toma después de analizar la zona.</li>
      <li><b>Por debajo del 30 %</b>, puede estudiarse una plantación o siembra selectiva.</li>
      <li>Una regeneración natural de <b>1.000–3.000 pies por hectárea</b> puede considerarse suficiente.</li>
    </ul>
    La capa <i>Criterio CEAM</i> aproxima esa cobertura por satélite. Con la imagen del ${CEAM_DATE} da
    ${Object.entries(S.ceam).map(([k, x]) => `${ha(x.total)} en ${k.split(':')[0]}`).join(', ')}.
    ${typeof F.ceamNow === 'function' ? F.ceamNow(S, ha) : F.ceamNow}</div>
    <h2>Calendario</h2>
    <div class="timeline">${F.timeline}
    </div>
    <h2>Actuaciones</h2>
    ${act(EMERG)}${[1, 2, 3, 4].map((n) => act(ACT_INFO[n])).join('')}
    <h2>Vegetación potencial de la zona</h2>
    <p class="muted">Series del Mapa de Series de Vegetación de España (Rivas-Martínez, 1987; MITECO) presentes en el área quemada.
    Las especies son las que nombra la descripción oficial de cada serie (Rivas-Martínez et al., 2011). Indican hacia dónde evolucionaría
    el bosque; no son una lista de plantación, que debe decidir un técnico con planta de la región de procedencia local.</p>
    ${used('pot').filter((k) => k !== 7).map((k) => { const p = POT_INFO[k]; return `<details><summary><span class="sw" style="display:inline-block;background:${C.pot[k]}"></span> ${p.corto}</summary>
      <p><small class="muted">Serie ${p.codigo}: ${p.serie}</small></p><p>${p.piso}</p>${p.especies ? `<p><b>Especies que la definen:</b> <span class="species">${p.especies}</span></p>` : ''}
      ${p.revision ? `<p class="muted">${p.revision}</p>` : ''}</details>`; }).join('')}
    <h2>Lo que conviene evitar</h2>
    <ul>
      <li>Repoblar de forma masiva con pino antes de saber qué regenera solo.</li>
      <li>Sacar la madera con maquinaria pesada en pendientes fuertes: multiplica la erosión.</li>
      <li>Desbrozar o "limpiar" el monte quemado: elimina rebrotes y deja el suelo desnudo.</li>
      <li>Usar planta de origen desconocido: debe venir de la región de procedencia local.</li>
      <li>Voluntariado sin coordinación: cualquier plantación o recogida de semillas, siempre con la Generalitat o el ayuntamiento.</li>
    </ul>
    <h2>Cómo puede ayudar la ciudadanía</h2>
    <ul>
      <li>Registrar observaciones de rebrote con fotos geolocalizadas (p. ej. iNaturalist) para el seguimiento.</li>
      <li>Participar en jornadas de voluntariado oficiales de siembra y plantación (otoño-invierno).</li>
      <li>${F.ayuda}</li>
    </ul>
  `;
}

// --- Fuentes
$('#tab-fuentes').innerHTML = `
  <h2>Datos</h2>
  <ul>
    ${F.fuentesDatos(S)}
    <li><b>Imágenes:</b> Sentinel-2 L2A (${Object.values(SC).filter((d) => d !== SC.abril).join(', ')}) vía <a href="https://earth-search.aws.element84.com/v1" target="_blank" rel="noopener">Earth Search</a>.</li>
    <li><b>Monte público:</b> <a href="https://dadesobertes.gva.es/es/dataset/montes-gestionados-por-la-administracion-autonomica1" target="_blank" rel="noopener">Montes gestionados por la Generalitat (catálogo de utilidad pública)</a>, ICV/GVA.</li>
    <li><b>Vegetación previa:</b> Mapa Forestal de España 1:50.000 (MITECO), servido por el ICV.</li>
    <li><b>Vegetación potencial:</b> <a href="https://www.miteco.gob.es/es/biodiversidad/servicios/banco-datos-naturaleza/informacion-disponible/memoria_mapa_series_veg_descargas.html" target="_blank" rel="noopener">Mapa de Series de Vegetación de España</a> (S. Rivas-Martínez, 1987), Banco de Datos de la Naturaleza, MITECO.
    Especies y revisión: Rivas-Martínez, S. y col. (2007, 2011). <i>Mapa de series, geoseries y geopermaseries de vegetación de España.</i> Itinera Geobotanica 17: 5-436 y 18(1): 5-424.</li>
    <li><b>Geología:</b> <a href="https://mapas.igme.es/gis/rest/services/Cartografia_Geologica/IGME_Geode_50/MapServer" target="_blank" rel="noopener">IGME GEODE 1:50.000</a>.</li>
    <li><b>Relieve:</b> Copernicus DEM GLO-30.</li>
    <li><b>Incendios ${FIRES_RANGE}</b>, <b>Parque Natural</b> y <b>términos municipales</b>: Generalitat Valenciana (ICV).</li>
    <li><b>Árboles:</b> <a href="https://www.miteco.gob.es/es/biodiversidad/servicios/banco-datos-naturaleza/informacion-disponible/ifn3_base_datos_1_25.html" target="_blank" rel="noopener">Tercer Inventario Forestal Nacional (IFN3), ${F.ifnProv}</a>, MITECO.</li>
    ${F.fuentesOficial}
  </ul>
  <h2>Método</h2>
  <ul>
    <li><b>Severidad:</b> dNBR = NBR(antes) − NBR(después), con NBR = (B8 − B12)/(B8 + B12). Umbrales de Key &amp; Benson (USGS): 0,10 · 0,27 · 0,44 · 0,66.</li>
    <li><b>Vegetación potencial:</b> serie de vegetación que asigna a cada punto el <i>Mapa de Series de Vegetación de España</i> (Rivas-Martínez, 1987), salvo riberas y usos no forestales, que salen del Mapa Forestal.
    El mapa es de escala nacional (originalmente 1:400.000), así que sus límites son muy generales: indica la serie dominante de la zona, no la de cada ladera. No incluye pinares naturales en estas zonas,
    aunque la revisión de 2011 sí reconoce series de pinar (por ejemplo, de pino laricio en el Sistema Ibérico).</li>
    <li><b>Actuación:</b> ${F.metodoActuacion || `rebrotadoras → regeneración natural; pinar maduro poco dañado y sin incendios desde ${(S.fire_year || 2026) - 15} → natural; resto de pinar → asistida; pinar con daño alto donde debería haber alcornocal o zonas con ≥2 incendios previos → restauración activa.`}</li>
    <li><b>Árboles quemados:</b> densidad (árboles/ha con diámetro ≥ 7,5 cm) de las parcelas IFN3 dentro del área quemada, media por tipo de bosque
    × hectáreas quemadas de ese tipo; clases con menos de 3 parcelas se completan con las más cercanas, y en matorral y pastizal se cuentan 0.
    Mortalidad supuesta según la severidad: pinos 10 % (baja), 50 % (moderada-baja), 90 % (moderada-alta), 100 % (alta);
    frondosas 0–25 %, porque rebrotan. Intervalo del 90 % por remuestreo de parcelas. Los datos de campo son de 2006.</li>
    <li><b>Sequedad previa:</b> NDMI = (B8 − B11)/(B8 + B11), imágenes Sentinel-2 del ${F.fechasSequedad || `${day(SC.abril)} y del ${day(SC.antes)}`}, como el análisis de la Fundación CEAM. Se compara la media dentro del área quemada.</li>
    <li><b>Criterio CEAM:</b> cobertura vegetal estimada = (NDVI ahora − NDVI de suelo quemado) / (NDVI de vegetación densa − NDVI de suelo quemado),
    con suelo quemado = ${fmt(S.soil_ndvi, 2)} (mediana tras el fuego en severidad alta) y vegetación densa = ${fmt(S.full_ndvi, 2)} (percentil 95 del bosque no quemado).
    Umbrales del CEAM: 30 % y 60 % de cobertura de especies leñosas rebrotadoras. El NDVI no distingue leñosas de hierbas, así que es una aproximación;
    el CEAM lo evalúa en campo.</li>
    <li><b>Erosión:</b> (clase de severidad − 1) × pendiente/25 %.</li>
    <li><b>Viabilidad:</b> base según la cercanía entre lo que había y lo que debería haber; ajustes por severidad, recurrencia (−12 por incendio previo), pendiente &gt;50 %, solanas secas sobre rodeno y rebrote observado (+10).</li>
  </ul>
${F.fuentesCeam}
  <h2>Licencias y atribución</h2>
  <ul>
    <li>Copernicus EMS: © Unión Europea, Copernicus Emergency Management Service (${F.ems}). <a href="https://mapping.emergency.copernicus.eu/terms-and-conditions/" target="_blank" rel="noopener">Condiciones</a>.</li>
    <li>Contiene datos modificados de Copernicus Sentinel (${S2_YEARS}), procesados por el autor de este proyecto.</li>
    <li>Copernicus DEM GLO-30: © DLR e.V. 2010-2014 y © Airbus Defence and Space GmbH 2014-2018, suministrado bajo COPERNICUS por la Unión Europea y la ESA.</li>
    <li>Montes, Mapa Forestal 1:50.000, Parque Natural e incendios históricos: Institut Cartogràfic Valencià / Generalitat Valenciana, CC BY 4.0. El Mapa Forestal de España es obra del MITECO.</li>
    <li>Geología: IGME-CSIC, GEODE 1:50.000, CC BY 4.0.</li>
    <li>Mapa de Series de Vegetación de España: MITECO, Banco de Datos de la Naturaleza.</li>
    <li>Mapa base y ortofoto PNOA: CC BY 4.0 scne.es (Instituto Geográfico Nacional).</li>
    <li>Leaflet: BSD-2-Clause. Código de esta aplicación: licencia MIT.</li>
  </ul>
  <p>Las capas derivadas (severidad, actuaciones, viabilidad, costes) son elaboración propia y ninguno de los organismos citados las ha revisado ni respaldado.</p>
  <h2>Aviso</h2>
  <p>Proyecto independiente con fines informativos y divulgativos. <b>No es una fuente oficial</b> y no tiene relación con la Generalitat Valenciana, el Ministerio ni ningún otro organismo.
  No debe usarse para tomar decisiones de emergencia, delimitar propiedades ni sustituir el criterio de técnicos forestales. Los datos se ofrecen tal cual, sin garantía.
  La propiedad indicada procede del catálogo público de montes y no identifica a propietarios particulares.</p>
  <p>La app no usa cookies ni analítica. Las teselas del mapa base se cargan desde los servidores del IGN.</p>
  <h2>Limitaciones</h2>
  <ul>
    <li>El área de Copernicus (${ha(S.ems_ha)}) es lo que se ve quemado desde satélite; ${F.officialLimit}.</li>
    <li>La capa de montes públicos solo incluye montes gestionados por la Generalitat; puede haber otras fincas públicas no catalogadas.</li>
    <li>Resolución de análisis: 25 m. Sirve para planificar, no para delimitar parcelas.</li>
    <li>La vegetación potencial procede de un mapa nacional muy general (1987). La revisión de 2011 cambia la serie asignada a algunas zonas, pero no se distribuye como capa SIG. Debe validarse con técnicos forestales y trabajo de campo.</li>
    <li>Costes: precios unitarios de las <a href="http://extremambiente.juntaex.es/files/2024/forestales/Tarifas%20SOGF_2024.pdf" target="_blank" rel="noopener">Tarifas forestales de la Junta de Extremadura 2024</a>; recargos de VAERSA según la <a href="https://dogv.gva.es/datos/2025/09/30/pdf/2025_41281_es.pdf" target="_blank" rel="noopener">Resolución de 25/9/2025 (DOGV)</a>. Las densidades de plantación (500 y 1.000 plantas/ha) son supuestos del modelo.</li>
  </ul>
`;

// --- enlace al otro incendio
if (F.otherFire) $('.brand').insertAdjacentHTML('beforeend', `<a class="other-fire" href="${F.otherFire.href}">${F.otherFire.label} →</a>`);

// --- móvil: el panel funciona como hoja inferior
{
  const panel = $('#panel');
  const handle = $('#sheet-handle');
  const isOpen = () => document.body.classList.contains('sheet-open');
  const setOpen = (open) => {
    if (!MOBILE.matches || open === isOpen()) return;
    document.body.classList.toggle('sheet-open', open);
    handle.setAttribute('aria-expanded', open);
  };
  handle.addEventListener('click', () => setOpen(!isOpen()));
  // al poner el foco o tocar algo del panel, se expande
  panel.addEventListener('focusin', (e) => { if (e.target !== handle) setOpen(true); });
  panel.addEventListener('click', (e) => { if (!handle.contains(e.target)) setOpen(true); });
  // deslizar hacia arriba expande; hacia abajo (con el contenido arriba del todo) contrae
  let y0 = null;
  let scroller = null;
  panel.addEventListener('touchstart', (e) => { y0 = e.touches[0].clientY; scroller = e.target.closest('.tab'); }, { passive: true });
  panel.addEventListener('touchmove', (e) => {
    if (y0 === null) return;
    const dy = y0 - e.touches[0].clientY;
    if (dy > 12 && !isOpen()) { setOpen(true); y0 = null; }
    else if (dy < -12 && isOpen() && (!scroller || scroller.scrollTop <= 0)) { setOpen(false); y0 = null; }
  }, { passive: true });
  panel.addEventListener('touchend', () => { y0 = null; });
  // al usar el mapa, se contrae
  map.on('click dragstart zoomstart', () => setOpen(false));
  MOBILE.addEventListener('change', () => { if (!MOBILE.matches) document.body.classList.remove('sheet-open'); });
}

renderTheme();
