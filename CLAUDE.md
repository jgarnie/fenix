# Fénix · notas para agentes

Mapas web de incendios forestales en España (antes/después con Sentinel-2, severidad, monte público, vegetación previa
y potencial, plan de restauración). Autor: **Joaquín García Nieto**. Proyecto divulgativo e independiente, no oficial.
Publicado en https://jgarnie.github.io/fenix/ (GitHub Pages desde `public/`, ver `.github/workflows/pages.yml`).

## Estructura
- `public/app.js`, `public/style.css`, `public/series.js`: visor común a todos los incendios.
- `public/<incendio>/index.html` + `fire.js`: textos y datos propios de cada incendio (Espadà vive en la raíz de `public/`).
  Incendios: `public/` (Espadà 2026), `bejis/` (2022), `tietar/` (2026, Ávila-Madrid), `viver/` (Villanueva de Viver – Alto Mijares, 2023, Castellón-Teruel).
- `scripts/build_data.py <clave>`: genera `public/<out>/data/` (claves en `FIRES`: espada, bejis, tietar, viver).
- `scripts/trees.py <clave>`: árboles quemados (IFN3). Ejecutar después de `build_data.py`.
- `scripts/publish_data.sh`: los datos generados NO se versionan aquí; se suben (un único commit forzado) al repo
  `jgarnie/fenix-data`, que sirve la web publicada. Sobrescribe los datos de todos los incendios a la vez.
- `data-raw/`: descargas cacheadas (no versionado). Borrar un fichero fuerza su descarga en la siguiente ejecución.
- `public/og/*.jpg`: imágenes de vista previa para redes (1200×630). Al añadir un incendio, crear la suya y las etiquetas og/twitter.

## Reglas del proyecto
- **Los incendios que cruzan fronteras regionales se cartografían enteros**: todas las capas continúan entre comunidades
  (catálogos de montes de cada comunidad, Mapa Forestal de cada provincia, municipios del IGN, ENP del MITECO,
  incendios previos de EFFIS + estadística autonómica donde exista). Nunca recortar en el límite autonómico.
- Todo dato de los textos (`fire.js`) lleva fuente enlazada; si algo es incierto o contradictorio, decirlo en el texto.
- Mantener el aviso de "no es fuente oficial" y la firma del autor: tarjeta "Autor" al final de la pestaña Fuentes y
  crédito semitransparente abajo a la derecha del mapa con email (`L.Control.Credit` en `app.js`, clase `.map-credit`); el nombre lleva a la tarjeta `#autor`.
- Al añadir un incendio: entrada en `FIRES` (build_data.py y trees.py), carpeta `public/<x>/`, enlace `otherFire` en los
  demás `fire.js`, `.gitignore`, `publish_data.sh`, README y tarjeta og.
- No publicar (push a `main` ni `publish_data.sh`) sin confirmación del usuario.

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
- **Serie de vegetación nueva** (Rivas-Martínez 1987): el script se para si aparece una serie sin clase en `SERIES_CLASS`.
  Añadirla a `POT`, `SERIES_CLASS`, la regla `same` y `public/series.js` con nombre oficial y fuente; no inventar especies.
- **IGN WFS de unidades administrativas**: muy lento; un timeout corto deja el GML truncado. El filtro por `nationalLevel`
  no funciona. GDAL necesita un `.gfs` válido (copiar el de otro incendio si falla la lectura).
- **WFS vacíos** (EFFIS en años sin incendios): `read_gdf` los devuelve como capa vacía.
- **Imágenes Sentinel-2**: elegir la tesela que cubra el 100 % del perímetro; si el margen queda sin datos, `fill_tile`
  lo completa con la tesela vecina de la misma pasada (solo afecta a las imágenes del comparador).
- **Catálogo de montes de Aragón** (IDEAragon `VISOR2D:v_montes`): no indica el titular; filtrar el bbox en EPSG:25830.
