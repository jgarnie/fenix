"""
Pipeline de datos: Incendio de la Vall d'Uixó / Serra d'Espadà (25 jul 2026).

Descarga datos oficiales y abiertos, los cruza en una rejilla común (EPSG:3857, ~25 m)
y genera los ficheros que consume la app web en public/data/.

Fuentes:
  - Copernicus EMS Rapid Mapping EMSR905 (perímetro del área quemada, producto GRA v2)
  - Sentinel-2 L2A (Element84 Earth Search, COGs públicos en AWS)
  - Copernicus DEM GLO-30
  - Generalitat Valenciana / ICV: montes gestionados (utilidad pública), Mapa Forestal
    de España 1:50.000, Parque Natural, incendios históricos 1993-2024
  - IGME: mapa geológico continuo GEODE 1:50.000

Uso:  python3 scripts/build_data.py
"""
import io
import json
import math
import os
import sys
import urllib.parse
import urllib.request
import zipfile

import geopandas as gpd
import numpy as np
import rasterio
from PIL import Image
from rasterio.enums import Resampling
from rasterio.features import rasterize
from rasterio.transform import from_origin
from rasterio.vrt import WarpedVRT

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "data-raw")
OUT = os.path.join(ROOT, "public", "data")
os.makedirs(RAW, exist_ok=True)
os.makedirs(OUT, exist_ok=True)

os.environ.setdefault("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR")
os.environ.setdefault("AWS_NO_SIGN_REQUEST", "YES")

FETCH_BBOX = "-0.42,39.76,-0.10,40.02"  # lon/lat, generoso alrededor del incendio
EMS_GRA = "https://rapidmapping.emergency.copernicus.eu/backend/EMSR905/AOI01/GRA_PRODUCT/EMSR905_AOI01_GRA_PRODUCT_v2.zip"
GVA = "https://carto.icv.gva.es/arcgis/rest/services/tm_medio_ambiente/"
IGME = "https://mapas.igme.es/gis/rest/services/Cartografia_Geologica/IGME_Geode_50/MapServer/8/query"
STAC = "https://earth-search.aws.element84.com/v1/collections/sentinel-2-l2a/items/"
MUNI = "https://carto.icv.gva.es/arcgis/rest/services/0105_delimitaciones/0105_Delimitaciones/MapServer/0/query"
DEM = "https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_N39_00_W001_00_DEM/Copernicus_DSM_COG_10_N39_00_W001_00_DEM.tif"

SCENES = {
    "abril": "S2B_30TYK_20260404_0_L2A",   # primavera, misma órbita que "antes" (sequedad previa, como el CEAM)
    "antes": "S2B_30TYK_20260703_0_L2A",   # 3 semanas antes, sin nubes ni calima
    "despues": "S2A_30TYK_20260819_1_L2A",  # 18 días tras la estabilización, sin nubes
    "ahora": "S2A_30TYK_20260908_1_L2A",    # última escena con 0 % de nubes sobre el perímetro
}


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
    with urllib.request.urlopen(EMS_GRA, timeout=300) as r:
        z = zipfile.ZipFile(io.BytesIO(r.read()))
    with open(path, "wb") as f:
        f.write(z.read("EMSR905_AOI01_GRA_PRODUCT_observedEventA_v2.json"))


def read_gdf(name, producer):
    g = gpd.read_file(cached(name, producer))
    if g.crs is None:
        g = g.set_crs(4326)
    return g


# ----------------------------------------------------------------------------- rejilla
log("1/7 Perímetro Copernicus EMSR905")
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

IMG_GROUND = 10.0
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
log("2/7 Sentinel-2 (antes / después / ahora)")


def read_band(href, transform, width, height, resampling=Resampling.bilinear):
    with rasterio.open(href) as src:
        with WarpedVRT(src, crs="EPSG:3857", transform=transform, width=width, height=height,
                       resampling=resampling) as vrt:
            return vrt.read(1).astype("float32")


