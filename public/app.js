// Espadà después del fuego — visor y planificador de restauración
// Todos los cálculos por píxel se hacen sobre public/data/grid.bin (rejilla de 25 m generada
// por scripts/build_data.py). Ver la pestaña "Fuentes" para el método.

const $ = (s, el = document) => el.querySelector(s);
const fmt = (n, d = 0) => Number(n).toLocaleString('es-ES', { maximumFractionDigits: d, minimumFractionDigits: d });
const ha = (n) => `${fmt(n)} ha`;
const eur = (n) => n >= 1e6 ? `${fmt(n / 1e6, 2)} M€` : `${fmt(n / 1e3, 0)} k€`;
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

// ------------------------------------------------------------------ datos
const meta = await (await fetch('data/meta.json')).json();
const buf = new Uint8Array(await (await fetch('data/grid.bin')).arrayBuffer());
const { width: W, height: H, stats: S } = meta;
const N = W * H;
const G = Object.fromEntries(meta.layers.map((k, i) => [k, buf.subarray(i * N, (i + 1) * N)]));
const [montes, perimetro, parque, incendios, municipios] = await Promise.all(
  ['montes', 'perimetro', 'parque_natural', 'incendios_previos', 'municipios'].map((f) => fetch(`data/${f}.geojson`).then((r) => r.json())),
);
const PIX_HA = meta.pixel_ha;
const leg = meta.legends;
const PUBLIC = (o) => o >= 1 && o <= 3;
const FOREST = (v) => v !== 0 && v !== 10 && v !== 11 && v !== 12;

// ------------------------------------------------------------------ paletas y textos
const C = {
  sev: { 1: '#4d9221', 2: '#fee08b', 3: '#fdae61', 4: '#f46d43', 5: '#a50026' },
  sevLbl: { 1: 'No quemado', 2: 'Baja', 3: 'Moderada-baja', 4: 'Moderada-alta', 5: 'Alta' },
  owner: { 0: '#bdbdbd', 1: '#2b83ba', 2: '#7b3294', 3: '#41b6c4', 4: '#fdae61' },
  veg: { 1: '#d95f02', 2: '#1b9e77', 3: '#66a61e', 4: '#a6d854', 5: '#00582a', 6: '#e6ab02', 7: '#1f78b4',
    8: '#b39ddb', 9: '#e1d5ee', 10: '#f5eeb0', 11: '#8c8c8c', 12: '#a6cee3', 13: '#8dd3c7' },
  pot: { 1: '#d95f02', 2: '#7570b3', 3: '#00582a', 4: '#e6ab02', 5: '#c51b7d', 6: '#1f78b4', 7: '#d9d9d9' },
  eros: { 1: '#ffffcc', 2: '#fed976', 3: '#fd8d3c', 4: '#bd0026' },
  act: { 1: '#1a9850', 2: '#fee08b', 3: '#d73027', 4: '#bf812d', 5: '#d9d9d9' },
  feas: { 1: '#d73027', 2: '#fee08b', 3: '#1a9850' },
  recur: { 1: '#fcbba1', 2: '#fb6a4a', 3: '#a50f15' },
};

