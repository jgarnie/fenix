# Fénix remoto (Cloudflare Workers)

El mismo servidor MCP de Fénix (`../src/core.js` y `../src/tools.js`), pero en internet, para conectarlo sin instalar nada
desde Claude (web, escritorio y móvil), ChatGPT y cualquier cliente MCP con transporte HTTP. Además ofrece una API REST
en JSON con su especificación OpenAPI, para un GPT personalizado u otras aplicaciones.

| Ruta | Qué es |
|---|---|
| `/mcp` | MCP *Streamable HTTP* sin estado (respuestas JSON) |
| `/api/incendios` | lista de incendios |
| `/api/incendios/{incendio}` | resumen (texto + datos) |
| `/api/incendios/{incendio}/plan` | plan de restauración |
| `/api/punto?lat=&lon=[&incendio=]` | qué pasó en unas coordenadas |
| `/api/municipio?nombre=` | hectáreas quemadas de un municipio |
| `/openapi.json` | especificación OpenAPI 3.1 (el servidor se toma de la URL de la petición) |
| `/` y `/privacidad` | instrucciones de conexión y política de privacidad |

Todas las respuestas llevan el aviso de proyecto no oficial y la firma del autor.

## Consultas por punto: `point.json` + `point.bin.gz`

El plan gratuito de Workers da **10 ms de CPU y 128 MB por petición**. La rejilla completa no cabe: descomprimir
`grid.bin.gz` de Tiétar (13 MB → 82 MB) cuesta unos 340 ms de CPU y ~360 MB. Por eso `scripts/build_point.py` genera en
cada `data/` una copia troceada en teselas de 64×64 píxeles (gzip por tesela, unos 20 KB) y un índice, `point.json`, con
la posición de cada tesela y las capas de monte e incendios previos ya rasterizadas. El Worker pide solo su tesela con
HTTP Range (GitHub Pages responde 206). Medido en Node: 1–5 ms de CPU la primera consulta de un incendio y <1 ms
después; el manejador `/mcp` completo, ~1 ms de mediana. Coincide con la consulta sobre la rejilla completa en
240/240 puntos aleatorios (salvo, a veces, un píxel en el borde de un monte, porque se rasteriza por centro de píxel).

El servidor local (`../src/stdio.js`, extensión `.mcpb`) sigue usando la rejilla completa (`point: 'grid'`).

## Probar en local (sin cuenta)

```bash
cd mcp && npm install            # incluye wrangler y el validador de esquemas para Workers (dependencias de desarrollo)
cd worker && npx wrangler dev    # http://localhost:8787 contra los datos publicados
```

Para probar con datos sin publicar (por ejemplo `point.*` recién generados), servir `public/` con un servidor que admita
Range (`python3 -m http.server` **no** lo admite) y arrancar con
`npx wrangler dev --var FENIX_SITE:http://localhost:8811/ --var FENIX_DATA:local`.

## Publicar (requiere confirmación del autor)

1. Generar y publicar los datos de punto: `python3 scripts/build_point.py` y `scripts/publish_data.sh` (sube `point.json`
   y `point.bin.gz` junto con el resto de `data/`).
2. Iniciar sesión en Cloudflare (abre el navegador; plan gratuito, sin tarjeta): `! npx wrangler login` desde `mcp/worker`.
3. `npx wrangler deploy` → `https://fenix-mcp.<subdominio>.workers.dev` (la primera vez pide elegir el subdominio
   `workers.dev` de la cuenta).
4. Comprobar `https://fenix-mcp.<subdominio>.workers.dev/` y una consulta: `…/api/punto?lat=39.90975&lon=-0.21464`.

Límites del plan gratuito: 100.000 peticiones al día; si se superan, deja de responder hasta el día siguiente (sin coste).

## Conectarlo

- **Claude** (web, escritorio, móvil): Ajustes → Conectores → Añadir conector personalizado → URL `https://…/mcp`, sin
  autenticación.
- **ChatGPT**: Ajustes → Aplicaciones y conectores → Configuración avanzada → modo desarrollador → Crear conector con la
  misma URL. Los menús y la disponibilidad por plan cambian a menudo.
- **GPT personalizado público** (lo más fácil para cualquiera): ver [GPT.md](GPT.md).
- Otros clientes MCP: la URL `/mcp` con transporte *Streamable HTTP*.
