// Herramientas MCP de Fénix: compartidas por el servidor local (stdio.js) y el remoto (worker/src/worker.js).
import { z } from 'zod';
z.config(z.locales.es());   // mensajes de validación en español
import { createFenix } from './core.js';
import { TEMAS, guia } from './guides.js';

export const INSTRUCTIONS = 'Fénix ofrece datos de incendios forestales en España cartografiados con Sentinel-2 y cartografía oficial: '
  + 'área quemada, severidad, vegetación previa y potencial, monte público, sustrato, riesgo de erosión y un plan de restauración propuesto. '
  + 'Ante preguntas de planificación (qué hacer o plantar, informe para un ayuntamiento, evaluar una parcela, reincendio), llama primero a '
  + 'guia_experta (o usa los prompts guia_*): explica qué criterios aplicar y qué herramientas consultar en qué orden. Para cifras a medida '
  + '(hectáreas cruzando municipio, severidad, propiedad, vegetación, sustrato…) usa consultar_superficies. '
  + 'Es un proyecto divulgativo y no oficial de Joaquín García Nieto: cita la fuente y el enlace al mapa al usar estos datos, y aclara que las '
  + 'actuaciones son una propuesta propia, no la planificación de la administración.';

export function registerTools(server, opts = {}) {
  const fx = opts.fx || createFenix(opts);   // opts.fx: núcleo compartido entre peticiones (servidor remoto)
  const wrap = (fn) => async (args) => {
    try {
      return { content: [{ type: 'text', text: await fn(args) }] };
    } catch (e) {
      return { content: [{ type: 'text', text: `Error al consultar Fénix: ${e.message}${fx.firma(null)}` }], isError: true };
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

  server.registerTool('zonas_prioritarias', {
    title: 'Zonas prioritarias',
    description: 'Dónde es más urgente actuar en un incendio y con qué: zonas de 1 km² con más superficie forestal en riesgo. '
      + 'En incendios de menos de un año, riesgo de erosión alto (proteger el suelo); después, erosión alta y cobertura vegetal por debajo del 30 % '
      + '(sembrar o plantar); además, zonas que ya habían ardido hace menos de 15 años (reincendio: el pinar no se regenera). Para cada zona: coordenadas, municipio, monte público y titular, qué había, sustrato, serie de vegetación '
      + 'potencial con sus especies, actuación propuesta, avisos y enlace al mapa.',
    inputSchema: {
      incendio,
      municipio: z.string().optional().describe('Opcional: limitar a un municipio (p. ej. "El Toro", "Artana")'),
      solo_publico: z.boolean().optional().describe('Opcional: solo zonas en monte público (donde puede actuar la administración)'),
      limite: z.number().int().min(1).max(8).optional().describe('Número de zonas por criterio (1–8, por defecto 5)'),
      tipo: z.enum(['todas', 'erosion', 'regeneracion', 'reincendio']).optional()
        .describe('Criterio: todas (por defecto), erosion, regeneracion o reincendio (zonas que ya habían ardido hace menos de 15 años)'),
    },
    annotations: ro,
  }, wrap(({ incendio: q, municipio, solo_publico, limite, tipo }) => fx.prioridades(q, { municipio, solo_publico, limite, tipo })));

  const lista = z.union([z.array(z.string()), z.string()]);
  server.registerTool('consultar_superficies', {
    title: 'Consultar superficies',
    description: 'Consultas libres de hectáreas quemadas cruzando capas: filtra y agrupa por municipio, severidad, propiedad (monte público o privado), '
      + 'vegetación antes, sustrato, serie de vegetación potencial, actuación propuesta, riesgo de erosión, espacio protegido, año del incendio anterior, '
      + 'cobertura (criterio CEAM), forestal y reincendio en menos de 15 años. Ejemplos: monte público con severidad alta; alcornocal sobre caliza en Tales; '
      + 'lo que ya había ardido en 2016 en Artana. Sin filtros ni agrupación, lista los valores posibles con sus hectáreas.',
    inputSchema: {
      incendio,
      filtros: z.object({
        municipio: lista.optional(), severidad: lista.optional().describe('no quemado, baja, moderada-baja, moderada-alta, alta'),
        propiedad: lista.optional().describe('"publico" (monte de utilidad pública), "privado" o el titular (ayuntamiento, generalitat…)'),
        vegetacion_antes: lista.optional().describe('p. ej. "pino carrasco", "alcornocal", "encinar", "matorral"'),
        sustrato: lista.optional().describe('p. ej. "silíceo", "calizo", "arcillas y yesos"'),
        serie_potencial: lista.optional().describe('nombre o código de serie, p. ej. "alcornocal", "22b", "melojar"'),
        actuacion: lista.optional().describe('p. ej. "natural", "asistida", "activa", "cultivo"'),
        erosion: lista.optional().describe('bajo, medio, alto, muy alto'),
        incendio_previo: lista.optional().describe('año del incendio anterior, p. ej. "2016", o "ninguno"'),
        cobertura_ceam: lista.optional().describe('"<30", "30–60" o ">60" (significativa a partir de un año)'),
        espacio_protegido: z.union([z.boolean(), lista]).optional().describe('true/false o el nombre del espacio protegido'),
        forestal: z.boolean().optional(),
        reincendio_corto: z.boolean().optional().describe('ya había ardido hace menos de 15 años'),
      }).partial()
        // claves desconocidas: llegan al núcleo, que responde con la lista de filtros válidos (no se descartan en silencio)
        .catchall(z.union([lista, z.boolean(), z.number()]))
        .optional().describe('Filtros (sin tildes ni mayúsculas; coincidencia parcial). Varios valores = cualquiera de ellos.'),
      agrupar_por: z.array(z.string()).max(2).optional().describe('Hasta 2 dimensiones de las anteriores, p. ej. ["municipio","severidad"]'),
    },
    annotations: ro,
  }, wrap(({ incendio: q, filtros, agrupar_por }) => fx.superficies(q, { filtros, agrupar_por })));

  const tema = z.enum(Object.keys(TEMAS));
  server.registerTool('guia_experta', {
    title: 'Guía de experto',
    description: 'Llámala PRIMERO ante preguntas de planificación (qué hacer, qué plantar, informe para un ayuntamiento, evaluar una parcela, reincendio): '
      + 'devuelve los pasos y criterios de restauración tras incendio que usa Fénix y qué herramientas llamar en qué orden. Temas: '
      + Object.entries(TEMAS).map(([k, v]) => `${k} (${v})`).join('; ') + '.',
    inputSchema: {
      tema,
      incendio: incendio.optional(),
      municipio: z.string().optional().describe('Opcional: municipio'),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, wrap(async ({ tema: t, incendio: q, municipio }) => {
    const ctx = q ? await fx.contexto(q).catch(() => null) : null;
    const aviso = q && !ctx ? `AVISO: no encuentro el incendio "${q}". Incendios de Fénix: ${(await fx.index()).incendios.map((f) => `${f.slug} (${f.subtitulo})`).join('; ')}. La guía sigue sin datos de un incendio concreto.\n\n` : '';
    return aviso + guia(t, ctx, municipio) + fx.firma(ctx ? await fx.findFire(ctx.slug) : null);
  }));

  // las mismas guías como prompts MCP (en los clientes que los admiten aparecen como plantillas)
  for (const [t, titulo] of Object.entries(TEMAS)) {
    server.registerPrompt(`guia_${t}`, {
      title: `Fénix · ${titulo}`,
      description: `Guía de experto de Fénix: ${titulo.toLowerCase()}.`,
      argsSchema: { incendio: z.string().optional().describe('Incendio (slug o nombre)'), municipio: z.string().optional().describe('Municipio') },
    }, async ({ incendio: q, municipio }) => {
      const ctx = q ? await fx.contexto(q).catch(() => null) : null;
      const text = guia(t, ctx, municipio) + fx.firma(ctx ? await fx.findFire(ctx.slug) : null);
      return { messages: [{ role: 'user', content: { type: 'text', text } }] };
    });
  }

  return fx;
}
