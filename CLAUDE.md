# Fénix · notas para agentes

Mapas web de incendios forestales en España (antes/después con Sentinel-2, severidad, monte público, vegetación previa
y potencial, plan de restauración). Autor: **Joaquín García Nieto**. Proyecto divulgativo e independiente, no oficial.
Publicado en https://jgarnie.github.io/fenix/ (GitHub Pages desde `public/`, ver `.github/workflows/pages.yml`).

## Estructura
- `public/app.js`, `public/style.css`, `public/series.js`: visor común a todos los incendios.
- `public/<incendio>/index.html` + `fire.js`: textos y datos propios de cada incendio (Espadà vive en la raíz de `public/`).
  Incendios: `public/` (Espadà 2026), `bejis/` (2022), `tietar/` (2026, Ávila-Madrid), `villanueva-de-viver/` (Villanueva de Viver – Alto Mijares, 2023, Castellón-Teruel).
- `scripts/build_data.py <clave>`: genera `public/<out>/data/` (claves en `FIRES`: espada, bejis, tietar, villanueva-de-viver).
- `scripts/trees.py <clave>`: árboles quemados (IFN3). Ejecutar después de `build_data.py`.
- `scripts/publish_data.sh`: los datos generados NO se versionan aquí; se suben (un único commit forzado) al repo
  `jgarnie/fenix-data`, que sirve la web publicada. Sobrescribe los datos de todos los incendios a la vez.
- `data-raw/`: descargas cacheadas (no versionado). Borrar un fichero fuerza su descarga en la siguiente ejecución.
- `scripts/build_api.mjs`: genera `public/api/incendios.json` y `public/api/<slug>.json` (textos de `fire.js`/`series.js` +
  estadísticas de `meta.json`, sin rejillas). **Volver a ejecutarlo tras `build_data.py`/`trees.py` o al cambiar textos de un
  `fire.js`**; `public/api/` sí se versiona y se publica con el push a `main`. Al añadir un incendio, añadirlo a su lista `FIRES`.
- `scripts/build_priority.py`: zonas prioritarias de cada incendio → `public/api/<slug>.prioridades.json` (ventanas de 1 km²;
  incendio de menos de 12 meses → erosión alta; después → erosión alta + cobertura < 30 % CEAM; y un bloque `reincendio`:
  forestal quemado cuyo incendio anterior —capa `last`, año − 1900— fue < 15 años antes, «trampa de inmadurez» del pinar). Lo usa la herramienta MCP
  `zonas_prioritarias` y `/api/incendios/{slug}/prioridades`. Se versiona con `public/api/`.
- `scripts/build_cube.py`: tabla de superficies → `public/api/<slug>.superficies.json` (píxeles dentro del área quemada contados por
  combinación de municipio, severidad, propiedad, vegetación, sustrato, serie potencial, actuación, erosión, espacio protegido, año del
  incendio anterior y cobertura CEAM; 2.000–9.000 filas, ≤ 230 KB). La usa la herramienta `consultar_superficies` y
  `/api/incendios/{slug}/superficies`: filtrar y agrupar la tabla cuesta ~1–2 ms de CPU (cabe en el Worker gratuito). Se versiona con `public/api/`.
- Guías de experto (`mcp/src/guides.js`): prompts MCP `guia_*` y herramienta `guia_experta` (también `/api/guia`). Solo criterios con
  fuente (Fénix, CEAM, Keeley et al. 1999, Castro et al. 2002, RD 289/2003); si cambian los criterios del modelo, actualizarlas.
- **Orden de regeneración de un incendio**: `build_data.py` → `trees.py` → `node scripts/build_api.mjs` → `build_point.py` →
  `build_priority.py` → `build_cube.py`. **Publicar** = push a `main` (código, textos, `public/api/`) + `publish_data.sh` (rejillas y teselas) +
  `npx wrangler deploy` en `mcp/worker` **siempre después de `publish_data.sh`** (aunque no cambie `mcp/src`: así ningún
  isolate mezcla un `meta.json` viejo con teselas nuevas; la caché del núcleo caduca cada 10 min, pero el redespliegue la
  vacía al instante) + release del `.mcpb` con versión nueva si cambia `mcp/src`.
