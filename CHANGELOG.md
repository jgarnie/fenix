# Historial de cambios

Todos los cambios relevantes de Fénix (web, datos, API y servidor MCP) se anotan aquí.
El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y las versiones siguen
[versionado semántico](https://semver.org/lang/es/) con una sola versión para todo el proyecto
(`public/version.json`, ver `scripts/bump_version.mjs`):

- **PARCHE** (0.2.**1**): arreglos y correcciones de datos o de textos.
- **MENOR** (0.**3**.0): un incendio, una herramienta o una función nueva.
- **MAYOR** (**1**.0.0): cambios incompatibles en la API, el MCP o el formato de los datos.
  La 1.0.0 se reserva para cuando el proyecto haya pasado una revisión experta.

Las cifras de cada versión pueden cambiar en la siguiente si se corrige un dato: al citar Fénix, indica la versión.

## [0.2.1] – 2026-11-20

Correcciones de la primera revisión de la 0.2.0 (código, datos y textos, y pruebas de uso de la web y del MCP).

### Corregido
- **Espadà, corrección por sustrato**: las cifras del texto salen ahora de los datos (antes de corregir, 982 ha de la serie
  del alcornocal caían sobre caliza o margas en la superficie forestal quemada, y 47 ha del alcornocal real en manchas de
  carrascal); se explica que el alcornocal pasa a carrascal del mismo piso y que se respetan 71 ha de alcornocal real sobre
  sustrato calizo (suelos descarbonatados). La actuación «restauración activa» dice ahora «donde debería haber alcornocal»,
  como el modelo.
- **Tiétar**: la parte quemada en Toledo son unas 980 ha (La Iglesuela del Tiétar, Almorox y Sartajada), no 750.
- **Reincendio en menos de 15 años**: separa el pinar (que solo se regenera por semilla) del resto de la vegetación, que en
  buena parte rebrota; los avisos y el criterio solo recomiendan actuar pronto donde hay pinar; el año del propio incendio
  ya no cuenta como incendio anterior; nombres de los pinos según la zona (rodeno o resinero).
- **Guías de experto y avisos**: la carrasca o encina vive en caliza y en suelos silíceos (las especies salen siempre de la
  serie de cada punto); laricio, silvestre y piñonero «apenas se regeneran por semilla salvo cerca de árboles vivos»
  (Retana et al. 2002; Ordóñez et al. 2005); riesgo de inmadurez citado para el pino carrasco (Keeley et al. 1999;
  Espelta et al. 2008); facilitación con matorral nodriza (Castro et al. 2002; Gómez-Aparicio et al. 2004); planta
  certificada de la región de procedencia (RD 289/2003); un único consejo de descorche; el criterio del CEAM se indica como
  referencia fuera de la Comunitat Valenciana; las guías terminan con la fuente y el aviso.
- **Textos**: altitud («tope de 1.275 m», ya se guardaba en pasos de 10 m); series 23b (piso meso y termomediterráneo) y
  22b (nota sobre su faciación silicícola); en el MCP se distingue la superficie de la rejilla de 25 m de la del perímetro de
  Copernicus EMS; resumen sin saltos de línea a mitad de frase.
- **Web**: ficha de un punto más compacta y por encima de los controles (en móvil, como mucho el 45 % de la pantalla); el
  primer toque en el mapa con el panel abierto solo lo minimiza; un clic fuera de la zona cierra la ficha; «sin datos»
  fuera de la huella de las imágenes (antes salía NDVI 0,00); el nº de monte vacío ya no aparece; el filtro por municipio
  sigue al ancla de la URL (atrás/adelante) y avisa si el municipio no está en el incendio; casillas del plan sin negativos;
  sin desplazamiento horizontal en la pestaña Plan; etiquetas del comparador sin cortar; icono de «Comparar» en móvil;
  accesibilidad de los desplegables (Tab) y de la leyenda plegada.
- **Servidor MCP y API**: filtros desconocidos de `consultar_superficies` avisan en lugar de ignorarse (alias
  `propietario`); `espacio_protegido` acepta un nombre; guion normal o raya en «30-60»; parámetros inválidos y rutas mal
  codificadas devuelven un error 400 claro; respuestas de «incendio no encontrado» y de error con la fuente y el aviso;
  mensajes de validación en español; consultas por punto con teselas también en el servidor local y la extensión (antes
  descargaban la rejilla entera, hasta 13 MB); el núcleo renueva su caché cada 10 minutos.

## [0.2.0] – 2026-11-20 (publicada junto con la 0.2.1)

Publicada junto con la 0.2.1.

### Añadido
- **Servidor MCP remoto** (Cloudflare Workers) en `https://fenix-mcp.garcia-nieto-joaquin.workers.dev/mcp`, con API REST
  (`/api/…`) y especificación OpenAPI para un GPT personalizado. Las consultas por punto usan teselas (`point.bin.gz`).
- **Herramienta `zonas_prioritarias`**: zonas más urgentes de cada incendio y municipio. Erosión en incendios de menos de
  un año; regeneración insuficiente (cobertura < 30 %, criterio CEAM) en los más antiguos; bloque aparte de
  **reincendio en menos de 15 años** (riesgo de inmadurez de los pinos que solo regeneran por semilla; el bloque separa
  el pinar del resto de la vegetación, que en buena parte rebrota).
- **Consultas libres (`consultar_superficies`)**, **guías de experto (`guia_experta`)** y *prompts* MCP para planes de
  repoblación e informes municipales.
- **Filtro por municipio** en el mapa, con resumen del término y enlace compartible (`#municipio=…`).
- **Leyenda de la vegetación potencial con especies** desplegables y tabla «Series de vegetación de este incendio» en Cómo.
- Guía **«Úsalo con tu IA»** en el README y enlace en la tarjeta Autor.
- **Estadísticas anónimas de uso**: Cloudflare Web Analytics en la web (sin cookies) y recuento de consultas del MCP
  (herramienta, incendio, municipio, familia de aplicación y país; nunca IP, coordenadas ni texto libre). Los registros
  automáticos de invocación de Cloudflare, que guardarían la URL de cada petición, están desactivados.
- Llamada **«Pide un mapa»** en el mapa y en la tarjeta Autor.
- **Versionado del proyecto**: este historial, `public/version.json`, versión visible en Fuentes, en los `meta.json`, en la
  API y en las respuestas del MCP.

### Cambiado
- **Desplegables a medida** en toda la web (incendio, comparador agrupado por tipo de imagen, plan), con fundido.
- **Selector de incendio** desplegable en lugar de la lista de enlaces.
- **Comparador en móvil** en una fila, sin fechas cortadas.
- **Colores de la vegetación potencial** rediseñados para que no se confundan series vecinas (también con daltonismo).
- **Créditos del mapa plegados** detrás de ⓘ en todos los tamaños; el nombre y el email del autor solo en la tarjeta Autor.
- Etiquetas de la ficha de un punto más legibles.

### Corregido
- **Espadà**: corrección por sustrato de la vegetación potencial (Rivas-Martínez 1:400.000 frente a IGME 1:50.000):
  926 ha de la serie del alcornocal sobre caliza o margas pasan a carrascal del mismo piso (aquí, todas a la serie 22b,
  mesomediterránea) y 412 ha de carrascal sobre rodeno pasan a alcornocal; se respeta el alcornocal donde el Mapa Forestal
  lo registra. Detalle en Fuentes → «Correcciones propias sobre los datos oficiales».
- **Altitud**: la rejilla guardaba la altitud con un tope de 1.275 m. En Bejís (1.088 ha) y el Tiétar (7.640 ha) las
  zonas más altas aparecían con 1.275 m; ahora se guarda (en pasos de 10 m, como antes) desde la cota mínima de cada
  incendio, hasta 2.550 m por encima. No afectaba a la pendiente, la erosión ni la viabilidad.
- **Sustrato**: las unidades geológicas sin regla se clasificaban por defecto como caliza. Reglas nuevas para canchales
  (→ depósitos de ladera), navas endorreicas (→ fondo de valle) y filones de cuarzo, alteritas, arenas, gravas y cantos y
  lamprófidos (→ silíceo). Solo cambia el Tiétar: la caliza en la superficie forestal quemada baja de 744 a 83 ha
  (quedan mármoles cámbricos y depósitos con carbonatos reales); en Espadà, Bejís y Villanueva de Viver no cambia ningún
  píxel.
- **Accesibilidad WCAG 2.2 AA**: 0 errores de axe en los 4 incendios (etiquetas, pestañas con teclado, mapa y
  comparador manejables con teclado, contraste, foco visible, movimiento reducido, enlace para saltar al contenido).

## [0.1.0] – 2026-11-12

Primera versión publicada con número (extensión de Claude Desktop `fenix.mcpb`).

### Añadido
- Mapas de cuatro incendios: **Espadà / Vall d'Uixó** (2026), **Bejís** (2022), **Tiétar** (Ávila y Madrid, 2026) y
  **Villanueva de Viver – Alto Mijares** (Castellón y Teruel, 2023), cartografiados enteros aunque crucen comunidades.
- Visor común: comparador antes/después con Sentinel-2 y ortofotos PNOA, severidad (dNBR), monte público, vegetación
  previa (Mapa Forestal) y potencial (Rivas-Martínez), sustrato (IGME), erosión, viabilidad, actuación recomendada,
  rebrote observado, criterio del CEAM, incendios previos, árboles quemados (IFN3) y plan de restauración con costes.
- Datos publicados aparte en `jgarnie/fenix-data`; móvil con panel inferior deslizante; vistas previas para redes.
- **API JSON** (`public/api/`) y **servidor MCP local** (`fenix-mcp`) con `listar_incendios`, `resumen_incendio`,
  `plan_restauracion`, `consultar_punto` y `buscar_municipio`; extensión de Claude Desktop (`fenix.mcpb`).

[0.2.1]: https://github.com/jgarnie/fenix/compare/v0.1.0...v0.2.1
[0.2.0]: https://github.com/jgarnie/fenix/compare/v0.1.0...v0.2.1
[0.1.0]: https://github.com/jgarnie/fenix/releases/tag/v0.1.0
