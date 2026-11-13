// Visor y planificador de restauración tras un incendio (común a todos los incendios)
// Los textos propios de cada incendio están en su fire.js (junto a su index.html). Todos los cálculos por píxel se hacen sobre data/grid.bin.gz (rejilla de 25 m generada
// por scripts/build_data.py). Ver la pestaña "Fuentes" para el método.

const $ = (s, el = document) => el.querySelector(s);
const fmt = (n, d = 0) => Number(n).toLocaleString('es-ES', { maximumFractionDigits: d, minimumFractionDigits: d });
const ha = (n) => `${fmt(n)} ha`;
const eur = (n) => n >= 1e6 ? `${fmt(n / 1e6, 2)} M€` : `${fmt(n / 1e3, 0)} k€`;
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// ------------------------------------------------------------------ desplegables propios (sobre un <select>)
// Mejora progresiva: el <select> nativo sigue en el DOM (oculto e inert) y guarda el valor, así que el resto del
// código lo lee y escucha su 'change' como siempre. Se añade un botón y una lista (role=listbox) en <body> con
// position: fixed, para que ni el panel ni el mapa la recorten; fundido de entrada y salida en CSS.
// Cada <option> puede llevar data-a (texto principal) y data-b (secundario); los <optgroup> son secciones.
const SEL_REDUCED = matchMedia('(prefers-reduced-motion: reduce)');
const CHEVRON = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const SEL_VALUE = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
const selMenus = {};
let selOpen = null; // el desplegable abierto (solo uno a la vez)
document.addEventListener('pointerdown', (e) => { if (selOpen && !selOpen.menu.contains(e.target) && !selOpen.btn.contains(e.target)) selOpen.close(false); });
addEventListener('resize', () => selOpen?.close(false));
addEventListener('pageshow', () => selOpen?.close(false));
document.addEventListener('scroll', (e) => { if (selOpen && e.target !== selOpen.menu) selOpen.place(); }, true);
document.addEventListener('transitionend', (e) => { if (selOpen && e.target.id === 'panel') selOpen.place(); }); // hoja inferior del móvil
function enhanceSelect(sel, { cls = '', label = null, alignTo = () => null } = {}) {
  const id = sel.id;
  if (selMenus[id]) { if (selOpen?.menu === selMenus[id]) selOpen = null; selMenus[id].remove(); } // la tabla del plan se rehace
  if (label && !label.id) label.id = `${id}-lbl`;
  sel.classList.add('sel-native');
  sel.inert = true;
  sel.tabIndex = -1;
  const btn = document.createElement('button');
  Object.assign(btn, { type: 'button', id: `${id}-btn`, className: `sel-btn ${cls}`, innerHTML: `<span></span>${CHEVRON}` });
  btn.setAttribute('aria-haspopup', 'listbox');
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-controls', `${id}-menu`);
  if (label) btn.setAttribute('aria-labelledby', `${label.id} ${btn.id}`);
  sel.after(btn);
  // tabIndex 0: si la lista es larga y se desplaza, también se puede recorrer con el teclado (solo existe abierta)
  const menu = Object.assign(document.createElement('div'), { id: `${id}-menu`, className: `sel-menu ${cls}`, tabIndex: 0, hidden: true });
  menu.setAttribute('role', 'listbox');
  if (label) menu.setAttribute('aria-labelledby', label.id);
  // las listas van en <body> (position: fixed, por encima del mapa y de la hoja inferior), dentro de una región
  // con nombre para que todo el contenido esté en un punto de referencia (landmark)
  const layer = $('#sel-layer') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'sel-layer' }));
  if (!layer.hasAttribute('role')) { layer.setAttribute('role', 'region'); layer.setAttribute('aria-label', 'Opciones de los desplegables'); }
  layer.append(menu);
  selMenus[id] = menu;

  let opts = [], sig = null, hideTimer = 0;
  const optHtml = (o, i) => `<div role="option" id="${id}-o${i}" tabindex="-1" aria-selected="false"><b>${esc(o.dataset.a || o.text)}</b>${o.dataset.b ? `<small>${esc(o.dataset.b)}</small>` : ''}</div>`;
  const build = () => {
    const s = [...sel.options].map((o) => `${o.value}|${o.text}|${o.parentElement.label || ''}`).join('\n');
    if (s === sig) return;
    sig = s;
    let html = '', i = 0;
    for (const node of sel.children) {
      if (node.tagName === 'OPTGROUP') {
        const g = `${id}-g${i}`;
        html += `<div role="group" aria-labelledby="${g}"><div class="sel-grp" id="${g}">${esc(node.label)}</div>${[...node.children].map((o) => optHtml(o, i++)).join('')}</div>`;
      } else if (node.tagName === 'OPTION') html += optHtml(node, i++);
    }
    menu.innerHTML = html;
    opts = [...menu.querySelectorAll('[role=option]')];
    opts.forEach((o, j) => {
      o.addEventListener('click', () => choose(j));
      o.addEventListener('mousemove', () => { if (document.activeElement !== o) o.focus({ preventScroll: true }); });
    });
  };
  const sync = () => {
    build();
    const i = sel.selectedIndex;
    opts.forEach((o, j) => o.setAttribute('aria-selected', j === i));
    btn.firstChild.textContent = sel.options[i]?.text ?? '';
  };
  // el código que cambia el valor (preajustes, zoom a ortofoto…) o las opciones mantiene el botón al día
  Object.defineProperty(sel, 'value', { configurable: true, get() { return SEL_VALUE.get.call(this); }, set(v) { SEL_VALUE.set.call(this, v); sync(); } });
  new MutationObserver(sync).observe(sel, { childList: true, subtree: true, characterData: true, attributes: true });
  sel.addEventListener('change', sync);

  const isOpen = () => btn.getAttribute('aria-expanded') === 'true';
  const place = () => {
    const r = btn.getBoundingClientRect();
    const a = (alignTo() || btn).getBoundingClientRect();
    menu.style.minWidth = `${a.width}px`;
    menu.style.maxHeight = '';
    const h = menu.scrollHeight + 2;
    const below = innerHeight - r.bottom - 14, above = r.top - 14;
    const up = h > below && above > below; // sin sitio debajo: hacia arriba
    const room = Math.max(140, up ? above : below);
    menu.style.maxHeight = `${room}px`;
    menu.classList.toggle('up', up);
    menu.style.top = `${up ? Math.max(8, r.top - Math.min(h, room) - 6) : r.bottom + 6}px`;
    menu.style.left = `${Math.max(8, Math.min(a.left, innerWidth - menu.offsetWidth - 8))}px`;
  };
  const focusOpt = (i) => opts[(i + opts.length) % opts.length]?.focus();
  const close = (refocus = true) => {
    if (!isOpen()) return;
    btn.setAttribute('aria-expanded', 'false');
    menu.classList.remove('open');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => { menu.hidden = true; }, SEL_REDUCED.matches ? 0 : 180);
    if (selOpen?.menu === menu) selOpen = null;
    if (refocus) btn.focus();
  };
  const open = () => {
    if (isOpen()) return;
    selOpen?.close(false);
    sync();
    clearTimeout(hideTimer);
    menu.hidden = false;
    place();
    btn.setAttribute('aria-expanded', 'true');
    selOpen = { menu, btn, close, place };
    requestAnimationFrame(() => menu.classList.add('open'));
    focusOpt(Math.max(0, sel.selectedIndex));
  };
  const choose = (i) => {
    const v = sel.options[i].value;
    close();
    if (v !== sel.value) { sel.value = v; sel.dispatchEvent(new Event('change', { bubbles: true })); }
  };
  btn.addEventListener('click', () => (isOpen() ? close() : open()));
  btn.addEventListener('keydown', (e) => {
    if (!['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) return;
    e.preventDefault();
    open();
    if (e.key === 'ArrowUp') focusOpt(opts.length - 1);
  });
  // clic en el rótulo (p. ej. "Izquierda"): enfoca el botón, como haría con el <select>
  sel.closest('label')?.addEventListener('click', (e) => { if (!btn.contains(e.target)) { e.preventDefault(); btn.focus(); } });
  let typed = '', typedAt = 0;
  const norm = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  menu.addEventListener('keydown', (e) => {
    const i = opts.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') focusOpt(i + 1);
    else if (e.key === 'ArrowUp') focusOpt(i - 1);
    else if (e.key === 'Home') focusOpt(0);
    else if (e.key === 'End') focusOpt(opts.length - 1);
    else if (e.key === 'Enter' || e.key === ' ') choose(Math.max(0, i));
    else if (e.key === 'Escape') close();
    else if (e.key === 'Tab') { close(false); return; }
    else if (e.key.length === 1) { // búsqueda por las primeras letras
      typed = (Date.now() - typedAt > 700 ? '' : typed) + norm(e.key);
      typedAt = Date.now();
      const j = opts.findIndex((o) => norm(o.textContent).startsWith(typed));
      if (j >= 0) focusOpt(j);
    } else return;
    e.preventDefault();
  });
  sync();
  return { sync, btn, menu, close, place };
}

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
const PARK_SHORT = F.parkShort || 'Parque Natural';     // etiqueta corta del espacio protegido
const PARK_IN = F.parkIn || `del Parque Natural de la ${F.park}`; // "dentro …" en el resumen
const ADMIN = F.admin || 'la Generalitat';             // administración forestal que actúa

// ------------------------------------------------------------------ paletas y textos
const C = {
  sev: { 1: '#4d9221', 2: '#fee08b', 3: '#fdae61', 4: '#f46d43', 5: '#a50026' },
  sevLbl: { 1: 'No quemado', 2: 'Baja', 3: 'Moderada-baja', 4: 'Moderada-alta', 5: 'Alta' },
  owner: { 0: '#bdbdbd', 1: '#2b83ba', 2: '#7b3294', 3: '#41b6c4', 4: '#fdae61' },
  veg: { 1: '#d95f02', 2: '#1b9e77', 3: '#66a61e', 4: '#a6d854', 5: '#00582a', 6: '#e6ab02', 7: '#1f78b4',
    8: '#b39ddb', 9: '#e1d5ee', 10: '#f5eeb0', 11: '#8c8c8c', 12: '#a6cee3', 13: '#8dd3c7',
    14: '#3f6e3a', 15: '#9c8c4a', 16: '#5aae61', 17: '#8c6d31', 18: '#2d9f8f' },
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
  owner: { name: '¿Es monte público?', desc: F.ownerDesc || 'Catálogo de montes de utilidad pública (GVA)', inside: false,
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
// sin capa ni protocolo del CEAM (incendios fuera de su ámbito): fire.js → hideCeam
if (F.hideCeam) {
  delete THEMES.ceam;
  THEMES.dry.desc = 'Pérdida de humedad (NDMI) de primavera a julio';
}
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
// autoría: discreta, abajo a la derecha, entre los créditos de las fuentes y el zoom
L.Control.Credit = L.Control.extend({
  options: { position: 'bottomright' },
  onAdd() {
    const d = L.DomUtil.create('div', 'map-credit');
    d.innerHTML = `Creado por <a href="#autor" class="credit-author" title="Ver autor y contacto">Joaquín García Nieto</a> · <a href="mailto:garcia.nieto.joaquin@gmail.com" title="Escríbeme"><span class="credit-long">garcia.nieto.joaquin@gmail.com</span><span class="credit-short">✉</span></a><span class="credit-long"> · proyecto divulgativo, no oficial</span>`;
    d.title = 'Proyecto independiente con fines divulgativos. No es una fuente oficial: ver Aviso en la pestaña Fuentes.';
    L.DomEvent.disableClickPropagation(d);
    // el nombre lleva a la tarjeta "Autor" (pestaña Fuentes); en móvil también despliega el panel
    d.querySelector('.credit-author').addEventListener('click', (e) => {
      e.preventDefault();
      document.querySelector('[data-tab=fuentes]').click();
      const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches;
      requestAnimationFrame(() => setTimeout(() => {
        const a = document.getElementById('autor');
        a?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
        a?.querySelector('h2')?.setAttribute('tabindex', '-1');
        a?.querySelector('h2')?.focus({ preventScroll: true }); // el foco sigue al usuario (teclado y lectores)
      }, 300));
    });
    return d;
  },
});
new L.Control.Credit().addTo(map);
L.control.zoom({ position: 'bottomright' }).addTo(map);
// en móvil los créditos ocupan mucho sobre el mapa: se pliegan en un botón ⓘ que los despliega al tocarlo
map.attributionControl.setPrefix('<button type="button" class="attr-toggle" aria-label="Mostrar créditos" aria-expanded="false">ⓘ</button><a href="https://leafletjs.com">Leaflet</a>');
map.attributionControl.getContainer().addEventListener('click', (e) => {
  const b = e.target.closest('.attr-toggle');
  if (!b) return;
  const open = b.parentElement.classList.toggle('open');
  b.setAttribute('aria-expanded', open);
});
const bounds = L.latLngBounds(meta.bounds);
const MOBILE = matchMedia('(max-width: 860px)');
// en móvil el panel tapa la parte inferior: centrar el incendio en la zona visible
map.fitBounds(bounds.pad(-0.05), MOBILE.matches ? { paddingTopLeft: [0, 60], paddingBottomRight: [0, innerHeight * 0.42] } : {});

for (const [name, z] of [['imgL', 300], ['imgR', 301], ['theme', 420], ['mask', 430], ['labels', 440], ['vec', 450]]) {
  map.createPane(name).style.zIndex = z;
}
map.getPane('mask').style.pointerEvents = 'none';
map.getPane('vec').style.pointerEvents = 'none';
map.getPane('labels').style.pointerEvents = 'none';

L.tileLayer('https://www.ign.es/wmts/ign-base?layer=IGNBaseTodo&style=default&tilematrixset=GoogleMapsCompatible&Service=WMTS&Request=GetTile&Version=1.0.0&Format=image/png&TileMatrix={z}&TileCol={x}&TileRow={y}', {
  attribution: 'Base: <a href="https://www.scne.es">CC BY 4.0 scne.es</a>', maxZoom: 18,
}).addTo(map);
// nombres de pueblos, carreteras y ríos (capa transparente del IGN) por encima de las imágenes y capas temáticas
L.tileLayer('https://www.ign.es/wmts/ign-base?layer=IGNBaseOrto&style=default&tilematrixset=GoogleMapsCompatible&Service=WMTS&Request=GetTile&Version=1.0.0&Format=image/png&TileMatrix={z}&TileCol={x}&TileRow={y}', {
  pane: 'labels', maxZoom: 18, bounds, // solo sobre la zona del incendio: fuera, el mapa base ya tiene los nombres
}).addTo(map);

// en pantallas estrechas los selectores del comparador usan etiquetas cortas ("23 ago 22"); la etiqueta
// completa se sigue viendo en las píldoras sobre el mapa (cmp-label)
const NARROW = matchMedia('(max-width: 480px)').matches;
const dayShort = (d) => `${day(d, false)} ${d.slice(2, 4)}`;
const IMAGES = {
  ...Object.fromEntries(F.images.map(([k, l]) => [k, { label: `${l} · ${day(SC[k])}`, short: `${l} · ${dayShort(SC[k])}`, a: l, b: day(SC[k]), src: `${DATA}s2_${k}.jpg` }])),
  ...Object.fromEntries(F.swir.map((k) => [`${k}_swir`, { label: `${F.images.find(([x]) => x === k)[1]} · falso color`, a: F.images.find(([x]) => x === k)[1], b: day(SC[k]), src: `${DATA}s2_${k}_swir.jpg` }])),
  pnoa: { label: F.pnoa, short: 'Ortofoto PNOA', a: F.pnoa.replace(/\s*\(.*$/, ''), b: (F.pnoa.match(/\((.*)\)/) || [])[1] || '', tiles: 'https://www.ign.es/wmts/pnoa-ma?layer=OI.OrthoimageCoverage&style=default&tilematrixset=GoogleMapsCompatible&Service=WMTS&Request=GetTile&Version=1.0.0&Format=image/jpeg&TileMatrix={z}&TileCol={x}&TileRow={y}' },
  // ortofotos históricas del PNOA (25 cm): mucho más detalle que Sentinel-2 (10 m), pero una sola fecha por vuelo
  ...Object.fromEntries((F.ortos || []).map((o) => [`orto${o.year}`, { label: `Ortofoto ${o.year} · ${o.label}`, short: `Ortofoto ${o.year}`, a: `Ortofoto ${o.year}`, b: o.label, wms: `PNOA${o.year}`, pre: o.pre }])),
  none: { label: 'Mapa base', a: 'Sin imagen', b: 'solo el mapa base' },
};
const S2_ATTR = `Contiene datos modificados de <a href="https://www.copernicus.eu">Copernicus Sentinel</a> (${S2_YEARS})`;
function makeImage(key, pane) {
  const d = IMAGES[key];
  if (d.tiles) return L.tileLayer(d.tiles, { pane, maxZoom: 19, attribution: 'PNOA: <a href="https://www.scne.es">CC BY 4.0 scne.es</a>' });
  if (d.wms) return L.tileLayer.wms('https://www.ign.es/wms/pnoa-historico', { layers: d.wms, format: 'image/jpeg', pane, maxZoom: 19, attribution: 'PNOA: <a href="https://www.scne.es">CC BY 4.0 scne.es</a>' });
  if (d.src) return L.imageOverlay(d.src, bounds, { pane, attribution: S2_ATTR });
  return null;
}

const cmp = { on: true, left: 'antes', right: 'despues', x: 0.5, layers: {}, shown: {}, manual: {} };
// Con mucho zoom, Sentinel-2 se ve borroso: si hay ortofoto de la misma época (antes o después del
// incendio), se muestra en su lugar; al alejarse vuelve la imagen elegida. Si con zoom alto se elige
// a mano una imagen en el selector, se respeta hasta que se vuelva a alejar.
const ORTO_ZOOM = 14;
function shownKey(side) {
  const k = cmp[side];
  const d = IMAGES[k];
  if (!d.src || cmp.manual[side] || map.getZoom() < ORTO_ZOOM) return k;
  const pre = SC[k.replace('_swir', '')] < SC.despues;
  return Object.keys(IMAGES).find((o) => IMAGES[o].wms && IMAGES[o].pre === pre) || k;
}
function setImage(side) {
  const pane = side === 'left' ? 'imgL' : 'imgR';
  if (cmp.layers[side]) map.removeLayer(cmp.layers[side]);
  cmp.shown[side] = shownKey(side);
  $(`#cmp-${side}`).value = cmp.shown[side]; // el selector muestra siempre la imagen que se ve
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
  if (map.getZoom() < ORTO_ZOOM) cmp.manual = {};
  for (const side of ['left', 'right']) if (shownKey(side) !== cmp.shown[side]) setImage(side);
  clip();
});

// secciones del desplegable del comparador (las claves de IMAGES ya van en este orden)
const imgGroup = (k) => (k === 'none' ? 'Mapa base' : IMAGES[k].tiles || IMAGES[k].wms ? 'Ortofotos' : k.endsWith('_swir') ? 'Falso color (rebrote)' : 'Imágenes de satélite');
for (const side of ['left', 'right']) {
  const sel = $(`#cmp-${side}`);
  const groups = {};
  for (const [k, v] of Object.entries(IMAGES)) {
    (groups[imgGroup(k)] ||= []).push(`<option value="${k}" data-a="${esc(v.a)}" data-b="${esc(v.b)}">${esc(NARROW && v.short ? v.short : v.label)}</option>`);
  }
  sel.innerHTML = Object.entries(groups).map(([g, o]) => `<optgroup label="${g}">${o.join('')}</optgroup>`).join('');
  sel.value = cmp[side];
  sel.onchange = () => { cmp[side] = sel.value; cmp.manual[side] = map.getZoom() >= ORTO_ZOOM; setImage(side); clip(); };
  // en móvil el menú ocupa el ancho de la barra del comparador
  enhanceSelect(sel, { cls: 'cmp', label: sel.closest('label').querySelector('.cmp-cap'), alignTo: () => (MOBILE.matches ? $('#compare-bar') : null) });
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
  // con teclado: la barra es un control deslizante (←/→ mueven un 5 %, Inicio/Fin a los extremos)
  Object.assign(handle, { tabIndex: 0 });
  handle.setAttribute('role', 'slider');
  handle.setAttribute('aria-label', 'Posición de la barra del comparador');
  handle.setAttribute('aria-valuemin', 2);
  handle.setAttribute('aria-valuemax', 98);
  const sync = () => { handle.setAttribute('aria-valuenow', Math.round(cmp.x * 100)); handle.setAttribute('aria-valuetext', `${Math.round(cmp.x * 100)} % desde la izquierda`); };
  sync();
  map.on('move zoom resize', sync);
  handle.addEventListener('pointerup', sync);
  handle.addEventListener('keydown', (e) => {
    const step = { ArrowLeft: -0.05, ArrowDown: -0.05, ArrowRight: 0.05, ArrowUp: 0.05 }[e.key];
    if (step === undefined && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault(); e.stopPropagation();
    cmp.x = e.key === 'Home' ? 0.02 : e.key === 'End' ? 0.98 : Math.max(0.02, Math.min(0.98, cmp.x + step));
    clip(); sync();
  });
}
setImage('left');
setImage('right');
clip();

// --- capa temática
const canvas = Object.assign(document.createElement('canvas'), { width: W, height: H });
const ctx = canvas.getContext('2d');
const theme = { key: 'none', opacity: 0.75, scope: 'all', insideOnly: true };
// filtro por municipio: índice (1-based) en meta.municipios, como la capa G.mun; 0 = todos
const munF = { idx: 0, name: null, layers: [] };
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
    if (munF.idx && G.mun[i] !== munF.idx) continue;
    let c = t.color(i);
    if (!c) continue;
    if (typeof c === 'string') c = hex(c);
    d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; d[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  themeLayer = L.imageOverlay(canvas.toDataURL(), bounds, {
    pane: 'theme', opacity: theme.opacity, className: 'pixelated',
    attribution: F.attrib || '© Unión Europea, Copernicus EMS · ICV/GVA · IGME-CSIC · MITECO · Copernicus DEM',
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
function queryPoint(ll, byKeyboard = false) {
  const i = pixelAt(ll);
  if (i < 0) return;
  if (marker) marker.setLatLng(ll); else marker = L.circleMarker(ll, { radius: 6, color: '#fff', weight: 2, fillColor: '#111', fillOpacity: 1, pane: 'vec' }).addTo(map);
  showInfo(i, ll, byKeyboard);
}
map.on('click', (e) => queryPoint(e.latlng));
// accesibilidad: el mapa se maneja con teclado (flechas para moverse, + y − para el zoom) e Intro consulta el centro
{
  const mc = map.getContainer();
  mc.setAttribute('role', 'application');
  mc.setAttribute('aria-roledescription', 'mapa');
  mc.setAttribute('aria-label', `Mapa del incendio. Flechas para moverte, + y − para el zoom, Intro para consultar el punto central. Los mismos datos están en texto en las pestañas Resumen y Plan.`);
  mc.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.target !== mc) return;
    e.preventDefault();
    queryPoint(map.getCenter(), true);
  });
}

// texto de las píldoras: negro o blanco, el que tenga más contraste con el fondo (WCAG)
const lum = (c) => c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((a, v, j) => a + v * [0.2126, 0.7152, 0.0722][j], 0);
function pill(color, text) {
  const c = typeof color === 'string' ? hex(color) : color;
  const L0 = lum(c);
  const dark = (L0 + 0.05) / (lum([17, 17, 17]) + 0.05) >= 1.05 / (L0 + 0.05);
  return `<span class="pill" style="background:rgb(${c});color:${dark ? '#111' : '#fff'}">${text}</span>`;
}
function showInfo(i, ll, byKeyboard = false) {
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
    ...(HAS_PN ? [[PARK_SHORT, G.pn[i] ? `Sí · ${F.park}` : 'No']] : []),
    ['Sustrato', leg.sub[G.sub[i]] || 's/d'],
    ['Altitud · pendiente', `${fmt(G.elev[i] * 5)} m · ${fmt(G.slope[i])} %`],
    ['Incendios previos', fuegos.length ? fuegos.join(', ') : `Ninguno desde ${F.firesFrom}`],
    [`Sequedad ${month(SC.abril)} → ${month(SC.antes)}`, G.dndmi[i] ? `NDMI ${fmt((G.dndmi[i] - 100) / 100, 2)}` : 's/d'],
    ...(G.ceam[i] && !F.hideCeam ? [['Criterio CEAM', `${pill(C.ceam[G.ceam[i]], leg.ceam[G.ceam[i]])}<br><small>Cobertura vegetal estimada: ${fmt(G.recov[i])} % (${CEAM_DATE}). El CEAM lo evalúa a 1–2 años del incendio.</small>`]] : []),
  ];
  let html = `<button type="button" class="close" aria-label="Cerrar la ficha del punto">×</button><h3 id="info-title" tabindex="-1">${inside ? 'Punto afectado' : 'Punto consultado'}</h3><small>${ll.lat.toFixed(5)}, ${ll.lng.toFixed(5)}</small>`;
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
  // lectores de pantalla: se anuncia la ficha; con teclado, el foco va a la ficha y al cerrarla vuelve al mapa
  announce(`Ficha del punto: ${inside ? 'dentro del área quemada' : 'fuera del área quemada'}${G.mun[i] ? `, ${meta.municipios[G.mun[i] - 1]}` : ''}.`);
  if (byKeyboard) $('#info-title').focus();
  $('.close', el).onclick = () => {
    const back = el.contains(document.activeElement);
    el.classList.add('hidden');
    if (marker) { map.removeLayer(marker); marker = null; }
    if (back) map.getContainer().focus();
  };
}
// región viva (oculta) para avisos a lectores de pantalla
function announce(msg) {
  let r = $('#sr-live');
  if (!r) document.body.insertAdjacentHTML('beforeend', '<div id="sr-live" class="sr-only" aria-live="polite"></div>'), r = $('#sr-live');
  r.textContent = '';
  setTimeout(() => (r.textContent = msg), 50);
}

// ------------------------------------------------------------------ pestañas
// patrón ARIA de pestañas: tablist/tab/tabpanel, foco itinerante y flechas ←/→, Inicio/Fin
{
  const tabs = [...document.querySelectorAll('.tabs [role=tab]')];
  $('.tabs').setAttribute('aria-label', 'Secciones');
  const select = (b, focus = false) => {
    for (const x of tabs) {
      const on = x === b;
      x.classList.toggle('active', on);
      x.setAttribute('aria-selected', on);
      x.tabIndex = on ? 0 : -1;
      $(`#tab-${x.dataset.tab}`).classList.toggle('active', on);
    }
    if (focus) b.focus();
  };
  for (const b of tabs) {
    const p = $(`#tab-${b.dataset.tab}`);
    b.id = `tabbtn-${b.dataset.tab}`;
    b.type = 'button';
    b.setAttribute('aria-controls', p.id);
    p.setAttribute('role', 'tabpanel');
    p.setAttribute('aria-labelledby', b.id);
    p.tabIndex = 0; // el panel tiene scroll propio: debe poder enfocarse para desplazarlo con teclado
    b.onclick = () => select(b);
    b.addEventListener('keydown', (e) => {
      const i = tabs.indexOf(b);
      const j = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
      if (j === undefined) return;
      e.preventDefault();
      select(tabs[(j + tabs.length) % tabs.length], true);
    });
  }
  select(tabs.find((b) => b.classList.contains('active')) || tabs[0]);
}
// enlace "saltar" al principio de la página (visible solo al enfocarlo con el teclado)
document.body.insertAdjacentHTML('afterbegin', '<a class="skip-link" href="#tabbtn-resumen">Saltar a los datos del incendio</a>');
$('.skip-link').addEventListener('click', (e) => { e.preventDefault(); $('.tabs [aria-selected=true]').focus(); });
// ficha del punto y leyenda: regiones con nombre; la ficha se cierra con Escape
{
  const info = $('#info');
  info.setAttribute('role', 'region');
  info.setAttribute('aria-labelledby', 'info-title');
  info.addEventListener('keydown', (e) => { if (e.key === 'Escape') $('.close', info)?.click(); });
  const lg = $('#legend');
  lg.setAttribute('role', 'region');
  lg.setAttribute('aria-label', 'Leyenda de la capa');
  lg.tabIndex = 0;
}

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
    <table><thead><tr><th>Paraje</th><th>CEAM</th><th>dNBR medio (500 m)</th><th>¿Coincide?</th></tr></thead><tbody>${zonas}</tbody></table>
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
  const pine = S.pine_ha ?? (S.veg_before['Pinar de pino carrasco'] || 0) + (S.veg_before['Pinar de rodeno (P. pinaster)'] || 0) + (S.veg_before['Bosque mixto pino + frondosas'] || 0)
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
      ${HAS_PN ? `<div class="kpi"><b>${ha(S.pn_ha)}</b><span>dentro ${PARK_IN}</span></div>` : ''}
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
        : `El ${fmt((S.public_ha / S.grid_ha) * 100)} % es <b>monte público</b>, donde ${ADMIN} puede actuar directamente; en el resto, sobre todo privado, hacen falta acuerdos con los propietarios.`}
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
    a arder después del inventario${F.reburnNota ?? ' (sobre todo en el incendio de Andilla de 2012)'}: allí solo había regenerado joven.` : ''} Ver método en Fuentes.</p>` : ''}
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
  const munList = Object.entries(S.municipios || {}).filter(([, v]) => v.total > 0).sort((a, b) => b[1].total - a[1].total);
  $('#tab-capas').innerHTML = `
    <h2 id="mun-lbl">Municipio</h2>
    <select id="mun-sel">
      <option value="" data-a="Todos los municipios" data-b="${munList.length} municipios · ${ha(S.grid_ha)}">Todos los municipios</option>
      ${munList.map(([n, v]) => `<option value="${esc(n)}" data-a="${esc(n)}" data-b="${ha(v.total)}">${esc(n)} · ${ha(v.total)}</option>`).join('')}
    </select>
    <div id="mun-card"></div>
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
      ${HAS_PN ? `<button class="chip" data-s="pn">${PARK_SHORT}</button>` : ''}
    </div>
    <div class="row"><label><input type="checkbox" id="insideOnly" checked> Solo dentro del área quemada</label></div>
    <h2>Límites</h2>
    <div class="row" style="flex-direction:column;align-items:flex-start;gap:6px">
      <label><input type="checkbox" data-v="perimetro" checked> Área quemada (Copernicus EMS)</label>
      <label><input type="checkbox" data-v="montes" checked> Montes de utilidad pública <span class="sw" style="background:#08519c"></span></label>
      ${HAS_PN ? `<label><input type="checkbox" data-v="parque" checked> ${PARK_SHORT} ${F.park} <span class="sw" style="background:#1b7837"></span></label>` : ''}
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
    document.querySelectorAll('#scope .chip').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); });
    renderTheme();
  }));
  $('#insideOnly').onchange = (e) => { theme.insideOnly = e.target.checked; renderTheme(); };
  document.querySelectorAll('[data-v]').forEach((c) => (c.onchange = () => { vecOn[c.dataset.v] = c.checked; syncVec(); }));
  document.querySelectorAll('[data-p]').forEach((b) => (b.onclick = () => {
    const [l, r] = b.dataset.p.split('|');
    Object.assign(cmp, { left: l, right: r, manual: map.getZoom() >= ORTO_ZOOM ? { left: true, right: true } : {} });
    $('#cmp-left').value = l; $('#cmp-right').value = r;
    if (!cmp.on) $('#cmp-toggle').click();
    setImage('left'); setImage('right'); clip();
  }));
}

// --- filtro por municipio: solo se pinta su término, se atenúa el resto y se resume lo que ardió en él
const norm = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
function munCard() {
  const el = $('#mun-card');
  if (!munF.idx) { el.innerHTML = ''; return; }
  let tot = 0, forest = 0, pub = 0;
  const sev = {}, veg = {}, act = {};
  for (let i = 0; i < N; i++) {
    if (G.mun[i] !== munF.idx || !G.inside[i]) continue;
    tot++;
    if (FOREST(G.veg[i])) forest++;
    if (PUBLIC(G.owner[i])) pub++;
    sev[G.sev[i]] = (sev[G.sev[i]] || 0) + 1;
    veg[G.veg[i]] = (veg[G.veg[i]] || 0) + 1;
    act[G.act[i]] = (act[G.act[i]] || 0) + 1;
  }
  const h = (n) => n * PIX_HA;
  const pct = (n) => (tot ? `${fmt((n / tot) * 100)} %` : '—');
  const obj = (o, lbl, keys = Object.keys(o)) => Object.fromEntries(keys.filter((k) => o[k] && lbl[k]).map((k) => [lbl[k], h(o[k])]));
  const vegTop = Object.keys(veg).filter((k) => +k).sort((a, b) => veg[b] - veg[a]).slice(0, 3);
  const actLbl = Object.fromEntries(Object.entries(ACT_INFO).map(([k, v]) => [k, v.corto]));
  const actKeys = Object.keys(act).filter((k) => +k && +k !== 5).sort((a, b) => act[b] - act[a]);
  const feat = municipios.features.find((f) => f.properties.nom_mun === munF.name);
  const where = feat?.properties.comarca;
  el.innerHTML = `<div class="mun-card">
    <div class="mun-head"><div><b>${esc(munF.name)}</b>${where ? `<small class="muted">${esc(where)}</small>` : ''}</div>
      <button type="button" class="chip" id="mun-clear">Quitar filtro</button></div>
    <div class="kpis">
      <div class="kpi accent"><b>${ha(h(tot))}</b><span>quemadas en el término</span></div>
      <div class="kpi"><b>${ha(h(forest))}</b><span>de ellas forestales (${pct(forest)})</span></div>
      <div class="kpi"><b>${ha(h(pub))}</b><span>monte público (${pct(pub)})</span></div>
      <div class="kpi"><b>${ha(h(tot - pub))}</b><span>sin catalogar, sobre todo privado (${pct(tot - pub)})</span></div>
    </div>
    <h3>Severidad</h3>${bars(obj(sev, C.sevLbl, ['1', '2', '3', '4', '5']), byLabel(C.sevLbl, C.sev))}
    <h3>Qué había antes</h3>${bars(obj(veg, leg.veg, vegTop), byLabel(leg.veg, C.veg))}
    ${actKeys.length ? `<h3>Actuación recomendada</h3>${bars(obj(act, actLbl, actKeys), byLabel(actLbl, C.act))}` : ''}
    <p class="muted">Superficie vista quemada por satélite dentro del término; el reparto oficial puede variar. Pulsa el mapa para ver la ficha de cada punto.</p>
  </div>`;
  $('#mun-clear').onclick = () => { setMun(null); $('#mun-sel-btn')?.focus(); };
}
function setMun(name, { fit = true } = {}) {
  const idx = name ? meta.municipios.indexOf(name) + 1 : 0;
  munF.idx = idx; munF.name = idx ? name : null;
  munF.layers.forEach((l) => map.removeLayer(l));
  munF.layers = [];
  const feat = idx && municipios.features.find((f) => f.properties.nom_mun === name);
  if (feat) {
    const line = L.geoJSON(feat, { pane: 'vec', interactive: false, style: { color: '#111', weight: 3.2, fill: false } });
    const halo = L.geoJSON(feat, { pane: 'vec', interactive: false, style: { color: '#fff', weight: 6, opacity: 0.8, fill: false } });
    // máscara: el mundo con el término como agujero, para atenuar todo lo de fuera
    const polys = feat.geometry.type === 'Polygon' ? [feat.geometry.coordinates] : feat.geometry.coordinates;
    const holes = polys.map((p) => p[0].map(([x, y]) => [y, x]));
    const mask = L.polygon([[[-89, -179], [-89, 179], [89, 179], [89, -179]], ...holes],
      { pane: 'mask', interactive: false, stroke: false, fillColor: '#fff', fillOpacity: 0.45 });
    munF.layers = [mask, halo, line];
    munF.layers.forEach((l) => l.addTo(map));
    if (fit) map.fitBounds(line.getBounds().pad(0.05), MOBILE.matches ? { paddingTopLeft: [0, 60], paddingBottomRight: [0, innerHeight * 0.42] } : {});
  }
  const sel = $('#mun-sel');
  if (sel && sel.value !== (munF.name || '')) sel.value = munF.name || '';
  renderTheme();
  munCard();
  history.replaceState(null, '', munF.name ? `#municipio=${encodeURIComponent(munF.name)}` : location.pathname + location.search);
  announce(munF.name ? `Mapa filtrado: solo el término municipal de ${munF.name}.` : 'Mapa sin filtro de municipio: se muestran todos.');
}
$('#mun-sel').addEventListener('change', (e) => setMun(e.target.value || null));
enhanceSelect($('#mun-sel'), { cls: 'wide mun', label: $('#mun-lbl') });
// #municipio=… en la URL (enlace compartible); los demás anclajes (#autor, #tabbtn-…) no tocan el filtro
function munFromHash() {
  const m = location.hash.match(/(?:^#|&)municipio=([^&]*)/);
  if (!m) return null;
  let q;
  try { q = norm(decodeURIComponent(m[1].replace(/\+/g, ' '))); } catch { return null; }
  return Object.keys(S.municipios || {}).find((n) => norm(n) === q) || null;
}
addEventListener('hashchange', () => { const n = munFromHash(); if (n && n !== munF.name) setMun(n); });

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
  recargo: F.recargo || 'vaersa',
};
if (F.sinVaersa) delete RECARGO.vaersa;
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
      <td>${fmt(A[k])}</td><td><input type="number" min="0" step="100" data-c="${k}" value="${plan.cost[k]}" aria-label="€/ha · ${name}"></td><td>${eur(t)}</td></tr>`;
  }).join('');
  const pct = Math.min(100, (plan.budget / total) * 100);
  // al recalcular se rehace la tabla: recordar qué control tenía el foco para devolvérselo (teclado)
  const ae = document.activeElement;
  const refocus = ae && $('#plan-table').contains(ae) ? (ae.dataset.c ? `[data-c="${ae.dataset.c}"]` : ae.id ? `#${ae.id}` : null) : null;
  $('#plan-table').innerHTML = `<table><thead><tr><th>Actuación</th><th>ha</th><th>€/ha</th><th>Coste</th></tr></thead>
    <tbody>${body}</tbody><tfoot><tr><td>Total</td><td></td><td></td><td>${eur(total)}</td></tr></tfoot></table>
    <div class="row"><label><span id="recargo-lbl">Forma de ejecución</span> <select id="recargo">${Object.entries(RECARGO).map(([k, r]) => `<option value="${k}" data-a="${esc(r.lbl.replace(/\s*\(.*$/, ''))}" data-b="${esc((r.lbl.match(/\((.*)\)/) || [])[1] || '')}" ${k === plan.recargo ? 'selected' : ''}>${r.lbl}</option>`).join('')}</select></label></div>
    <div class="budget"><p><label for="budget">Presupuesto de referencia:</label> <input type="number" id="budget" step="100000" min="0" value="${plan.budget}" style="width:110px"> €
    → cubre el <b>${fmt(pct)} %</b> de este escenario${total > plan.budget ? `; faltarían <b>${eur(total - plan.budget)}</b>` : ''}.</p>
    <div class="track" aria-hidden="true"><div class="fill" style="width:${pct}%"></div></div></div>`;
  enhanceSelect($('#recargo'), { cls: 'wide', label: $('#recargo-lbl') });
  if (refocus) $(refocus)?.focus();
  // se recalcula en el siguiente ciclo: así, si el cambio llega al salir con Tab, el foco ya está en el control siguiente y se conserva
  const later = () => setTimeout(renderPlan);
  document.querySelectorAll('[data-c]').forEach((inp) => (inp.onchange = () => { plan.cost[inp.dataset.c] = +inp.value || 0; later(); }));
  $('#budget').onchange = (e) => { plan.budget = +e.target.value || 0; later(); };
  $('#recargo').onchange = (e) => { plan.recargo = e.target.value; later(); };
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
    ${F.jornalNota || 'Los jornales de Extremadura (peón 11,08 €/h) pueden ser algo más bajos que en Castellón.'}</p>
    <h2>Superficie por actuación y propiedad</h2>
    <table><thead><tr><th>Actuación</th><th>Público</th><th>Privado</th></tr></thead><tbody>
      ${[1, 2, 3, 4].map((n) => `<tr><td>${ACT_INFO[n].corto}</td><td>${fmt(k(n).publico)}</td><td>${fmt(k(n).privado)}</td></tr>`).join('')}
    </tbody></table>
    <div class="callout"><b>El reto es la propiedad.</b> Solo el ${fmt((S.public_ha / S.grid_ha) * 100, 1)} % del área quemada es monte público catalogado.
    Para actuar en el resto hacen falta herramientas para propietarios privados:
    <ul>
      <li><b>Declaración de zona de actuación urgente</b> para trabajos de emergencia (erosión) en cualquier propiedad.</li>
      <li><b>Convenios o consorcios</b> entre ${ADMIN} y los propietarios para ejecutar la restauración.</li>
      <li><b>Agrupaciones de propietarios</b> y <b>custodia del territorio</b> (asociaciones, fundaciones) para gestionar fincas pequeñas.</li>
      <li><b>Ayudas FEADER/PAC</b> a la reforestación y a la recuperación de cultivos de secano como mosaico cortafuegos.</li>
      <li><b>Mercado voluntario de carbono y patrocinio</b> (Registro de huella de carbono del MITECO) para financiar plantaciones.</li>
    </ul></div>
  `;
  document.querySelectorAll('#pscope .chip').forEach((b) => (b.onclick = () => {
    plan.scope = b.dataset.s;
    document.querySelectorAll('#pscope .chip').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); });
    renderPlan();
  }));
  renderPlan();
}

// --- Cómo
{
  const act = (a) => `<details><summary><span class="sw" style="display:inline-block;background:${a === EMERG ? C.eros[4] : C.act[Object.keys(ACT_INFO).find((k) => ACT_INFO[k] === a)]}"></span> ${a.corto}</summary><p>${a.que}</p><ul>${a.como.map((x) => `<li>${x}</li>`).join('')}</ul></details>`;
  $('#tab-como').innerHTML = `
    ${F.hideCeam ? `<div class="callout"><b>Primero el suelo, luego la vegetación.</b> Las actuaciones de emergencia para conservar el suelo
    y regular el agua se hacen en las primeras semanas o meses, antes de las lluvias fuertes de otoño. Plantar o sembrar se decide
    <b>uno o dos años después del incendio</b>, cuando se puede comprobar en campo qué ha rebrotado y cuánto pino ha nacido.
    ${typeof F.ceamNow === 'function' ? F.ceamNow(S, ha) : F.ceamNow}</div>` : `<div class="callout"><b>Protocolo de la Fundación CEAM</b> (manual Postfire-DSS). Las actuaciones de emergencia para conservar el suelo
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
    ${typeof F.ceamNow === 'function' ? F.ceamNow(S, ha) : F.ceamNow}</div>`}
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
      <li>Voluntariado sin coordinación: cualquier plantación o recogida de semillas, siempre con ${ADMIN} o el ayuntamiento.</li>
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
    ${F.fuentesMontes || `<li><b>Monte público:</b> <a href="https://dadesobertes.gva.es/es/dataset/montes-gestionados-por-la-administracion-autonomica1" target="_blank" rel="noopener">Montes gestionados por la Generalitat (catálogo de utilidad pública)</a>, ICV/GVA.</li>
    <li><b>Vegetación previa:</b> Mapa Forestal de España 1:50.000 (MITECO), servido por el ICV.</li>`}
    <li><b>Vegetación potencial:</b> <a href="https://www.miteco.gob.es/es/biodiversidad/servicios/banco-datos-naturaleza/informacion-disponible/memoria_mapa_series_veg_descargas.html" target="_blank" rel="noopener">Mapa de Series de Vegetación de España</a> (S. Rivas-Martínez, 1987), Banco de Datos de la Naturaleza, MITECO.
    Especies y revisión: Rivas-Martínez, S. y col. (2007, 2011). <i>Mapa de series, geoseries y geopermaseries de vegetación de España.</i> Itinera Geobotanica 17: 5-436 y 18(1): 5-424.</li>
    <li><b>Geología:</b> <a href="https://mapas.igme.es/gis/rest/services/Cartografia_Geologica/IGME_Geode_50/MapServer" target="_blank" rel="noopener">IGME GEODE 1:50.000</a>.</li>
    <li><b>Relieve:</b> Copernicus DEM GLO-30.</li>
    ${F.fuentesOtras || `<li><b>Incendios ${FIRES_RANGE}</b>, <b>Parque Natural</b> y <b>términos municipales</b>: Generalitat Valenciana (ICV).</li>`}
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
    <li><b>Sequedad previa:</b> NDMI = (B8 − B11)/(B8 + B11), imágenes Sentinel-2 del ${F.fechasSequedad || `${day(SC.abril)} y del ${day(SC.antes)}`}${F.hideCeam ? '' : ', como el análisis de la Fundación CEAM'}. Se compara la media dentro del área quemada.</li>
    ${F.hideCeam ? '' : `<li><b>Criterio CEAM:</b> cobertura vegetal estimada = (NDVI ahora − NDVI de suelo quemado) / (NDVI de vegetación densa − NDVI de suelo quemado),
    con suelo quemado = ${fmt(S.soil_ndvi, 2)} (mediana tras el fuego en severidad alta) y vegetación densa = ${fmt(S.full_ndvi, 2)} (percentil 95 del bosque no quemado).
    Umbrales del CEAM: 30 % y 60 % de cobertura de especies leñosas rebrotadoras. El NDVI no distingue leñosas de hierbas, así que es una aproximación;
    el CEAM lo evalúa en campo.</li>`}
    <li><b>Erosión:</b> (clase de severidad − 1) × pendiente/25 %.</li>
    <li><b>Viabilidad:</b> base según la cercanía entre lo que había y lo que debería haber; ajustes por severidad, recurrencia (−12 por incendio previo), pendiente &gt;50 %, solanas secas sobre rodeno y rebrote observado (+10).</li>
  </ul>
${F.fuentesCeam}
  <h2>Licencias y atribución</h2>
  <ul>
    <li>Copernicus EMS: © Unión Europea, Copernicus Emergency Management Service (${F.ems}). <a href="https://mapping.emergency.copernicus.eu/terms-and-conditions/" target="_blank" rel="noopener">Condiciones</a>.</li>
    <li>Contiene datos modificados de Copernicus Sentinel (${S2_YEARS}), procesados por el autor de este proyecto.</li>
    <li>Copernicus DEM GLO-30: © DLR e.V. 2010-2014 y © Airbus Defence and Space GmbH 2014-2018, suministrado bajo COPERNICUS por la Unión Europea y la ESA.</li>
    ${F.licencias || '<li>Montes, Mapa Forestal 1:50.000, Parque Natural e incendios históricos: Institut Cartogràfic Valencià / Generalitat Valenciana, CC BY 4.0. El Mapa Forestal de España es obra del MITECO.</li>'}
    <li>Geología: IGME-CSIC, GEODE 1:50.000, CC BY 4.0.</li>
    <li>Mapa de Series de Vegetación de España: MITECO, Banco de Datos de la Naturaleza.</li>
    <li>Mapa base y ortofoto PNOA: CC BY 4.0 scne.es (Instituto Geográfico Nacional).</li>
    <li>Leaflet: BSD-2-Clause. Código de esta aplicación: licencia MIT.</li>
  </ul>
  <p>Las capas derivadas (severidad, actuaciones, viabilidad, costes) son elaboración propia y ninguno de los organismos citados las ha revisado ni respaldado.</p>
  <h2>Aviso</h2>
  <p>Proyecto independiente con fines informativos y divulgativos. <b>No es una fuente oficial</b> y no tiene relación con ${F.organismos || 'la Generalitat Valenciana'}, el Ministerio ni ningún otro organismo.
  No debe usarse para tomar decisiones de emergencia, delimitar propiedades ni sustituir el criterio de técnicos forestales. Los datos se ofrecen tal cual, sin garantía.
  La propiedad indicada procede del catálogo público de montes y no identifica a propietarios particulares.</p>
  <p>La app no usa cookies ni analítica. Las teselas del mapa base se cargan desde los servidores del IGN.</p>
  <h2>Limitaciones</h2>
  <ul>
    <li>El área de Copernicus (${ha(S.ems_ha)}) es lo que se ve quemado desde satélite; ${F.officialLimit}.</li>
    <li>${F.limitMontes || 'La capa de montes públicos solo incluye montes gestionados por la Generalitat; puede haber otras fincas públicas no catalogadas.'}</li>
    <li>Resolución de análisis: 25 m. Sirve para planificar, no para delimitar parcelas.</li>
    <li>La vegetación potencial procede de un mapa nacional muy general (1987). La revisión de 2011 cambia la serie asignada a algunas zonas, pero no se distribuye como capa SIG. Debe validarse con técnicos forestales y trabajo de campo.</li>
    <li>Costes: precios unitarios de las <a href="http://extremambiente.juntaex.es/files/2024/forestales/Tarifas%20SOGF_2024.pdf" target="_blank" rel="noopener">Tarifas forestales de la Junta de Extremadura 2024</a>${F.recargoNota ?? '; recargos de VAERSA según la <a href="https://dogv.gva.es/datos/2025/09/30/pdf/2025_41281_es.pdf" target="_blank" rel="noopener">Resolución de 25/9/2025 (DOGV)</a>'}. Las densidades de plantación (500 y 1.000 plantas/ha) son supuestos del modelo.</li>
  </ul>
`;

// --- autor: firma visible y contacto (los campos vacíos no se muestran)
const AUTHOR = {
  name: 'Joaquín García Nieto',
  github: 'https://github.com/jgarnie',
  linkedin: 'https://www.linkedin.com/in/jgarnie/',
  email: 'garcia.nieto.joaquin@gmail.com',
};
const authorLinks = [
  AUTHOR.linkedin && `<a href="${AUTHOR.linkedin}" target="_blank" rel="noopener">LinkedIn</a>`,
  AUTHOR.email && `<a href="mailto:${AUTHOR.email}">${AUTHOR.email}</a>`,
  `<a href="${AUTHOR.github}" target="_blank" rel="noopener">GitHub</a>`,
].filter(Boolean);
$('#tab-fuentes').insertAdjacentHTML('beforeend', `<div class="author-card" id="autor">
  <h2>Autor</h2>
  <p>Proyecto independiente de <b>${AUTHOR.name}</b>, hecho con datos abiertos de satélite y cartografía pública.
  ¿Te interesa, quieres colaborar o usarlo en tu municipio o asociación? Escríbeme.</p>
  <p class="author-links">${authorLinks.join(' · ')}</p>
  <p class="muted">Código abierto en <a href="https://github.com/jgarnie/fenix" target="_blank" rel="noopener">github.com/jgarnie/fenix</a>.</p>
  <p class="muted"><b>Pregúntale a tu IA por estos incendios:</b> Fénix funciona con Claude y ChatGPT. <a href="https://github.com/jgarnie/fenix#%C3%BAsalo-con-tu-ia" target="_blank" rel="noopener">Cómo conectarlo</a> · <a href="https://github.com/jgarnie/fenix/releases/latest/download/fenix.mcpb">Descargar para Claude Desktop</a>.</p>
</div>`);

// --- selector de incendio: la lista vive aquí (una sola vez para todos); `dir` es la carpeta dentro de public/
// y `dataDir` el de cada fire.js, que sirve para marcar el incendio actual. Al añadir un incendio, añadirlo aquí.
const FIRE_LIST = [
  { dir: '', dataDir: 'vallduixo', label: "Espadà · Vall d'Uixó (2026)", name: 'Espadà', detail: "Vall d'Uixó · Castellón · julio 2026" },
  { dir: 'bejis/', dataDir: 'bejis', label: 'Bejís · Alto Palancia (2022)', name: 'Bejís', detail: 'Alto Palancia · Castellón y Valencia · agosto 2022' },
  { dir: 'tietar/', dataDir: 'tietar', label: 'Tiétar · Ávila y Madrid (2026)', name: 'Tiétar', detail: 'Alberche y valle del Tiétar · Ávila y Madrid · julio 2026' },
  { dir: 'villanueva-de-viver/', dataDir: 'villanueva-de-viver', label: 'Villanueva de Viver (2023)', name: 'Villanueva de Viver', detail: 'Alto Mijares · Castellón y Teruel · marzo 2023' },
];
// desplegable propio (enhanceSelect sobre un <select> con la URL de cada incendio)
{
  const root = new URL('./', import.meta.url); // app.js está en la raíz de public/
  const cur = Math.max(0, FIRE_LIST.findIndex((f) => f.dataDir === F.dataDir));
  const href = (f) => new URL(f.dir, root).href;
  $('.brand').insertAdjacentHTML('beforeend', `<div class="fire-switch"><span id="fire-switch-lbl">Incendio:</span>
    <select id="fire-sel">${FIRE_LIST.map((f, i) => `<option value="${href(f)}" data-a="${esc(f.name)}" data-b="${esc(f.detail)}"${i === cur ? ' selected' : ''}>${esc(f.label)}</option>`).join('')}</select></div>`);
  const sel = $('#fire-sel');
  enhanceSelect(sel, { cls: 'fire', label: $('#fire-switch-lbl') });
  sel.addEventListener('change', () => { location.href = sel.value; });
  addEventListener('pageshow', () => { sel.value = href(FIRE_LIST[cur]); }); // al volver con "atrás"
}

// --- móvil: el panel funciona como hoja inferior con tres estados: 'min' (solo la pestaña), 'peek' y 'open'
{
  const panel = $('#panel');
  const handle = $('#sheet-handle');
  const state = () => document.body.classList.contains('sheet-open') ? 'open' : document.body.classList.contains('sheet-min') ? 'min' : 'peek';
  const setState = (s) => {
    if (!MOBILE.matches || s === state()) return;
    document.body.classList.toggle('sheet-open', s === 'open');
    document.body.classList.toggle('sheet-min', s === 'min');
    handle.setAttribute('aria-expanded', s !== 'min');
  };
  // la pestaña: desde minimizado vuelve a la hoja; si no, alterna entre hoja y expandido
  handle.addEventListener('click', () => setState(state() === 'min' ? 'peek' : state() === 'open' ? 'peek' : 'open'));
  // al poner el foco o tocar algo del panel, se expande
  panel.addEventListener('focusin', (e) => { if (e.target !== handle) setState('open'); });
  panel.addEventListener('click', (e) => { if (!handle.contains(e.target)) setState('open'); });
  // deslizar hacia arriba expande un nivel; hacia abajo (con el contenido arriba del todo) contrae un nivel
  let y0 = null;
  let scroller = null;
  panel.addEventListener('touchstart', (e) => { y0 = e.touches[0].clientY; scroller = e.target.closest('.tab'); }, { passive: true });
  panel.addEventListener('touchmove', (e) => {
    if (y0 === null) return;
    const dy = y0 - e.touches[0].clientY;
    const s = state();
    if (dy > 12 && s !== 'open') { setState(s === 'min' ? 'peek' : 'open'); y0 = null; }
    else if (dy < -12 && s !== 'min' && (!scroller || scroller.scrollTop <= 0)) { setState(s === 'open' ? 'peek' : 'min'); y0 = null; }
  }, { passive: true });
  panel.addEventListener('touchend', () => { y0 = null; });
  // al tocar o usar el mapa, se minimiza del todo
  $('#map').addEventListener('pointerdown', (e) => { if (!e.target.closest('.leaflet-control')) setState('min'); });
  map.on('click dragstart zoomstart', () => setState('min'));
  MOBILE.addEventListener('change', () => { if (!MOBILE.matches) document.body.classList.remove('sheet-open', 'sheet-min'); });
}

// --- accesibilidad: grupos de controles con nombre y estado de los botones de alternar
{
  const named = (el, role, label) => el && (el.setAttribute('role', role), el.setAttribute('aria-label', label));
  named($('.layer-list'), 'radiogroup', 'Capa de análisis');
  named($('#scope'), 'group', 'Mostrar solo');
  named($('#pscope'), 'group', 'Escenario del plan');
  document.querySelectorAll('#scope .chip, #pscope .chip').forEach((x) => { x.type = 'button'; x.setAttribute('aria-pressed', x.classList.contains('on')); });
  document.querySelectorAll('.chip[data-p]').forEach((x) => (x.type = 'button'));
}

renderTheme();
{
  const n = munFromHash();
  if (n) {
    // en escritorio se abre la pestaña Mapa para ver el resumen del municipio; en móvil se deja ver el mapa
    if (!MOBILE.matches) document.querySelector('[data-tab=capas]')?.click();
    setMun(n);
  }
}
