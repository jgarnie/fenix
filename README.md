# Fénix · después del fuego

Mapas interactivos de dos grandes incendios forestales del interior de Castellón:

- **Espadà** (`public/`): incendio de la Vall d'Uixó / Serra d'Espadà (25 jul – 1 ago 2026).
- **Bejís** (`public/bejis/`): incendio de Bejís, Alto Palancia (agosto 2022), con imágenes de cada verano hasta 2026
  para seguir la recuperación.

Los dos usan el mismo visor (`public/app.js`); los textos propios de cada incendio están en su `fire.js`.

- **Antes / después / ahora:** comparador deslizante con imágenes Sentinel-2 (color natural y falso color) y ortofoto PNOA.
- **Capas:** severidad del fuego (dNBR), monte público (catálogo de utilidad pública), vegetación previa (Mapa Forestal de España),
  vegetación potencial (Mapa de Series de Vegetación de España, MITECO), riesgo de erosión, rebrote observado e incendios anteriores.
- **Árboles quemados:** estimación a partir de las parcelas del Inventario Forestal Nacional dentro del área quemada.
- **Términos municipales** y hectáreas quemadas en cada uno.
- **Análisis de la Fundación CEAM** reproducidos con datos abiertos: sequedad de la vegetación antes del incendio, su criterio para decidir dónde reforzar la regeneración (30 % y 60 % de cobertura de leñosas rebrotadoras, evaluado a 1–2 años del incendio), los parajes que cita y una comparación de cifras.
- **Ficha de cada punto:** al pulsar el mapa, qué había, qué debería haber, de quién es, la viabilidad de recuperarlo y cómo actuar.
- **Plan:** superficie y coste por actuación según el alcance. Los costes salen de tarifas forestales oficiales y se pueden editar.

## Ejecutar

```bash
python3 -m http.server 5173 -d public   # abre http://localhost:5173
```

## Regenerar los datos

```bash
pip3 install geopandas rasterio pillow access-parser
python3 scripts/build_data.py           # Espadà: descarga a data-raw/ (no versionado) y escribe public/data/
python3 scripts/trees.py                # estimación de árboles quemados (Inventario Forestal Nacional)
python3 scripts/build_data.py bejis     # Bejís: data-raw/bejis/ → public/bejis/data/
python3 scripts/trees.py bejis
```

## Datos y licencias

| Datos | Fuente | Licencia / condiciones |
|---|---|---|
| Área quemada | © Unión Europea, Copernicus Emergency Management Service (EMSR905 Espadà, EMSR625 Bejís) | [Condiciones de Copernicus EMS](https://mapping.emergency.copernicus.eu/terms-and-conditions/): reproducción autorizada citando la fuente |
| Imágenes | Contiene datos modificados de Copernicus Sentinel (2022–2026), vía Earth Search (Element 84) | Datos Copernicus de acceso libre y abierto |
| Relieve | Copernicus DEM GLO-30: © DLR e.V. 2010-2014 y © Airbus Defence and Space GmbH 2014-2018, suministrado bajo COPERNICUS por la UE y la ESA | Licencia Copernicus DEM |
| Montes, Mapa Forestal 1:50.000, Parque Natural, incendios 1993–2024 | Institut Cartogràfic Valencià / Generalitat Valenciana (el Mapa Forestal de España es obra del MITECO) | CC BY 4.0 |
| Términos municipales | Institut Cartogràfic Valencià | CC BY 4.0 |
| Árboles por hectárea | Tercer Inventario Forestal Nacional (IFN3), Castellón y Valencia, MITECO | Datos públicos del Banco de Datos de la Naturaleza |
| Geología | IGME-CSIC, GEODE 1:50.000 | CC BY 4.0 |
| Vegetación potencial | Mapa de Series de Vegetación de España (S. Rivas-Martínez, 1987), Banco de Datos de la Naturaleza, MITECO. Especies: Rivas-Martínez y col. (2011), *Itinera Geobotanica* 18(1) | Datos públicos del Banco de Datos de la Naturaleza; la memoria solo se cita |
| Mapa base y ortofoto (se cargan en directo) | Instituto Geográfico Nacional | CC BY 4.0 scne.es |
| Precios unitarios | Tarifas forestales de la Junta de Extremadura (2024); recargos de VAERSA según el DOGV (30/9/2025) | Documentos públicos (solo se citan cifras) |
| Leaflet | Volodymyr Agafonkin y colaboradores | BSD-2-Clause (`public/vendor/leaflet/LICENSE`) |

Las capas derivadas (severidad, actuaciones, viabilidad y costes) son elaboración propia y
ninguno de los organismos citados las ha revisado ni respaldado. El código está bajo licencia MIT (ver `LICENSE`).

## Aviso

Proyecto independiente con fines informativos y divulgativos. **No es una fuente oficial** y no tiene relación con la
Generalitat Valenciana, el Ministerio ni ningún otro organismo. No debe usarse para tomar decisiones de emergencia,
delimitar propiedades ni sustituir el criterio de técnicos forestales. Los datos y resultados se ofrecen tal cual, sin garantía.

La capa de propiedad procede del catálogo público de montes y no contiene datos de propietarios particulares.
La aplicación no usa cookies ni analítica. Las teselas del mapa base se cargan desde los servidores del IGN.