- `mcp/`: servidor MCP (paquete npm `fenix-mcp`). `src/core.js` lógica sin dependencias de transporte (fetch +
  DecompressionStream, lee `api/` de la web y `grid.bin.gz` de fenix-data; decodifica la rejilla igual que `app.js`),
  `src/tools.js` herramientas, `src/stdio.js` servidor local. Pruebas en local: `FENIX_SITE=http://localhost:8765/ FENIX_DATA=local`.
- `mcp/worker/`: el mismo MCP en Cloudflare Workers (`/mcp` Streamable HTTP sin estado) + API REST `/api/...` +
  `/openapi.json` para un GPT personalizado (borrador en `mcp/worker/GPT.md`). Ver `mcp/worker/README.md`. En el plan
  gratuito (10 ms de CPU, 128 MB) no cabe la rejilla completa: usa `createFenix({ point: 'tiles' })`, que lee
  `data/point.json` y una tesela de `data/point.bin.gz` con HTTP Range. **Ejecutar `python3 scripts/build_point.py` tras
  `build_data.py`** (los publica `publish_data.sh` con el resto de `data/`). `wrangler` y `@cfworker/json-schema` son
  dependencias de desarrollo de `mcp/` (no entran en el `.mcpb`). `npx wrangler dev` en `mcp/worker` prueba sin cuenta.
  Extensión de Claude Desktop: `mcp/manifest.json` + `icon.png` → `mcp/dist/fenix.mcpb` (no versionado; se adjunta a una
  release de GitHub). Para regenerarla, subir la versión en `package.json` y `manifest.json` y seguir «Empaquetar la
  extensión» en `mcp/README.md` (copia con `npm ci --omit=dev`, `mcpb validate`, `mcpb pack`). Los patrones de
  `.mcpbignore` deben ir anclados (`/dist/`): sin barra excluyen el `dist/` del SDK y la extensión no arranca.
  Probar siempre el `.mcpb` desempaquetado con un cliente MCP antes de distribuirlo.
- `public/og/*.jpg`: imágenes de vista previa para redes (1200×630). Al añadir un incendio, crear la suya y las etiquetas og/twitter.

## Reglas del proyecto
- **Los incendios que cruzan fronteras regionales se cartografían enteros**: todas las capas continúan entre comunidades
  (catálogos de montes de cada comunidad, Mapa Forestal de cada provincia, municipios del IGN, ENP del MITECO,
  incendios previos de EFFIS + estadística autonómica donde exista). Nunca recortar en el límite autonómico.
- Todo dato de los textos (`fire.js`) lleva fuente enlazada; si algo es incierto o contradictorio, decirlo en el texto.
- Mantener el aviso de "no es fuente oficial" y la firma del autor. Nombre, email, LinkedIn y GitHub solo en la tarjeta
  "Autor" (`#autor`, al final de la pestaña Fuentes), que empieza con la llamada "¿Necesitas el mapa de otro incendio?" y un
  botón `mailto:` con asunto y plantilla. Sobre el mapa no va el nombre: abajo a la derecha hay un enlace semitransparente
  "¿Quieres el mapa de un incendio? Pídemelo" ("Pide un mapa" en móvil) que abre Fuentes y baja a `#autor`
  (`L.Control.Credit` en `app.js`, clase `.map-credit`). La idea es que la gente pida mapas.
- Los créditos de las fuentes (atribución de Leaflet) van plegados tras el botón ⓘ en todos los tamaños; el estado se recuerda
  en `localStorage` (`fenix-creditos-abiertos`). Las licencias completas siguen en Fuentes.