const POT_INFO = {
  1: {
    corto: 'Alcornocal',
    serie: 'Asplenio onopteridis–Querco suberis sigmetum',
    donde: 'Areniscas del rodeno (suelos ácidos), por debajo de ~950 m. Es la formación emblemática de Espadà.',
    arboles: 'Quercus suber (alcornoque), Q. rotundifolia (carrasca), Arbutus unedo (madroño)',
    arbustos: 'Erica arborea, E. scoparia, Cistus salviifolius, Phillyrea angustifolia, Viburnum tinus, Ruscus aculeatus, Smilax aspera, Lonicera implexa',
  },
  2: {
    corto: 'Carrascal silicícola de montaña',
    serie: 'Encinar/carrascal acidófilo mesomediterráneo',
    donde: 'Rodeno en cumbres y crestas por encima de ~950 m (Rápita, Pinós).',
    arboles: 'Quercus rotundifolia, Q. suber disperso, Q. faginea en umbrías',
    arbustos: 'Arbutus unedo, Erica arborea, Juniperus oxycedrus, Cistus salviifolius',
  },
  3: {
    corto: 'Carrascal con quejigo',
    serie: 'Rubio longifoliae–Querco rotundifoliae sigmetum',
    donde: 'Calizas y dolomías por encima de ~350 m o en umbrías.',
    arboles: 'Quercus rotundifolia, Q. faginea (umbrías), Fraxinus ornus, Acer granatense en barrancos',
    arbustos: 'Rubia peregrina subsp. longifolia, Viburnum tinus, Phillyrea latifolia, Rhamnus alaternus, Juniperus oxycedrus, Quercus coccifera',
  },
  4: {
    corto: 'Lentiscar-coscojar termomediterráneo',
    serie: 'Querco cocciferae–Pistacio lentisci sigmetum (con carrasca)',
    donde: 'Calizas de las solanas bajas, por debajo de ~350 m, hacia la Plana.',
    arboles: 'Ceratonia siliqua (algarrobo), Olea europaea var. sylvestris (acebuche), Q. rotundifolia en vaguadas',
    arbustos: 'Pistacia lentiscus, Quercus coccifera, Chamaerops humilis (palmito), Rhamnus lycioides, Ephedra fragilis, Asparagus horridus',
  },
  5: {
    corto: 'Carrascal-coscojar sobre yesos',
    serie: 'Vegetación de arcillas y yesos del Keuper',
    donde: 'Arcillas abigarradas y yesos del Keuper (suelos pobres, fácilmente erosionables).',
    arboles: 'Quercus rotundifolia (dispersa), Pinus halepensis como pionero',
    arbustos: 'Quercus coccifera, Rhamnus lycioides, Juniperus phoenicea, Pistacia lentiscus, Rosmarinus officinalis',
  },
  6: {
    corto: 'Vegetación de ribera',
    serie: 'Saucedas, choperas-olmedas y adelfares de rambla',
    donde: 'Fondos de barranco, ramblas y depósitos aluviales.',
    arboles: 'Populus alba, Fraxinus angustifolia, Ulmus minor, Salix spp.',
    arbustos: 'Nerium oleander (adelfa, en ramblas secas), Tamarix africana, Rubus ulmifolius, Vitex agnus-castus',
  },
  7: { corto: 'Uso no forestal', serie: '—', donde: 'Cultivos, núcleos urbanos, infraestructuras o agua.', arboles: '—', arbustos: '—' },
};

const ACT_INFO = {
  1: {
    corto: 'Regeneración natural',
    que: 'La vegetación previa rebrota (alcornoque, carrasca, coscoja, lentisco, madroño, palmito…) o el pinar era maduro y sin incendios recientes, por lo que regenera por semilla.',
    como: [
      'No cortar ni desbrozar los rebrotes; no descorchar alcornoques en al menos 5 años.',
      'Esperar a la brotación de la primavera de 2027 antes de declarar muertos alcornoques y carrascas.',
      'Excluir pastoreo y proteger frente a herbívoros 3–5 años donde haya presión.',
      'Seguimiento con parcelas de campo y NDVI (Sentinel-2) cada primavera.',
    ],
    coste: 17,
  },
  2: {
    corto: 'Regeneración asistida',
    que: 'Pinar con daño alto o pinar joven: probablemente no hay banco de piñas serótinas suficiente. Se ayuda con siembras y núcleos de plantación que aceleren la entrada de frondosas.',
    como: [
      'Medir el regenerado de pino en primavera-verano 2027; actuar donde haya <1.000 plántulas/ha.',
      'Siembra de bellotas (alcornoque o carrasca, según la vegetación potencial) por puntos, protegidas.',
      'Plantación en bosquetes / núcleos de dispersión (400–600 plantas/ha) con protector, en otoño-invierno.',
      'Clareos del regenerado de pino a los 8–12 años para evitar masas densas muy inflamables.',
    ],
    coste: 3125,
  },
  3: {
    corto: 'Restauración activa',
    que: 'El pinar ocupaba suelos donde debería haber alcornocal o carrascal, o la zona ha ardido repetidamente y el matorral ya no evoluciona solo. Hay que reintroducir las especies de la vegetación potencial.',
    como: [
      'Plantación de 800–1.100 plantas/ha de las especies de la serie potencial (ver pestaña Cómo).',
      'Planta de la región de procedencia local (Banc de Llavors Forestals de la GVA).',
      'Hoyos manuales en pendiente, protectores, riego de apoyo el primer verano y reposición de marras.',
      'Ejecutar tras la estabilización del suelo, en la ventana de plantación de otoño-invierno 2027–28.',
    ],
    coste: 6963,
  },
  4: {
    corto: 'Recuperar cultivo / mosaico',
    que: 'Terreno agrícola (sobre todo algarrobos, olivos y almendros de secano) dentro del perímetro.',
    como: [
      'Recuperar cultivos de secano como discontinuidades cortafuegos (mosaico agroforestal).',
      'Ayudas a explotaciones afectadas (Generalitat / PAC) y pastoreo controlado en fajas.',
    ],
    coste: 0,
  },
  5: { corto: 'Sin actuación', que: 'No quemado o afectado levemente.', como: [], coste: 0 },
};
const EMERG = {
  corto: 'Estabilización urgente del suelo',
  que: 'Severidad alta en pendiente: alto riesgo de erosión y arrastres con las primeras lluvias fuertes de otoño.',
  como: [
    'Fajinas y barreras con troncos quemados siguiendo las curvas de nivel.',
    'Albarradas o diques de mampostería en cárcavas y cabeceras de barranco.',
    'Acolchado (mulching) de paja o astilla en las laderas más expuestas.',
    'Evitar maquinaria pesada y la saca de madera en pendientes fuertes.',
  ],
  coste: 2204,
};

