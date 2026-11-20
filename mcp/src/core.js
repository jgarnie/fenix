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

import { VERSION } from './version.js';

const PUBLIC_SITE = 'https://jgarnie.github.io/fenix/';

const CACHE_MS = 10 * 60 * 1000;  // igual que el max-age de GitHub Pages
export function createFenix({ site = PUBLIC_SITE, data = null, point = 'grid', fetchImpl = globalThis.fetch } = {}) {
  site = site.endsWith('/') ? site : `${site}/`;
  // caché en memoria (índices, detalles, teselas). Se vacía entera cada CACHE_MS para que un proceso o isolate de larga
  // vida no mezcle nunca un meta.json antiguo con teselas nuevas después de publicar datos (todo caduca a la vez).
  const cache = new Map();
  let cacheBorn = Date.now();
  const once = (key, fn) => {
    if (Date.now() - cacheBorn > CACHE_MS) { cache.clear(); cacheBorn = Date.now(); }
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
  const prio = (slug) => once(`z:${slug}`, () => get(`${site}api/${slug}.prioridades.json`));
  // tabla de superficies (scripts/build_cube.py) decodificada en columnas Uint8Array, una vez por proceso o isolate
  const cube = (slug) => once(`c:${slug}`, async () => {
    const c = await get(`${site}api/${slug}.superficies.json`);
    const cols = {};
    for (const dm of c.dimensiones) cols[dm.clave] = Uint8Array.from(c.filas[dm.clave]);
    const labels = Object.fromEntries(c.dimensiones.map((dm) => [dm.clave, dm.valores]));
    // columnas derivadas: forestal (vegetación antes no agrícola/urbana/agua) y reincendio en menos de REB años
    const nfv = new Set(c.no_forestal_vegetacion), n = c.pixeles.length;
    cols.forestal = new Uint8Array(n);
    cols.reincendio_corto = new Uint8Array(n);
    for (let r = 0; r < n; r++) {
      cols.forestal[r] = nfv.has(cols.vegetacion_antes[r]) ? 0 : 1;
      const p = cols.incendio_previo[r], dy = c.ano_incendio - (1900 + p);
      cols.reincendio_corto[r] = p && dy >= 1 && dy < REB ? 1 : 0;   // el propio año del incendio no cuenta
    }
    return { ...c, cols, labels, px: Uint32Array.from(c.pixeles), n, filas: undefined, pixeles: undefined };
  });

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
  const notFound = async (q) => `No encuentro el incendio "${q}". Disponibles: ${(await index()).incendios.map((f) => `${f.slug} (${f.subtitulo})`).join('; ')}.${firma()}`;
  const firma = (f) => `\n\n—\nFuente: Fénix v${VERSION} (${f ? mapUrl(f) : site}), proyecto divulgativo y no oficial de Joaquín García Nieto (garcia.nieto.joaquin@gmail.com). `
    + 'Las capas derivadas son elaboración propia; para decisiones, consultar a la administración forestal.';

  // ------------------------------------------------------------ herramientas
  async function listar() {
    const { incendios } = await index();
    const rows = incendios.map((f) => `- ${f.slug}: ${f.subtitulo}. ${fmt(f.superficie_satelite_ha)} ha quemadas según el perímetro de Copernicus EMS`
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
      if (!(a.ha_total > 0)) continue;   // actuaciones sin superficie en este incendio: no se listan
      L.push('', `${a.clave}. ${a.nombre} (${a.calendario || 's/f'}): ${fmt(a.ha_total)} ha (${fmt(a.ha_publico)} en monte público, ${fmt(a.ha_privado)} privadas). ${a.que}`,
        ...a.como.map((c) => `   - ${c}`), ...(a.coste_eur_ha > 0 ? [`   Coste orientativo: ${fmt(a.coste_eur_ha)} €/ha → ${eur(a.coste_escenario_eur)} en monte público.`] : []));
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
      const inB = lat >= f.bounds[0][0] && lat <= f.bounds[1][0] && lon >= f.bounds[0][1] && lon <= f.bounds[1][1];
      if (!inB) {
        Object.assign(out, { lat, lon, incendio: null, en_zona_de_algun_incendio: cands.length > 0, incendios_que_contienen_el_punto: cands.map((x) => x.slug) });
        return `El punto ${lat.toFixed(5)}, ${lon.toFixed(5)} no está en la zona del ${f.subtitulo} (${f.slug}). `
          + (cands.length ? `Sí está en la zona de: ${cands.map((x) => `${x.subtitulo} (${x.slug})`).join('; ')}; consulta sin indicar incendio o con ese.`
            : 'No está en la zona de ningún incendio de Fénix.') + firma(f);
      }
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
    // fuera de la huella de las imágenes Sentinel-2 los tres NDVI valen exactamente 0 (código 100): sin datos de satélite
    const noImg = G.ndvi_b[i] === 100 && G.ndvi_a[i] === 100 && G.ndvi_n[i] === 100;
    const v = G.veg[i], p = G.pot[i], a = G.act[i], o = G.owner[i], s = G.sev[i], e = G.eros[i];
    const serie = d.series_potenciales.find((x) => x.clave === p);
    const ac = d.plan.acciones.find((x) => x.clave === a);
    const forestal = r.inside && FOREST(v);
    Object.assign(out, {
      lat, lon, incendio: f.slug, incendio_nombre: d.subtitulo, mapa: mapUrl(f), en_zona_de_algun_incendio: true,
      dentro_area_quemada: !!r.inside, severidad: r.inside ? SEV[s] || null : null, dnbr: noImg ? null : (G.dnbr[i] - 100) / 100,
      ndvi: noImg ? null : { antes: (G.ndvi_b[i] - 100) / 100, despues: (G.ndvi_a[i] - 100) / 100, ahora: (G.ndvi_n[i] - 100) / 100, fecha_ahora: meta.stats.scenes.ahora },
      vegetacion_antes: v ? leg.veg[v] : null, propiedad: o ? leg.owner[o] : 'No catalogado como monte público (probablemente privado)',
      monte: monte ? { nombre: monte.properties.denominacion?.toString().trim() || null, numero: monte.properties.num_up?.toString().trim() || null, municipio: monte.properties.municipio || null } : null,
      municipio: G.mun[i] ? meta.municipios[G.mun[i] - 1] : null, parque_natural: d.parque_natural ? !!G.pn[i] : null,
      sustrato: leg.sub[G.sub[i]] || null, altitud_m: G.elev[i] * (meta.elev_step || 5) + (meta.elev_offset || 0), pendiente_pct: G.slope[i], incendios_previos: fuegos,
      vegetacion_potencial: p ? (serie ? { nombre: serie.corto, codigo: serie.codigo || null, serie: serie.serie, especies: serie.especies || null } : { nombre: leg.pot[p] }) : null,
      viabilidad: forestal ? G.feas[i] : null, riesgo_erosion: e ? leg.eros[e] : null,
      actuacion_recomendada: forestal ? (ac ? ac.nombre : a === 5 ? 'Ninguna (no quemado o afección leve)' : null) : null,
    });
    const L = [`Punto ${lat.toFixed(5)}, ${lon.toFixed(5)} · ${d.subtitulo}`];
    L.push(r.inside ? `Dentro del área quemada. Severidad: ${SEV[s] || 's/d'} (dNBR ${((G.dnbr[i] - 100) / 100).toFixed(2)}).`
      : `Fuera del área quemada (perímetro Copernicus ${d.ems}), pero dentro de la zona del mapa.`);
    L.push(noImg ? 'NDVI y dNBR: sin datos (fuera de la huella de las imágenes de satélite).'
      : `NDVI: ${nd('ndvi_b')} antes → ${nd('ndvi_a')} después → ${nd('ndvi_n')} ahora (${meta.stats.scenes.ahora}).`);
    L.push(`Vegetación antes del incendio: ${v ? leg.veg[v] : 's/d'} (Mapa Forestal de España).`);
    L.push(`Propiedad: ${o ? leg.owner[o] : 'no catalogado como monte público (probablemente privado)'}${monte ? ((mp) => (mp.length ? ` · ${mp.join(' · ')}` : ''))([monte.properties.denominacion, monte.properties.num_up?.toString().trim() && `nº ${String(monte.properties.num_up).trim()}`, monte.properties.municipio].map((x) => x?.toString().trim()).filter(Boolean)) : ''}.`);
    L.push(`Municipio: ${G.mun[i] ? meta.municipios[G.mun[i] - 1] : 's/d'}.`);
    if (d.parque_natural) L.push(`${d.parque_natural.nombre}: ${G.pn[i] ? 'sí' : 'no'}.`);
    L.push(`Sustrato: ${leg.sub[G.sub[i]] || 's/d'} (IGME GEODE 1:50.000).`);
    L.push(`Altitud ${fmt(G.elev[i] * (meta.elev_step || 5) + (meta.elev_offset || 0))} m · pendiente ${fmt(G.slope[i])} %.`);
    L.push(`Incendios previos: ${fuegos.length ? fuegos.join(', ') : `ninguno registrado desde ${d.estadisticas.desde}`}.`);
    if (G.ceam?.[i] && d.criterio_ceam_ahora) L.push(`Criterio CEAM: ${leg.ceam[G.ceam[i]]} (cobertura vegetal estimada ${fmt(G.recov[i])} %, ${meta.stats.scenes[meta.stats.ceam_scene || 'ahora']}).`);
    if (p && serie) {
      L.push('', `Vegetación que debería haber: ${serie.corto}${serie.codigo ? ` (serie ${serie.codigo})` : ''}: ${serie.serie}.`);
      if (serie.piso) L.push(`Piso y suelo: ${serie.piso}.`);
      if (serie.especies) L.push(`Especies que la definen${serie.especiesNota ? ` (${serie.especiesNota})` : ' (memoria del Mapa de Series, 2011)'}: ${serie.especies}.`);
    } else if (p) L.push('', `Vegetación que debería haber: ${leg.pot[p]}.`);
    if (forestal) {
      L.push('', `Viabilidad de recuperar la vegetación potencial: ${G.feas[i]}/100.`);
      if (e) L.push(`Riesgo de erosión: ${leg.eros[e].toLowerCase()} (severidad × pendiente).`);
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
      + '\n\nSuperficies calculadas en la rejilla de 25 m dentro del perímetro de Copernicus EMS; el reparto oficial por municipio puede variar.' + firma();
  }

  // zonas prioritarias precalculadas (scripts/build_priority.py). tipo: todas | erosion | regeneracion | reincendio.
  // out (opcional): datos estructurados para la API REST
  async function prioridades(q, { municipio: mq = null, solo_publico: soloPub = false, limite = 5, tipo = 'todas' } = {}, out = {}) {
    mq = norm(mq) ? String(mq).trim() : null;  // un municipio vacío o solo con espacios cuenta como ausente
    const f = await findFire(q);
    if (!f) return notFound(q);
    const [d, z] = await Promise.all([detail(f.slug), prio(f.slug)]);
    limite = Math.max(1, Math.min(8, Number(limite) || 5));
    tipo = ['erosion', 'regeneracion', 'reincendio'].includes(tipo) ? tipo : 'todas';
    const serie = (k) => d.series_potenciales.find((x) => x.clave === k);
    const acts = new Set();
    const mapLink = (u) => u.replace(PUBLIC_SITE, site);

    // zonas de una sección (principal o reincendio) según los filtros
    function pick(sec) {
      if (mq) {
        const ks = Object.keys(sec.zonas_por_municipio || {});
        const name = ks.find((m) => norm(m) === norm(mq)) || ks.find((m) => norm(m).includes(norm(mq)) || norm(mq).includes(norm(m)));
        if (!name) return { zonas: [], ambito: `municipio "${mq}"`, sinMun: true };
        let zs = sec.zonas_por_municipio[name];
        if (soloPub) zs = zs.filter((x) => x.ha_monte_publico > 0);
        const t = (sec.municipios || {})[name];
        return { zonas: zs.slice(0, limite), ambito: `municipio de ${name}`, munLine: t ? `En ${name}: ${fmt(t.ha)} ha, de ellas ${fmt(t.ha_monte_publico)} en monte público.` : null };
      }
      return { zonas: (soloPub ? sec.zonas_monte_publico : sec.zonas).slice(0, limite), ambito: soloPub ? 'solo monte público' : 'todo el incendio' };
    }
    function zoneLines(x, n) {
      const m = x.monte;
      const monte = m ? `monte "${m.nombre || 's/n'}"${m.numero ? ` (nº ${m.numero})` : ''}, ${m.titular || ''}${m.parte_zona_pct < 50 ? ` (cubre el ${m.parte_zona_pct} % de la zona)` : ''}` : 'sin monte público catalogado';
      const pots = x.vegetacion_potencial.map((p) => {
        const s = serie(p.clave);
        return s ? `${s.corto}${s.codigo ? ` (serie ${s.codigo})` : ''}, ${fmt(p.ha)} ha${s.especies ? `; especies que la definen: ${s.especies}` : ''}` : `${p.nombre}, ${fmt(p.ha)} ha`;
      });
      x.actuaciones.forEach((a) => acts.add(a.clave));
      return ['', `${n + 1}. ${x.municipio || 's/d'} · ${fmt(x.ha)} ha en 1 km² · centro ${x.lat}, ${x.lon} · ${monte}`,
        `   Monte público: ${fmt(x.ha_monte_publico)} ha${x.parque_natural_pct ? ` · dentro del espacio protegido: ${x.parque_natural_pct} %` : ''}. `
          + `Altitud ~${fmt(x.altitud_m)} m · pendiente ~${x.pendiente_pct} %${x.cobertura_pct != null ? ` · cobertura vegetal ~${x.cobertura_pct} %` : ''}.`,
        `   Severidad (ha): ${kv(x.severidad_ha)}. Ya había ardido antes: ${fmt(x.incendios_previos_ha)} ha${x.reincendio_corto_ha ? ` (${fmt(x.reincendio_corto_ha)} ha hace menos de 15 años${x.reincendio_corto_pinar_ha != null ? `, ${fmt(x.reincendio_corto_pinar_ha)} de ellas pinar` : ''})` : ''}.`,
        `   Qué había (Mapa Forestal): ${x.vegetacion_antes.map((v) => `${v.nombre} ${fmt(v.ha)} ha`).join('; ')}. Sustrato: ${x.sustrato.map((v) => `${v.nombre} ${fmt(v.ha)} ha`).join('; ')}.`,
        `   Qué debería haber (Rivas-Martínez${d.correcciones?.sobre_datos_oficiales?.length ? ', con las correcciones indicadas en Fuentes' : ''}): ${pots.join(' | ')}.`,
        `   Actuación propuesta por el modelo: ${x.actuaciones.map((a) => `${a.nombre} ${fmt(a.ha)} ha`).join('; ')}.`,
        ...x.avisos.map((a) => `   ⚠ ${a}`),
        `   Mapa: ${mapLink(x.mapa)}`];
    }

    const blocks = [];
    const showMain = tipo === 'todas' || tipo === 'erosion' || tipo === 'regeneracion';
    const showReb = (tipo === 'todas' || tipo === 'reincendio') && z.reincendio && z.reincendio.total_ha >= 1;
    if (showMain) {
      const { zonas, ambito, sinMun, munLine } = pick(z);
      const L = [`■ ${z.modo === 'erosion' ? 'Riesgo de erosión (incendio reciente: proteger el suelo)' : 'Regeneración insuficiente (más de un año después)'} · ${ambito}`];
      if (tipo !== 'todas' && tipo !== z.modo) {
        L.push(`(Este incendio se evalúa con el criterio de ${z.modo === 'erosion' ? 'erosión, porque es reciente' : 'regeneración, porque ha pasado más de un año'}.)`);
      }
      L.push(`Criterio: ${z.criterio}`, `Imágenes: después del incendio ${z.fechas.despues}; última ${z.fechas.ultima_imagen}.`,
        `Total: ${fmt(z.total_ha)} ha, de ellas ${fmt(z.total_monte_publico_ha)} en monte público. Por municipio: ${Object.entries(z.municipios).map(([m, v]) => `${m} ${fmt(v.ha)}`).join('; ')}.`);
      if (munLine) L.push(munLine);
      if (sinMun) L.push('', `No hay zonas que cumplan este criterio en "${mq}" (o tiene menos de 5 ha).`);
      else if (!zonas.length) L.push('', 'No hay zonas que cumplan el criterio con estos filtros.');
      zonas.forEach((x, n) => L.push(...zoneLines(x, n)));
      blocks.push({ sinMun, ha: z.total_ha, text: L, data: { tipo: z.modo, criterio: z.criterio, total_ha: z.total_ha, total_monte_publico_ha: z.total_monte_publico_ha, municipios: z.municipios, ambito, zonas } });
    }
    if (showReb && z.reincendio.total_ha < 5 && !mq) {
      const r = z.reincendio;
      blocks.push({ sinMun: false, ha: r.total_ha, text: [`■ Reincendio en intervalo corto: solo ${fmt(r.total_ha, 1)} ha forestales de todo el incendio habían ardido hace menos de ${r.anos_umbral} años; no hay zonas destacables.`],
        data: { tipo: 'reincendio', total_ha: r.total_ha, zonas: [] } });
    } else if (showReb) {
      const r = z.reincendio;
      const { zonas, ambito, sinMun, munLine } = pick(r);
      const L = [`■ Reincendio en intervalo corto (ya había ardido hace menos de ${r.anos_umbral} años) · ${ambito}`,
        `Criterio: ${r.criterio}`,
        `Total: ${fmt(r.total_ha)} ha forestales${r.pinar_ha != null ? ` (${fmt(r.pinar_ha)} de pinar y ${fmt(r.otra_vegetacion_ha)} de otra vegetación, que en buena parte rebrota)` : ''}, de ellas ${fmt(r.total_monte_publico_ha)} en monte público${r.parque_natural_ha ? ` y ${fmt(r.parque_natural_ha)} en el espacio protegido` : ''}. `
          + `Incendio anterior (ha): ${Object.entries(r.por_ano_incendio_previo).filter(([, v]) => v >= 1).map(([y, v]) => `${y} ${fmt(v)}`).join('; ')}.`,
        `Por municipio: ${Object.entries(r.municipios).map(([m, v]) => `${m} ${fmt(v.ha)}${v.ha_pinar != null ? ` (pinar ${fmt(v.ha_pinar)})` : ''}`).join('; ') || '—'}.`,
        `Qué había antes del incendio previo (Mapa Forestal): ${r.vegetacion_antes.map((v) => `${v.nombre} ${fmt(v.ha)}`).join('; ')}. `
          + `Sustrato: ${r.sustrato.map((v) => `${v.nombre} ${fmt(v.ha)}`).join('; ')}. Severidad (ha): ${kv(r.severidad_ha)}.`,
        `Qué debería haber: ${r.vegetacion_potencial.map((p) => { const s = serie(p.clave); return s ? `${s.corto}${s.codigo ? ` (${s.codigo})` : ''} ${fmt(p.ha)} ha${s.especies ? ` — ${s.especies}` : ''}` : `${p.nombre} ${fmt(p.ha)} ha`; }).join(' | ')}.`,
        `Zonas ordenadas por ${r.orden_zonas}.`];
      if (munLine) L.push(munLine);
      if (sinMun) L.push('', `No hay reincendio en intervalo corto en "${mq}" (o menos de 5 ha).`);
      else if (!zonas.length) L.push('', 'No hay zonas con estos filtros.');
      zonas.forEach((x, n) => L.push(...zoneLines(x, n)));
      blocks.push({ sinMun, ha: r.total_ha, text: L, data: { tipo: 'reincendio', criterio: r.criterio, total_ha: r.total_ha, pinar_ha: r.pinar_ha, otra_vegetacion_ha: r.otra_vegetacion_ha, total_monte_publico_ha: r.total_monte_publico_ha, por_ano_incendio_previo: r.por_ano_incendio_previo, municipios: r.municipios, ambito, zonas } });
    }
    const notes = [];
    if (mq && tipo === 'todas' && blocks.some((b) => !b.sinMun)) {
      // con municipio, solo los bloques que tienen zonas allí; de los demás se dice en una línea que no hay
      for (let i = blocks.length - 1; i >= 0; i--) {
        if (!blocks[i].sinMun) continue;
        const t = blocks[i].data.tipo;
        notes.push(t === 'reincendio' ? `En "${mq}" no hay reincendio en intervalo corto (0 ha o menos de 5 ha forestales).`
          : `En "${mq}" no hay superficie que cumpla el criterio de ${t === 'erosion' ? 'erosión' : 'regeneración insuficiente'} (o menos de 5 ha).`);
        blocks.splice(i, 1);
      }
    } else if (mq && blocks.length && blocks.every((b) => b.sinMun)) {
      const ms = [...new Set([...Object.keys(z.municipios), ...Object.keys(z.reincendio?.municipios || {})])];
      return `En el ${d.subtitulo} no hay zonas prioritarias en "${mq}" (o tiene menos de 5 ha). Municipios con zonas: ${ms.join(', ') || 'ninguno'}.${firma(f)}`;
    }
    blocks.sort((a, b) => b.ha - a.ha);   // primero el bloque con más superficie
    Object.assign(out, { incendio: f.slug, incendio_nombre: d.subtitulo, fechas: z.fechas, tipo, bloques: blocks.map((b) => b.data) });
    const L = [`Zonas prioritarias · ${d.subtitulo}`, `Zonas = ventanas de ${z.ventana} con más superficie que cumple cada criterio, de mayor a menor.`];
    blocks.forEach((b) => L.push('', ...b.text));
    if (notes.length) L.push('', ...notes);
    const em = d.plan.emergencia;
    L.push('', 'Cómo, según el plan de Fénix para este incendio:', `- ${em.nombre} (${em.calendario}): ${em.que}`, ...em.como.map((c) => `   · ${c}`));
    for (const a of d.plan.acciones.filter((x) => acts.has(x.clave))) {
      L.push(`- ${a.nombre}${a.calendario ? ` (${a.calendario})` : ''}: ${a.que}`, ...a.como.map((c) => `   · ${c}`));
    }
    L.push('', `${z.nota} Haz una visita de campo antes de actuar: la cobertura y la severidad salen de imágenes de satélite y los mapas de vegetación y suelo son de escala regional.`);
    return L.join('\n') + firma(f);
  }

  // consultas libres de superficie sobre la tabla precalculada (scripts/build_cube.py).
  // filtros: { dimensión: [textos] } (sin tildes ni mayúsculas, coincidencia parcial; "publico"/"privado" en propiedad)
  //          + booleanos forestal, reincendio_corto, espacio_protegido. agrupar_por: hasta 2 dimensiones.
  async function superficies(q, { filtros = {}, agrupar_por = [] } = {}, out = {}) {
    const f = await findFire(q);
    if (!f) return notFound(q);
    const c = await cube(f.slug);
    const ph = c.pixel_ha;
    // la rejilla (píxeles de 25 m) y el perímetro de Copernicus EMS dan totales algo distintos: se dice cuál es cuál
    const emsTxt = f.superficie_satelite_ha ? `; el polígono de Copernicus EMS mide ${ha(f.superficie_satelite_ha)} ha` : '';
    const derived = { forestal: true, reincendio_corto: true };   // columnas booleanas calculadas al cargar la tabla
    const boolLabel = { forestal: ['No forestal', 'Forestal'], reincendio_corto: ['No (o hace 15 años o más)', `Sí: ya había ardido hace menos de ${REB} años`] };
    const dimNames = [...Object.keys(c.labels), ...Object.keys(derived)];
    const dimOf = (k) => {
      const a = norm(k).replace(/\s+/g, '_');
      return (Object.prototype.hasOwnProperty.call(DIM_ALIAS, a) ? DIM_ALIAS[a] : null) || (dimNames.includes(k) ? k : null);
    };
    const valueOf = (d, r) => c.cols[d][r];
    const labelOf = (d, v) => (derived[d] ? boolLabel[d][v] : c.labels[d][String(v)] ?? String(v));
    const valuesList = (d) => {
      const tot = new Float64Array(256), col = c.cols[d], px = c.px;
      for (let r = 0; r < c.n; r++) tot[col[r]] += px[r];
      const vs = [];
      for (let v = 0; v < 256; v++) if (tot[v]) vs.push([v, tot[v]]);
      return vs.sort((a, b) => b[1] - a[1]).map(([v, p]) => `${labelOf(d, v)} (${ha(p * ph)} ha)`).join('; ');
    };

    // filtros → conjunto de códigos aceptados por dimensión
    const accept = {};
    const applied = [];
    const isBool = (v) => typeof v === 'boolean' || ['true', 'false', 'si', 'sí', 'no', '1', '0'].includes(norm(v));
    const toBool = (v) => (typeof v === 'boolean' ? v : ['true', 'si', 'sí', '1'].includes(norm(v)));
    for (const [k0, v0] of Object.entries(filtros || {})) {
      if (v0 == null || v0 === '' || (Array.isArray(v0) && !v0.length)) continue;
      const d = dimOf(k0);
      if (!d) return (out.error_filtro = true) && `No conozco el filtro "${k0}". Filtros posibles: ${[...Object.keys(c.labels), 'forestal', 'reincendio_corto'].join(', ')}.${firma(f)}`;
      if (derived[d] || (d === 'espacio_protegido' && isBool(Array.isArray(v0) ? v0[0] : v0))) {
        const b = toBool(Array.isArray(v0) ? v0[0] : v0);
        if (d === 'espacio_protegido') {
          accept[d] = new Set(Object.keys(c.labels[d]).map(Number).filter((x) => (b ? x > 0 : x === 0)));
        } else accept[d] = new Set([b ? 1 : 0]);
        applied.push(`${DIM_TXT[d]}: ${b ? 'sí' : 'no'}`);
        continue;
      }
      const terms = (Array.isArray(v0) ? v0 : String(v0).split(',')).map((t) => norm(t)).filter(Boolean);
      const labs = Object.entries(c.labels[d]).map(([code, lab]) => [Number(code), norm(lab)]);
      const codes = new Set();
      for (const t of terms) {
        if (d === 'propiedad' && /^(publico|publica|monte publico|utilidad publica|mup)$/.test(t)) { c.propiedad_publica.filter((x) => String(x) in c.labels[d]).forEach((x) => codes.add(x)); continue; }
        if (d === 'propiedad' && /^(privado|privada|particular|sin catalogar)$/.test(t)) {
          labs.filter(([, l]) => l.includes('sin catalogar') || l.includes('privad')).forEach(([x]) => codes.add(x)); continue;
        }
        const exact = labs.filter(([, l]) => l === t);
        (exact.length ? exact : labs.filter(([, l]) => l.includes(t))).forEach(([x]) => codes.add(x));
      }
      if (!codes.size) {
        out.error_filtro = true;
        return `En el ${c.nombre} no hay ningún valor de ${DIM_TXT[d]} que coincida con "${terms.join(', ')}". Valores posibles (ha quemadas): ${valuesList(d)}.${firma(f)}`;
      }
      accept[d] = codes;
      applied.push(`${DIM_TXT[d]}: ${[...codes].map((x) => labelOf(d, x)).join(' o ')}`);
    }
    const groups = (Array.isArray(agrupar_por) ? agrupar_por : String(agrupar_por || '').split(',')).map((g) => String(g).trim()).filter(Boolean).slice(0, 2);
    const gd = [];
    for (const g of groups) {
      const d = dimOf(g);
      if (!d) return (out.error_filtro = true) && `No puedo agrupar por "${g}". Dimensiones posibles: ${dimNames.join(', ')}.${firma(f)}`;
      gd.push(d);
    }

    // sin filtros ni agrupación: valores disponibles con su superficie
    if (!applied.length && !gd.length) {
      const L = [`Superficies consultables · ${c.nombre}`, `Total visto quemado por satélite: ${ha(c.superficie_quemada_ha)} ha (píxeles de 25 m dentro del perímetro${emsTxt}).`, '',
        'Dimensiones para filtrar o agrupar (valores con sus hectáreas quemadas):'];
      for (const d of dimNames) L.push(`- ${d} (${DIM_TXT[d]}): ${valuesList(d)}`);
      L.push('', `Usa filtros (p. ej. {"municipio":["Tales"],"vegetacion_antes":["alcornocal"],"sustrato":["calizo"]}) y agrupar_por (hasta 2 dimensiones).`,
        `Cobertura CEAM medida el ${c.fecha_cobertura_ceam}; solo es significativa a partir de un año después del incendio.`);
      Object.assign(out, { incendio: f.slug, total_ha: c.superficie_quemada_ha, dimensiones: Object.fromEntries(dimNames.map((d) => [d, valuesList(d)])) });
      return L.join('\n') + firma(f);
    }

    // filtro y agrupación sobre columnas Uint8Array: máscaras de 256 valores por dimensión y suma en un Float64Array
    let tot = 0;
    const ks = Object.keys(accept);
    const fcols = ks.map((d) => c.cols[d]);
    const masks = ks.map((d) => { const m = new Uint8Array(256); accept[d].forEach((v) => { m[v] = 1; }); return m; });
    const g0 = gd[0] ? c.cols[gd[0]] : null, g1 = gd[1] ? c.cols[gd[1]] : null;
    const sums = new Float64Array(gd.length ? 65536 : 1);
    const px = c.px, nk = ks.length;
    for (let r = 0; r < c.n; r++) {
      let k = 0;
      while (k < nk && masks[k][fcols[k][r]]) k++;
      if (k < nk) continue;
      tot += px[r];
      if (g0) sums[g0[r] * 256 + (g1 ? g1[r] : 0)] += px[r];
    }
    const acc = [];
    if (g0) for (let k = 0; k < 65536; k++) if (sums[k]) acc.push([gd.length > 1 ? `${k >> 8}|${k & 255}` : `${k >> 8}`, sums[k]]);
    const totHa = tot * ph;
    const pct = (x, y) => (!(y > 0) ? '—' : x <= 0 ? '0 %' : `${fmt((100 * x) / y, x / y < 0.1 ? 1 : 0)} %`);
    const L = [`Superficies · ${c.nombre}`, `Filtros: ${applied.length ? applied.join(' · ') : 'ninguno (todo el área quemada)'}.`,
      `Total: ${ha(totHa)} ha (${pct(totHa, c.superficie_quemada_ha)} de las ${ha(c.superficie_quemada_ha)} ha vistas quemadas en la rejilla de 25 m${emsTxt}).`];
    if (accept.reincendio_corto && !accept.forestal) {
      L.push('Nota: este total incluye superficie no forestal (cultivos, zonas urbanas). Para compararlo con zonas_prioritarias, añade forestal:true.');
    }
    const rows = acc.map(([k, p]) => ({ k: k.split('|').map(Number), ha: p * ph })).sort((a, b) => b.ha - a.ha);
    if (gd.length) {
      L.push('', `Por ${gd.map((d) => DIM_TXT[d]).join(' y ')} (ha · % del total filtrado · % del incendio):`);
      rows.slice(0, 30).forEach((x) => L.push(`- ${x.k.map((v, j) => labelOf(gd[j], v)).join(' · ')}: ${ha(x.ha)} ha · ${pct(x.ha, totHa)} · ${pct(x.ha, c.superficie_quemada_ha)}`));
      if (rows.length > 30) L.push(`… y ${rows.length - 30} combinaciones más (${ha(rows.slice(30).reduce((s, x) => s + x.ha, 0))} ha).`);
    }
    if (ks.includes('cobertura_ceam') || gd.includes('cobertura_ceam')) {
      L.push('', `Cobertura según el criterio CEAM, imagen del ${c.fecha_cobertura_ceam}: solo es significativa a partir de un año después del incendio.`);
    }
    L.push('', c.nota);
    Object.assign(out, {
      incendio: f.slug, filtros: applied, total_ha: Math.round(totHa * 10) / 10, superficie_quemada_ha: c.superficie_quemada_ha,
      agrupado_por: gd, filas: rows.slice(0, 100).map((x) => ({ ...Object.fromEntries(gd.map((d, j) => [d, labelOf(d, x.k[j])])), ha: Math.round(x.ha * 10) / 10 })),
    });
    return L.join('\n') + firma(f);
  }

  // contexto de un incendio para las guías: tiempo transcurrido, criterio de prioridad, reincendio y municipios
  async function contexto(q) {
    if (!q) return null;
    const f = await findFire(q);
    if (!f) return null;
    const [d, z] = await Promise.all([detail(f.slug), prio(f.slug)]);
    // meses desde la imagen "después" (justo tras el incendio) hasta hoy
    const [y0, m0] = z.fechas.despues.split('-').map(Number), hoy = new Date();
    return {
      slug: f.slug, nombre: d.subtitulo, mapa: mapUrl(f), meses: Math.max(0, (hoy.getUTCFullYear() - y0) * 12 + hoy.getUTCMonth() + 1 - m0), modo: z.modo, fechas: z.fechas,
      hoy: hoy.toISOString().slice(0, 10), fuera_ceam: !['espada', 'bejis', 'villanueva-de-viver'].includes(f.slug),
      reincendio_ha: z.reincendio?.total_ha || 0, municipios: d.municipios.map((m) => m.nombre), espacio: d.parque_natural?.nombre || null,
    };
  }

  // píxel de la rejilla (25 m) que contiene el punto; null si cae fuera de la zona del mapa
  function locate(W, H, bounds, lat, lon) {
    const [[s, w], [n, e]] = bounds;
    const P0 = merc(s, w), P1 = merc(n, e), p = merc(lat, lon);
    const x = Math.floor(((p.x - P0.x) / (P1.x - P0.x)) * W);
    const y = Math.floor(((P1.y - p.y) / (P1.y - P0.y)) * H);
    return x < 0 || y < 0 || x >= W || y >= H ? null : { x, y };
  }

  // teselas (point.json + un trozo de point.bin.gz por HTTP Range) si existen; si no, la rejilla completa
  const tilesOk = new Map();
  async function pixel(f, lat, lon) {
    if (point === 'tiles' && tilesOk.get(f.slug) !== false) {
      try {
        const r = await pixelTiles(f, lat, lon);
        tilesOk.set(f.slug, true);
        return r;
      } catch (e) {
        if (tilesOk.get(f.slug) === true) throw e;   // las teselas ya funcionaban: error real, no se oculta
        tilesOk.set(f.slug, false);
      }
    }
    return pixelGrid(f, lat, lon);
  }
  async function pixelTiles(f, lat, lon) {
    {
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
  }
  async function pixelGrid(f, lat, lon) {
    const { meta, G, montes, previos } = await grid(f);
    const c = locate(meta.width, meta.height, meta.bounds, lat, lon);
    if (!c) return null;
    const i = c.y * meta.width + c.x;
    const pt = [lon, lat];
    const monte = montes.features.find((x) => inFeature(pt, x.geometry));
    const fuegos = previos.features.filter((x) => inFeature(pt, x.geometry)).map((x) => x.properties.anyo).sort();
    return { meta, G, i, monte, fuegos, inside: G.inside[i] ? 1 : 0 };
  }

  return { listar, resumen, plan, punto, municipio, prioridades, superficies, contexto, index, detail, findFire, firma };
}

// ------------------------------------------------------------ utilidades
const REB = 15;   // años: reincendio en intervalo corto (como scripts/build_priority.py)
const DIM_TXT = {
  municipio: 'municipio', severidad: 'severidad', propiedad: 'propiedad', vegetacion_antes: 'vegetación antes', sustrato: 'sustrato',
  serie_potencial: 'serie de vegetación potencial', actuacion: 'actuación propuesta', erosion: 'riesgo de erosión',
  espacio_protegido: 'espacio protegido', incendio_previo: 'incendio anterior', cobertura_ceam: 'cobertura (criterio CEAM)',
  forestal: 'forestal', reincendio_corto: `reincendio en menos de ${REB} años`,
};
const DIM_ALIAS = {
  municipio: 'municipio', municipios: 'municipio', severidad: 'severidad', propiedad: 'propiedad', propietario: 'propiedad', titular: 'propiedad', titularidad: 'propiedad', monte_publico: 'propiedad',
  vegetacion: 'vegetacion_antes', vegetacion_antes: 'vegetacion_antes', vegetacion_previa: 'vegetacion_antes', sustrato: 'sustrato', suelo: 'sustrato', geologia: 'sustrato',
  serie: 'serie_potencial', serie_potencial: 'serie_potencial', vegetacion_potencial: 'serie_potencial', potencial: 'serie_potencial',
  actuacion: 'actuacion', accion: 'actuacion', erosion: 'erosion', riesgo_erosion: 'erosion', espacio_protegido: 'espacio_protegido', parque_natural: 'espacio_protegido',
  incendio_previo: 'incendio_previo', incendio_anterior: 'incendio_previo', ano_incendio_previo: 'incendio_previo', cobertura: 'cobertura_ceam', cobertura_ceam: 'cobertura_ceam', ceam: 'cobertura_ceam',
  forestal: 'forestal', reincendio: 'reincendio_corto', reincendio_corto: 'reincendio_corto',
};
const ha = (x) => fmt(x, x > 0 && x < 10 ? 1 : 0);
const SEV = { 1: 'no quemado', 2: 'baja', 3: 'moderada-baja', 4: 'moderada-alta', 5: 'alta' };
const FOREST = (v) => v !== 0 && v !== 10 && v !== 11 && v !== 12;
// formateadores en caché: crear uno por llamada (toLocaleString con opciones) cuesta ~0,02 ms y hay respuestas con cientos de cifras
const NF = [0, 1, 2].map((d) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: d, minimumFractionDigits: d }));
const fmt = (n, d = 0) => (NF[d] || new Intl.NumberFormat('es-ES', { maximumFractionDigits: d, minimumFractionDigits: d })).format(Number(n));
const eur = (n) => (n >= 1e6 ? `${fmt(n / 1e6, 2)} M€` : `${fmt(n / 1e3, 0)} k€`);
const kv = (o) => Object.entries(o || {}).filter(([, v]) => (typeof v === 'number' ? v : v?.total) > 0)
  .map(([k, v]) => `${k} ${fmt(typeof v === 'number' ? v : v.total)}`).join('; ');
// sin tildes ni mayúsculas; apóstrofos y guiones unificados ("30-60" casa con "30–60")
export const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’']/g, "'").replace(/[‐-―−]/g, '-').trim();
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