- Al añadir un incendio: entrada en `FIRES` (build_data.py, trees.py, build_api.mjs y build_point.py), carpeta `public/<x>/`, entrada en `FIRE_LIST` (app.js: `name`, `detail` y `label`)
  (`public/app.js`, el selector "Incendio:" de la cabecera; ya no hay `otherFire` en cada `fire.js`), `.gitignore`, `publish_data.sh`, README y tarjeta og.
- No publicar (push a `main`, `publish_data.sh`, `npm publish` del MCP, releases con el `.mcpb` ni `wrangler deploy`) sin confirmación del usuario.
- Las respuestas del MCP terminan siempre con la fuente, el aviso de no oficial y la firma del autor: mantenerlo.

## Versiones y publicación
- **Una sola versión para todo el proyecto** (web, datos, API, MCP y extensión), semver `MAYOR.MENOR.PARCHE`. Única fuente:
  `public/version.json`. `node scripts/bump_version.mjs X.Y.Z` la cambia y sincroniza `mcp/package.json`,
  `mcp/package-lock.json`, `mcp/manifest.json` y `mcp/src/version.js` (generado, no editar). La leen `build_data.py`
  (`version` y `generated` en cada `meta.json`), `build_api.mjs` (`version` en `public/api/*.json`), la web (línea
  «Fénix vX · datos generados el …» en la tarjeta Autor), el servidor MCP (versión del servidor, pie de cada respuesta,
  portada y OpenAPI).
- **Qué subir**: PARCHE = arreglos y correcciones de datos o textos; MENOR = incendio, herramienta o función nueva;
  MAYOR = cambios incompatibles en API/MCP/formato de datos (la 1.0.0 se reserva para después de una revisión experta).
- **Cada versión**: entrada en `CHANGELOG.md` (pasar «sin publicar» a la fecha) → `bump_version.mjs` → regenerar lo que
  toque (`build_data.py`, `trees.py`, `build_api.mjs`, `build_point.py`, …) → `cd mcp && npx @anthropic-ai/mcpb pack . dist/fenix.mcpb`.
- **Orden de publicación** (siempre con confirmación del usuario): push a `main` → `bash scripts/publish_data.sh` →
  `cd mcp/worker && npx wrangler deploy` → `git tag vX.Y.Z && git push origin vX.Y.Z` →
  `gh release create vX.Y.Z mcp/dist/fenix.mcpb --notes-file <notas>` (la sección del CHANGELOG) → comprobar en línea
  (web, `…/api/incendios.json` con la versión nueva, `/mcp` `tools/list`, descarga del `.mcpb`).

## Detalles técnicos que han dado problemas
- **Rejilla**: 25 m reales sobre el terreno = `25 / cos(lat)` m en Mercator (`RES` en build_data.py). Cualquier script de
  diagnóstico que compare con `meta.json` debe usar ese `RES`, no 25.
- **IGME GEODE (sustrato)**: en nov. 2026 el IGME desactivó `query`/`identify` del servicio (solo permite `export` de imagen).
  `build_data.py` usa entonces `geo_raster()`: una imagen por regla de clasificación con `layerDefs` (filtro SQL sobre
  `DESC_UNIT` y `NAME_EDA1`, con `LOWER()`/`UPPER()` porque distingue mayúsculas), al doble de resolución y por mayoría.
  Validado: 99,6 % de píxeles iguales al vectorial en Bejís y 99,2 % en Espadà. Cada máscara se pide dos veces y se exige
  que coincidan. Los colores del mapa del IGME son de **edad**, no de litología: no clasificar por color.
- **Clases de sustrato** (`geo_code` y `GEO_RULES`, deben dar lo mismo): las rocas detríticas cenozoicas (arcillas,
  areniscas y conglomerados con edad terciaria/cuaternaria en `NAME_EDA1`) son clase 6 "Detrítico terciario", no silíceo:
  en el levante son calcáreas. Las unidades con margas no son silíceas. Los yesos pueden ser Keuper o terciarios.
  En el macizo hercínico (`"hercinico": True`, Tiétar) no se separan: allí las arcosas terciarias sí son silíceas.
