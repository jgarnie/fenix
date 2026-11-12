// Herramientas MCP de Fénix: compartidas por el servidor local (stdio.js) y un futuro servidor remoto (HTTP).
import { z } from 'zod';
import { createFenix } from './core.js';

export const INSTRUCTIONS = 'Fénix ofrece datos de incendios forestales en España cartografiados con Sentinel-2 y cartografía oficial: '
  + 'área quemada, severidad, vegetación previa y potencial, monte público, sustrato, riesgo de erosión y un plan de restauración propuesto. '
  + 'Es un proyecto divulgativo y no oficial de Joaquín García Nieto: cita la fuente y el enlace al mapa al usar estos datos, y aclara que las '
  + 'actuaciones son una propuesta propia, no la planificación de la administración.';

export function registerTools(server, opts = {}) {
  const fx = createFenix(opts);
  const wrap = (fn) => async (args) => {
    try {
      return { content: [{ type: 'text', text: await fn(args) }] };
    } catch (e) {
      return { content: [{ type: 'text', text: `Error al consultar Fénix: ${e.message}` }], isError: true };
    }
  };
  const ro = { readOnlyHint: true, openWorldHint: true };
  const incendio = z.string().describe('Incendio: slug (espada, bejis, tietar, villanueva-de-viver) o nombre/lugar (p. ej. "Bejís", "Montanejos")');

  server.registerTool('listar_incendios', {
    title: 'Listar incendios',
    description: 'Lista los incendios forestales cartografiados en Fénix, con superficie quemada, municipios y enlace al mapa interactivo.',
    inputSchema: {}, annotations: ro,
  }, wrap(() => fx.listar()));

  server.registerTool('resumen_incendio', {
    title: 'Resumen de un incendio',
    description: 'Resumen de un incendio: superficie (satélite y oficial), municipios, severidad, vegetación antes y potencial, monte público, '
      + 'erosión, árboles afectados, recuperación observada con NDVI, cronología y fuentes.',
    inputSchema: { incendio }, annotations: ro,
  }, wrap(({ incendio: q }) => fx.resumen(q)));

  server.registerTool('plan_restauracion', {
    title: 'Plan de restauración',
    description: 'Plan de restauración que propone Fénix para un incendio: actuaciones (regeneración natural, asistida, restauración activa, '
      + 'cultivos), hectáreas en monte público y privado, qué hacer y cómo, calendario, costes orientativos y presupuesto oficial de referencia.',
    inputSchema: { incendio }, annotations: ro,
  }, wrap(({ incendio: q }) => fx.plan(q)));

  server.registerTool('consultar_punto', {
    title: 'Consultar un punto',
    description: 'Qué pasó en unas coordenadas concretas (WGS84): si ardió y con qué severidad, vegetación que había, propiedad y monte público, '
      + 'municipio, sustrato, altitud y pendiente, incendios previos, vegetación que debería haber con sus especies, viabilidad y actuación recomendada. '
      + 'Resolución 25 m.',
    inputSchema: {
      lat: z.number().min(-90).max(90).describe('Latitud en grados decimales (p. ej. 39.93)'),
      lon: z.number().min(-180).max(180).describe('Longitud en grados decimales (p. ej. -0.17; oeste negativo)'),
      incendio: incendio.optional().describe('Opcional: incendio concreto; si no se indica, se detecta por la ubicación'),
    },
    annotations: ro,
  }, wrap(({ lat, lon, incendio: q }) => fx.punto(lat, lon, q)));

  server.registerTool('buscar_municipio', {
    title: 'Buscar municipio',
    description: 'Busca en qué incendios de Fénix se quemó superficie de un municipio y cuántas hectáreas (sin distinguir tildes).',
    inputSchema: { nombre: z.string().describe('Nombre del municipio, p. ej. "Artana", "Montanejos", "Burgohondo"') },
    annotations: ro,
  }, wrap(({ nombre }) => fx.municipio(nombre)));

  return fx;
}
