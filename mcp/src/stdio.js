#!/usr/bin/env node
// Servidor MCP local de Fénix (stdio). Uso: npx fenix-mcp  ·  node src/stdio.js
// Variables opcionales (pruebas en local): FENIX_SITE=http://localhost:8765/  FENIX_DATA=local
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerTools, INSTRUCTIONS } from './tools.js';
import { VERSION } from './version.js';

const server = new McpServer({ name: 'fenix', title: 'Fénix · incendios forestales', version: VERSION }, { instructions: INSTRUCTIONS });
// consultas por punto con teselas (unos KB por consulta) en lugar de descargar la rejilla entera (hasta 13 MB en el Tiétar);
// si un incendio no tiene teselas publicadas, se usa la rejilla
registerTools(server, { site: process.env.FENIX_SITE || undefined, data: process.env.FENIX_DATA || null, point: process.env.FENIX_POINT || 'tiles' });
await server.connect(new StdioServerTransport());
