#!/usr/bin/env node
// Servidor MCP local de Fénix (stdio). Uso: npx fenix-mcp  ·  node src/stdio.js
// Variables opcionales (pruebas en local): FENIX_SITE=http://localhost:8765/  FENIX_DATA=local
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerTools, INSTRUCTIONS } from './tools.js';

const server = new McpServer({ name: 'fenix', title: 'Fénix · incendios forestales', version: '0.1.0' }, { instructions: INSTRUCTIONS });
registerTools(server, { site: process.env.FENIX_SITE || undefined, data: process.env.FENIX_DATA || null });
await server.connect(new StdioServerTransport());
