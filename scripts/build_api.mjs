// Genera public/api/: resúmenes en JSON de cada incendio para IAs y para el servidor MCP (mcp/).
// Lee los textos de cada fire.js y series.js, el título de cada index.html y las estadísticas de data/meta.json.
// Ejecutar después de scripts/build_data.py (y trees.py):  node scripts/build_api.mjs
// Los JSON no llevan rejillas: el MCP lee grid.bin.gz directamente del repo fenix-data para las consultas por punto.

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUB = path.join(ROOT, 'public');
const SITE = 'https://jgarnie.github.io/fenix/';
const DATA = 'https://jgarnie.github.io/fenix-data/';

// slug → carpeta dentro de public/ ('' = raíz, Espadà)
const FIRES = [
  { slug: 'espada', dir: '' },
  { slug: 'bejis', dir: 'bejis' },
  { slug: 'tietar', dir: 'tietar' },
  { slug: 'villanueva-de-viver', dir: 'villanueva-de-viver' },
];

const AUTOR = {
  nombre: 'Joaquín García Nieto',
  email: 'garcia.nieto.joaquin@gmail.com',
  linkedin: 'https://www.linkedin.com/in/jgarnie/',
  github: 'https://github.com/jgarnie',
  codigo: 'https://github.com/jgarnie/fenix',
};
const AVISO = 'Fénix es un proyecto divulgativo e independiente, no una fuente oficial. Las capas derivadas (severidad, actuaciones, '
  + 'viabilidad, costes) son elaboración propia y ningún organismo las ha revisado ni respaldado. Para decisiones, consultar a la administración forestal competente.';

// ---------------------------------------------------------------- utilidades
const fmt = (n, d = 0) => Number(n).toLocaleString('es-ES', { maximumFractionDigits: d, minimumFractionDigits: d });
const ha = (n) => `${fmt(n)} ha`;
const r1 = (x) => Math.round(x * 10) / 10;
const ENT = { '&gt;': '>', '&lt;': '<', '&amp;': '&', '&nbsp;': ' ', '&quot;': '"', '&#39;': "'", '&rarr;': '→', '&middot;': '·' };

