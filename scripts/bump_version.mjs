#!/usr/bin/env node
// Cambia la versión de todo el proyecto (web, datos, API y MCP) desde una única fuente: public/version.json.
// Uso: node scripts/bump_version.mjs 0.2.1 [AAAA-MM-DD]   ·   sin argumentos: solo resincroniza los ficheros derivados.
// Después: añadir la entrada en CHANGELOG.md, regenerar (build_api.mjs …) y seguir los pasos de publicación de CLAUDE.md.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const P = (...p) => path.join(ROOT, ...p);
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const writeJson = (f, o, indent = 2) => fs.writeFileSync(f, JSON.stringify(o, null, indent) + '\n');

const vfile = P('public', 'version.json');
const v = readJson(vfile);
const [, , next, date] = process.argv;
if (next) {
  if (!/^\d+\.\d+\.\d+$/.test(next)) { console.error(`Versión no válida: ${next} (formato MAYOR.MENOR.PARCHE)`); process.exit(1); }
  v.version = next;
  v.date = date || new Date().toISOString().slice(0, 10);
  writeJson(vfile, v, 1);
}
const V = v.version;

// MCP: package.json, package-lock.json (raíz y paquete raíz), manifest.json de la extensión y src/version.js
const pkg = readJson(P('mcp', 'package.json')); pkg.version = V; writeJson(P('mcp', 'package.json'), pkg);
const lockF = P('mcp', 'package-lock.json');
if (fs.existsSync(lockF)) {
  const lock = readJson(lockF); lock.version = V;
  if (lock.packages && lock.packages['']) lock.packages[''].version = V;
  writeJson(lockF, lock);
}
const man = readJson(P('mcp', 'manifest.json')); man.version = V; writeJson(P('mcp', 'manifest.json'), man);
fs.writeFileSync(P('mcp', 'src', 'version.js'),
  `// Generado por scripts/bump_version.mjs a partir de public/version.json (única fuente de la versión). No editar a mano.\nexport const VERSION = '${V}';\n`);
console.log(`Fénix v${V} (${v.date}): public/version.json, mcp/package.json, package-lock.json, manifest.json y mcp/src/version.js sincronizados.`);