// ------------------------------------------------------------------ temas (capas raster)
const val = (k, i) => G[k][i];
const ndviDiff = (i) => (G.ndvi_n[i] - G.ndvi_a[i]) / 100;
const THEMES = {
  sev: { name: 'Severidad del fuego', desc: 'dNBR Sentinel-2 (3 jul → 19 ago)', inside: true,
    color: (i) => C.sev[val('sev', i)], legend: () => cats(C.sev, C.sevLbl) },
  owner: { name: '¿Es monte público?', desc: 'Catálogo de montes de utilidad pública (GVA)', inside: false,
    color: (i) => (val('owner', i) ? C.owner[val('owner', i)] : null), legend: () => cats(C.owner, leg.owner, [1, 2, 3, 4]) },
  veg: { name: 'Vegetación antes del incendio', desc: 'Mapa Forestal de España 1:50.000', inside: false,
    color: (i) => C.veg[val('veg', i)], legend: () => cats(C.veg, leg.veg, used('veg')) },
  pot: { name: 'Vegetación que debería haber', desc: 'Vegetación potencial (modelo: geología + altitud + orientación)', inside: false,
    color: (i) => C.pot[val('pot', i)], legend: () => cats(C.pot, Object.fromEntries(Object.entries(POT_INFO).map(([k, v]) => [k, v.corto])), used('pot')) },
  eros: { name: 'Riesgo de erosión', desc: 'Severidad × pendiente', inside: true,
    color: (i) => C.eros[val('eros', i)], legend: () => cats(C.eros, leg.eros) },
  act: { name: 'Actuación recomendada', desc: 'Modelo de decisión (pestaña Cómo)', inside: true,
    color: (i) => C.act[val('act', i)], legend: () => cats(C.act, Object.fromEntries(Object.entries(ACT_INFO).map(([k, v]) => [k, v.corto]))) },
  feas: { name: 'Viabilidad de recuperar la vegetación potencial', desc: 'Índice 0–100 (≈30 años)', inside: true,
    color: (i) => (G.feas[i] ? ramp(G.feas[i] / 100, ['#d73027', '#fc8d59', '#fee08b', '#91cf60', '#1a9850']) : null),
    legend: () => rampLegend(['#d73027', '#fc8d59', '#fee08b', '#91cf60', '#1a9850'], 'Baja', 'Alta') },
  regrow: { name: 'Rebrote observado', desc: 'Cambio de NDVI 19 ago → 8 sep', inside: true,
    color: (i) => ramp((ndviDiff(i) + 0.15) / 0.3, ['#8c510a', '#d8b365', '#f6e8c3', '#c7eae5', '#5ab4ac', '#01665e']),
    legend: () => rampLegend(['#8c510a', '#d8b365', '#f6e8c3', '#c7eae5', '#5ab4ac', '#01665e'], 'Pierde verde', 'Rebrota') },
  recur: { name: 'Incendios anteriores (1993–2024)', desc: 'Nº de veces que ya ardió', inside: false,
    color: (i) => (val('recur', i) ? C.recur[Math.min(3, val('recur', i))] : null),
    legend: () => cats(C.recur, { 1: '1 incendio previo', 2: '2 incendios', 3: '3 o más' }) },
};
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
map.fitBounds(bounds.pad(-0.05));

for (const [name, z] of [['imgL', 300], ['imgR', 301], ['theme', 420], ['vec', 450]]) {
  map.createPane(name).style.zIndex = z;
}
map.getPane('vec').style.pointerEvents = 'none';

