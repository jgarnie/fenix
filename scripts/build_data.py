"""
Pipeline de datos de cada incendio (ver FIRES): Vall d'Uixó / Serra d'Espadà (jul 2026), Bejís (ago 2022),
valle del Tiétar (jul 2026) y Villanueva de Viver – Alto Mijares (mar 2023, Castellón y Teruel).

Descarga datos oficiales y abiertos, los cruza en una rejilla común (EPSG:3857, ~25 m)
y genera los ficheros que consume la app web en public/data/.

Fuentes:
  - Copernicus EMS Rapid Mapping (perímetro del área quemada): EMSR905 (Espadà), EMSR625 (Bejís)
  - Sentinel-2 L2A (Element84 Earth Search, COGs públicos en AWS)
  - Copernicus DEM GLO-30
  - Generalitat Valenciana / ICV: montes gestionados (utilidad pública), Mapa Forestal
    de España 1:50.000, Parque Natural, incendios históricos 1993-2024
  - IGME: mapa geológico continuo GEODE 1:50.000

Uso:  python3 scripts/build_data.py [espada|bejis|tietar|villanueva-de-viver]
"""
import gzip
import io
import json
import math
import os
import sys
import time
import urllib.parse
import urllib.request
import zipfile
from concurrent.futures import ThreadPoolExecutor

import geopandas as gpd
import shapely.ops
from shapely.geometry import MultiPolygon, Polygon
import numpy as np
import rasterio
from PIL import Image
from rasterio.enums import Resampling
from rasterio.features import rasterize
from rasterio.transform import from_origin
from rasterio.vrt import WarpedVRT

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Cada incendio: perímetro de Copernicus, escenas Sentinel-2 y parámetros del modelo.
# "ceam" es la escena con la que se evalúa el criterio del CEAM (lo ideal, 1-2 años después).
FIRES = {
    "espada": {
        "year": 2026,
        "raw": "",                  # data-raw/ (subcarpeta)
        "out": "data",              # public/data
        "bbox": "-0.42,39.76,-0.10,40.02",
        "ems": ("https://rapidmapping.emergency.copernicus.eu/backend/EMSR905/AOI01/GRA_PRODUCT/EMSR905_AOI01_GRA_PRODUCT_v2.zip",
                "EMSR905_AOI01_GRA_PRODUCT_observedEventA_v2.json"),
        "scenes": {
            "abril": "S2B_30TYK_20260404_0_L2A",   # primavera, misma órbita que "antes" (sequedad previa, como el CEAM)
            "antes": "S2B_30TYK_20260703_0_L2A",   # 3 semanas antes, sin nubes ni calima
            "despues": "S2A_30TYK_20260819_1_L2A",  # 18 días tras la estabilización, sin nubes
            "ahora": "S2A_30TYK_20260908_1_L2A",    # última escena con 0 % de nubes sobre el perímetro
        },
        "ceam": "ahora",
    },
    "bejis": {
        "year": 2022,
        "raw": "bejis",
        "out": "bejis/data",
        "bbox": "-0.86,39.74,-0.55,40.02",
        "ems": ("https://cems-mapping-website.s3.eu-west-1.amazonaws.com/static/activations/EMSR625/EMSR625_AOI01_GRA_PRODUCT_r1_RTP01_v1_vector.zip",
                "EMSR625_AOI01_GRA_PRODUCT_observedEventA_r1_v1.json"),
        # todas de la tesela 30TXK (la 30TYK solo cubre una cuarta parte del perímetro), 0 % de nubes sobre él
        "scenes": {
            "abril": "S2A_30TXK_20220510_0_L2A",   # primavera (la de abril tiene un 33 % de nubes sobre el perímetro)
            "antes": "S2B_30TXK_20220724_0_L2A",   # 3 semanas antes
            "despues": "S2B_30TXK_20220823_0_L2A",  # 8 días después del inicio, perímetro ya cerrado
            "y2023": "S2B_30TXK_20230729_0_L2A",
            "y2024": "S2B_30TXK_20240723_0_L2A",    # 2 años: cuando el CEAM evalúa la regeneración
            "y2025": "S2B_30TXK_20250718_0_L2A",
            "ahora": "S2A_30TXK_20260730_0_L2A",    # misma época del año que "antes"
        },
        "ceam": "y2024",
    },
    # Burgohondo – Valle del Tiétar (Ávila y oeste de Madrid, julio 2026). Fuera de la Comunitat Valenciana:
    # todas las capas vectoriales salen de fuentes nacionales o de cada comunidad ("src": "nacional").
    "tietar": {
        "year": 2026,
        "raw": "tietar",
        "out": "tietar/data",
        "bbox": "-4.95,40.12,-4.02,40.62",
        "src": "nacional",
        "montes": ["cyl", "mad"],   # catálogos de utilidad pública de cada comunidad que toca el incendio
        "hercinico": True,          # macizo granítico: cambia los nombres de algunas clases de vegetación y sustrato
        # EMSR900 (Central Spain): AOI03 es la delimitación final del incendio (28 jul); las AOI04-07 son
        # evaluaciones de daños posteriores de partes del mismo incendio. La AOI02 es el incendio de Almorox –
        # Villa del Prado, que toca el perímetro: se incluye para cartografiar todo lo que ardió junto.
        "ems": [
            ("https://rapidmapping.emergency.copernicus.eu/backend/EMSR900/AOI02/GRA_PRODUCT/EMSR900_AOI02_GRA_PRODUCT_v1.zip",
             "EMSR900_AOI02_GRA_PRODUCT_observedEventA_v1.json"),
            ("https://rapidmapping.emergency.copernicus.eu/backend/EMSR900/AOI03/DEL_MONIT04/EMSR900_AOI03_DEL_MONIT04_v1.zip",
             "EMSR900_AOI03_DEL_MONIT04_observedEventA_v1.json"),
            ("https://rapidmapping.emergency.copernicus.eu/backend/EMSR900/AOI04/GRA_MONIT01/EMSR900_AOI04_GRA_MONIT01_v1.zip",
             "EMSR900_AOI04_GRA_MONIT01_observedEventA_v1.json"),
            ("https://rapidmapping.emergency.copernicus.eu/backend/EMSR900/AOI05/GRA_MONIT01/EMSR900_AOI05_GRA_MONIT01_v1.zip",
             "EMSR900_AOI05_GRA_MONIT01_observedEventA_v1.json"),
            ("https://rapidmapping.emergency.copernicus.eu/backend/EMSR900/AOI06/GRA_PRODUCT/EMSR900_AOI06_GRA_PRODUCT_v1.zip",
             "EMSR900_AOI06_GRA_PRODUCT_observedEventA_v1.json"),
            ("https://rapidmapping.emergency.copernicus.eu/backend/EMSR900/AOI07/GRA_PRODUCT/EMSR900_AOI07_GRA_PRODUCT_v1.zip",
             "EMSR900_AOI07_GRA_PRODUCT_observedEventA_v1.json"),
        ],
        "dem": "Copernicus_DSM_COG_10_N40_00_W005_00_DEM",
        "mfe_provs": {"05": "MFE50_05_tcm30-200064.zip", "28": "MFE50_28_tcm30-200078.zip", "45": "MFE50_45_tcm30-200089.zip"},
        "scenes": {  # tesela 30TUK
            "abril": "S2C_30TUK_20260415_0_L2A",
            "antes": "S2A_30TUK_20260716_1_L2A",   # 5 días antes del inicio (21 jul)
            "despues": "S2B_30TUK_20260808_0_L2A",  # una semana después de darlo por estabilizado
            "ahora": "S2C_30TUK_20261101_0_L2A",    # última sin nubes
        },
        "ceam": "ahora",
        "perim_min_ha": 1.0, "perim_tol": 0.0001,
        "img_m": 20.0,  # incendio muy grande: imágenes del comparador a 20 m (JPEG ~4× más ligeros)
    },
    # Villanueva de Viver – Alto Mijares (Castellón y Teruel, marzo 2023). Cruza a Aragón: las capas se continúan
    # entre comunidades con fuentes nacionales (MFE, ENP, municipios del IGN, EFFIS) más los catálogos de montes
    # de la Generalitat y del Gobierno de Aragón y la estadística de incendios de la Generalitat.
    "villanueva-de-viver": {
        "year": 2023,
        "raw": "villanueva-de-viver",
        "out": "villanueva-de-viver/data",
        "bbox": "-0.80,39.96,-0.40,40.20",
        "src": "nacional",
        "montes": ["gva", "aragon"],
        "ems": ("https://rapidmapping.emergency.copernicus.eu/backend/EMSR656/AOI01/GRA_PRODUCT/EMSR656_AOI01_GRA_PRODUCT_v2.zip",
                "EMSR656_AOI01_GRA_PRODUCT_v2/EMSR656_AOI01_GRA_PRODUCT_observedEventA_v2.json"),
        "dem": "Copernicus_DSM_COG_10_N40_00_W001_00_DEM",
        "mfe_provs": {"12": "MFE50_12_tcm30-200098.zip", "44": "MFE50_44_tcm30-200094.zip"},
        # tesela 30TYK (la 30TXK deja fuera el 5 % oriental del perímetro); 0 % de nubes sobre el perímetro en todas.
        # Incendio de primavera: el seguimiento se hace con imágenes de la misma época de cada año.
        "scenes": {
            "abril": "S2A_30TYK_20230204_0_L2A",    # 6 semanas antes, misma órbita que "antes" (sequedad previa)
            "antes": "S2A_30TYK_20230316_0_L2A",    # una semana antes del inicio (23 mar)
            "despues": "S2A_30TYK_20230405_0_L2A",  # 5 días después de darlo por controlado, sin humo
            "y2024": "S2A_30TYK_20240409_0_L2A",
            "y2025": "S2B_30TYK_20250330_0_L2A",    # 2 años: cuando el CEAM evalúa la regeneración
            "y2026": "S2B_30TYK_20260404_0_L2A",    # 3 años, misma época del año que "antes"
            "ahora": "S2B_30TYK_20261021_0_L2A",    # última escena sin nubes
        },
        "ceam": "y2025",
        "fill_tile": ("30TYK", "30TXK"),  # margen occidental de las imágenes del comparador
    },
}
FIRE_KEY = sys.argv[1] if len(sys.argv) > 1 else "espada"
FIRE = FIRES[FIRE_KEY]
RAW = os.path.join(ROOT, "data-raw", FIRE["raw"])
OUT = os.path.join(ROOT, "public", FIRE["out"])
os.makedirs(RAW, exist_ok=True)
os.makedirs(OUT, exist_ok=True)