scenes = {}
for key, sid in SCENES.items():
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
    rgb = np.dstack([refl(b, IT, IW, IH) for b in ("red", "green", "blue")])
    rgb8 = np.clip((np.clip(rgb, 0, None) / 0.22) ** (1 / 1.6) * 255, 0, 255).astype("uint8")
    Image.fromarray(rgb8).save(os.path.join(OUT, f"s2_{key}.jpg"), quality=86)
    # falso color SWIR (B12-B8-B4): la cicatriz del fuego se ve en rojo/marrón
    fc = np.dstack([refl("swir22", IT, IW, IH), refl("nir", IT, IW, IH), refl("red", IT, IW, IH)])
    fc8 = np.clip((np.clip(fc, 0, None) / np.array([0.45, 0.45, 0.25])) ** (1 / 1.4) * 255, 0, 255).astype("uint8")
    Image.fromarray(fc8).save(os.path.join(OUT, f"s2_{key}_swir.jpg"), quality=86)
    scenes[key] = s
    log(f"   {key}: {sid} ({s['date']})")


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
log("4/7 Capas GVA / IGME")
montes = read_gdf("gva_montes.geojson", arcgis_query(GVA + "forestal/MapServer/25/query"))
mfe = read_gdf("gva_mfe50.geojson", arcgis_query(GVA + "forestal/MapServer/41/query"))
pn = read_gdf("gva_parque_natural.geojson", arcgis_query(GVA + "espacios_protegidos/MapServer/10/query"))
muni = read_gdf("icv_municipios.geojson", arcgis_query(MUNI, "cod_ine_mun,nom_mun,comarca,area_ha", paginate=False)).reset_index(drop=True)
geo = read_gdf("igme_geode50.geojson", arcgis_query(IGME, "CODE_UNIO,DESC_UNIT,NAME_EDA1,NAME_EDA2"))
fire_layers = {1993 + i: 1 + i for i in range(28)}
fire_layers.update({2021: 101, 2022: 102, 2023: 120, 2024: 121})
fires = []
for y, lid in fire_layers.items():
    g = read_gdf(f"gva_incendios_{y}.geojson", arcgis_query(GVA + f"prevencion_de_incendios/MapServer/{lid}/query"))
    if len(g):
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
# primero los públicos, luego los enclavados encima
mo = montes.sort_values("owner", key=lambda s: s == 4)
owner = burn(mo, mo["owner"])

# --- vegetación antes del incendio (MFE50)
VEG = {0: "Sin datos", 1: "Alcornocal", 2: "Pinar de rodeno (P. pinaster)", 3: "Pinar de pino carrasco",
       4: "Bosque mixto pino + frondosas", 5: "Encinar, quejigar y frondosas", 6: "Algarrobal / acebuchal",
       7: "Bosque de ribera", 8: "Matorral", 9: "Pastizal-matorral", 10: "Agrícola",
       11: "Artificial / minería", 12: "Agua / humedal", 13: "Otros arbolados"}


def veg_code(r):
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
    if "ribere" in e.lower() or "Riberas" in t: return 7
    return 13


mfe["veg"] = mfe.apply(veg_code, axis=1)
veg = burn(mfe, mfe["veg"])

# --- sustrato (IGME)
GEO = {0: "Sin datos", 1: "Silíceo (areniscas del rodeno)", 2: "Calizo / dolomítico",
       3: "Arcillas y yesos (Keuper)", 4: "Fondo de valle / rambla", 5: "Depósitos cuaternarios de ladera"}


def geo_code(d):
    d = d.lower() if isinstance(d, str) else ""
    if "masa" in d and "agua" in d: return 0
    if "fondos de valle" in d or "rambla" in d or "aluvial" in d: return 4
    if "yeso" in d: return 3
    if any(k in d for k in ("coluvi", "glacis", "abanico", "terraza", "conos", "playa", "albufera", "cordón")): return 5
    if any(k in d for k in ("arenisc", "argilit", "pizarra", "cuarc", "arenas y cantos")) and "calizas" not in d: return 1
    return 2


geo["sub"] = geo["DESC_UNIT"].map(geo_code)
sub = burn(geo, geo["sub"])

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

POT = {0: "—", 1: "Alcornocal (Asplenio onopteridis–Querco suberis S.)",
       2: "Carrascal silicícola de montaña",
       3: "Carrascal con quejigo (Rubio longifoliae–Querco rotundifoliae S.)",
       4: "Lentiscar-coscojar con carrasca, algarrobo y acebuche (termomediterráneo)",
       5: "Carrascal-coscojar sobre arcillas y yesos",
       6: "Vegetación de ribera (sauceda, chopera, adelfar)",
       7: "Uso no forestal (agrícola, urbano, agua)"}
pot = np.zeros((H, W), "uint8")
pot[(eff_sub == 1) & (elev < 950)] = 1
pot[(eff_sub == 1) & (elev >= 950)] = 2
pot[(eff_sub == 2) & ((elev >= 350) | north)] = 3
pot[(eff_sub == 2) & (elev < 350) & ~north] = 4
pot[eff_sub == 3] = 5
pot[(eff_sub == 4) | (veg == 7)] = 6
pot[np.isin(veg, [10, 11, 12])] = 7

RESPROUTER = np.isin(veg, [1, 5, 6, 7, 8, 9])  # rebrotan de cepa/raíz/yemas tras el fuego
PINE = np.isin(veg, [2, 3, 4, 13])
forest = ~np.isin(veg, [0, 10, 11, 12])
burned = inside & (sev >= 2)
recent_fire = last_fire >= 2011  # pinar inmaduro: <15 años, sin piñas serótinas suficientes
cloud_now = np.isin(scenes["ahora"]["scl"], [3, 8, 9, 10])
regrowth = ((ndvi_n - ndvi_a) > 0.05) & ~cloud_now