L.tileLayer('https://www.ign.es/wmts/ign-base?layer=IGNBaseTodo&style=default&tilematrixset=GoogleMapsCompatible&Service=WMTS&Request=GetTile&Version=1.0.0&Format=image/png&TileMatrix={z}&TileCol={x}&TileRow={y}', {
  attribution: 'Base: <a href="https://www.scne.es">CC BY 4.0 scne.es</a>', maxZoom: 18,
}).addTo(map);

const IMAGES = {
  antes: { label: 'Antes · 3 jul 2026', src: 'data/s2_antes.jpg' },
  despues: { label: 'Después · 19 ago 2026', src: 'data/s2_despues.jpg' },
  ahora: { label: 'Ahora · 8 sep 2026', src: 'data/s2_ahora.jpg' },
  antes_swir: { label: 'Antes · falso color', src: 'data/s2_antes_swir.jpg' },
  despues_swir: { label: 'Después · falso color', src: 'data/s2_despues_swir.jpg' },
  ahora_swir: { label: 'Ahora · falso color', src: 'data/s2_ahora_swir.jpg' },
  pnoa: { label: 'Ortofoto PNOA (pre-incendio)', tiles: 'https://www.ign.es/wmts/pnoa-ma?layer=OI.OrthoimageCoverage&style=default&tilematrixset=GoogleMapsCompatible&Service=WMTS&Request=GetTile&Version=1.0.0&Format=image/jpeg&TileMatrix={z}&TileCol={x}&TileRow={y}' },
  none: { label: 'Mapa base' },
};
const S2_ATTR = 'Contiene datos modificados de <a href="https://www.copernicus.eu">Copernicus Sentinel</a> (2026)';
function makeImage(key, pane) {
  const d = IMAGES[key];
  if (d.tiles) return L.tileLayer(d.tiles, { pane, maxZoom: 19, attribution: 'PNOA: <a href="https://www.scne.es">CC BY 4.0 scne.es</a>' });
  if (d.src) return L.imageOverlay(d.src, bounds, { pane, attribution: S2_ATTR });
  return null;
}