os.environ.setdefault("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR")
os.environ.setdefault("AWS_NO_SIGN_REQUEST", "YES")
os.environ.setdefault("GDAL_HTTP_MULTIRANGE", "YES")
os.environ.setdefault("GDAL_HTTP_MERGE_CONSECUTIVE_RANGES", "YES")
os.environ.setdefault("VSI_CACHE", "TRUE")
os.environ.setdefault("OGR_GEOJSON_MAX_OBJ_SIZE", "0")  # perímetros de Copernicus muy grandes

FETCH_BBOX = FIRE["bbox"]  # lon/lat, generoso alrededor del incendio
SRC = FIRE.get("src", "gva")
EMS = FIRE["ems"] if isinstance(FIRE["ems"], list) else [FIRE["ems"]]
GVA = "https://carto.icv.gva.es/arcgis/rest/services/tm_medio_ambiente/"
# Mapa de Series de Vegetación de España (Rivas-Martínez 1987), Banco de Datos de la Naturaleza (MITECO)
SERIES_ZIP = "https://www.miteco.gob.es/content/dam/miteco/es/biodiversidad/servicios/banco-datos-naturaleza/series_p_tcm30-199924.zip"
IGME = "https://mapas.igme.es/gis/rest/services/Cartografia_Geologica/IGME_Geode_50/MapServer/8/query"
STAC = "https://earth-search.aws.element84.com/v1/collections/sentinel-2-l2a/items/"
MUNI = "https://carto.icv.gva.es/arcgis/rest/services/0105_delimitaciones/0105_Delimitaciones/MapServer/0/query"
_dem = FIRE.get("dem", "Copernicus_DSM_COG_10_N39_00_W001_00_DEM")
DEM = f"https://copernicus-dem-30m.s3.amazonaws.com/{_dem}/{_dem}.tif"
BDN = "https://www.miteco.gob.es/content/dam/miteco/es/biodiversidad/servicios/banco-datos-naturaleza/"
ENP_ZIP = BDN + "enp/Enp2025_geojson.zip"  # Espacios Naturales Protegidos (MITECO)
MUP_CYL = "https://idecyl.jcyl.es/geoserver/montes/ows"  # montes:montes_cyl_mup_vw
MUP_MAD = "https://idem.comunidad.madrid/geoidem/ows"    # Zonas:IDEM_MA_MONTES_UP
MUP_ARA = "https://idearagon.aragon.es/Visor2D"          # VISOR2D:v_montes (montes públicos de Aragón)
IGN_AU = "https://www.ign.es/wfs-inspire/unidades-administrativas"
EFFIS = "https://maps.effis.emergency.copernicus.eu/effis"
EFFIS_FROM = 2016  # el WFS de EFFIS solo sirve perímetros desde 2016

SCENES = FIRE["scenes"]


# ----------------------------------------------------------------------------- descargas
def log(*a):
    print(*a, flush=True)


def http_json(url, timeout=180):
    with urllib.request.urlopen(url, timeout=timeout) as r:
        return json.load(r)


def cached(name, producer):
    path = os.path.join(RAW, name)
    if not os.path.exists(path):
        log("  descargando", name)
        producer(path)
    return path


def arcgis_query(base, fields="*", page=1000, paginate=True):
    def produce(path):
        feats, off = [], 0
        while True:
            q = dict(where="1=1", geometry=FETCH_BBOX, geometryType="esriGeometryEnvelope", inSR=4326,
                     spatialRel="esriSpatialRelIntersects", outFields=fields, outSR=4326, f="geojson")
            if paginate:  # algunas capas del ICV rechazan resultOffset
                q.update(resultOffset=off, resultRecordCount=page)
            d = http_json(base + "?" + urllib.parse.urlencode(q))
            if "error" in d:
                raise RuntimeError(f"{base}: {d['error']}")
            fs = d.get("features", [])
            feats += fs
            if not paginate or len(fs) < page:
                break
            off += page
        with open(path, "w") as f:
            json.dump({"type": "FeatureCollection", "features": feats}, f)
    return produce


def download_ems(path):
    # varias AOI del mismo incendio se unen en una sola capa
    feats = []
    for url, name in EMS:
        with urllib.request.urlopen(url, timeout=600) as r:
            z = zipfile.ZipFile(io.BytesIO(r.read()))
        d = json.loads(z.read(name))
        if len(EMS) == 1:
            with open(path, "wb") as f:
                f.write(z.read(name))
            return
        feats += d["features"]
    with open(path, "w") as f:
        json.dump({"type": "FeatureCollection", "features": feats}, f)


def wfs_geojson(base, typename, version="2.0.0"):
    """GetFeature en GeoJSON dentro de FETCH_BBOX (WFS 2.0 con eje lat/lon)."""
    def produce(path):
        w, s, e, n = FETCH_BBOX.split(",")
        q = dict(service="WFS", version=version, request="GetFeature", typenames=typename, outputFormat="application/json",
                 srsName="EPSG:4326", bbox=f"{s},{w},{n},{e},urn:ogc:def:crs:EPSG::4326")
        with urllib.request.urlopen(base + "?" + urllib.parse.urlencode(q), timeout=300) as r, open(path, "wb") as f:
            f.write(r.read())
    return produce


def wfs_gml(base, typename, version="2.0.0", bbox_lonlat=False):
    def produce(path):
        w, s, e, n = FETCH_BBOX.split(",")
        q = dict(service="WFS", version=version, request="GetFeature", typename=typename, typenames=typename, count=5000,
                 bbox=f"{s},{w},{n},{e}," + ("EPSG:4326" if version.startswith("1") else "urn:ogc:def:crs:EPSG::4326"))
        with urllib.request.urlopen(base + "?" + urllib.parse.urlencode(q), timeout=600) as r, open(path, "wb") as f:
            f.write(r.read())
    return produce


def bdn_zip(zname, members):
    """Descarga un zip del Banco de Datos de la Naturaleza (MITECO) y extrae los ficheros indicados."""
    def produce(path):
        req = urllib.request.Request(BDN + zname if not zname.startswith("http") else zname, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=900) as r:
            z = zipfile.ZipFile(io.BytesIO(r.read()))
        for m in z.namelist():
            if any(m.endswith(x) for x in members):
                z.extract(m, os.path.dirname(path))
    return produce


def read_gdf(name, producer):
    path = cached(name, producer)
    try:
        g = gpd.read_file(path)
    except Exception:
        # respuesta WFS sin ningún elemento (p. ej. un año sin incendios en la zona): capa vacía
        with open(path, "rb") as f:
            head = f.read(4096)
        if b"FeatureCollection" in head and b"member" not in open(path, "rb").read():
            return gpd.GeoDataFrame(geometry=[], crs=4326)
        raise
    if g.crs is None:
        g = g.set_crs(4326)
    return g


# ----------------------------------------------------------------------------- rejilla
log(f"1/7 Perímetro Copernicus ({FIRE_KEY})")
burnt = read_gdf("ems_burnt.geojson", download_ems).to_crs(4326)
burnt_m = burnt.to_crs(3857)
lat0 = burnt.geometry.union_all().centroid.y
K = 1 / math.cos(math.radians(lat0))  # factor de escala Mercator

pad = 1800 * K
minx, miny, maxx, maxy = burnt_m.total_bounds
minx, miny, maxx, maxy = minx - pad, miny - pad, maxx + pad, maxy + pad

GROUND = 25.0                    # resolución de análisis (m sobre el terreno)
RES = GROUND * K                 # resolución en metros Mercator
W = int(math.ceil((maxx - minx) / RES))
H = int(math.ceil((maxy - miny) / RES))
T = from_origin(minx, maxy, RES, RES)
PIX_HA = GROUND * GROUND / 1e4

