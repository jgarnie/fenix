// Núcleo de Fénix MCP: lee los datos publicados y responde en texto. No depende del transporte
// (stdio en local, HTTP en un servidor remoto): solo usa fetch y DecompressionStream (Node 18+, Workers, navegadores).
//
// Datos:
//  - <SITE>api/incendios.json y api/<slug>.json: textos y estadísticas (scripts/build_api.mjs)
//  - <DATA><dataDir>/data/: meta.json, grid.bin.gz, montes.geojson, incendios_previos.geojson (scripts/build_data.py)
//  - consultas por punto con point: 'tiles' (servidor remoto): point.json + una tesela de point.bin.gz pedida con HTTP Range
//    (scripts/build_point.py). Evita descomprimir la rejilla entera, que no cabe en los límites de un Worker gratuito.
//    point.bin.gz es un gzip de varios miembros (uno por tesela): GitHub Pages lo sirve como application/gzip, sin
//    recomprimirlo, y responde a Range con 206.

const PUBLIC_SITE = 'https://jgarnie.github.io/fenix/';

export function createFenix({ site = PUBLIC_SITE, data = null, point = 'grid', fetchImpl = globalThis.fetch } = {}) {
  site = site.endsWith('/') ? site : `${site}/`;
  const cache = new Map();
  const once = (key, fn) => {
    if (!cache.has(key)) cache.set(key, fn().catch((e) => { cache.delete(key); throw e; }));
    return cache.get(key);
  };
  const get = async (url, kind = 'json', init) => {
    const r = await fetchImpl(url, init);
    if (!r.ok) throw new Error(`No se pudo descargar ${url} (HTTP ${r.status})`);
    return kind === 'json' ? r.json() : kind === 'res' ? r : new Uint8Array(await r.arrayBuffer());
  };

  // URL del mapa y de los datos (publicados o servidos en local con FENIX_DATA=local)
  const mapUrl = (f) => f.mapa.replace(PUBLIC_SITE, site);
  const dataUrl = (f) => (data === 'local' ? `${mapUrl(f)}data/` : data ? `${data.replace(/\/$/, '')}/${f.dataUrl.split('/fenix-data/')[1]}` : f.dataUrl);

  const index = () => once('index', () => get(`${site}api/incendios.json`));
  const detail = (slug) => once(`d:${slug}`, () => get(`${site}api/${slug}.json`));

  async function grid(f) {
    return once(`g:${f.slug}`, async () => {
      const base = dataUrl(f);
      const [meta, raw, montes, previos] = await Promise.all([
        get(`${base}meta.json`), get(`${base}grid.bin.gz`, 'bin'),
        get(`${base}montes.geojson`).catch(() => ({ features: [] })),
        get(`${base}incendios_previos.geojson`).catch(() => ({ features: [] })),
      ]);
      // si el servidor ya lo descomprime (Content-Encoding), llega sin la cabecera gzip 1f 8b
      let buf = raw;
      if (buf[0] === 0x1f && buf[1] === 0x8b) {
        buf = new Uint8Array(await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
      }
      const N = meta.width * meta.height;
      const G = Object.fromEntries(meta.layers.map((k, i) => [k, buf.subarray(i * N, (i + 1) * N)]));
      return { meta, G, montes, previos };
    });
  }

  // modo 'tiles': solo meta.json, point.json y la tesela del punto
  const pointMeta = (f) => once(`p:${f.slug}`, async () => {
    const base = dataUrl(f);
    const [meta, idx] = await Promise.all([get(`${base}meta.json`), get(`${base}point.json`)]);
    return { meta, idx };
  });
  async function tile(f, idx, t) {
    return once(`t:${f.slug}:${t}`, async () => {
      const a = idx.offsets[t], b = idx.offsets[t + 1];
      const r = await get(`${dataUrl(f)}point.bin.gz`, 'res', { headers: { Range: `bytes=${a}-${b - 1}` } });
      let bytes = new Uint8Array(await r.arrayBuffer());
      if (r.status === 200) bytes = bytes.subarray(a, b);   // servidor sin Range: llega el fichero entero
      return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
    });
  }

  async function findFire(q) {
    const { incendios } = await index();
    const n = norm(q);
    return incendios.find((f) => f.slug === n || norm(f.nombre).includes(n) || norm(f.subtitulo).includes(n))
      || incendios.find((f) => n.split(/\s+/).every((w) => norm(`${f.slug} ${f.nombre} ${f.subtitulo} ${f.descripcion}`).includes(w)))
      || incendios.find((f) => f.municipios.some((m) => norm(m.nombre) === n));
  }
  const notFound = async (q) => `No encuentro el incendio "${q}". Disponibles: ${(await index()).incendios.map((f) => `${f.slug} (${f.subtitulo})`).join('; ')}.`;
  const firma = (f) => `\n\n—\nFuente: Fénix (${f ? mapUrl(f) : site}), proyecto divulgativo y no oficial de Joaquín García Nieto (garcia.nieto.joaquin@gmail.com). `
    + 'Las capas derivadas son elaboración propia; para decisiones, consultar a la administración forestal.';

  // ------------------------------------------------------------ herramientas
  async function listar() {
    const { incendios } = await index();
    const rows = incendios.map((f) => `- ${f.slug}: ${f.subtitulo}. ${fmt(f.superficie_satelite_ha)} ha vistas quemadas por satélite`
      + `${f.oficial ? ` (oficial: ${f.oficial.valor})` : ''}; ${f.municipios.length} municipios. Mapa: ${mapUrl(f)}`);
    return `Incendios disponibles en Fénix (${incendios.length}):\n${rows.join('\n')}\n\nUsa resumen_incendio, plan_restauracion o consultar_punto con el slug.${firma()}`;
  }

  async function resumen(q) {
    const f = await findFire(q);
    if (!f) return notFound(q);
    const d = await detail(f.slug);
    const e = d.estadisticas;
    const L = [`${d.subtitulo} (${d.nombre})`, d.descripcion, '',
      `Superficie vista quemada por satélite (Copernicus ${d.ems}): ${fmt(d.superficie_satelite_ha)} ha, de ellas ${fmt(d.superficie_forestal_ha)} forestales.`];
    if (d.oficial) L.push(`Cifra oficial: ${d.oficial.valor} (${d.oficial.nota}).${d.nota_superficie ? ` Nota: ${d.nota_superficie}.` : ''}`);
    L.push(`Monte público: ${fmt(d.monte_publico_ha)} ha.`);
    if (d.parque_natural) L.push(`${d.parque_natural.nombre}: ${fmt(d.parque_natural.ha_dentro)} ha quemadas dentro del espacio protegido.`);
    L.push(`Ya había ardido al menos una vez desde ${e.desde}: ${fmt(e.ya_habia_ardido_ha)} ha.`);
    L.push('', `Municipios (ha quemadas · forestales): ${d.municipios.map((m) => `${m.nombre} ${fmt(m.ha_total)} · ${fmt(m.ha_forestal)}`).join('; ')}.`);
    L.push('', `Severidad (ha): ${kv(e.severidad_ha)}.`, `Vegetación antes del incendio (ha): ${kv(e.vegetacion_antes_ha)}.`,
      `Propiedad (ha): ${kv(e.propiedad_ha)}.`, `Riesgo de erosión (ha): ${kv(e.erosion_ha)}.`);
    L.push(`Vegetación que debería haber (potencial): ${d.vegetacion_potencial_resumen || ''}. Detalle (ha): ${kv(e.vegetacion_potencial_ha)}.`);
    if (e.arboles) L.push(`Árboles afectados (estimación IFN3): ${fmt(e.arboles.total)} árboles (IC90 ${fmt(e.arboles.intervalo90[0])}–${fmt(e.arboles.intervalo90[1])}), de los que habrían muerto ~${fmt(e.arboles.muertos)}${e.arboles.nota ? ` (${e.arboles.nota})` : ''}.`);
    const ns = Object.entries(e.ndvi_serie_quemado || {});
    if (ns.length) L.push(`Recuperación (NDVI medio quemado vs sin quemar): ${ns.map(([k, v]) => `${k}: ${v} vs ${e.ndvi_serie_sin_quemar[k]}`).join('; ')}.`);
    if (d.criterio_ceam_ahora) L.push(`Criterio CEAM: ${d.criterio_ceam_ahora}`);
    if (d.destacado) L.push('', d.destacado);
    if (d.cronologia.length) L.push('', 'Cronología:', ...d.cronologia.map((c) => `- ${c.cuando}: ${c.que}`));
    L.push('', 'Fuentes principales:', ...d.fuentes.enlaces.slice(0, 12).map((x) => `- ${x.texto}${x.url ? ` (${x.url})` : ''}`));
    return L.join('\n') + firma(f);
  }

  async function plan(q) {
    const f = await findFire(q);
    if (!f) return notFound(q);
    const d = await detail(f.slug);
    const p = d.plan;
    const L = [`Plan de restauración propuesto por Fénix · ${d.subtitulo}`, p.escenario + '.', '',
      `Criterio de asignación: ${p.metodo_actuacion}`, ''];
    const em = p.emergencia;
    L.push(`0. ${em.nombre} (${em.calendario}): ${fmt(em.ha)} ha con riesgo de erosión alto o muy alto. ${em.que}`,
      ...em.como.map((c) => `   - ${c}`), `   Coste orientativo: ${fmt(em.coste_eur_ha)} €/ha → ${eur(em.coste_escenario_eur)}.`);
    for (const a of p.acciones) {
      L.push('', `${a.clave}. ${a.nombre} (${a.calendario || 's/f'}): ${fmt(a.ha_total)} ha (${fmt(a.ha_publico)} en monte público, ${fmt(a.ha_privado)} privadas). ${a.que}`,
        ...a.como.map((c) => `   - ${c}`), `   Coste orientativo: ${fmt(a.coste_eur_ha)} €/ha → ${eur(a.coste_escenario_eur)} en monte público.`);
    }
    L.push('', `Coste total del escenario: ${eur(p.coste_total_escenario_eur)}. Presupuesto de referencia: ${eur(p.presupuesto_referencia_eur)}. ${p.referencia || ''}`);
    L.push('', 'Cómo puede ayudar la ciudadanía:', ...d.como_ayudar.map((x) => `- ${x}`));
    L.push('', 'Costes con precios unitarios de las tarifas forestales de la Junta de Extremadura 2024; densidades de plantación supuestas por el modelo. En el mapa se puede cambiar el escenario.');
    return L.join('\n') + firma(f);
  }

  // out (opcional): objeto que se rellena con los datos estructurados (API REST del servidor remoto)
  async function punto(lat, lon, q, out = {}) {
    const { incendios } = await index();
    let cands = incendios.filter((f) => lat >= f.bounds[0][0] && lat <= f.bounds[1][0] && lon >= f.bounds[0][1] && lon <= f.bounds[1][1]);
    if (q) {
      const f = await findFire(q);
      if (!f) return notFound(q);
      cands = [f];
    }
    if (!cands.length) {
      Object.assign(out, { lat, lon, incendio: null, en_zona_de_algun_incendio: false });
      return `El punto ${lat.toFixed(5)}, ${lon.toFixed(5)} está fuera de la zona de todos los incendios cartografiados en Fénix (${incendios.map((f) => f.slug).join(', ')}). `
        + 'Para otros incendios, consultar EFFIS (https://effis.jrc.ec.europa.eu) o la estadística de la comunidad autónoma.' + firma();
    }
    const results = await Promise.all(cands.map(async (f) => ({ f, r: await pixel(f, lat, lon) })));
    results.sort((a, b) => (b.r?.inside ?? -1) - (a.r?.inside ?? -1));
    const { f, r } = results[0];
    if (!r) return `El punto queda fuera de la rejilla del incendio ${f.slug}.${firma(f)}`;
    const d = await detail(f.slug);
    const { meta, G, i, monte, fuegos } = r;
    const leg = meta.legends;
    const nd = (k) => ((G[k][i] - 100) / 100).toFixed(2);
    const v = G.veg[i], p = G.pot[i], a = G.act[i], o = G.owner[i], s = G.sev[i], e = G.eros[i];
    const serie = d.series_potenciales.find((x) => x.clave === p);
    const ac = d.plan.acciones.find((x) => x.clave === a);
    const forestal = r.inside && FOREST(v);
    Object.assign(out, {
      lat, lon, incendio: f.slug, incendio_nombre: d.subtitulo, mapa: mapUrl(f), en_zona_de_algun_incendio: true,
      dentro_area_quemada: !!r.inside, severidad: r.inside ? SEV[s] || null : null, dnbr: (G.dnbr[i] - 100) / 100,
      ndvi: { antes: (G.ndvi_b[i] - 100) / 100, despues: (G.ndvi_a[i] - 100) / 100, ahora: (G.ndvi_n[i] - 100) / 100, fecha_ahora: meta.stats.scenes.ahora },
      vegetacion_antes: v ? leg.veg[v] : null, propiedad: o ? leg.owner[o] : 'No catalogado como monte público (probablemente privado)',
      monte: monte ? { nombre: monte.properties.denominacion?.toString().trim() || null, numero: monte.properties.num_up?.toString().trim() || null, municipio: monte.properties.municipio || null } : null,
      municipio: G.mun[i] ? meta.municipios[G.mun[i] - 1] : null, parque_natural: d.parque_natural ? !!G.pn[i] : null,
      sustrato: leg.sub[G.sub[i]] || null, altitud_m: G.elev[i] * 5, pendiente_pct: G.slope[i], incendios_previos: fuegos,
      vegetacion_potencial: p ? (serie ? { nombre: serie.corto, codigo: serie.codigo || null, serie: serie.serie, especies: serie.especies || null } : { nombre: leg.pot[p] }) : null,
      viabilidad: forestal ? G.feas[i] : null, riesgo_erosion: e ? leg.eros[e] : null,
      actuacion_recomendada: forestal ? (ac ? ac.nombre : a === 5 ? 'Ninguna (no quemado o afección leve)' : null) : null,
    });
    const L = [`Punto ${lat.toFixed(5)}, ${lon.toFixed(5)} · ${d.subtitulo}`];
    L.push(r.inside ? `Dentro del área quemada. Severidad: ${SEV[s] || 's/d'} (dNBR ${((G.dnbr[i] - 100) / 100).toFixed(2)}).`
      : `Fuera del área quemada (perímetro Copernicus ${d.ems}), pero dentro de la zona del mapa.`);
    L.push(`NDVI: ${nd('ndvi_b')} antes → ${nd('ndvi_a')} después → ${nd('ndvi_n')} ahora (${meta.stats.scenes.ahora}).`);
    L.push(`Vegetación antes del incendio: ${v ? leg.veg[v] : 's/d'} (Mapa Forestal de España).`);
    L.push(`Propiedad: ${o ? leg.owner[o] : 'no catalogado como monte público (probablemente privado)'}${monte ? ((mp) => (mp.length ? ` · ${mp.join(' · ')}` : ''))([monte.properties.denominacion, monte.properties.num_up?.toString().trim() && `nº ${String(monte.properties.num_up).trim()}`, monte.properties.municipio].map((x) => x?.toString().trim()).filter(Boolean)) : ''}.`);
    L.push(`Municipio: ${G.mun[i] ? meta.municipios[G.mun[i] - 1] : 's/d'}.`);
    if (d.parque_natural) L.push(`${d.parque_natural.nombre}: ${G.pn[i] ? 'sí' : 'no'}.`);
    L.push(`Sustrato: ${leg.sub[G.sub[i]] || 's/d'} (IGME GEODE 1:50.000).`);
    L.push(`Altitud ${fmt(G.elev[i] * 5)} m · pendiente ${fmt(G.slope[i])} %.`);
    L.push(`Incendios previos: ${fuegos.length ? fuegos.join(', ') : `ninguno registrado desde ${d.estadisticas.desde}`}.`);
    if (G.ceam?.[i] && d.criterio_ceam_ahora) L.push(`Criterio CEAM: ${leg.ceam[G.ceam[i]]} (cobertura vegetal estimada ${fmt(G.recov[i])} %, ${meta.stats.scenes[meta.stats.ceam_scene || 'ahora']}).`);
    if (p && serie) {
      L.push('', `Vegetación que debería haber: ${serie.corto}${serie.codigo ? ` (serie ${serie.codigo})` : ''}: ${serie.serie}.`);
      if (serie.piso) L.push(`Piso y suelo: ${serie.piso}.`);
      if (serie.especies) L.push(`Especies que la definen${serie.especiesNota ? ` (${serie.especiesNota})` : ' (memoria del Mapa de Series, 2011)'}: ${serie.especies}.`);
    } else if (p) L.push('', `Vegetación que debería haber: ${leg.pot[p]}.`);
    if (forestal) {
      L.push('', `Viabilidad de recuperar la vegetación potencial: ${G.feas[i]}/100.`);
      if (e >= 3) L.push(`⚠ ${d.plan.emergencia.nombre} (riesgo de erosión ${leg.eros[e].toLowerCase()}): ${d.plan.emergencia.que}`, ...d.plan.emergencia.como.map((c) => `- ${c}`));
      if (ac) L.push('', `Actuación recomendada: ${ac.nombre}. ${ac.que}`, ...ac.como.map((c) => `- ${c}`));
      else if (a === 5) L.push('Actuación recomendada: ninguna (no quemado o afección leve).');
    }
    L.push('', 'Resolución 25 m; mapas de escala regional o nacional: comprobar siempre en campo. Cualquier siembra o plantación necesita permiso del propietario y de la administración forestal.');
    return L.join('\n') + firma(f);
  }

  async function municipio(nombre, out = {}) {
    const { incendios } = await index();
    const n = norm(nombre);
    const hits = incendios.flatMap((f) => f.municipios.filter((m) => norm(m.nombre).includes(n) || n.includes(norm(m.nombre))).map((m) => ({ f, m })));
    out.resultados = hits.map(({ f, m }) => ({ municipio: m.nombre, ha_quemadas: m.ha_total, ha_forestales: m.ha_forestal, incendio: f.slug, incendio_nombre: f.subtitulo, mapa: mapUrl(f) }));
    if (!hits.length) {
      return `"${nombre}" no aparece entre los municipios afectados por los incendios de Fénix (${incendios.map((f) => f.slug).join(', ')}). `
        + 'Puede que haya ardido en otro incendio no cartografiado aquí.' + firma();
    }
    return hits.map(({ f, m }) => `- ${m.nombre}: ${fmt(m.ha_total)} ha quemadas (${fmt(m.ha_forestal)} forestales) en el ${f.subtitulo} (${f.slug}). Mapa: ${mapUrl(f)}`).join('\n')
      + '\n\nSuperficies vistas por satélite (Copernicus); el reparto oficial por municipio puede variar.' + firma();
  }

  // píxel de la rejilla (25 m) que contiene el punto; null si cae fuera de la zona del mapa
  function locate(W, H, bounds, lat, lon) {
    const [[s, w], [n, e]] = bounds;
    const P0 = merc(s, w), P1 = merc(n, e), p = merc(lat, lon);
    const x = Math.floor(((p.x - P0.x) / (P1.x - P0.x)) * W);
    const y = Math.floor(((P1.y - p.y) / (P1.y - P0.y)) * H);
    return x < 0 || y < 0 || x >= W || y >= H ? null : { x, y };
  }

  async function pixel(f, lat, lon) {
    if (point === 'tiles') {
      const { meta, idx } = await pointMeta(f);
      const c = locate(idx.width, idx.height, idx.bounds, lat, lon);
      if (!c) return null;
      const T = idx.tile, tx = Math.floor(c.x / T), ty = Math.floor(c.y / T);
      const w = Math.min(T, idx.width - tx * T), h = Math.min(T, idx.height - ty * T);
      const raw = await tile(f, idx, ty * idx.tiles_x + tx);
      const n = w * h, j = (c.y - ty * T) * w + (c.x - tx * T);
      const G = Object.fromEntries(idx.layers.map((k, l) => [k, [raw[l * n + j]]]));
      const u16 = (l) => { const o = idx.layers.length * n + l * 2 * n + 2 * j; return raw[o] | (raw[o + 1] << 8); };
      const m = u16(0), pv = u16(1);
      return { meta, G, i: 0, monte: m ? { properties: idx.montes[m - 1] } : null, fuegos: pv ? idx.previos[pv - 1] : [], inside: G.inside[0] ? 1 : 0 };
    }
    const { meta, G, montes, previos } = await grid(f);
    const c = locate(meta.width, meta.height, meta.bounds, lat, lon);
    if (!c) return null;
    const i = c.y * meta.width + c.x;
    const pt = [lon, lat];
    const monte = montes.features.find((x) => inFeature(pt, x.geometry));
    const fuegos = previos.features.filter((x) => inFeature(pt, x.geometry)).map((x) => x.properties.anyo).sort();
    return { meta, G, i, monte, fuegos, inside: G.inside[i] ? 1 : 0 };
  }

  return { listar, resumen, plan, punto, municipio, index, detail, findFire, firma };
}

// ------------------------------------------------------------ utilidades
const SEV = { 1: 'no quemado', 2: 'baja', 3: 'moderada-baja', 4: 'moderada-alta', 5: 'alta' };
const FOREST = (v) => v !== 0 && v !== 10 && v !== 11 && v !== 12;
const fmt = (n, d = 0) => Number(n).toLocaleString('es-ES', { maximumFractionDigits: d, minimumFractionDigits: d });
const eur = (n) => (n >= 1e6 ? `${fmt(n / 1e6, 2)} M€` : `${fmt(n / 1e3, 0)} k€`);
const kv = (o) => Object.entries(o || {}).filter(([, v]) => (typeof v === 'number' ? v : v?.total) > 0)
  .map(([k, v]) => `${k} ${fmt(typeof v === 'number' ? v : v.total)}`).join('; ');
export const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’']/g, "'").trim();
function merc(lat, lon) {
  const R = 6378137;
  return { x: (R * lon * Math.PI) / 180, y: R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) };
}
function pip([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function inFeature(pt, g) {
  if (!g) return false;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
  return polys.some((p) => pip(pt, p[0]) && !p.slice(1).some((h) => pip(pt, h)));
}
