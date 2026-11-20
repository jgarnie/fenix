// Servidor remoto de Fénix (Cloudflare Workers). Mismo núcleo y herramientas que el servidor local (../../src):
//   /mcp           MCP Streamable HTTP sin estado (Claude, ChatGPT y otros clientes con conectores remotos)
//   /api/...       API REST en JSON (acciones de un GPT personalizado u otras aplicaciones)
//   /openapi.json  especificación OpenAPI 3.1 de la API REST
//   /              página con instrucciones   ·   /privacidad   política de privacidad
// Las consultas por punto usan point.json + una tesela de point.bin.gz (HTTP Range): la rejilla completa no cabe en los
// límites del plan gratuito (10 ms de CPU y 128 MB por petición). Ver scripts/build_point.py.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { CfWorkerJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/cfworker';
import { createFenix } from '../../src/core.js';
import { registerTools, INSTRUCTIONS } from '../../src/tools.js';
import { openapi } from './openapi.js';
import { TEMAS, guia } from '../../src/guides.js';

const BOOL_KEYS = ['forestal', 'reincendio_corto'];  // espacio_protegido admite sí/no o un nombre: lo decide el núcleo
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
// decodifica un segmento de ruta; null si está mal codificado (→ 400)
const dec = (s) => { try { return decodeURIComponent(s); } catch { return null; } };
import { VERSION } from '../../src/version.js';  // generado desde public/version.json (scripts/bump_version.mjs)
const AUTOR = { nombre: 'Joaquín García Nieto', email: 'garcia.nieto.joaquin@gmail.com', linkedin: 'https://www.linkedin.com/in/jgarnie/' };
const AVISO = 'Fénix es un proyecto divulgativo e independiente, no una fuente oficial. Las capas derivadas (severidad, actuaciones, '
  + 'viabilidad, costes) son elaboración propia. Para decisiones, consultar a la administración forestal competente.';