IMG_GROUND = FIRE.get("img_m", 10.0)  # resolución de las imágenes del comparador
IMG_RES = IMG_GROUND * K
IW, IH = int(round(W * RES / IMG_RES)), int(round(H * RES / IMG_RES))
IT = from_origin(minx, maxy, (W * RES) / IW, (H * RES) / IH)

to4326 = gpd.GeoSeries.from_xy([minx, maxx], [miny, maxy], crs=3857).to_crs(4326)
BOUNDS = [[to4326.y[0], to4326.x[0]], [to4326.y[1], to4326.x[1]]]  # [[S,W],[N,E]] Leaflet
log(f"   rejilla {W}x{H} @ {GROUND} m, imágenes {IW}x{IH} @ {IMG_GROUND} m")


def burn(gdf, values, dtype="uint8", fill=0, all_touched=False):
    shapes = [(g, v) for g, v in zip(gdf.to_crs(3857).geometry, values) if g is not None and not g.is_empty]
    if not shapes:
        return np.full((H, W), fill, dtype=dtype)
    return rasterize(shapes, out_shape=(H, W), transform=T, fill=fill, dtype=dtype, all_touched=all_touched)


inside = burn(burnt, [1] * len(burnt)).astype(bool)

# ----------------------------------------------------------------------------- Sentinel-2
log("2/7 Sentinel-2 (" + " / ".join(SCENES) + ")")


def read_band(href, transform, width, height, resampling=Resampling.bilinear, tries=4):
    # lecturas largas por HTTP: si se corta la conexión, se reintenta la banda entera
    for i in range(tries):
        try:
            with rasterio.open(href) as src:
                with WarpedVRT(src, crs="EPSG:3857", transform=transform, width=width, height=height,
                               resampling=resampling) as vrt:
                    return vrt.read(1).astype("float32")
        except rasterio.errors.RasterioIOError as e:
            if i == tries - 1:
                raise
            log(f"   reintento {i + 1} ({os.path.basename(href)}): {str(e)[:80]}")


def load_scene(key, sid):
    # las bandas a 25 m se guardan en data-raw/ para no volver a leerlas de AWS en cada ejecución
    cache = os.path.join(RAW, f"{sid}.npz")
    imgs = [os.path.join(OUT, f"s2_{key}.jpg"), os.path.join(OUT, f"s2_{key}_swir.jpg")]
    if os.path.exists(cache) and all(map(os.path.exists, imgs)):
        z = np.load(cache)
        return {k: (str(z[k]) if k == "date" else z[k]) for k in z.files}
    item = http_json(STAC + sid)
    a = item["assets"]
    # Desde la baseline 04.00 los DN llevan +1000. Earth Search ya lo corrige cuando
    # earthsearch:boa_offset_applied es True (aunque raster:bands siga anunciando -0.1).
    corrected = item["properties"].get("earthsearch:boa_offset_applied", False)

    def refl(name, tr=T, w=W, h=H):
        info = (a[name].get("raster:bands") or [{}])[0]
        scale = info.get("scale", 1e-4)
        offset = 0.0 if corrected else info.get("offset", 0.0)
        return read_band(a[name]["href"], tr, w, h) * scale + offset
    s = {
        "date": item["properties"]["datetime"][:10],
        "nir": refl("nir"), "swir": refl("swir22"), "swir16": refl("swir16"), "red": refl("red"),
        "scl": read_band(a["scl"]["href"], T, W, H, Resampling.nearest),
    }
    # imagen en color natural a 10 m
    red10 = refl("red", IT, IW, IH)
    rgb = np.dstack([red10] + [refl(b, IT, IW, IH) for b in ("green", "blue")])
    fc = np.dstack([refl("swir22", IT, IW, IH), refl("nir", IT, IW, IH), red10])
    # el margen que queda fuera de la tesela (sin datos) se completa con la tesela vecina de la misma pasada
    # (mismo satélite y día): solo para las imágenes del comparador; el análisis va dentro del perímetro
    hole = np.all(rgb <= 0, axis=2)
    if hole.any() and FIRE.get("fill_tile"):
        src_t, dst_t = FIRE["fill_tile"]
        for alt in (sid.replace(src_t, dst_t), sid.replace(src_t, dst_t).replace("_1_L2A", "_0_L2A"),
                    sid.replace(src_t, dst_t).replace("_0_L2A", "_1_L2A")):
            try:
                a2 = http_json(STAC + alt)["assets"]
            except Exception:
                continue
            def refl2(name):
                info = (a2[name].get("raster:bands") or [{}])[0]
                return read_band(a2[name]["href"], IT, IW, IH) * info.get("scale", 1e-4) + (0.0 if corrected else info.get("offset", 0.0))
            r2 = refl2("red")
            rgb2 = np.dstack([r2, refl2("green"), refl2("blue")])
            fc2 = np.dstack([refl2("swir22"), refl2("nir"), r2])
            rgb[hole], fc[hole] = rgb2[hole], fc2[hole]
            log(f"   {key}: margen completado con {alt} ({hole.mean() * 100:.0f} % de la imagen)")
            break
    rgb8 = np.clip((np.clip(rgb, 0, None) / 0.22) ** (1 / 1.6) * 255, 0, 255).astype("uint8")
    Image.fromarray(rgb8).save(imgs[0], quality=86)
    # falso color SWIR (B12-B8-B4): la cicatriz del fuego se ve en rojo/marrón
    fc8 = np.clip((np.clip(fc, 0, None) / np.array([0.45, 0.45, 0.25])) ** (1 / 1.4) * 255, 0, 255).astype("uint8")
    Image.fromarray(fc8).save(imgs[1], quality=86)
    np.savez(cache, **s)
    return s


# las lecturas son de red: varias escenas a la vez
with ThreadPoolExecutor(max_workers=2) as pool:  # más hilos saturan la conexión y provocan cortes
    futures = {key: pool.submit(load_scene, key, sid) for key, sid in SCENES.items()}
scenes = {key: f.result() for key, f in futures.items()}
for key, sid in SCENES.items():
    log(f"   {key}: {sid} ({scenes[key]['date']})")


def nbr(s):
    return (s["nir"] - s["swir"]) / np.maximum(s["nir"] + s["swir"], 1e-4)


def ndvi(s):
    return (s["nir"] - s["red"]) / np.maximum(s["nir"] + s["red"], 1e-4)


dnbr = nbr(scenes["antes"]) - nbr(scenes["despues"])
ndvi_b, ndvi_a, ndvi_n = ndvi(scenes["antes"]), ndvi(scenes["despues"]), ndvi(scenes["ahora"])


def ndmi(s):  # humedad de la vegetación: (B8 - B11) / (B8 + B11)
    return (s["nir"] - s["swir16"]) / np.maximum(s["nir"] + s["swir16"], 1e-4)


# Sequedad previa (abril -> julio), el mismo análisis que publicó la Fundación CEAM
ndmi_abr, ndmi_jul = ndmi(scenes["abril"]), ndmi(scenes["antes"])
ndvi_abr = ndvi(scenes["abril"])
cloud_pre = np.isin(scenes["abril"]["scl"], [3, 8, 9, 10]) | np.isin(scenes["antes"]["scl"], [3, 8, 9, 10])
cloud = np.isin(scenes["antes"]["scl"], [3, 8, 9, 10]) | np.isin(scenes["despues"]["scl"], [3, 8, 9, 10])

# Severidad (Key & Benson 2006, USGS): 0 sin datos, 1 no quemado, 2 baja, 3 moderada-baja,
# 4 moderada-alta, 5 alta
sev = np.select([dnbr < 0.10, dnbr < 0.27, dnbr < 0.44, dnbr < 0.66], [1, 2, 3, 4], 5).astype("uint8")
sev[cloud] = 0

# ----------------------------------------------------------------------------- DEM
log("3/7 Modelo digital de elevaciones (Copernicus GLO-30)")
elev = read_band(DEM, T, W, H)
gy, gx = np.gradient(elev, GROUND, GROUND)
slope = np.degrees(np.arctan(np.hypot(gx, gy)))
slope_pct = np.tan(np.radians(slope)) * 100
aspect = (np.degrees(np.arctan2(-gx, gy)) + 360) % 360  # 0=N (fila crece hacia el sur)
north = (aspect > 292.5) | (aspect < 67.5)
south = (aspect > 112.5) & (aspect < 247.5)

# ----------------------------------------------------------------------------- capas vectoriales
log(f"4/7 Capas vectoriales ({SRC})")
# Vegetación (MFE50): códigos comunes a todos los incendios; cada incendio solo usa algunos.
VEG = {0: "Sin datos", 1: "Alcornocal", 2: "Pinar de rodeno (P. pinaster)", 3: "Pinar de pino carrasco",
       4: "Bosque mixto pino + frondosas", 5: "Encinar, quejigar y frondosas", 6: "Algarrobal / acebuchal",
       7: "Bosque de ribera", 8: "Matorral", 9: "Pastizal-matorral", 10: "Agrícola",
       11: "Artificial / minería", 12: "Agua / humedal", 13: "Otros arbolados",
       14: "Pinar de montaña (P. nigra, P. sylvestris)", 15: "Sabinar / enebral",
       16: "Pinar de pino piñonero (P. pinea)", 17: "Melojar (Quercus pyrenaica)", 18: "Mezcla de pinos (resinero y piñonero)"}
