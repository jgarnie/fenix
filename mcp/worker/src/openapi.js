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
