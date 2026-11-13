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

const VERSION = '0.2.0';
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
  let m = /^\/api\/incendios\/([^/]+)(\/plan)?$/.exec(path);
  if (m) {
    const q = decodeURIComponent(m[1]);
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
    const out = {};
    const texto = await fx.punto(lat, lon, params.get('incendio') || undefined, out);
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
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    try {
      if (path === '/mcp') return withCors(await mcp(request, env));
      if (request.method !== 'GET' && request.method !== 'HEAD') return bad('Método no permitido', 405);
      if (path === '/openapi.json') return json(openapi(url.origin, VERSION));
      if (path === '/') return html(landing(url.origin));
      if (path === '/privacidad') return html(privacy(url.origin));
      if (path === '/favicon.ico') return new Response(null, { status: 204 });
      const r = await api(path, url.searchParams, env);
      return r || bad(`No existe ${path}. Ver ${url.origin}/ y ${url.origin}/openapi.json`, 404);
    } catch (e) {
      return bad(`Error al consultar Fénix: ${e.message}`, 502);
    }
  },
};

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
<li>¿Qué había y qué debería plantarse en 39.90975, -0.21464?</li><li>¿Qué plan de restauración propone Fénix para Bejís?</li></ul>

<footer class="muted">${AVISO}<br>Creado por <a href="${AUTOR.linkedin}">${AUTOR.nombre}</a> ·
<a href="mailto:${AUTOR.email}">${AUTOR.email}</a> · <a href="https://github.com/jgarnie/fenix">código abierto</a> · <a href="${origin}/privacidad">privacidad</a></footer>`);
}

function privacy(origin) {
  return page('Fénix · privacidad', `
<h1>Política de privacidad</h1>
<p class="muted">Servidor de Fénix para asistentes de IA (${origin})</p>
<ul>
<li>Este servicio no pide registro, no usa cookies y no guarda las preguntas ni las coordenadas consultadas.</li>
<li>Solo responde con datos públicos de los mapas de Fénix (<a href="https://jgarnie.github.io/fenix/">jgarnie.github.io/fenix</a>), que no contienen datos personales.</li>
<li>Funciona en Cloudflare Workers. Como cualquier servidor web, Cloudflare puede registrar de forma temporal datos técnicos de las peticiones
(dirección IP, fecha, ruta) con fines de seguridad y diagnóstico, según su <a href="https://www.cloudflare.com/privacypolicy/">política de privacidad</a>.</li>
<li>Tu asistente de IA (Claude, ChatGPT u otro) trata la conversación según la política de su proveedor.</li>
</ul>
<p>Contacto: <a href="mailto:${AUTOR.email}">${AUTOR.nombre} · ${AUTOR.email}</a></p>
<footer class="muted">${AVISO}</footer>`);
}