# Criterio de la Fundación CEAM para decidir dónde plantar: recuperación de la cubierta
# vegetal respecto a la previa (>60 % no plantar, 30-60 % plantación selectiva,
# <30 % reforestar). Aproximación con NDVI: (NDVI ahora - suelo quemado) / (NDVI antes -
# suelo quemado), donde el suelo quemado es la mediana del NDVI tras el fuego en severidad alta.
soil_ndvi = float(np.median(ndvi_a[inside & (sev >= 4)]))
recov = np.clip((ndvi_n - soil_ndvi) / np.maximum(ndvi_b - soil_ndvi, 0.05), 0, 1.5) * 100
CEAM = {0: "—", 1: "<30 %: reforestar", 2: "30–60 %: plantación selectiva", 3: ">60 %: no plantar"}
ceam = np.zeros((H, W), "uint8")
ceam_ok = inside & forest & (sev >= 2) & ~cloud_now
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
# pinar sobre rodeno donde la potencial es el alcornocal, matorral muy recurrente o
# afección alta repetida: hay que reintroducir las especies de la vegetación potencial
active = burned & forest & (
    (PINE & np.isin(pot, [1, 2]) & (sev >= 4)) |
    (np.isin(veg, [8, 9]) & (recur >= 2)) |
    ((sev >= 5) & (recur >= 2))
)
act[active] = 3
act[inside & np.isin(veg, [10]) & (sev >= 2)] = 4

# Viabilidad de alcanzar la vegetación potencial (0-100) en un horizonte de ~30 años
same = (((veg == 1) & np.isin(pot, [1, 2])) | ((veg == 5) & np.isin(pot, [2, 3, 4, 5])) |
        ((veg == 7) & (pot == 6)) | ((veg == 6) & (pot == 4)))
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
    "ems_ha": round(float(burnt.to_crs(25830).area.sum() / 1e4), 1),
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
    "ceam": {CEAM[k]: {"total": ha(ceam == k), "publico": ha((ceam == k) & np.isin(owner, [1, 2, 3]))} for k in (1, 2, 3)},
    "sequedad": {
        # cambio relativo de la media dentro del área quemada, abril -> julio (como el CEAM)
        "ndmi_abril": round(float(ndmi_abr[inside & ~cloud_pre].mean()), 3),
        "ndmi_julio": round(float(ndmi_jul[inside & ~cloud_pre].mean()), 3),
        "ndvi_abril": round(float(ndvi_abr[inside & ~cloud_pre].mean()), 3),
        "ndvi_julio": round(float(ndvi_b[inside & ~cloud_pre].mean()), 3),
    },
    "scenes": {k: v["date"] for k, v in scenes.items()},
}
for k, lab in ACT.items():
    if not k:
        continue
    m = inside & (act == k)
    stats["actions"][lab] = {"total": ha(m), "publico": ha(m & public), "privado": ha(m & ~public),
                             "erosion_alta": ha(m & (eros >= 3))}
stats["erosion_public"] = {EROS[k]: ha(inside & public & (eros == k)) for k in (3, 4)}
# vegetación antes vs potencial (matriz) dentro del área forestal quemada
stats["veg_vs_pot"] = {VEG[v]: {POT[p]: ha(valid & (veg == v) & (pot == p)) for p in range(1, 7)
                                if ha(valid & (veg == v) & (pot == p)) > 0}
                       for v in range(1, 14) if ha(valid & (veg == v)) > 0}

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
    "recov": np.where(cloud_now, 255, np.clip(recov, 0, 150)).astype("uint8"),
    "ceam": ceam,
    "pn": in_pn.astype("uint8"),
    "mun": mun,
}
order = list(layers)
with open(os.path.join(OUT, "grid.bin"), "wb") as f:
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


def save_geojson(gdf, name, cols, tol=0.00005):
    g = gdf[cols + ["geometry"]].copy()
    g["geometry"] = g.geometry.simplify(tol, preserve_topology=True)
    g.to_crs(4326).to_file(os.path.join(OUT, name), driver="GeoJSON", COORDINATE_PRECISION=5)


burnt_d = gpd.GeoDataFrame(geometry=[burnt.geometry.union_all()], crs=4326)
save_geojson(burnt_d, "perimetro.geojson", [], tol=0.00002)
montes["owner_label"] = montes["owner"].map(OWNER)
save_geojson(montes, "montes.geojson", ["denominacion", "num_up", "municipio", "owner", "owner_label", "hectareas"])
save_geojson(pn, "parque_natural.geojson", ["nombre", "hect_ofi", "legislacio"], tol=0.0002)
muni["ha_quemadas"] = [ha(inside & (mun == k)) for k in range(1, len(muni) + 1)]
save_geojson(muni, "municipios.geojson", ["nom_mun", "comarca", "area_ha", "ha_quemadas"], tol=0.0001)
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