// núcleo compartido por todas las peticiones del mismo isolate (caché de índices, detalles y teselas)
let FX = null, FXKEY = null;
function fenix(env) {
  const site = env.FENIX_SITE || undefined, data = env.FENIX_DATA || null;
  const key = `${site}|${data}`;
  if (!FX || FXKEY !== key) {
    FX = createFenix({ site, data, point: 'tiles' });
    FXKEY = key;
  }
  return FX;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID',
  'Access-Control-Expose-Headers': 'Mcp-Session-Id, Mcp-Protocol-Version',
  'Access-Control-Max-Age': '86400',
};
const withCors = (res) => {
  const r = new Response(res.body, res);
  for (const [k, v] of Object.entries(CORS)) r.headers.set(k, v);
  return r;
};
const json = (body, status = 200) => new Response(JSON.stringify(body, null, 2), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': status === 200 ? 'public, max-age=600' : 'no-store', ...CORS },
});
const html = (body) => new Response(body, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600', ...CORS } });

// respuesta REST: texto listo para citar + datos estructurados + aviso y autor
const ok = (texto, datos = null, extra = {}) => json({ texto, datos, ...extra, aviso: AVISO, autor: AUTOR });
const bad = (texto, status = 400) => json({ error: texto, aviso: AVISO, autor: AUTOR }, status);

async function mcp(request, env) {
  const server = new McpServer(
    { name: 'fenix', title: 'Fénix · incendios forestales', version: VERSION, websiteUrl: 'https://jgarnie.github.io/fenix/' },
    { instructions: INSTRUCTIONS, jsonSchemaValidator: new CfWorkerJsonSchemaValidator() },
  );
  registerTools(server, { fx: fenix(env) });
  // sin estado: un servidor y un transporte por petición; respuestas JSON en lugar de SSE
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  return transport.handleRequest(request);
}

async function api(path, params, env) {
  const fx = fenix(env);
  if (path === '/api/incendios') {
    const { incendios } = await fx.index();
    return ok(await fx.listar(), incendios.map(({ slug, nombre, subtitulo, descripcion, anyo, mapa, superficie_satelite_ha, oficial, municipios, bounds }) => (
      { slug, nombre, subtitulo, descripcion, anyo, mapa, superficie_satelite_ha, oficial, municipios, bounds })));
  }
  const sp = /^\/api\/incendios\/([^/]+)\/superficies$/.exec(path);
  if (sp) {
    const q = dec(sp[1]);
    if (q === null) return bad('Ruta mal codificada.');
    const f = await fx.findFire(q);
    if (!f) return bad(await fx.resumen(q), 404);
    // filtros como parámetros: ?municipio=Tales&vegetacion_antes=alcornocal&severidad=alta,moderada-alta&reincendio_corto=true&agrupar_por=municipio,severidad
    const filtros = Object.create(null);   // sin prototipo: claves como __proto__ o constructor son filtros (desconocidos) normales
    for (const [k, v] of params) if (k !== 'agrupar_por' && v.trim() !== '') filtros[k] = BOOL_KEYS.includes(k) ? ['1', 'true', 'si', 'sí'].includes(v.toLowerCase()) : v.split(',');
    const out = {};
    const texto = await fx.superficies(f.slug, { filtros, agrupar_por: (params.get('agrupar_por') || '').split(',').filter(Boolean) }, out);
    if (out.error_filtro) return bad(texto);   // filtro o agrupación desconocidos, o valor sin coincidencias: 400 con los valores válidos
    return ok(texto, out, { incendio: f.slug });
  }
  if (path === '/api/guia') {
    const tema = params.get('tema') || '';
    if (!has(TEMAS, tema)) return bad(`Parámetro tema obligatorio: ${Object.keys(TEMAS).join(', ')}.`);
    const q = params.get('incendio');
    const ctx = q ? await fx.contexto(q).catch(() => null) : null;
    if (q && !ctx) return bad(await fx.resumen(q), 404);
    const texto = guia(tema, ctx, (params.get('municipio') || '').trim() || null) + fx.firma(ctx ? await fx.findFire(ctx.slug) : null);
    return ok(texto, { tema, incendio: ctx?.slug || null });
  }
  const zp = /^\/api\/incendios\/([^/]+)\/prioridades$/.exec(path);
  if (zp) {
    const q = dec(zp[1]);
    if (q === null) return bad('Ruta mal codificada.');
    const f = await fx.findFire(q);
    if (!f) return bad(await fx.resumen(q), 404);
    const lim = Number(params.get('limite') || 5);
    if (!Number.isInteger(lim) || lim < 1 || lim > 8) return bad('Parámetro limite: un número entero entre 1 y 8.');
    const tp = params.get('tipo') || 'todas';
    if (!['todas', 'erosion', 'regeneracion', 'reincendio'].includes(tp)) return bad('Parámetro tipo: todas, erosion, regeneracion o reincendio.');
    const out = {};
    const texto = await fx.prioridades(f.slug, {
      municipio: (params.get('municipio') || '').trim() || null, solo_publico: ['1', 'true', 'si', 'sí'].includes((params.get('solo_publico') || '').toLowerCase()), limite: lim, tipo: tp,
    }, out);
    return ok(texto, out, { incendio: f.slug });
  }
  let m = /^\/api\/incendios\/([^/]+)(\/plan)?$/.exec(path);
  if (m) {
    const q = dec(m[1]);
    if (q === null) return bad('Ruta mal codificada.');
    const f = await fx.findFire(q);
    if (!f) return bad(await fx.resumen(q), 404);
    const d = await fx.detail(f.slug);
    return m[2] ? ok(await fx.plan(f.slug), d.plan, { incendio: f.slug, mapa: d.mapa })
      : ok(await fx.resumen(f.slug), d, { incendio: f.slug, mapa: d.mapa });
  }
  if (path === '/api/punto') {
    const lat = Number(params.get('lat')), lon = Number(params.get('lon'));
    if (!params.has('lat') || !params.has('lon') || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      return bad('Parámetros lat y lon obligatorios, en grados decimales WGS84 (p. ej. lat=39.90975&lon=-0.21464).');
    }
    const qi = (params.get('incendio') || '').trim();
    if (qi && !(await fx.findFire(qi))) return bad(await fx.resumen(qi), 404);
    const out = {};
    const texto = await fx.punto(lat, lon, qi || undefined, out);
    return ok(texto, out);
  }
  if (path === '/api/municipio') {
    const nombre = (params.get('nombre') || '').trim();
    if (!nombre) return bad('Parámetro nombre obligatorio (p. ej. nombre=Artana).');
    const out = {};
    const texto = await fx.municipio(nombre, out);
    return ok(texto, out.resultados);
  }
  return null;
}

export default {
  async fetch(request, env, ctx) {
    const t0 = Date.now();
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    // estadística anónima: se lee una copia de la petición MCP (método y argumentos) antes de atenderla
    const rpc = path === '/mcp' && request.method === 'POST' ? request.clone().json().catch(() => null) : null;
    let res;
    try {
      if (path === '/mcp') res = withCors(await mcp(request, env));
      else if (request.method !== 'GET' && request.method !== 'HEAD') res = bad('Método no permitido', 405);
      else if (path === '/openapi.json') res = json(openapi(url.origin, VERSION));
      else if (path === '/') res = html(landing(url.origin));
      else if (path === '/privacidad') res = html(privacy(url.origin));
      else if (path === '/favicon.ico') return new Response(null, { status: 204 });
      else res = (await api(path, url.searchParams, env)) || bad(`No existe ${path}. Ver ${url.origin}/ y ${url.origin}/openapi.json`, 404);
    } catch (e) {
      res = bad(`Error al consultar Fénix: ${e.message}`, 502);
    }
    const rec = track(request, env, path, url.searchParams, rpc, res.status, Date.now() - t0);
    if (ctx?.waitUntil) ctx.waitUntil(rec); else rec.catch(() => {});
    return res;
  },
};

// ------------------------------------------------------------------ estadística de uso anónima
// Una fila por petición en Workers Analytics Engine (binding STATS, dataset fenix_mcp) y la misma fila como log
// JSON (Workers Logs, visible 3 días en el panel; los registros de invocación, con la URL completa, están desactivados en
// wrangler.jsonc). Solo campos cerrados: nunca IP, User-Agent completo, coordenadas ni texto libre; el cliente se reduce
// a una familia (lista cerrada) y el municipio se guarda solo si coincide con uno de los incendios de Fénix ("otro" si no).
// Orden de columnas (scripts/mcp_stats.mjs depende de él):
//   blob1 tipo (mcp|rest|pagina) · blob2 ruta/método · blob3 herramienta · blob4 incendio · blob5 municipio · blob6 tipo
//   de prioridad · blob7 cliente · blob8 versión del cliente · blob9 país · blob10 resultado (ok|error)
//   double1 milisegundos · double2 código HTTP
const ROUTE_TOOL = { '/api/incendios': 'listar_incendios', '/api/punto': 'consultar_punto', '/api/municipio': 'buscar_municipio', '/api/guia': 'guia_experta' };
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
// lista cerrada: el nombre que declara el cliente MCP (texto libre) nunca se guarda tal cual
const clientFamily = (ua) => {
  const u = String(ua || '');
  if (/claude|anthropic/i.test(u)) return 'Claude';
  if (/openai|chatgpt/i.test(u)) return 'ChatGPT';
  if (/cursor/i.test(u)) return 'Cursor';
  if (/visual studio|vscode|copilot/i.test(u)) return 'VS Code';
  if (/gemini|google/i.test(u)) return 'Gemini';
  if (/python/i.test(u)) return 'python';
  if (/node|undici/i.test(u)) return 'node';
  if (/curl|wget/i.test(u)) return 'curl';
  if (/mozilla/i.test(u)) return 'navegador';
  return u ? 'otro' : 'desconocido';
};
const clean = (s, n = 40) => String(s || '').replace(/[^\p{L}\p{N} ._/{}-]/gu, '').slice(0, n);
// métodos MCP conocidos (cualquier otro se registra como "otro")
const MCP_METHODS = new Set(['initialize', 'notifications/initialized', 'ping', 'tools/list', 'tools/call', 'prompts/list', 'prompts/get',
  'resources/list', 'resources/templates/list', 'resources/read', 'completion/complete', 'logging/setLevel', 'notifications/cancelled']);
const TOOLS = new Set(['listar_incendios', 'resumen_incendio', 'plan_restauracion', 'consultar_punto', 'buscar_municipio',
  'zonas_prioritarias', 'consultar_superficies', 'guia_experta']);
const VERSION_RE = /^\d{1,4}(\.\d{1,4}){0,3}$/;

async function track(request, env, path, params, rpcPromise, status, ms) {
  try {
    let kind = 'pagina', route = path, tool = '', args = {}, client = clientFamily(request.headers.get('User-Agent')), clientVer = '';
    if (path === '/mcp') {
      kind = 'mcp';
      const body = await rpcPromise;
      const msg = Array.isArray(body) ? body[0] : body;
      route = MCP_METHODS.has(msg?.method) ? msg.method : (msg ? 'otro' : request.method === 'GET' ? 'GET' : 'otro');
      if (msg?.method === 'tools/call') {
        tool = TOOLS.has(msg.params?.name) ? msg.params.name : 'otra';
        const a = msg.params?.arguments || {};
        const fm = a.filtros?.municipio;
        args = { incendio: a.incendio, municipio: a.municipio || a.nombre || (Array.isArray(fm) ? fm[0] : fm), tipo: a.tipo };
      }
      if (msg?.method === 'initialize' && msg.params?.clientInfo) {
        if (msg.params.clientInfo.name) client = clientFamily(msg.params.clientInfo.name);
        const v = String(msg.params.clientInfo.version || '');
        clientVer = VERSION_RE.test(v) ? v : '';
      }
    } else if (path.startsWith('/api/')) {
      kind = 'rest';
      const m = /^\/api\/incendios\/([^/]+)(\/plan|\/prioridades|\/superficies)?$/.exec(path);
      tool = m ? ({ '/plan': 'plan_restauracion', '/prioridades': 'zonas_prioritarias', '/superficies': 'consultar_superficies' }[m[2]] || 'resumen_incendio') : (ROUTE_TOOL[path] || 'otra');
      route = m ? `/api/incendios/{incendio}${m[2] || ''}` : path;
      args = { incendio: m ? dec(m[1]) : params.get('incendio'), municipio: (params.get('municipio') || params.get('nombre') || '').split(',')[0], tipo: params.get('tipo') };
    } else if (!['/', '/privacidad', '/openapi.json'].includes(path)) {
      route = 'otra';
    }
    // incendio y municipio: solo valores conocidos de Fénix
    let fire = '', mun = '';
    if (norm(args.incendio) || norm(args.municipio)) {
      const { incendios } = await fenix(env).index();
      if (norm(args.incendio)) {
        const q = norm(args.incendio);
        const f = incendios.find((x) => norm(x.slug) === q || norm(x.nombre).includes(q));
        fire = f ? f.slug : 'otro';
      }
      if (norm(args.municipio)) {
        const q = norm(args.municipio);
        const names = incendios.flatMap((x) => (x.municipios || []).map((mm) => mm.nombre));
        mun = names.find((n) => norm(n) === q) || 'otro';
      }
    }
    const tipo = ['todas', 'erosion', 'regeneracion', 'reincendio'].includes(norm(args.tipo)) ? norm(args.tipo) : '';
    const country = clean(request.cf?.country, 3);
    const result = status < 400 ? 'ok' : 'error';
    const blobs = [kind, route, tool, fire, mun, tipo, client, clientVer, country, result];
    if (env.STATS?.writeDataPoint) env.STATS.writeDataPoint({ indexes: [kind], blobs, doubles: [ms, status] });
    console.log(JSON.stringify({ fenix_uso: 1, tipo: kind, ruta: route, herramienta: tool, incendio: fire, municipio: mun,
      prioridad: tipo, cliente: client, cliente_version: clientVer, pais: country, resultado: result, ms, http: status }));
  } catch {
    // la estadística nunca debe romper una respuesta
  }
}

// ------------------------------------------------------------------ páginas
const page = (title, body) => `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title><link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🔥</text></svg>">
<style>
:root{--bg:#fbfaf7;--fg:#222;--muted:#666;--line:#e3e0d8;--code:#f0ede6;--accent:#b5451b}
@media (prefers-color-scheme:dark){:root{--bg:#161514;--fg:#eee;--muted:#aaa;--line:#333;--code:#26241f;--accent:#f08a5d}}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.55 system-ui,-apple-system,Segoe UI,sans-serif}
main{max-width:720px;margin:0 auto;padding:32px 16px 48px}h1{margin:0 0 4px;font-size:28px}h2{margin-top:28px;font-size:19px}
a{color:var(--accent)}code{background:var(--code);padding:2px 5px;border-radius:4px;font-size:14px;overflow-wrap:anywhere}
.url{display:block;padding:10px 12px;margin:8px 0;background:var(--code);border-radius:6px;font-family:ui-monospace,monospace;overflow-wrap:anywhere}
.muted{color:var(--muted);font-size:14px}footer{margin-top:36px;padding-top:12px;border-top:1px solid var(--line)}li{margin:4px 0}
</style></head><body><main>${body}</main></body></html>`;

function landing(origin) {
  return page('Fénix MCP', `
<h1>🔥 Fénix para asistentes de IA</h1>
<p class="muted">Datos de incendios forestales en España (área quemada, severidad, vegetación antes y potencial, monte público, plan de restauración)
para preguntar a tu IA. Mapas: <a href="https://jgarnie.github.io/fenix/">jgarnie.github.io/fenix</a></p>

<h2>Dirección del conector (MCP)</h2>
<code class="url">${origin}/mcp</code>

<h2>Claude (web, escritorio y móvil)</h2>
<ol><li>Ajustes → <b>Conectores</b> → <b>Añadir conector personalizado</b>.</li>
<li>Nombre: <i>Fénix</i>. URL: la de arriba. Sin autenticación.</li>
<li>En un chat, activa Fénix en el menú de herramientas y pregunta.</li></ol>
<p class="muted">En Claude Desktop también puedes instalar la <a href="https://github.com/jgarnie/fenix/releases/latest/download/fenix.mcpb">extensión fenix.mcpb</a> (doble clic).</p>

<h2>ChatGPT</h2>
<ol><li>Ajustes → <b>Aplicaciones y conectores</b> → Configuración avanzada → activa el <b>modo desarrollador</b>.</li>
<li><b>Crear</b> conector: nombre <i>Fénix</i>, URL de arriba, sin autenticación.</li>
<li>En un chat, elige el conector en el menú «+» y pregunta.</li></ol>
<p class="muted">Los menús cambian a menudo y el modo desarrollador depende del plan de ChatGPT.</p>

<h2>Gemini</h2>
<p>La app de Gemini (web y móvil) no admite conectores MCP. En <b>Gemini CLI</b>: <code>gemini mcp add --transport http fenix ${origin}/mcp</code></p>

<h2>Otras aplicaciones</h2>
<p>Cualquier cliente MCP con transporte HTTP («Streamable HTTP») puede usar la URL de arriba. También hay una API REST en JSON:
<a href="${origin}/openapi.json">openapi.json</a> (por ejemplo, <a href="${origin}/api/incendios">/api/incendios</a>).</p>

<h2>Preguntas de ejemplo</h2>
<ul><li>¿Qué incendios tiene Fénix?</li><li>¿Cómo quedó Betxí tras el incendio de Espadà?</li>
<li>¿Qué había y qué debería plantarse en 39.90975, -0.21464?</li><li>¿Qué plan de restauración propone Fénix para Bejís?</li>
<li>¿Dónde es más urgente repoblar en Bejís y con qué?</li>
<li>¿Cuántas hectáreas de monte público ardieron con severidad alta en Bejís?</li>
<li>Prepárame un informe para el Ayuntamiento de El Toro.</li></ul>
<p class="muted">Herramientas: listar_incendios, resumen_incendio, plan_restauracion, consultar_punto, buscar_municipio, zonas_prioritarias, consultar_superficies (hectáreas cruzando capas) y guia_experta (criterios y pasos de restauración; también como prompts guia_*).</p>

<footer class="muted">${AVISO}<br>Creado por <a href="${AUTOR.linkedin}">${AUTOR.nombre}</a> ·
<a href="mailto:${AUTOR.email}">${AUTOR.email}</a> · <a href="https://github.com/jgarnie/fenix">código abierto</a> · <a href="${origin}/privacidad">privacidad</a>
· <a href="https://github.com/jgarnie/fenix/blob/main/CHANGELOG.md">Fénix v${VERSION}</a></footer>`);
}

function privacy(origin) {
  return page('Fénix · privacidad', `
<h1>Política de privacidad</h1>
<p class="muted">Servidor de Fénix para asistentes de IA (${origin})</p>
<ul>
<li>Este servicio no pide registro, no usa cookies y no guarda las preguntas, las coordenadas consultadas ni la dirección IP.</li>
<li>Para saber cuánto se usa, cuenta cada consulta de forma anónima: qué herramienta se usó, sobre qué incendio y municipio de Fénix,
el tipo de aplicación (Claude, ChatGPT…), el país (según Cloudflare), si funcionó y cuánto tardó. Nada de eso identifica a nadie.
Los recuentos se guardan en Cloudflare (Workers Analytics Engine, unos 3 meses) y, con esos mismos campos, en los registros
del servidor (Workers Logs, 3 días); los registros automáticos de cada petición, que incluirían la URL consultada, están desactivados.
Solo los ve el autor.</li>
<li>Solo responde con datos públicos de los mapas de Fénix (<a href="https://jgarnie.github.io/fenix/">jgarnie.github.io/fenix</a>), que no contienen datos personales.</li>
<li>Funciona en Cloudflare Workers. Como cualquier servidor web, Cloudflare puede registrar de forma temporal datos técnicos de las peticiones
(dirección IP, fecha, ruta) con fines de seguridad y diagnóstico, según su <a href="https://www.cloudflare.com/privacypolicy/">política de privacidad</a>.</li>
<li>Tu asistente de IA (Claude, ChatGPT u otro) trata la conversación según la política de su proveedor.</li>
</ul>
<p>Contacto: <a href="mailto:${AUTOR.email}">${AUTOR.nombre} · ${AUTOR.email}</a></p>
<footer class="muted">${AVISO}</footer>`);
}