- **Sustrato por defecto**: en `geo_code` lo que no casa con ninguna regla es «calizo» (2). En el macizo hercínico eso
  convertía canchales, cuarzo, navas y depósitos de granito en caliza; ahora `SILICEO` (hercínico) los incluye, `NO_SIL`
  excluye mármoles y carbonatos, `canchal` → 5 y `endorreic` → 4. Revisar las unidades que caen en 2 al añadir un incendio.
- **Vegetación potencial**: Rivas-Martínez tal cual, salvo la opción `"pot_edafico": True` del incendio (solo Espadà):
  dentro del piso del mapa (campo `PISO`), 23b sobre caliza/margas/yesos/detrítico (sub 2, 3, 6) → 22b (H) o 27c (I),
  salvo alcornocal real (veg 1); 22b sobre rodeno (sub 1) → 23b; 27c sobre rodeno se mantiene. Las hectáreas quedan en
  `stats.correcciones` y se citan en Fuentes → «Correcciones propias» (`correcciones` / `erroresCorregidos` en fire.js).
- **Altitud en la rejilla**: uint8 en pasos de `meta.elev_step` (10 m) desde `meta.elev_offset`; quien la lea (app.js,
  mcp/src/core.js) debe usar `elev * elev_step + elev_offset` (antes `*5`, máximo 1.275 m).
- **Serie de vegetación nueva** (Rivas-Martínez 1987): el script se para si aparece una serie sin clase en `SERIES_CLASS`.
  Añadirla a `POT`, `SERIES_CLASS`, la regla `same` y `public/series.js` con nombre oficial y fuente; no inventar especies.
- **IGN WFS de unidades administrativas**: muy lento; un timeout corto deja el GML truncado. El filtro por `nationalLevel`
  no funciona. GDAL necesita un `.gfs` válido (copiar el de otro incendio si falla la lectura).
- **WFS vacíos** (EFFIS en años sin incendios): `read_gdf` los devuelve como capa vacía.
- **Imágenes Sentinel-2**: elegir la tesela que cubra el 100 % del perímetro; si el margen queda sin datos, `fill_tile`
  lo completa con la tesela vecina de la misma pasada (solo afecta a las imágenes del comparador).
- **Catálogo de montes de Aragón** (IDEAragon `VISOR2D:v_montes`): no indica el titular; filtrar el bbox en EPSG:25830.
- **Desplegables**: todos los `<select>` de la app usan `enhanceSelect()` (app.js): el `<select>` nativo queda oculto e `inert` y guarda el valor (el código lo lee y escucha su `change`); botón + lista propia en `#sel-layer`. Opciones con `data-a`/`data-b` (texto principal/secundario) y `<optgroup>` como secciones. Al cambiar `.value` por código el botón se actualiza solo.
- **Filtro por municipio** (pestaña Mapa, `setMun()` en app.js): usa la capa `mun` de la rejilla (índice 1-based en `meta.municipios`) y `municipios.geojson` (`nom_mun`, `comarca`). Lista = `stats.municipios` con superficie quemada; la capa temática solo pinta ese término, una máscara (panel `mask`) atenúa el resto y la tarjeta `#mun-card` resume lo quemado. Estado en la URL: `#municipio=<nombre>` (sin distinguir acentos); otros anclajes (`#autor`, `#tabbtn-…`) no lo tocan.
- **Estadística de uso**: la web carga Cloudflare Web Analytics solo si `CF_BEACON_TOKEN` (arriba de `app.js`) no está vacío y en `*.github.io`; el Worker cuenta cada petición en Analytics Engine (`STATS`/`fenix_mcp`) y en Workers Logs (`fenix_uso`), ver `track()` en `mcp/worker/src/worker.js` y `scripts/mcp_stats.mjs`. **Nunca registrar datos personales**: ni IP, ni User-Agent completo, ni coordenadas, ni texto libre (incendio y municipio solo si coinciden con los de Fénix). Si cambia lo que se cuenta, actualizar el Aviso (Fuentes), `/privacidad` del Worker y el README.