GEO = {0: "Sin datos", 1: "Silíceo (areniscas del rodeno, Weald o Utrillas)", 2: "Calizo, dolomítico o margoso",
       3: "Arcillas y yesos (Keuper o terciarios)", 4: "Fondo de valle / rambla", 5: "Depósitos cuaternarios de ladera",
       6: "Detrítico terciario (arcillas, areniscas y conglomerados)"}
try:
    geo = read_gdf("igme_geode50.geojson", arcgis_query(IGME, "CODE_UNIO,DESC_UNIT,NAME_EDA1,NAME_EDA2"))
except Exception as ex:  # el servidor del IGME a veces cae: se sigue sin sustrato (solo afecta a la ficha y a la viabilidad)
    log(f"  AVISO: IGME no disponible ({ex}); sustrato sin datos. Vuelve a ejecutar el script cuando responda.")
    geo = gpd.GeoDataFrame({"DESC_UNIT": []}, geometry=[], crs=4326)

if SRC == "gva":
    montes = read_gdf("gva_montes.geojson", arcgis_query(GVA + "forestal/MapServer/25/query"))
    mfe = read_gdf("gva_mfe50.geojson", arcgis_query(GVA + "forestal/MapServer/41/query"))
    pn = read_gdf("gva_parque_natural.geojson", arcgis_query(GVA + "espacios_protegidos/MapServer/10/query"))
    muni = read_gdf("icv_municipios.geojson", arcgis_query(MUNI, "cod_ine_mun,nom_mun,comarca,area_ha", paginate=False)).reset_index(drop=True)
    fire_layers = {1993 + i: 1 + i for i in range(28)}
    fire_layers.update({2021: 101, 2022: 102, 2023: 120, 2024: 121})
    fires = []
    for y, lid in fire_layers.items():
        g = read_gdf(f"gva_incendios_{y}.geojson", arcgis_query(GVA + f"prevencion_de_incendios/MapServer/{lid}/query"))
        if len(g) and y < FIRE["year"]:  # solo incendios anteriores (la capa de 2022 ya incluye Bejís)
            g = g[["geometry"]].copy()
            g["anyo"] = y
            fires.append(g)
    fires = gpd.GeoDataFrame(gpd.pd.concat(fires, ignore_index=True), crs=4326)

    # --- propiedad (montes gestionados por la Generalitat)
    OWNER = {0: "Sin catalogar (mayoritariamente privado)", 1: "Utilidad pública · Ayuntamiento",
             2: "Utilidad pública · Generalitat", 3: "Utilidad pública · Conf. Hidrográfica del Júcar",
             4: "Enclavado privado en monte público"}

    def owner_code(r):
        if r["cup"] == "ENC":
            return 4
        p = r["pertenencia"].upper() if isinstance(r["pertenencia"], str) else ""
        return 2 if "GENERALITAT" in p else 3 if "CONFEDERACION" in p else 1

    montes["owner"] = montes.apply(owner_code, axis=1)
else:
    # --- fuentes nacionales y autonómicas (incendios fuera de la Comunitat Valenciana o que cruzan a otra
    # comunidad): las capas se continúan entre comunidades
    REG = FIRE["montes"]
    if FIRE.get("hercinico"):
        VEG.update({2: "Pinar de pino resinero (P. pinaster)", 5: "Encinar y otras frondosas", 15: "Enebral"})
        GEO[1] = "Silíceo (granitos, gneises, pizarras)"
    # Montes públicos: catálogo de cada comunidad que toca el incendio
    OWNER = {0: "Sin catalogar (mayoritariamente privado)", 1: "Utilidad pública · Ayuntamiento",
             2: "Utilidad pública · Comunidad autónoma", 3: "Utilidad pública · Otras entidades (asocios, Estado)",
             4: "Enclavado privado en monte público"}
    if "aragon" in REG:  # el catálogo de Aragón no indica el titular
        OWNER[3] = "Monte público · Otras entidades o titular sin indicar"
    parts = []

    def own_cyl(r):
        p = str(r.get("n_tipprop") or "") + " " + str(r.get("n_pertenen") or "")
        return 1 if "Ayto" in p or "Ayuntamiento" in p else 2 if "Comunidad" in p or "Junta" in p else 3

    def own_mad(r):
        p = str(r.get("DS_PROPIETARIO") or "")
        return 1 if "Ayuntamiento" in p else 2 if "Comunidad" in p else 3

    def own_gva(r):
        if r["cup"] == "ENC":
            return 4
        p = r["pertenencia"].upper() if isinstance(r["pertenencia"], str) else ""
        return 2 if "GENERALITAT" in p else 3 if "CONFEDERACION" in p else 1

    def load_aragon(path):
        # WFS de IDEAragon en EPSG:25830 (su filtro por bbox en lat/lon no es fiable)
        w, s_, e_, n = map(float, FETCH_BBOX.split(","))
        bb = gpd.GeoSeries.from_xy([w, e_], [s_, n], crs=4326).to_crs(25830).total_bounds
        q = dict(service="WFS", version="2.0.0", request="GetFeature", typeNames="VISOR2D:v_montes",
                 outputFormat="application/json", bbox=f"{bb[0]:.0f},{bb[1]:.0f},{bb[2]:.0f},{bb[3]:.0f},urn:ogc:def:crs:EPSG::25830")
        with urllib.request.urlopen(MUP_ARA + "?" + urllib.parse.urlencode(q), timeout=600) as r, open(path, "wb") as f:
            f.write(r.read())

    if "cyl" in REG:  # Junta de Castilla y León (IDECyL)
        cyl = read_gdf("mup_cyl.geojson", wfs_geojson(MUP_CYL, "montes:montes_cyl_mup_vw"))
        parts.append(gpd.GeoDataFrame({"denominacion": cyl.n_monte, "num_up": cyl.v_mup, "municipio": cyl.n_mun,
                                       "pertenencia": cyl.n_pertenen, "hectareas": cyl.m_sup_ha,
                                       "owner": cyl.apply(own_cyl, axis=1)}, geometry=cyl.geometry, crs=4326))
    if "mad" in REG:  # Comunidad de Madrid (IDEM)
        mad = read_gdf("mup_madrid.geojson", wfs_geojson(MUP_MAD, "Zonas:IDEM_MA_MONTES_UP"))
        parts.append(gpd.GeoDataFrame({"denominacion": mad.DS_NOMBRE, "num_up": mad.CD_UP.astype(str), "municipio": mad.DS_MUNICIPIO,
                                       "pertenencia": mad.DS_NOM_PROPIETARIO, "hectareas": mad.NM_SUPERF_CATALOGO,
                                       "owner": mad.apply(own_mad, axis=1)}, geometry=mad.geometry.to_crs(4326), crs=4326))
    if "gva" in REG:  # Generalitat Valenciana (ICV): montes gestionados, utilidad pública
        gva = read_gdf("gva_montes.geojson", arcgis_query(GVA + "forestal/MapServer/25/query"))
        parts.append(gpd.GeoDataFrame({"denominacion": gva.get("denominacion", gva.texto), "num_up": gva.num_up,
                                       "municipio": gva.municipio.str.replace("_", "'"), "pertenencia": gva.get("pertenencia"),
                                       "hectareas": gva.hectareas, "owner": gva.apply(own_gva, axis=1)},
                                      geometry=gva.geometry.to_crs(4326), crs=4326))
    if "aragon" in REG:  # Gobierno de Aragón (IDEAragon): montes públicos, catalogados o no
        ara = read_gdf("mup_aragon.geojson", load_aragon)
        ara = ara[ara.tipo == "Monte público"]
        parts.append(gpd.GeoDataFrame({"denominacion": ara.denominacion, "num_up": ara.numero.str.strip().str.lstrip("0"),
                                       "municipio": ara.ttmm, "pertenencia": None, "hectareas": ara.sup_oficial,
                                       "owner": 3}, geometry=ara.geometry.to_crs(4326), crs=4326))
    montes = gpd.GeoDataFrame(gpd.pd.concat(parts, ignore_index=True), crs=4326)

    # Mapa Forestal de España 1:50.000 por provincias (MITECO, Banco de Datos de la Naturaleza)
    def load_mfe(path):
        parts = []
        for prov, zname in FIRE["mfe_provs"].items():
            shp = os.path.join(RAW, f"mfe50_{prov}.shp")
            if not os.path.exists(shp):
                bdn_zip(zname, (".shp", ".shx", ".dbf", ".prj"))(shp)
            crs = gpd.read_file(shp, rows=1).crs
            w, s, e, n = map(float, FETCH_BBOX.split(","))
            bb = gpd.GeoSeries.from_xy([w, e], [s, n], crs=4326).to_crs(crs).total_bounds
            parts.append(gpd.read_file(shp, bbox=tuple(bb)).to_crs(4326))
        gpd.GeoDataFrame(gpd.pd.concat(parts, ignore_index=True), crs=4326)[
            ["DEFINICION", "NOM_FORARB", "USOS_SUELO", "geometry"]].to_file(path, driver="GPKG")
    mfe = read_gdf("mfe50.gpkg", load_mfe)

    # Espacios Naturales Protegidos (MITECO): los que toca el incendio
    def load_enp(path):
        src = os.path.join(RAW, "Enp2025_p.json")
        if not os.path.exists(src):
            bdn_zip(ENP_ZIP, ("Enp2025_p.json",))(src)
        os.environ["OGR_GEOJSON_MAX_OBJ_SIZE"] = "0"
        # solo la zona del incendio: el fichero nacional entero no cabe cómodamente en memoria
        w, s_, e_, n = map(float, FETCH_BBOX.split(","))
        bb = gpd.GeoSeries.from_xy([w, e_], [s_, n], crs=4326).to_crs(25830).total_bounds
        e = gpd.read_file(src, bbox=tuple(bb)).to_crs(25830)
        b = burnt.to_crs(25830).simplify(25).union_all().buffer(200)
        e = e[e.intersects(b)]
        gpd.GeoDataFrame({"nombre": e.SITE_NAME, "hect_ofi": e.Sup_ha, "legislacio": e.ODESIGNATE},
                         geometry=e.geometry, crs=25830).to_crs(4326).to_file(path, driver="GeoJSON")
    pn = read_gdf("enp.geojson", load_enp)

    # Términos municipales: IGN (unidades administrativas INSPIRE)
    PROV = {"05": "Ávila", "28": "Madrid", "45": "Toledo", "10": "Cáceres", "40": "Segovia",
            "12": "Castellón", "44": "Teruel", "46": "Valencia"}
    au = read_gdf("ign_unidades.gml", wfs_gml(IGN_AU, "au:AdministrativeUnit"))
    au = au[au.LocalisedCharacterString == "Municipio"].to_crs(4326)
    au["nationalCode"] = au.nationalCode.astype("int64").astype(str)  # GDAL lo lee como número
    muni = gpd.GeoDataFrame({"cod_ine_mun": au.nationalCode.str[-5:], "nom_mun": au.text,
                             "comarca": au.nationalCode.str[6:8].map(PROV).fillna(""),
                             "area_ha": au.to_crs(25830).area / 1e4},
                            geometry=au.geometry, crs=4326).reset_index(drop=True)

    # Incendios anteriores: EFFIS (Copernicus), perímetros desde 2016
    fires = []
    for y in range(EFFIS_FROM, FIRE["year"]):
        g = read_gdf(f"effis_{y}.gml", wfs_gml(EFFIS, f"ms:modis.ba.poly.{y}", version="1.1.0"))
        if len(g):
            g = g.set_crs(4326, allow_override=True)[["geometry"]].copy()
            # el GML de EFFIS (WFS 1.1, EPSG:4326) viene en orden lat/lon: se intercambian los ejes
            g["geometry"] = g.geometry.map(lambda geom: shapely.ops.transform(lambda x, y: (y, x), geom))
            g["anyo"] = y
            fires.append(g)
    if "gva" in REG:  # en la parte valenciana, además, la estadística de la Generalitat desde 1993
        fire_layers = {1993 + i: 1 + i for i in range(28)}
        fire_layers.update({2021: 101, 2022: 102, 2023: 120, 2024: 121})
        for y, lid in fire_layers.items():
            if y >= FIRE["year"]:
                continue
            g = read_gdf(f"gva_incendios_{y}.geojson", arcgis_query(GVA + f"prevencion_de_incendios/MapServer/{lid}/query"))
            if len(g):
                g = g[["geometry"]].to_crs(4326).copy()
                g["anyo"] = y
                fires.append(g)
    fires = gpd.GeoDataFrame(gpd.pd.concat(fires, ignore_index=True), crs=4326)