// HTML → texto plano; los enlaces quedan como "texto (url)"
function text(html) {
  if (html == null) return null;
  return String(html)
    .replace(/<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g, (_, u, t) => `${t} (${u})`)
    .replace(/<li[^>]*>/g, '\n- ')
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/<\/(p|div|h\d|ul)>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&[a-z#0-9]+;/g, (e) => ENT[e] ?? e)
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();
}
const links = (html) => [...String(html || '').matchAll(/<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)]
  .map(([, url, t]) => ({ texto: text(t), url }));
const call = (v, ...a) => (typeof v === 'function' ? v(...a) : v);

function timeline(html) {
  return [...String(html || '').matchAll(/<div><b>([\s\S]*?)<\/b>([\s\S]*?)<\/div>/g)].map(([, c, q]) => ({ cuando: text(c), que: text(q) }));
}

function page(file) {
  const h = fs.readFileSync(file, 'utf8');
  const get = (re) => (h.match(re) || [])[1];
  return {
    titulo: text(get(/<title>([^<]*)<\/title>/)),
    subtitulo: text(get(/class="sub"[^>]*>([^<]*)</)),
    descripcion: text(get(/<meta name="description" content="([^"]*)"/)),
  };
}

// fuentes comunes que añade app.js a todos los incendios (pestaña Fuentes)
const COMUNES = [
  { texto: 'Imágenes Sentinel-2 L2A (Copernicus) vía Earth Search', url: 'https://earth-search.aws.element84.com/v1' },
  { texto: 'Mapa de Series de Vegetación de España (Rivas-Martínez 1987), MITECO', url: 'https://www.miteco.gob.es/es/biodiversidad/servicios/banco-datos-naturaleza/informacion-disponible/memoria_mapa_series_veg_descargas.html' },
  { texto: 'Geología: IGME GEODE 1:50.000', url: 'https://mapas.igme.es/gis/rest/services/Cartografia_Geologica/IGME_Geode_50/MapServer' },
  { texto: 'Relieve: Copernicus DEM GLO-30', url: null },
  { texto: 'Tercer Inventario Forestal Nacional (IFN3), MITECO', url: 'https://www.miteco.gob.es/es/biodiversidad/servicios/banco-datos-naturaleza/informacion-disponible/ifn3_base_datos_1_25.html' },
  { texto: 'Costes: Tarifas forestales de la Junta de Extremadura 2024', url: 'http://extremambiente.juntaex.es/files/2024/forestales/Tarifas%20SOGF_2024.pdf' },
];
const METODO = {
  severidad: 'dNBR = NBR(antes) − NBR(después), con NBR = (B8 − B12)/(B8 + B12), Sentinel-2. Umbrales de Key & Benson (USGS): 0,10 · 0,27 · 0,44 · 0,66.',
  vegetacion_potencial: 'Serie de vegetación del Mapa de Series de Vegetación de España (Rivas-Martínez, 1987), escala nacional: indica la serie dominante de la zona, no la de cada ladera.',
  erosion: '(clase de severidad − 1) × pendiente/25 %.',
  viabilidad: 'Índice 0–100: cercanía entre la vegetación previa y la potencial, con ajustes por severidad, recurrencia, pendiente, solanas secas sobre rodeno y rebrote observado.',
  ceam: 'Cobertura vegetal estimada con NDVI respecto a suelo quemado y vegetación densa; umbrales del CEAM 30 % y 60 %. Aproximación: el CEAM lo evalúa en campo.',
  arboles: 'Densidad de las parcelas IFN3 por tipo de bosque × hectáreas quemadas, con mortalidad supuesta según severidad. Datos de campo de 2006.',
};
const RECARGO = { pem: 1, vaersa: 1.0747, licita: 1.19 * 1.21 };

// ---------------------------------------------------------------- generación
const { POT_INFO } = await import(pathToFileURL(path.join(PUB, 'series.js')).href);
const out = path.join(PUB, 'api');
fs.mkdirSync(out, { recursive: true });
const index = [];

for (const { slug, dir } of FIRES) {
  const base = path.join(PUB, dir);
  const { ACT_INFO, EMERG, FIRE: F } = await import(pathToFileURL(path.join(base, 'fire.js')).href);
  const meta = JSON.parse(fs.readFileSync(path.join(base, 'data', 'meta.json'), 'utf8'));
  const S = meta.stats;
  const pg = page(path.join(base, 'index.html'));
  const mapa = SITE + (dir ? `${dir}/` : '');
  const dataUrl = `${DATA}${F.dataDir}/data/`;

  // plan: escenario por defecto del mapa (emergencia en todo el área; resto, solo monte público)
  const fRec = RECARGO[F.recargo || 'vaersa'];
  const emergHa = (S.erosion.Alto || 0) + (S.erosion['Muy alto'] || 0);
  const acciones = [1, 2, 3, 4].map((k) => {
    const a = S.actions[meta.legends.act[k]];
    return {
      clave: k, nombre: ACT_INFO[k].corto, que: text(ACT_INFO[k].que), como: ACT_INFO[k].como.map(text),
      ha_total: a?.total ?? 0, ha_publico: a?.publico ?? 0, ha_privado: a?.privado ?? 0, ha_erosion_alta: a?.erosion_alta ?? 0,
      coste_eur_ha: ACT_INFO[k].coste, calendario: F.plan.when[k] || null,
      coste_escenario_eur: Math.round((a?.publico ?? 0) * ACT_INFO[k].coste * fRec),
    };
  });
  const emerg = { nombre: EMERG.corto, que: text(EMERG.que), como: EMERG.como.map(text), ha: r1(emergHa), coste_eur_ha: EMERG.coste,
    calendario: F.plan.when.emerg || null, coste_escenario_eur: Math.round(emergHa * EMERG.coste * fRec) };
  const totalEsc = emerg.coste_escenario_eur + acciones.reduce((s, a) => s + a.coste_escenario_eur, 0);

  // series potenciales presentes
  const potKeys = Object.entries(meta.legends.pot).filter(([, l]) => S.potential[l] > 0).map(([k]) => +k);
  const potencial = potKeys.map((k) => ({ clave: k, ha: S.potential[meta.legends.pot[k]], ...POT_INFO[k], color: undefined }));

  const fuentesHtml = [call(F.fuentesDatos, S), F.fuentesMontes, F.fuentesOtras, F.fuentesOficial, F.fuentesCeam].filter(Boolean).join('\n');
  const municipios = Object.entries(S.municipios).map(([n, v]) => ({ nombre: n, ha_total: v.total, ha_forestal: v.forestal }));

  const resumen = {
    slug, nombre: pg.titulo, subtitulo: pg.subtitulo, descripcion: pg.descripcion, anyo: S.fire_year,
    mapa, dataUrl, bounds: meta.bounds, ems: F.ems, ems_url: F.emsUrl,
    superficie_satelite_ha: S.ems_ha, superficie_forestal_ha: S.forest_ha, monte_publico_ha: S.public_ha,
    oficial: F.official ? { valor: F.official.value, nota: text(F.official.label) } : null,
    municipios,
  };
  index.push(resumen);

  const full = {
    ...resumen,
    parque_natural: F.park ? { nombre: F.park, ha_dentro: S.pn_ha } : null,
    administracion: text(F.admin) || 'Generalitat Valenciana',
    vegetacion_potencial_resumen: text(F.potential),
    nota_superficie: text(F.officialLimit),
    destacado: text(call(F.calloutExtra, S, ha)),
    estadisticas: {
      ya_habia_ardido_ha: S.recurrent_ha, desde: F.firesFrom,
      severidad_ha: S.severity, propiedad_ha: S.owner, vegetacion_antes_ha: S.veg_before, vegetacion_potencial_ha: S.potential,
      erosion_ha: S.erosion, viabilidad_ha: S.feasibility, criterio_ceam_ha: F.hideCeam ? null : S.ceam,
      rebrote_ha: S.regrowth_ha, ndvi_serie_quemado: S.ndvi_serie, ndvi_serie_sin_quemar: S.ndvi_serie_ref,
      escenas_sentinel2: S.scenes, sequedad_previa: S.sequedad,
      arboles: S.arboles ? { total: S.arboles.total, intervalo90: S.arboles.total_ci90, muertos: S.arboles.muertos, muertos_intervalo90: S.arboles.muertos_ci90, nota: text(F.arbolesNota), fuente: S.arboles.fuente } : null,
    },
    criterio_ceam_ahora: F.hideCeam ? null : text(call(F.ceamNow, S, ha)),
    plan: {
      escenario: 'Escenario por defecto del mapa: control de la erosión en todo el área quemada y actuaciones a largo plazo solo en monte público. Precios de tarifa forestal con recargo de ' + (F.recargo === 'licita' ? 'contrato licitado (+GG, BI e IVA)' : F.recargo === 'pem' ? 'ninguno (ejecución material)' : 'encargo a VAERSA'),
      emergencia: emerg, acciones, coste_total_escenario_eur: totalEsc,
      presupuesto_referencia_eur: F.plan.budget, referencia: text(F.plan.ref),
      metodo_actuacion: text(F.metodoActuacion) || 'rebrotadoras → regeneración natural; pinar maduro poco dañado y sin incendios recientes → natural; resto de pinar → asistida; pinar con daño alto donde debería haber alcornocal o zonas con ≥2 incendios previos → restauración activa.',
    },
    series_potenciales: potencial,
    cronologia: timeline(F.timeline),
    como_ayudar: [
      'Registrar observaciones de rebrote con fotos geolocalizadas (p. ej. iNaturalist).',
      'Participar en jornadas oficiales de voluntariado de siembra y plantación (otoño-invierno).',
      text(F.ayuda),
    ].filter(Boolean),
    fuentes: { texto: text(fuentesHtml), enlaces: [...links(fuentesHtml), ...COMUNES], limites: text(F.limitMontes) },
    metodo: METODO,
    aviso: AVISO,
    autor: AUTOR,
  };
  fs.writeFileSync(path.join(out, `${slug}.json`), JSON.stringify(full, null, 1));
  console.log(`${slug}: ${fmt(fs.statSync(path.join(out, `${slug}.json`)).size / 1024, 1)} KB`);
}

fs.writeFileSync(path.join(out, 'incendios.json'), JSON.stringify({
  proyecto: 'Fénix · mapas de incendios forestales en España después del fuego',
  web: SITE, generado: new Date().toISOString().slice(0, 10),
  incendios: index, aviso: AVISO, autor: AUTOR,
  detalle: 'Detalle de cada incendio en api/<slug>.json',
}, null, 1));
console.log(`incendios.json: ${index.length} incendios`);
