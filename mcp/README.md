# Fénix MCP

Servidor [MCP](https://modelcontextprotocol.io) de **Fénix**, los mapas de incendios forestales en España después del fuego
(https://jgarnie.github.io/fenix/). Permite que un asistente de IA (Claude, ChatGPT, Cursor…) consulte los datos de los
incendios cartografiados: área quemada, severidad, vegetación que había y la que debería haber, monte público, sustrato,
erosión y el plan de restauración propuesto.

Es un proyecto divulgativo e independiente de **Joaquín García Nieto**
([LinkedIn](https://www.linkedin.com/in/jgarnie/) · garcia.nieto.joaquin@gmail.com). **No es una fuente oficial**: las
capas derivadas (severidad, actuaciones, viabilidad, costes) son elaboración propia y ningún organismo las ha revisado.

## Herramientas

| Herramienta | Qué hace |
|---|---|
| `listar_incendios` | Incendios disponibles, con superficie, municipios y enlace al mapa |
| `resumen_incendio(incendio)` | Superficie (satélite y oficial), municipios, severidad, vegetación antes y potencial, propiedad, erosión, árboles, recuperación (NDVI), cronología y fuentes |
| `plan_restauracion(incendio)` | Actuaciones propuestas con hectáreas en monte público y privado, qué hacer y cómo, calendario y costes orientativos |
| `consultar_punto(lat, lon, incendio?)` | Qué pasó en unas coordenadas: si ardió y con qué severidad, vegetación, propietario y monte, municipio, sustrato, altitud, incendios previos, vegetación potencial con sus especies, viabilidad y actuación recomendada (rejilla de 25 m) |
| `buscar_municipio(nombre)` | En qué incendios ardió superficie de un municipio y cuántas hectáreas |

`incendio` admite el identificador (`espada`, `bejis`, `tietar`, `villanueva-de-viver`), el nombre o un municipio afectado.

Ejemplos de preguntas:

- «¿Qué incendios hay en Fénix y cuál fue el más grande?»
- «¿Ardió el punto 39.9097, -0.2146? ¿Qué debería plantarse allí?»
- «¿Cuántas hectáreas se quemaron en Montanejos y qué plan de restauración se propone?»
- «¿Qué parte del incendio de Bejís es monte público?»

## Instalación (local)

Necesita [Node.js](https://nodejs.org) 18 o superior. El servidor solo lee datos públicos de
`jgarnie.github.io/fenix` y `jgarnie.github.io/fenix-data`; no envía nada a ningún otro sitio.

### Claude Desktop

En *Ajustes → Desarrollador → Editar configuración* (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "fenix": { "command": "npx", "args": ["-y", "fenix-mcp"] }
  }
}
```

Mientras el paquete no esté publicado en npm, clonar el repositorio, ejecutar `npm install` en `mcp/` y usar la ruta:

```json
{
  "mcpServers": {
    "fenix": { "command": "node", "args": ["/ruta/a/fenix/mcp/src/stdio.js"] }
  }
}
```

### Claude Code

```bash
claude mcp add fenix -- npx -y fenix-mcp
# o, desde el repositorio:
claude mcp add fenix -- node /ruta/a/fenix/mcp/src/stdio.js
```

### Otros clientes (Cursor, VS Code, etc.)

Cualquier cliente MCP por stdio: comando `npx -y fenix-mcp` (o `node mcp/src/stdio.js`).

## Desarrollo

- `src/core.js`: lógica (descarga, decodificación de la rejilla, textos). Solo usa `fetch` y `DecompressionStream`,
  así que también sirve para un servidor remoto (HTTP) en el futuro.
- `src/tools.js`: definición de las herramientas MCP, común a cualquier transporte.
- `src/stdio.js`: servidor local por stdio.

Datos: `public/api/*.json` (textos y estadísticas, generados con `node scripts/build_api.mjs`) y la rejilla
`grid.bin.gz` de cada incendio en el repo `fenix-data`.

Para probar contra una copia local (`python3 -m http.server 8765` en `public/`):

```bash
FENIX_SITE=http://localhost:8765/ FENIX_DATA=local node src/stdio.js
```

Licencia MIT. Los datos de origen tienen sus propias licencias (ver la pestaña Fuentes de cada mapa).