# primero los públicos, luego los enclavados encima
mo = montes.sort_values("owner", key=lambda s: s == 4)
owner = burn(mo, mo["owner"])


def veg_code_bdn(r):
    """Mapa Forestal de España tal como lo distribuye el MITECO (campos DEFINICION y NOM_FORARB)."""
    t, e = [x if isinstance(x, str) else "" for x in (r["DEFINICION"], r["NOM_FORARB"])]
    if "cultivo" in t.lower() or t.startswith("Agrícola"):
        return 10
    if t in ("Artificial", "Minería, escombreras y vertederos", "Autopistas y autovías", "Infraestructuras de conducción"):
        return 11
    if t in ("Agua", "Humedal"):
        return 12
    if t in ("Matorral", "Monte sin vegetación superior", "T. D. (Incendio)"):
        return 8
    if t in ("Herbazal", "Pastizal-Matorral", "Prado", "Prado con sebes"):
        return 9
    if "Riberas" in t or "ribereñ" in e or "Fresneda" in e: return 7
    if "pinaster" in e: return 2
    if "piñonero" in e: return 16
    if "carrasco" in e or "halepensis" in e: return 3
    if "laricio" in e or "negral" in e: return 14
    if "Mezclas de coníferas autóctonas" in e: return 18 if FIRE.get("hercinico") else 3
    if "coníferas y frondosas" in e: return 4
    if "Melojar" in e: return 17
    if "albar" in e or "salgareño" in e: return 14
    if "Enebral" in e or "Sabinar" in e: return 15
    if any(k in e for k in ("Encinar", "Dehesa", "Quejigar", "Castañar", "frondosas")): return 5
    if "Alcornoc" in e: return 1
    return 13


def veg_code(r):
    if "DEFINICION" in r:
        return veg_code_bdn(r)
    t, e = [x if isinstance(x, str) else "" for x in (r["tipestr_definicion"], r["especie"])]
    if t in ("Agrícola",) or "cultivo" in t.lower():
        return 10
    if t in ("Artificial", "Minería, escombreras y vertederos", "Autopistas y autovías", "Infraestructuras de conducción"):
        return 11
    if t in ("Agua", "Humedal"):
        return 12
    if t in ("Matorral", "Monte sin vegetación superior", "Temporalmente desarbolado (incendios)"):
        return 8
    if t in ("Pastizal-matorral", "Prado"):
        return 9
    if "Alcornoc" in e: return 1
    if "pinaster" in e: return 2
    if "halepensis" in e or "Mezclas de coníferas autóctonas" in e: return 3
    if "coníferas y frondosas" in e: return 4
    if "Encinar" in e or "Quejigar" in e or "frondosas autóctonas" in e or "disperso de frondosas" in e: return 5
    if "Algarrob" in e or "Acebuch" in e: return 6
    if "nigra" in e or "sylvestris" in e: return 14
    if "Sabinar" in e or "Enebral" in e: return 15
    if "ribere" in e.lower() or "Riberas" in t: return 7
    return 13


mfe["veg"] = mfe.apply(veg_code, axis=1)
veg = burn(mfe, mfe["veg"])

# --- sustrato (IGME)
SILICEO = ("arenisc", "argilit", "pizarra", "cuarc", "arenas y cantos")
if FIRE.get("hercinico"):  # macizo hercínico: granitos y metamórficas
    SILICEO += ("granit", "granodiorit", "gneis", "neis", "migmat", "esquist", "pórfid", "porfid", "aplit", "pegmat",
                "leucogran", "monzogran", "tonalit", "diorit", "filit", "metasediment", "arcosa", "arcós")


# Rocas detríticas del Cenozoico (arcillas, areniscas y conglomerados terciarios): en el levante ibérico sus cantos
# y su matriz suelen ser calcáreos, así que no son "rodeno". Se reconocen por la edad de la unidad (NAME_EDA1).
# En el macizo hercínico (Tiétar) no se separan: allí las arcosas terciarias salen del granito y sí son silíceas.
DETRIT = ("arenisc", "conglomerad", "arcilla", "lutit", "arenas y cantos", "limo")
CENOZOICO = ("PALEOCENO", "EOCENO", "OLIGOCENO", "MIOCENO", "PLIOCENO", "PLEISTOCENO", "HOLOCENO", "PALEOGENO", "PALEÓGENO",
             "NEOGENO", "NEÓGENO", "CUATERNARIO", "DANIENSE", "THANETIENSE", "YPRESIENSE", "LUTECIENSE", "BARTONIENSE",
             "PRIABONIENSE", "RUPELIENSE", "CHATTIENSE", "AQUITANIENSE", "BURDIGALIENSE", "LANGHIENSE", "SERRAVALLIENSE",
             "TORTONIENSE", "MESINIENSE", "ZANCLIENSE", "PIACENZIENSE", "GELASIENSE", "AGENIENSE", "ARVERNIENSE",
             "SUEVIENSE", "RAMBLIENSE", "ARAGONIENSE", "VALLESIENSE", "TUROLIENSE", "RUSCINIENSE", "VILLAFRANQUIENSE")
SEP_TERC = not FIRE.get("hercinico")


