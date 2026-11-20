#!/usr/bin/env node
// Estadística de uso anónima del servidor MCP / API de Fénix (Cloudflare Workers Analytics Engine, dataset fenix_mcp).
// Columnas: ver mcp/worker/src/worker.js → track(). Los datos se guardan 3 meses.
//
// Uso:
//   CF_ACCOUNT_ID=xxxx CF_API_TOKEN=yyyy node scripts/mcp_stats.mjs [días]      (por defecto: 7 y 30 días)
// El token se crea en dash.cloudflare.com → Mi perfil → API Tokens → Create token → Custom token,
// con el permiso "Account · Account Analytics · Read" (solo lectura). Ver mcp/worker/README.md.

const ACCOUNT = process.env.CF_ACCOUNT_ID;
const TOKEN = process.env.CF_API_TOKEN;
if (!ACCOUNT || !TOKEN) {
  console.error('Faltan CF_ACCOUNT_ID y CF_API_TOKEN (ver la cabecera de este script).');
  process.exit(1);
}
const DATASET = 'fenix_mcp';
const days = process.argv[2] ? [Number(process.argv[2])] : [7, 30];

async function sql(query) {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/analytics_engine/sql`, {
    method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` }, body: `${query} FORMAT JSON`,
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text).data;
}

// recuentos ponderados por el muestreo de Analytics Engine (SUM(_sample_interval))
const by = (col, d, where = '', limit = 10) => sql(
  `SELECT ${col} AS k, SUM(_sample_interval) AS n FROM ${DATASET}
   WHERE timestamp > NOW() - INTERVAL '${d}' DAY ${where}
   GROUP BY k ORDER BY n DESC LIMIT ${limit}`);

function table(title, rows) {
  const r = rows.filter((x) => x.k !== '' && x.k != null);
  console.log(`\n  ${title}`);
  if (!r.length) { console.log('    —'); return; }
  for (const x of r) console.log(`    ${String(Math.round(x.n)).padStart(6)}  ${x.k}`);
}

for (const d of days) {
  console.log(`\n================ Últimos ${d} días ================`);
  const [tot] = await sql(`SELECT SUM(_sample_interval) AS n, AVG(double1) AS ms FROM ${DATASET} WHERE timestamp > NOW() - INTERVAL '${d}' DAY`);
  console.log(`  Peticiones: ${Math.round(tot?.n || 0)} · tiempo medio ${Math.round(tot?.ms || 0)} ms`);
  table('Por tipo (mcp = asistentes de IA · rest = API/GPT · pagina = web del servidor)', await by('blob1', d));
  table('Consultas por herramienta', await by('blob3', d));
  table('Incendios consultados', await by('blob4', d));
  table('Municipios consultados', await by('blob5', d, '', 15));
  table('Tipo de prioridad pedida', await by('blob6', d));
  table('Aplicaciones que se conectan (al iniciar sesión MCP)', await by('blob7', d, "AND blob2 = 'initialize'"));
  table('Aplicación por consulta (según User-Agent)', await by('blob7', d, "AND blob2 != 'initialize'"));
  table('Países', await by('blob9', d));
  table('Errores por ruta', await by('blob2', d, "AND blob10 = 'error'"));
  table('Consultas por día', await sql(
    `SELECT toDate(timestamp) AS k, SUM(_sample_interval) AS n FROM ${DATASET}
     WHERE timestamp > NOW() - INTERVAL '${d}' DAY AND blob3 != '' GROUP BY k ORDER BY k DESC LIMIT ${d}`));
}
