// Especificación OpenAPI 3.1 de la API REST de Fénix (acciones de un GPT personalizado u otras aplicaciones).
// El servidor se toma del origen de la petición, así sirve igual en local (wrangler dev) y publicado.

const respuesta = (datos) => ({
  description: 'Texto listo para citar, datos estructurados, aviso de proyecto no oficial y autor.',
  content: {
    'application/json': {
      schema: {
        type: 'object',
        properties: {
          texto: { type: 'string', description: 'Respuesta en español con las cifras clave, fuentes y enlace al mapa. Citarla o resumirla manteniendo el aviso.' },
          datos,
          aviso: { type: 'string' },
          autor: { type: 'object', properties: { nombre: { type: 'string' }, email: { type: 'string' }, linkedin: { type: 'string' } } },
        },
        required: ['texto', 'aviso'],
      },
    },
  },
});
const error = { description: 'Error o incendio no encontrado (el texto lista los disponibles).', content: { 'application/json': { schema: { type: 'object', properties: { error: { type: 'string' } } } } } };
const incendio = {
  name: 'incendio', in: 'path', required: true,
  description: 'Incendio: slug (espada, bejis, tietar, villanueva-de-viver) o un nombre o lugar (p. ej. "Bejís", "Montanejos").',
  schema: { type: 'string' },
};