def geo_code(d, eda=""):
    d = d.lower() if isinstance(d, str) else ""
    eda = eda.upper() if isinstance(eda, str) else ""
    if "masa" in d and "agua" in d: return 0
    if "fondos de valle" in d or "rambla" in d or "aluvial" in d: return 4
    if "yeso" in d: return 3
    if any(k in d for k in ("coluvi", "glacis", "abanico", "terraza", "conos", "playa", "albufera", "cordón")): return 5
    if SEP_TERC and any(e in eda for e in CENOZOICO) and any(k in d for k in DETRIT): return 6
    if any(k in d for k in SILICEO) and "calizas" not in d and (FIRE.get("hercinico") or "marga" not in d): return 1
    return 2


_like = lambda w: f"LOWER(DESC_UNIT) LIKE '%{w}%'"
_any = lambda ws: "(" + " OR ".join(_like(w) for w in ws) + ")"
GEO_RULES = [  # mismo orden de prioridad que geo_code (la primera regla que se cumple gana), como filtros SQL
    (0, f"{_like('masa')} AND {_like('agua')}"),
    (4, _any(["fondos de valle", "rambla", "aluvial"])),
    (3, _like("yeso")),
    (5, _any(["coluvi", "glacis", "abanico", "terraza", "conos", "playa", "albufera", "cord_n"])),
] + ([(6, "(" + " OR ".join(f"UPPER(NAME_EDA1) LIKE '%{e}%'" for e in CENOZOICO) + f") AND {_any(DETRIT)}")] if SEP_TERC else []) + [
    (1, f"{_any(SILICEO)} AND NOT {_like('calizas')}" + ("" if FIRE.get("hercinico") else f" AND NOT {_like('marga')}")),
]


def geo_raster(path):
    """Sustrato desde imágenes del IGME (el servicio GEODE desactivó las consultas en nov. 2026, pero sigue
    sirviendo el mapa como imagen y acepta filtros SQL): una imagen por regla de geo_code, filtrando por
    DESC_UNIT; los píxeles pintados son la máscara de esa clase. Se pide al doble de resolución que la
    rejilla y se resume cada bloque de 2×2 por mayoría."""
    base = IGME.rsplit("/", 2)[0] + "/export"
    bbox = f"{minx},{maxy - H * RES},{minx + W * RES},{maxy}"

    def mask(where):
        q = dict(bbox=bbox, bboxSR=3857, imageSR=3857, size=f"{2 * W},{2 * H}", format="png32", transparent="true",
                 f="image", layers="show:8", layerDefs=json.dumps({"8": where}), dpi=96)
        # el servidor a veces devuelve imágenes mal dibujadas cuando está cargado: cada máscara se pide dos
        # veces y solo se acepta si ambas coinciden (>99,9 % de los píxeles)
        def fetch():
            with urllib.request.urlopen(base + "?" + urllib.parse.urlencode(q), timeout=300) as r:
                a = np.array(Image.open(io.BytesIO(r.read())).convert("RGBA"))[..., 3] > 127
            return a.reshape(H, 2, W, 2).mean(axis=(1, 3)) >= 0.5
        prev = None
        for i in range(8):
            try:
                a = fetch()
            except Exception:
                time.sleep(15 * (i + 1))
                continue
            if prev is not None and (a == prev).mean() > 0.999:
                return a
            prev = a
        raise RuntimeError(f"IGME: imágenes inconsistentes para {where}")

    out = np.where(mask("1=1"), 2, 0).astype("uint8")  # todo lo cartografiado: calizo por defecto
    for code, where in reversed(GEO_RULES):  # de menor a mayor prioridad: la última sobrescribe
        m = mask(where)
        out[m] = code
        log(f"   {GEO[code]}: {m.mean() * 100:.1f} % de la rejilla")
    np.savez_compressed(path, sub=out)


if len(geo):
    geo["sub"] = [geo_code(d, e) for d, e in zip(geo["DESC_UNIT"], geo.get("NAME_EDA1", [""] * len(geo)))]
    sub = burn(geo, geo["sub"])
else:
    try:
        p_ = os.path.join(RAW, "igme_sustrato_img.npz")
        if not os.path.exists(p_):
            log("  sustrato desde imágenes del IGME (consultas desactivadas)")
            geo_raster(p_)
        sub = np.load(p_)["sub"]
        assert sub.shape == (H, W)
    except Exception as ex:
        log(f"  AVISO: tampoco hay imágenes del IGME ({ex}); sustrato sin datos")
        sub = np.zeros((H, W), "uint8")

# --- recurrencia: nº de incendios previos (1993-2024) que afectaron cada píxel
recur = np.zeros((H, W), "uint8")
last_fire = np.zeros((H, W), "uint16")
for y, g in fires.groupby("anyo"):
    m = burn(g, [1] * len(g)).astype(bool)
    recur += m
    last_fire[m] = y

in_pn = burn(pn, [1] * len(pn)).astype(bool)
# término municipal: índice 1..n en la rejilla (0 = sin municipio)
mun = burn(muni, muni.index + 1)

# ----------------------------------------------------------------------------- modelo
log("5/7 Modelo de vegetación potencial, acciones y viabilidad")
# Sustrato efectivo: en depósitos de ladera o sin datos se infiere de la vegetación
# indicadora (alcornoque y pino rodeno solo viven sobre suelos ácidos).
silicicola_ind = np.isin(veg, [1, 2])
eff_sub = sub.copy()
amb = np.isin(sub, [0, 5])
eff_sub[amb & silicicola_ind] = 1
eff_sub[amb & ~silicicola_ind] = 2

# Vegetación potencial: serie del Mapa de Series de Vegetación de España (Rivas-Martínez 1987, MITECO)
# en cada píxel. Las riberas y los usos no forestales salen del Mapa Forestal. Clases comunes a todos los
# incendios; los nombres, especies y la revisión de 2011 están en public/series.js.
POT = {0: "—",
       1: "Alcornocal (23b, Asplenio onopteridis–Querceto suberis S.)",
       2: "Carrascal termomediterráneo (27c, Rubio longifoliae–Querceto rotundifoliae S.)",
       3: "Carrascal mesomediterráneo (22b, Bupleuro rigidi–Querceto rotundifoliae S.)",
       4: "Carrascal supramediterráneo con sabina albar (22a, Junipero thuriferae–Querceto rotundifoliae S.)",
       5: "Sabinar albar (15b, Junipereto hemisphaerico-thuriferae S.)",
       6: "Vegetación de ribera (geomegaseries riparias)",
       7: "Uso no forestal (agrícola, urbano, agua)",
       8: "Coscojar semiárido (29b, Rhamno lycioidis–Querceto cocciferae S.)",
       9: "Encinar silicícola guadarrámico (24a, Junipero oxycedri–Querceto rotundifoliae S.)",
       10: "Encinar silicícola luso-extremadurense (24c, Pyro bourgaeanae–Querceto rotundifoliae S.)",
       11: "Melojar supramediterráneo (18a, Luzulo forsteri–Querceto pyrenaicae S.)",
       12: "Piornal oromediterráneo gredense (13b, Cytiso purgantis–Echinosparteto barnadesii S.)",
       13: "Melojar mesomediterráneo húmedo (18h, Arbuto–Querceto pyrenaicae S.)",
       14: "Enebral rastrero y piornal guadarrámico (13a, Junipero nanae–Cytiseto purgantis S.)",
       15: "Quejigar basófilo maestracense y aragonés (19c, Violo willkommii–Querceto fagineae S.)"}
# 24ab y 24cc son faciaciones de 24a y 24c (en el mapa, el color de la serie con una trama encima)
SERIES_CLASS = {"23b": 1, "27c": 2, "22b": 3, "22ba": 3, "22a": 4, "15b": 5, "I": 6, "29b": 8,
                "24a": 9, "24ab": 9, "24c": 10, "24cc": 10, "18a": 11, "13b": 12, "18h": 13, "13a": 14, "19c": 15}


def download_series(path):
    req = urllib.request.Request(SERIES_ZIP, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=300) as r:
        z = zipfile.ZipFile(io.BytesIO(r.read()))
    d = os.path.dirname(path)
    z.extractall(d)
    series = gpd.read_file(os.path.join(d, "Series_p.shp"))
    to4326 = gpd.GeoSeries.from_xy([minx, maxx], [miny, maxy], crs=3857).to_crs(series.crs)
    series = series.cx[to4326.x[0]:to4326.x[1], to4326.y[0]:to4326.y[1]]
    series[["SERIES", "PISO", "geometry"]].to_crs(4326).to_file(path, driver="GeoJSON")


series = read_gdf("mitecoseries.geojson", download_series)
unknown = set(series.SERIES) - set(SERIES_CLASS)
if unknown:
    raise SystemExit(f"Series sin clase asignada en SERIES_CLASS: {unknown}")
pot = burn(series, series.SERIES.map(SERIES_CLASS))
pot[veg == 7] = 6
pot[np.isin(veg, [10, 11, 12])] = 7

RESPROUTER = np.isin(veg, [1, 5, 6, 7, 8, 9, 17])  # rebrotan de cepa/raíz/yemas tras el fuego (melojo, de raíz)
PINE = np.isin(veg, [2, 3, 4, 13, 14, 15, 16, 18])  # no rebrotan: regeneran por semilla (sabinas, enebros y pino piñonero, mal)
forest = ~np.isin(veg, [0, 10, 11, 12])
burned = inside & (sev >= 2)
recent_fire = last_fire >= FIRE["year"] - 15  # pinar inmaduro: <15 años, sin piñas serótinas suficientes
cloud_now = np.isin(scenes["ahora"]["scl"], [3, 8, 9, 10])
regrowth = ((ndvi_n - ndvi_a) > 0.05) & ~cloud_now
ndvi_c = ndvi(scenes[FIRE["ceam"]])
cloud_c = np.isin(scenes[FIRE["ceam"]]["scl"], [3, 8, 9, 10])