const cmp = { on: true, left: 'antes', right: 'despues', x: 0.5, layers: {} };
function setImage(side) {
  const pane = side === 'left' ? 'imgL' : 'imgR';
  if (cmp.layers[side]) map.removeLayer(cmp.layers[side]);
  cmp.layers[side] = makeImage(cmp[side], pane);
  if (cmp.layers[side] && (side === 'right' || cmp.on)) cmp.layers[side].addTo(map);
  updateLabels();
}
const lblL = Object.assign(document.createElement('div'), { className: 'cmp-label' });
const lblR = Object.assign(document.createElement('div'), { className: 'cmp-label' });
$('#mapwrap').append(lblL, lblR);
function updateLabels() {
  lblL.textContent = IMAGES[cmp.left].label;
  lblR.textContent = IMAGES[cmp.right].label;
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
    onEachFeature: (f, l) => l.bindTooltip(
      `${f.properties.nom_mun}${f.properties.ha_quemadas ? `<br><small>${fmt(f.properties.ha_quemadas)} ha quemadas</small>` : ''}`,
      { permanent: true, direction: 'center', className: `mun-label${f.properties.ha_quemadas ? ' hit' : ''}` }),
  }),
};
const vecOn = { perimetro: true, montes: true, parque: true, incendios: false, municipios: true };
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
    ['Estado', inside ? `Dentro del área quemada · ${pill(C.sev[s] || '#999', 'Severidad ' + (C.sevLbl[s] || 's/d').toLowerCase())}` : 'Fuera del área quemada (EMSR905)'],
    ['dNBR', `${fmt((G.dnbr[i] - 100) / 100, 2)}`],
    ['NDVI', `${nd('ndvi_b')} antes → ${nd('ndvi_a')} después → ${nd('ndvi_n')} ahora`],
    ['Vegetación antes', v ? pill(C.veg[v], leg.veg[v]) : 's/d'],
    ['Propiedad', o ? `${pill(C.owner[o], leg.owner[o])}${monte ? `<br><small>${monte.properties.denominacion || ''} ${monte.properties.num_up ? '· nº ' + monte.properties.num_up : ''} · ${monte.properties.municipio}</small>` : ''}` : 'No catalogado como monte público (probablemente privado)'],
    ['Municipio', G.mun[i] ? meta.municipios[G.mun[i] - 1] : 's/d'],
    ['Parque Natural', G.pn[i] ? 'Sí · Serra d\'Espadà' : 'No'],
    ['Sustrato', leg.sub[G.sub[i]] || 's/d'],
    ['Altitud · pendiente', `${fmt(G.elev[i] * 5)} m · ${fmt(G.slope[i])} %`],
    ['Incendios previos', fuegos.length ? fuegos.join(', ') : 'Ninguno desde 1993'],
  ];
  let html = `<button class="close" aria-label="Cerrar">×</button><h3>${inside ? 'Punto afectado' : 'Punto consultado'}</h3><small>${ll.lat.toFixed(5)}, ${ll.lng.toFixed(5)}</small>`;
  html += `<dl>${rows.map(([k, x]) => `<dt>${k}</dt><dd>${x}</dd>`).join('')}</dl>`;
  if (p) {
    html += `<div class="act"><b>Debería haber:</b> ${pill(C.pot[p], pi.corto)}<br><small>${pi.serie}</small>
      ${p !== 7 ? `<p><b>Árboles:</b> <span class="species">${pi.arboles}</span></p><p><b>Arbustos:</b> <span class="species">${pi.arbustos}</span></p>` : ''}</div>`;
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
{
  const sev = S.severity;
  const sevHigh = (sev['Moderada-alta'] || 0) + (sev.Alta || 0);
  const pine = (S.veg_before['Pinar de pino carrasco'] || 0) + (S.veg_before['Pinar de rodeno (P. pinaster)'] || 0) + (S.veg_before['Bosque mixto pino + frondosas'] || 0);
  const feas = S.feasibility;
  const feasOk = (feas['Alta (≥70)'] || 0) + (feas['Media (45–70)'] || 0);
  const potLabels = Object.fromEntries(Object.entries(leg.pot).map(([k, v]) => [v, POT_INFO[k]?.corto || v]));
  const potShort = Object.fromEntries(Object.entries(S.potential).map(([k, v]) => [potLabels[k] || k, v]));
  const T = S.arboles;
  const mill = (n) => `${fmt(n / 1e6, 1)} M`;
  const mun = Object.fromEntries(Object.entries(S.municipios || {}).map(([k, v]) => [k, v.total]));
  $('#tab-resumen').innerHTML = `
    <div class="kpis">
      <div class="kpi accent"><b>9.568 ha</b><span>superficie oficial (CCE Generalitat)</span></div>
      <div class="kpi"><b>${ha(S.ems_ha)}</b><span>área quemada cartografiada por satélite (Copernicus EMSR905)</span></div>
      <div class="kpi"><b>${ha(S.forest_ha)}</b><span>de esa área era forestal (${fmt((S.forest_ha / S.grid_ha) * 100)} %)</span></div>
      <div class="kpi"><b>${ha(S.pn_ha)}</b><span>dentro del Parque Natural de la Serra d'Espadà</span></div>
      <div class="kpi accent"><b>${ha(S.public_ha)}</b><span>es monte público catalogado (${fmt((S.public_ha / S.grid_ha) * 100, 1)} %)</span></div>
      <div class="kpi"><b>${ha(S.recurrent_ha)}</b><span>ya había ardido al menos una vez desde 1993</span></div>
      ${T ? `<div class="kpi accent"><b>≈ ${mill(T.total)} árboles</b><span>en la zona quemada (entre ${mill(T.total_ci90[0])} y ${mill(T.total_ci90[1])})</span></div>
      <div class="kpi accent"><b>≈ ${mill(T.muertos)} muertos</b><span>sobre todo pinos; la mayoría de alcornoques y carrascas rebrotará</span></div>` : ''}
    </div>
    <div class="callout">
      <b>En pocas palabras.</b> El ${fmt((sevHigh / S.grid_ha) * 100)} % del área ardió con severidad moderada-alta o alta.
      Antes dominaban los pinares (${ha(pine)}), pero en la mayor parte de este terreno la vegetación natural sería
      <b>alcornocal</b> sobre el rodeno y <b>carrascal</b> sobre la caliza. Es viable recuperar esa vegetación en
      <b>${ha(feasOk)}</b> (${fmt((feasOk / S.forest_ha) * 100)} % del área forestal), parte de forma natural y parte con ayuda.
      Casi todo es <b>propiedad privada</b>, así que el plan depende de acuerdos con propietarios.
    </div>
    <h2>Severidad del fuego</h2>
    ${bars(sev, byLabel(C.sevLbl, C.sev))}
    <h2>Qué había antes</h2>
    ${bars(S.veg_before, byLabel(leg.veg, C.veg))}
    <h2>Qué debería haber (vegetación potencial)</h2>
    ${bars(potShort, (k) => C.pot[Object.keys(POT_INFO).find((i) => POT_INFO[i].corto === k)])}
    <h2>Por municipio</h2>
    ${bars(mun, () => '#7a6a5a')}
    <p class="muted">Superficie vista quemada por satélite; las cifras oficiales por municipio suelen ser mayores porque usan el perímetro exterior.</p>
    ${T ? `<h2>¿Cuántos árboles ardieron?</h2>
    <table><thead><tr><th>Tipo de bosque</th><th>ha</th><th>árboles/ha</th><th>árboles</th></tr></thead><tbody>
      ${Object.entries(T.por_clase).filter(([, c]) => c.arboles > 0).map(([k, c]) => `<tr><td>${k}</td><td>${fmt(c.ha)}</td><td>${fmt(c.pies_ha)}</td><td>${fmt(c.arboles)}</td></tr>`).join('')}
    </tbody><tfoot><tr><td>Total</td><td></td><td></td><td>${fmt(T.total)}</td></tr></tfoot></table>
    <p class="muted">Árboles con tronco de al menos 7,5 cm de diámetro, según ${T.parcelas_dentro} parcelas del Inventario Forestal Nacional
    (IFN3, medidas en 2006) que caen dentro del área quemada. De ellos, unos ${mill(T.muertos_coniferas)} pinos habrían muerto (no rebrotan)
    y unas ${fmt(T.muertos_frondosas / 1e3)} mil frondosas; el resto de frondosas (${mill(T.frondosas - T.muertos_frondosas)}) debería rebrotar.
    No incluye árboles jóvenes ni dispersos en el matorral. Ver método en Fuentes.</p>` : ''}
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
      <button class="chip" data-s="pn">Parque Natural</button>
    </div>
    <div class="row"><label><input type="checkbox" id="insideOnly" checked> Solo dentro del área quemada</label></div>
    <h2>Límites</h2>
    <div class="row" style="flex-direction:column;align-items:flex-start;gap:6px">
      <label><input type="checkbox" data-v="perimetro" checked> Área quemada (Copernicus EMS)</label>
      <label><input type="checkbox" data-v="montes" checked> Montes de utilidad pública <span class="sw" style="background:#08519c"></span></label>
      <label><input type="checkbox" data-v="parque" checked> Parque Natural Serra d'Espadà <span class="sw" style="background:#1b7837"></span></label>
      <label><input type="checkbox" data-v="municipios" checked> Términos municipales <span class="sw" style="background:#5b5b5b"></span></label>
      <label><input type="checkbox" data-v="incendios"> Incendios 1993–2024 <span class="sw" style="background:#ef6548"></span></label>
    </div>
    <h2>Imágenes</h2>
    <p class="muted">Usa los selectores de la parte superior del mapa y arrastra la barra central para comparar.
    El <b>falso color</b> (SWIR-NIR-rojo) muestra lo quemado en rojo oscuro y la vegetación viva en verde.</p>
    <div class="seg">
      <button class="chip" data-p="antes|despues">Antes vs después</button>
      <button class="chip" data-p="antes|ahora">Antes vs ahora</button>
      <button class="chip" data-p="despues_swir|ahora_swir">Rebrote (falso color)</button>
      <button class="chip" data-p="pnoa|despues">Ortofoto vs después</button>
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
  budget: 2.7e6,
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
  const rows = [['emerg', EMERG.corto, 'oct 2026 – mar 2027'], [1, ACT_INFO[1].corto, '2027 – 2032'], [2, ACT_INFO[2].corto, '2027 – 2030'], [3, ACT_INFO[3].corto, '2027 – 2031'], [4, ACT_INFO[4].corto, '2027 –']];
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
    <p class="muted">Referencia: la Generalitat anunció 4,2 M€ (oct 2026), de los que 2,7 M€ van a recuperación forestal y caminos.</p>
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
    <h2>Calendario</h2>
    <div class="timeline">
      <div><b>Ahora – marzo 2027 · Emergencia</b>Estabilizar laderas antes y durante las lluvias de otoño (fajinas, albarradas, acolchado), retirar árboles peligrosos junto a caminos y casas. No plantar todavía.</div>
      <div><b>Primavera – verano 2027 · Diagnóstico</b>Ver qué rebrota y cuánto pino nace. Parcelas de campo + imágenes Sentinel-2. Ajustar el mapa de actuaciones.</div>
      <div><b>Otoño 2027 – invierno 2029 · Restauración</b>Siembras y plantaciones con planta local donde la regeneración no basta. Protección frente a herbívoros.</div>
      <div><b>2030 – 2040 · Consolidación</b>Reposición de marras, clareos del regenerado denso de pino, creación de un mosaico menos inflamable.</div>
      <div><b>2040 – 2060 · Bosque maduro</b>Primer descorche de los alcornoques nuevos (~25–30 años), dominancia de frondosas.</div>
    </div>
    <h2>Actuaciones</h2>
    ${act(EMERG)}${[1, 2, 3, 4].map((n) => act(ACT_INFO[n])).join('')}
    <h2>Qué plantar según la vegetación potencial</h2>
    ${Object.entries(POT_INFO).filter(([k]) => k !== '7').map(([k, p]) => `<details><summary><span class="sw" style="display:inline-block;background:${C.pot[k]}"></span> ${p.corto}</summary>
      <p><small class="muted">${p.serie}</small></p><p>${p.donde}</p><p><b>Árboles:</b> <span class="species">${p.arboles}</span></p><p><b>Arbustos:</b> <span class="species">${p.arbustos}</span></p></details>`).join('')}
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
      <li>Apoyar a las asociaciones de custodia del territorio y a la economía local del corcho.</li>
    </ul>
  `;
}

// --- Fuentes
$('#tab-fuentes').innerHTML = `
  <h2>Datos</h2>
  <ul>
    <li><b>Área quemada:</b> <a href="https://rapidmapping.emergency.copernicus.eu/EMSR905" target="_blank" rel="noopener">Copernicus EMS Rapid Mapping EMSR905</a>, producto de evaluación (GRA v2, imagen del 31 jul 2026).</li>
    <li><b>Imágenes:</b> Sentinel-2 L2A (${S.scenes.antes}, ${S.scenes.despues}, ${S.scenes.ahora}) vía <a href="https://earth-search.aws.element84.com/v1" target="_blank" rel="noopener">Earth Search</a>.</li>
    <li><b>Monte público:</b> <a href="https://dadesobertes.gva.es/es/dataset/montes-gestionados-por-la-administracion-autonomica1" target="_blank" rel="noopener">Montes gestionados por la Generalitat (catálogo de utilidad pública)</a>, ICV/GVA.</li>
    <li><b>Vegetación previa:</b> Mapa Forestal de España 1:50.000 (MITECO), servido por el ICV.</li>
    <li><b>Geología:</b> <a href="https://mapas.igme.es/gis/rest/services/Cartografia_Geologica/IGME_Geode_50/MapServer" target="_blank" rel="noopener">IGME GEODE 1:50.000</a>.</li>
    <li><b>Relieve:</b> Copernicus DEM GLO-30.</li>
    <li><b>Incendios 1993–2024</b>, <b>Parque Natural</b> y <b>términos municipales</b>: Generalitat Valenciana (ICV).</li>
    <li><b>Árboles:</b> <a href="https://www.miteco.gob.es/es/biodiversidad/servicios/banco-datos-naturaleza/informacion-disponible/ifn3_base_datos_1_25.html" target="_blank" rel="noopener">Tercer Inventario Forestal Nacional (IFN3), Castellón</a>, MITECO.</li>
    <li><b>Cifras oficiales</b> (9.568 ha, 89 km de perímetro, 4,2 M€): Centro de Coordinación de Emergencias y Generalitat, según prensa.</li>
  </ul>
  <h2>Método</h2>
  <ul>
    <li><b>Severidad:</b> dNBR = NBR(antes) − NBR(después), con NBR = (B8 − B12)/(B8 + B12). Umbrales de Key &amp; Benson (USGS): 0,10 · 0,27 · 0,44 · 0,66.</li>
    <li><b>Vegetación potencial:</b> modelo propio siguiendo las series de vegetación de Rivas-Martínez: sustrato (IGME) + altitud + orientación. Donde la geología es ambigua, el alcornoque o el pino rodeno indican suelo ácido.</li>
    <li><b>Actuación:</b> rebrotadoras → regeneración natural; pinar maduro poco dañado y sin incendios desde 2011 → natural; resto de pinar → asistida; pinar con daño alto donde debería haber alcornocal o zonas con ≥2 incendios previos → restauración activa.</li>
    <li><b>Árboles quemados:</b> densidad (árboles/ha con diámetro ≥ 7,5 cm) de las parcelas IFN3 dentro del área quemada, media por tipo de bosque
    × hectáreas quemadas de ese tipo; clases con menos de 3 parcelas se completan con las más cercanas, y en matorral y pastizal se cuentan 0.
    Mortalidad supuesta según la severidad: pinos 10 % (baja), 50 % (moderada-baja), 90 % (moderada-alta), 100 % (alta);
    frondosas 0–25 %, porque rebrotan. Intervalo del 90 % por remuestreo de parcelas. Los datos de campo son de 2006.</li>
    <li><b>Erosión:</b> (clase de severidad − 1) × pendiente/25 %.</li>
    <li><b>Viabilidad:</b> base según la cercanía entre lo que había y lo que debería haber; ajustes por severidad, recurrencia (−12 por incendio previo), pendiente &gt;50 %, solanas secas sobre rodeno y rebrote observado (+10).</li>
  </ul>
  <h2>Licencias y atribución</h2>
  <ul>
    <li>Copernicus EMS: © Unión Europea, Copernicus Emergency Management Service (EMSR905). <a href="https://mapping.emergency.copernicus.eu/terms-and-conditions/" target="_blank" rel="noopener">Condiciones</a>.</li>
    <li>Contiene datos modificados de Copernicus Sentinel (2026), procesados por el autor de este proyecto.</li>
    <li>Copernicus DEM GLO-30: © DLR e.V. 2010-2014 y © Airbus Defence and Space GmbH 2014-2018, suministrado bajo COPERNICUS por la Unión Europea y la ESA.</li>
    <li>Montes, Mapa Forestal 1:50.000, Parque Natural e incendios históricos: Institut Cartogràfic Valencià / Generalitat Valenciana, CC BY 4.0. El Mapa Forestal de España es obra del MITECO.</li>
    <li>Geología: IGME-CSIC, GEODE 1:50.000, CC BY 4.0.</li>
    <li>Mapa base y ortofoto PNOA: CC BY 4.0 scne.es (Instituto Geográfico Nacional).</li>
    <li>Leaflet: BSD-2-Clause. Código de esta aplicación: licencia MIT.</li>
  </ul>
  <p>Las capas derivadas (severidad, vegetación potencial, actuaciones, viabilidad, costes) son elaboración propia y ninguno de los organismos citados las ha revisado ni respaldado.</p>
  <h2>Aviso</h2>
  <p>Proyecto independiente con fines informativos y divulgativos. <b>No es una fuente oficial</b> y no tiene relación con la Generalitat Valenciana, el Ministerio ni ningún otro organismo.
  No debe usarse para tomar decisiones de emergencia, delimitar propiedades ni sustituir el criterio de técnicos forestales. Los datos se ofrecen tal cual, sin garantía.
  La propiedad indicada procede del catálogo público de montes y no identifica a propietarios particulares.</p>
  <p>La app no usa cookies ni analítica. Las teselas del mapa base se cargan desde los servidores del IGN.</p>
  <h2>Limitaciones</h2>
  <ul>
    <li>El área de Copernicus (${ha(S.ems_ha)}) es lo que se ve quemado desde satélite; la cifra oficial (9.568 ha) usa el perímetro exterior e incluye islas no quemadas.</li>
    <li>La capa de montes públicos solo incluye montes gestionados por la Generalitat; puede haber otras fincas públicas no catalogadas.</li>
    <li>Resolución de análisis: 25 m. Sirve para planificar, no para delimitar parcelas.</li>
    <li>El modelo de vegetación potencial debe validarse con técnicos forestales y trabajo de campo.</li>
    <li>Costes: precios unitarios de las <a href="http://extremambiente.juntaex.es/files/2024/forestales/Tarifas%20SOGF_2024.pdf" target="_blank" rel="noopener">Tarifas forestales de la Junta de Extremadura 2024</a>; recargos de VAERSA según la <a href="https://dogv.gva.es/datos/2025/09/30/pdf/2025_41281_es.pdf" target="_blank" rel="noopener">Resolución de 25/9/2025 (DOGV)</a>. Las densidades de plantación (500 y 1.000 plantas/ha) son supuestos del modelo.</li>
  </ul>
  <p class="muted">Regenerar los datos: <code>python3 scripts/build_data.py</code></p>
`;

renderTheme();