export const openapi = (origin, version) => ({
  openapi: '3.1.0',
  info: {
    title: 'Fénix · incendios forestales',
    version,
    description: 'Datos de incendios forestales en España cartografiados con Sentinel-2 y cartografía oficial: área quemada, severidad, '
      + 'vegetación antes y potencial, monte público, sustrato, erosión y un plan de restauración propuesto. Proyecto divulgativo y no oficial '
      + 'de Joaquín García Nieto (https://jgarnie.github.io/fenix/).',
    contact: { name: 'Joaquín García Nieto', email: 'garcia.nieto.joaquin@gmail.com', url: 'https://www.linkedin.com/in/jgarnie/' },
    license: { name: 'MIT', identifier: 'MIT' },
  },
  servers: [{ url: origin }],
  paths: {
    '/api/incendios': {
      get: {
        operationId: 'listarIncendios',
        summary: 'Lista los incendios cartografiados en Fénix',
        description: 'Incendios disponibles con superficie quemada, cifra oficial, municipios y enlace al mapa interactivo.',
        responses: { 200: respuesta({ type: 'array', items: { type: 'object' } }) },
      },
    },
    '/api/incendios/{incendio}': {
      get: {
        operationId: 'resumenIncendio',
        summary: 'Resumen de un incendio',
        description: 'Superficie (satélite y oficial), municipios, severidad, vegetación antes y potencial, monte público, erosión, árboles afectados, '
          + 'recuperación observada con NDVI, cronología y fuentes.',
        parameters: [incendio],
        responses: { 200: respuesta({ type: 'object' }), 404: error },
      },
    },
    '/api/incendios/{incendio}/plan': {
      get: {
        operationId: 'planRestauracion',
        summary: 'Plan de restauración propuesto para un incendio',
        description: 'Actuaciones (regeneración natural, asistida, restauración activa, cultivos), hectáreas en monte público y privado, qué hacer y cómo, '
          + 'calendario, costes orientativos y presupuesto oficial de referencia.',
        parameters: [incendio],
        responses: { 200: respuesta({ type: 'object' }), 404: error },
      },
    },
    '/api/incendios/{incendio}/prioridades': {
      get: {
        operationId: 'zonasPrioritarias',
        summary: 'Dónde es más urgente actuar en un incendio y con qué',
        description: 'Zonas de 1 km² más urgentes: erosión en incendios de menos de un año; erosión y cobertura < 30 % después; y reincendio en menos de 15 años. '
          + 'Cada zona da coordenadas, municipio, monte, qué había, especies de la serie potencial, avisos y enlace al mapa.',
        parameters: [incendio,
          { name: 'municipio', in: 'query', required: false, description: 'Opcional: limitar a un municipio (p. ej. "El Toro").', schema: { type: 'string' } },
          { name: 'solo_publico', in: 'query', required: false, description: 'Opcional: solo zonas en monte público.', schema: { type: 'boolean' } },
          { name: 'limite', in: 'query', required: false, description: 'Número de zonas por criterio (1–8, por defecto 5).', schema: { type: 'integer', minimum: 1, maximum: 8 } },
          { name: 'tipo', in: 'query', required: false, description: 'Criterio: todas (por defecto), erosion, regeneracion o reincendio (ya había ardido hace menos de 15 años).', schema: { type: 'string', enum: ['todas', 'erosion', 'regeneracion', 'reincendio'] } }],
        responses: { 200: respuesta({ type: 'object' }), 404: error },
      },
    },
    '/api/incendios/{incendio}/superficies': {
      get: {
        operationId: 'consultarSuperficies',
        summary: 'Hectáreas quemadas cruzando capas (consultas libres)',
        description: 'Hectáreas quemadas filtrando y agrupando por las dimensiones de los parámetros (municipio, severidad, propiedad, vegetación, sustrato, serie…). '
          + 'Sin parámetros, lista los valores posibles con sus hectáreas.',
        parameters: [incendio,
          ...['municipio', 'severidad', 'propiedad', 'vegetacion_antes', 'sustrato', 'serie_potencial', 'actuacion', 'erosion', 'incendio_previo', 'cobertura_ceam']
            .map((name) => ({ name, in: 'query', required: false, description: `Filtro por ${name.replace('_', ' ')}: varios valores separados por comas; coincidencia parcial sin tildes ni mayúsculas${name === 'propiedad' ? ' ("publico" = monte de utilidad pública, "privado")' : name === 'cobertura_ceam' ? ' ("<30", "30-60", ">60"; significativa a partir de un año)' : ''}.`, schema: { type: 'string' } })),
          ...['forestal', 'reincendio_corto']
            .map((name) => ({ name, in: 'query', required: false, description: name === 'reincendio_corto' ? 'true: solo lo que ya había ardido hace menos de 15 años (combínalo con forestal=true para comparar con zonasPrioritarias).' : 'true: solo superficie forestal.', schema: { type: 'boolean' } })),
          { name: 'espacio_protegido', in: 'query', required: false, description: 'true/false, o el nombre del espacio protegido.', schema: { type: 'string' } },
          { name: 'agrupar_por', in: 'query', required: false, description: 'Hasta 2 dimensiones separadas por comas, p. ej. municipio,severidad.', schema: { type: 'string' } }],
        responses: { 200: respuesta({ type: 'object' }), 404: error },
      },
    },
    '/api/guia': {
      get: {
        operationId: 'guiaExperta',
        summary: 'Guía de experto: criterios y pasos para planificar la restauración',
        description: 'Llamar primero ante preguntas de planificación. Devuelve qué criterios aplicar (tiempo desde el incendio, erosión, regeneración, reincendio, '
          + 'especies según serie y sustrato, cómo y cuándo plantar, permisos) y qué operaciones de esta API consultar en qué orden.',
        parameters: [
          { name: 'tema', in: 'query', required: true, description: 'plan_repoblacion, informe_ayuntamiento, evaluar_punto, reincendio o que_plantar.', schema: { type: 'string', enum: ['plan_repoblacion', 'informe_ayuntamiento', 'evaluar_punto', 'reincendio', 'que_plantar'] } },
          { name: 'incendio', in: 'query', required: false, description: 'Opcional: incendio (slug o nombre).', schema: { type: 'string' } },
          { name: 'municipio', in: 'query', required: false, description: 'Opcional: municipio.', schema: { type: 'string' } },
        ],
        responses: { 200: respuesta({ type: 'object' }), 400: error },
      },
    },
    '/api/punto': {
      get: {
        operationId: 'consultarPunto',
        summary: 'Qué pasó en unas coordenadas',
        description: 'Si ardió y con qué severidad, vegetación que había, propiedad y monte público, municipio, sustrato, altitud y pendiente, incendios previos, '
          + 'vegetación que debería haber con sus especies, viabilidad y actuación recomendada. Resolución 25 m. Si el punto está fuera de todos los incendios, lo indica.',
        parameters: [
          { name: 'lat', in: 'query', required: true, description: 'Latitud en grados decimales WGS84 (p. ej. 39.90975).', schema: { type: 'number', minimum: -90, maximum: 90 } },
          { name: 'lon', in: 'query', required: true, description: 'Longitud en grados decimales WGS84, oeste negativo (p. ej. -0.21464).', schema: { type: 'number', minimum: -180, maximum: 180 } },
          { name: 'incendio', in: 'query', required: false, description: 'Opcional: incendio concreto; si no se indica, se detecta por la ubicación.', schema: { type: 'string' } },
        ],
        responses: { 200: respuesta({ type: 'object' }), 400: error },
      },
    },
    '/api/municipio': {
      get: {
        operationId: 'buscarMunicipio',
        summary: 'Hectáreas quemadas de un municipio',
        description: 'En qué incendios de Fénix se quemó superficie de un municipio y cuántas hectáreas (sin distinguir tildes).',
        parameters: [{ name: 'nombre', in: 'query', required: true, description: 'Nombre del municipio, p. ej. "Artana", "Montanejos", "Burgohondo".', schema: { type: 'string' } }],
        responses: { 200: respuesta({ type: 'array', items: { type: 'object' } }), 400: error },
      },
    },
  },
});