# Criterio de la Fundación CEAM (manual Postfire-DSS) para reforzar la regeneración, que se
# evalúa entre 1 y 2 años después del incendio: si las especies leñosas rebrotadoras cubren
# más del 60 % del terreno la regeneración es favorable; por debajo del 30 % puede estudiarse
# una plantación o siembra selectiva; entre ambos, se analiza caso a caso.
# Aproximación por satélite de la cobertura vegetal absoluta (no relativa a la previa):
# (NDVI ahora - suelo quemado) / (NDVI de vegetación densa - suelo quemado). El NDVI no
# distingue leñosas de herbáceas, así que es una cota superior de la cobertura leñosa.
soil_ndvi = float(np.median(ndvi_a[inside & (sev >= 4)]))
full_ndvi = float(np.percentile(ndvi_b[~inside & np.isin(veg, [1, 2, 3, 4, 5]) & ~cloud], 95))
recov = np.clip((ndvi_c - soil_ndvi) / max(full_ndvi - soil_ndvi, 0.1), 0, 1) * 100
CEAM = {0: "—", 1: "<30 %: estudiar plantación o siembra selectiva", 2: "30–60 %: analizar caso a caso",
        3: ">60 %: regeneración favorable"}
ceam = np.zeros((H, W), "uint8")
ceam_ok = inside & forest & (sev >= 2) & ~cloud_c
ceam[ceam_ok] = 1
ceam[ceam_ok & (recov >= 30)] = 2
ceam[ceam_ok & (recov >= 60)] = 3

# Riesgo de erosión post-incendio (antes de las lluvias de otoño)
EROS = {0: "—", 1: "Bajo", 2: "Medio", 3: "Alto", 4: "Muy alto"}
eros = np.zeros((H, W), "uint8")
eros_score = (sev.astype(int) - 1).clip(0) * (slope_pct / 25)
eros[inside & forest] = 1
eros[inside & forest & (eros_score >= 3)] = 2
eros[inside & forest & (eros_score >= 6)] = 3
eros[inside & forest & (eros_score >= 9)] = 4

ACT = {0: "—", 1: "Regeneración natural: seguimiento y protección",
       2: "Regeneración asistida: siembra y plantación en núcleos",
       3: "Restauración activa hacia la vegetación potencial",
       4: "Recuperar cultivo / mosaico agrícola cortafuegos",
       5: "No quemado o afección leve: sin actuación"}
act = np.zeros((H, W), "uint8")
act[inside] = 5
nat = burned & forest & (RESPROUTER | (PINE & (sev <= 3) & ~recent_fire))
act[nat] = 1
assist = burned & forest & PINE & ~nat
act[assist] = 2
# Si ya hay imagen de evaluación (1 año o más después del incendio), manda lo observado: donde la
# cobertura sigue por debajo del 30 % (criterio CEAM) la regeneración natural no está bastando.
ceam_eval = int(scenes[FIRE["ceam"]]["date"][:4]) - FIRE["year"] >= 1
if ceam_eval:
    act[(act == 1) & (ceam == 1)] = 2
# pinar con daño alto donde la potencial es el alcornocal, matorral muy recurrente o
# afección alta repetida: hay que reintroducir las especies de la vegetación potencial
active = burned & forest & (
    (PINE & (pot == 1) & (sev >= 4)) |
    (np.isin(veg, [8, 9]) & (recur >= 2)) |
    ((sev >= 5) & (recur >= 2))
)
act[active] = 3
act[inside & np.isin(veg, [10]) & (sev >= 2)] = 4

# Viabilidad de alcanzar la vegetación potencial (0-100) en un horizonte de ~30 años
same = (((veg == 1) & (pot == 1)) | ((veg == 5) & np.isin(pot, [2, 3, 4, 9, 10, 15])) |
        ((veg == 7) & (pot == 6)) | ((veg == 6) & (pot == 2)) | ((veg == 15) & np.isin(pot, [4, 5])) |
        ((veg == 17) & np.isin(pot, [11, 13])) | (np.isin(veg, [8, 9]) & np.isin(pot, [12, 14])))
score = np.full((H, W), 50.0)
score[same] = 85
score[np.isin(veg, [8, 9])] = 60
score[(veg == 4)] = 65
score[(veg == 6) & ~same] = 55
score += np.choose(np.clip(sev, 0, 5), [0, 15, 10, 0, -10, -20])
score -= np.minimum(recur, 3) * 12
score -= np.where(slope_pct > 50, 10, 0)
score -= np.where(south & (eff_sub == 1) & (elev < 500), 5, 0)
score += np.where(regrowth, 10, 0)
feas = np.clip(score, 0, 100).astype("uint8")
valid = inside & forest
feas[~valid] = 0
FEAS = {0: "—", 1: "Baja (<45)", 2: "Media (45–70)", 3: "Alta (≥70)"}
feas_cls = np.zeros((H, W), "uint8")
feas_cls[valid] = 1
feas_cls[valid & (feas >= 45)] = 2
feas_cls[valid & (feas >= 70)] = 3

# ----------------------------------------------------------------------------- estadísticas
log("6/7 Estadísticas")


def ha(mask):
    return round(float(mask.sum()) * PIX_HA, 1)


def crosstab(a, labels, mask):
    return {labels[k]: ha(mask & (a == k)) for k in labels if k and ha(mask & (a == k)) > 0}


public = np.isin(owner, [1, 2, 3])
stats = {
    # unión: en Tiétar las AOI de Copernicus se solapan
    "ems_ha": round(float(burnt.to_crs(25830).union_all().area / 1e4), 1),
    "grid_ha": ha(inside),
    "forest_ha": ha(inside & forest),
    "public_ha": ha(inside & public),
    "public_forest_ha": ha(inside & public & forest),
    "pn_ha": ha(inside & in_pn),
    "pn_total_ha": round(float(pn.to_crs(25830).area.sum() / 1e4), 1),
    "municipios": dict(sorted(((muni.nom_mun[k - 1], {"total": ha(inside & (mun == k)), "forestal": ha(inside & forest & (mun == k))})
                              for k in range(1, len(muni) + 1) if ha(inside & (mun == k)) > 0), key=lambda kv: -kv[1]["total"])),
    "recurrent_ha": ha(inside & (recur >= 1)),
    "severity": crosstab(sev, {1: "No quemado", 2: "Baja", 3: "Moderada-baja", 4: "Moderada-alta", 5: "Alta"}, inside),
    "owner": crosstab(owner, OWNER, inside) | {"Sin catalogar (mayoritariamente privado)": ha(inside & (owner == 0))},
    "veg_before": crosstab(veg, VEG, inside),
    "potential": crosstab(pot, POT, inside),
    "erosion": crosstab(eros, EROS, inside),
    "actions": {},
    "feasibility": crosstab(feas_cls, FEAS, valid),
    "regrowth_ha": ha(inside & forest & regrowth),
    "soil_ndvi": round(soil_ndvi, 3),
    "full_ndvi": round(full_ndvi, 3),
    "ceam": {CEAM[k]: {"total": ha(ceam == k), "publico": ha((ceam == k) & np.isin(owner, [1, 2, 3]))} for k in (1, 2, 3)},
    "sequedad": {
        # cambio relativo de la media dentro del área quemada, abril -> julio (como el CEAM)
        "ndmi_abril": round(float(ndmi_abr[inside & ~cloud_pre].mean()), 3),
        "ndmi_julio": round(float(ndmi_jul[inside & ~cloud_pre].mean()), 3),
        "ndvi_abril": round(float(ndvi_abr[inside & ~cloud_pre].mean()), 3),
        "ndvi_julio": round(float(ndvi_b[inside & ~cloud_pre].mean()), 3),
    },
    "scenes": {k: v["date"] for k, v in scenes.items()},
    "ceam_scene": FIRE["ceam"],
    "fire_year": FIRE["year"],
    # evolución del verdor (NDVI medio) en lo quemado con severidad moderada-alta o alta
    "ndvi_serie": {v["date"]: round(float(ndvi(v)[inside & (sev >= 4) & ~np.isin(v["scl"], [3, 8, 9, 10])].mean()), 3)
                   for k, v in sorted(scenes.items(), key=lambda kv: kv[1]["date"]) if k != "abril"},
    "ndvi_serie_ref": {v["date"]: round(float(ndvi(v)[~inside & forest & ~np.isin(v["scl"], [3, 8, 9, 10])].mean()), 3)
                       for k, v in sorted(scenes.items(), key=lambda kv: kv[1]["date"]) if k != "abril"},
}
for k, lab in ACT.items():
    if not k:
        continue
    m = inside & (act == k)
    stats["actions"][lab] = {"total": ha(m), "publico": ha(m & public), "privado": ha(m & ~public),
                             "erosion_alta": ha(m & (eros >= 3))}
stats["erosion_public"] = {EROS[k]: ha(inside & public & (eros == k)) for k in (3, 4)}
# vegetación antes vs potencial (matriz) dentro del área forestal quemada
stats["veg_vs_pot"] = {VEG[v]: {POT[p]: ha(valid & (veg == v) & (pot == p)) for p in POT if p
                                if ha(valid & (veg == v) & (pot == p)) > 0}
                       for v in VEG if v and ha(valid & (veg == v)) > 0}
# superficie de pinar (incluye mixto) para el resumen
stats["pine_ha"] = ha(inside & np.isin(veg, [2, 3, 4, 14, 16, 18]))

# ----------------------------------------------------------------------------- exportación
log("7/7 Exportando")
layers = {
    "inside": inside.astype("uint8"), "sev": sev, "owner": owner, "veg": veg, "sub": sub, "pot": pot,
    "act": act, "eros": eros, "feas": feas, "recur": recur,
    "last": np.where(last_fire > 0, last_fire - 1900, 0).astype("uint8"),
    "slope": np.clip(slope_pct, 0, 255).astype("uint8"),
    "elev": np.clip(elev / 5, 0, 255).astype("uint8"),
    "dnbr": np.clip(dnbr * 100 + 100, 0, 255).astype("uint8"),
    "ndvi_b": np.clip(ndvi_b * 100 + 100, 0, 255).astype("uint8"),
    "ndvi_a": np.clip(ndvi_a * 100 + 100, 0, 255).astype("uint8"),
    "ndvi_n": np.clip(ndvi_n * 100 + 100, 0, 255).astype("uint8"),
    "dndmi": np.where(cloud_pre, 0, np.clip((ndmi_jul - ndmi_abr) * 100 + 100, 1, 255)).astype("uint8"),
    "recov": np.where(cloud_c, 255, recov).astype("uint8"),
    "ceam": ceam,
    "pn": in_pn.astype("uint8"),
    "mun": mun,
}
# redondeo de las capas continuas: solo se muestran en la ficha o colorean rampas, y así gzip comprime
# mucho mejor (Bejís 4,5 → 2,8 MB). Paso en unidades codificadas: pendiente 5 %, altitud 10 m,
# dNBR y NDVI previo 0,05, NDVI después/ahora y NDMI 0,02 (colorean capas del mapa), cobertura 5 %.
QUANT = {"slope": (5, 0), "elev": (2, 0), "dnbr": (5, 100), "ndvi_b": (5, 100), "ndvi_a": (2, 100),
         "ndvi_n": (2, 100), "dndmi": (2, 100), "recov": (5, 0)}
for k, (step, off) in QUANT.items():
    a = layers[k]
    keep = (a == 255) if k == "recov" else (a == 0) if k == "dndmi" else np.zeros(a.shape, bool)  # sin dato
    r = np.round((a.astype(int) - off) / step) * step + off
    r = np.clip(r, 1 if k == "dndmi" else 0, 254 if k == "recov" else 255).astype("uint8")
    layers[k] = np.where(keep, a, r)
order = list(layers)
# comprimida con gzip: GitHub Pages no comprime los .bin al servirlos (18 MB → ~4,5 MB en Bejís)
with gzip.GzipFile(os.path.join(OUT, "grid.bin.gz"), "wb", compresslevel=9, mtime=0) as f:
    for k in order:
        f.write(np.ascontiguousarray(layers[k]).tobytes())

meta = {
    "width": W, "height": H, "bounds": BOUNDS, "pixel_ha": PIX_HA, "ground_m": GROUND,
    "layers": order,
    "municipios": list(muni.nom_mun),
    "legends": {"ceam": CEAM, "owner": OWNER, "veg": VEG, "sub": GEO, "pot": POT, "act": ACT, "eros": EROS, "feas": FEAS},
    "stats": stats,
}
with open(os.path.join(OUT, "meta.json"), "w") as f:
    json.dump(meta, f, ensure_ascii=False, indent=1)


def drop_small(geom, min_ha):
    """Quita partes y huecos de menos de min_ha (área medida en EPSG:25830)."""
    to_m = gpd.GeoSeries([geom], crs=4326).to_crs(25830).iloc[0]
    polys = getattr(to_m, "geoms", [to_m])
    keep = [Polygon(p.exterior, [h for h in p.interiors if Polygon(h).area >= min_ha * 1e4])
            for p in polys if p.area >= min_ha * 1e4]
    return gpd.GeoSeries([MultiPolygon(keep)], crs=25830).to_crs(4326).iloc[0]


def save_geojson(gdf, name, cols, tol=0.00005):
    g = gdf[cols + ["geometry"]].copy()
    g["geometry"] = g.geometry.simplify(tol, preserve_topology=True)
    g.to_crs(4326).to_file(os.path.join(OUT, name), driver="GeoJSON", COORDINATE_PRECISION=5)


burnt_u = burnt.geometry.union_all()
if FIRE.get("perim_min_ha"):  # incendio muy grande: sin islas ni huecos diminutos, que solo pesan
    burnt_u = drop_small(burnt_u, FIRE["perim_min_ha"])
burnt_d = gpd.GeoDataFrame(geometry=[burnt_u], crs=4326)
save_geojson(burnt_d, "perimetro.geojson", [], tol=FIRE.get("perim_tol", 0.00002))
montes["owner_label"] = montes["owner"].map(OWNER)
save_geojson(montes, "montes.geojson", ["denominacion", "num_up", "municipio", "owner", "owner_label", "hectareas"])
save_geojson(pn, "parque_natural.geojson", ["nombre", "hect_ofi", "legislacio"], tol=0.0002)
muni["ha_quemadas"] = [ha(inside & (mun == k)) for k in range(1, len(muni) + 1)]
save_geojson(muni, "municipios.geojson", ["nom_mun", "comarca", "area_ha", "ha_quemadas"], tol=0.0001)
if FIRE_KEY != "espada":
    fd = fires.dissolve("anyo").reset_index()
    save_geojson(fd, "incendios_previos.geojson", ["anyo"], tol=0.0001)
    gpd.GeoDataFrame({"nombre": []}, geometry=[], crs=4326).to_file(os.path.join(OUT, "ceam_zonas.geojson"), driver="GeoJSON")
    log("Listo:", json.dumps({k: stats[k] for k in ("ems_ha", "grid_ha", "forest_ha", "public_ha", "pn_ha")}))
    sys.exit()
# Parajes citados por la Fundación CEAM (coordenadas del Nomenclátor Geográfico del IGN vía
# CartoCiudad). El Puntal de Nules es el Pic de la Font de Cabres (639 m).
from shapely.geometry import Point
ceam_pts = [
    ("Puntal de Nules", "mayor", "Pic de la Font de Cabres (639 m), Nules", -0.224488, 39.862488, False),
    ("Umbría de Artana", "mayor", "La Umbría (vertientes), Artana", -0.263978, 39.873718, False),
    ("El Solaig", "mayor", "Solaig (vértice geodésico), Betxí", -0.205475, 39.908120, False),
    ("Penyes Aragoneses → Betxí", "menor", "Peñas Aragonesas (montaña), Artana; el CEAM sitúa la menor severidad al este, hacia Betxí", -0.240296, 39.922729, False),
]
pend = [k + 1 for k, n in enumerate(muni.nom_mun) if n in ("Onda", "Tales", "Alcudia de Veo", "Aín")]
rr, cc = np.nonzero(inside & np.isin(mun, pend))
px, py = T * (cc.mean() + 0.5, rr.mean() + 0.5)
pend_ll = gpd.GeoSeries([Point(px, py)], crs=3857).to_crs(4326).iloc[0]
ceam_pts.append(("Onda – Tales – l'Alcúdia – Aín", "pendiente", "Centro de lo quemado en esos cuatro municipios; el CEAM no pudo evaluarla por las nubes", pend_ll.x, pend_ll.y, False))


def sev_near(lon, lat, r_m=500):
    p = gpd.GeoSeries([Point(lon, lat)], crs=4326).to_crs(3857).iloc[0]
    col, row = ~T * (p.x, p.y)
    rad = r_m * K / RES
    yy, xx = np.ogrid[:H, :W]
    m = ((xx - col) ** 2 + (yy - row) ** 2 <= rad ** 2) & inside & (sev > 0)
    return round(float(dnbr[m].mean()), 2) if m.any() else None


cz = gpd.GeoDataFrame(
    [{"nombre": n, "ceam": c, "ubicacion": u, "aprox": a, "dnbr_500m": sev_near(x, y)} for n, c, u, x, y, a in ceam_pts],
    geometry=[Point(x, y) for *_, x, y, _ in ceam_pts], crs=4326)
cz.to_file(os.path.join(OUT, "ceam_zonas.geojson"), driver="GeoJSON")
fd = fires.dissolve("anyo").reset_index()
save_geojson(fd, "incendios_previos.geojson", ["anyo"], tol=0.0001)

log("Listo:", json.dumps({k: stats[k] for k in ("ems_ha", "grid_ha", "forest_ha", "public_ha", "pn_ha")}))
