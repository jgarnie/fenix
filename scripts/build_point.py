"""Rejilla troceada para consultas por punto (servidor MCP remoto, mcp/worker).

Un Worker de Cloudflare (plan gratuito: 10 ms de CPU y 128 MB por petición) no puede descomprimir grid.bin.gz entero
(Tiétar: 13 MB comprimidos, 82 MB sin comprimir) ni leer montes.geojson en cada consulta. Este script reparte la misma
rejilla en teselas de 64×64 píxeles, cada una comprimida con gzip por separado y concatenadas en data/point.bin.gz.
data/point.json guarda dónde empieza cada tesela, así el Worker pide solo la suya con una petición HTTP Range
(GitHub Pages las admite) y descomprime unos pocos KB.

Además añade dos capas uint16 que sustituyen a la búsqueda punto-en-polígono:
  - monte:   índice (1..n) en point.json["montes"] (propiedades de montes.geojson; si se solapan, el primero, como el visor)
  - previos: índice (1..n) en point.json["previos"] (lista de años de incendios_previos.geojson que contienen el píxel)
La rasterización es por centro de píxel (25 m): en el borde de un polígono puede diferir de la consulta exacta.

Contenido de cada tesela (sin comprimir), capa a capa: las capas de meta.json (uint8, w*h bytes cada una) y después
monte y previos (uint16 little-endian, 2*w*h bytes cada una), con w×h el tamaño real de la tesela (menor en los bordes).

Uso: python3 scripts/build_point.py [espada|bejis|tietar|villanueva-de-viver ...]   (sin argumentos: todos)
Ejecutar después de build_data.py. Los ficheros se publican con publish_data.sh junto con el resto de data/.
"""
import gzip
import json
import math
import os
import sys

import geopandas as gpd
import numpy as np
from rasterio.features import rasterize
from rasterio.transform import from_origin

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIRS = {"espada": "public/data", "bejis": "public/bejis/data", "tietar": "public/tietar/data",
        "villanueva-de-viver": "public/villanueva-de-viver/data"}
TILE = 64
R = 6378137.0


def merc(lat, lon):
    return R * math.radians(lon), R * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))


def read_geo(path):
    if not os.path.exists(path):
        return gpd.GeoDataFrame(geometry=[], crs=4326)
    with open(path) as f:
        fc = json.load(f)
    if not fc.get("features"):
        return gpd.GeoDataFrame(geometry=[], crs=4326)
    return gpd.GeoDataFrame.from_features(fc["features"], crs=4326)


def build(key):
    d = os.path.join(ROOT, DIRS[key])
    meta = json.load(open(os.path.join(d, "meta.json")))
    W, H, layers = meta["width"], meta["height"], meta["layers"]
    N = W * H
    with gzip.open(os.path.join(d, "grid.bin.gz")) as f:
        buf = np.frombuffer(f.read(), dtype=np.uint8)
    assert buf.size == N * len(layers), "grid.bin.gz no cuadra con meta.json"
    grid = buf.reshape(len(layers), H, W)

    # misma georreferencia que build_data.py: origen arriba a la izquierda en EPSG:3857
    (s, w), (n, e) = meta["bounds"]
    minx, miny = merc(s, w)
    maxx, maxy = merc(n, e)
    T = from_origin(minx, maxy, (maxx - minx) / W, (maxy - miny) / H)

    # montes: índice del primer monte que contiene el píxel (se pinta en orden inverso para que gane el primero)
    montes = read_geo(os.path.join(d, "montes.geojson"))
    monte = np.zeros((H, W), np.uint16)
    props = []
    if len(montes):
        keep = ["denominacion", "num_up", "municipio"]
        props = [{k: r.get(k) for k in keep if r.get(k) not in (None, "")} for _, r in montes.iterrows()]
        m3857 = montes.to_crs(3857)
        shapes = [(g, i + 1) for i, g in enumerate(m3857.geometry) if g is not None and not g.is_empty][::-1]
        if shapes:
            monte = rasterize(shapes, out_shape=(H, W), transform=T, fill=0, dtype="uint16")

    # incendios previos: combinación de años por píxel
    prev = read_geo(os.path.join(d, "incendios_previos.geojson"))
    combo = np.zeros((H, W), np.int64)          # id de combinación provisional
    combos = {(): 0}
    keys = [()]
    if len(prev):
        p3857 = prev.to_crs(3857)
        for g, year in zip(p3857.geometry, prev["anyo"]):
            if g is None or g.is_empty:
                continue
            mask = rasterize([(g, 1)], out_shape=(H, W), transform=T, fill=0, dtype="uint8").astype(bool)
            if not mask.any():
                continue
            old = np.unique(combo[mask])
            remap = {}
            for o in old:
                k = tuple(sorted(keys[o] + (int(year),)))
                if k not in combos:
                    combos[k] = len(keys)
                    keys.append(k)
                remap[o] = combos[k]
            lut = np.arange(len(keys), dtype=np.int64)
            for o, nid in remap.items():
                lut[o] = nid
            combo[mask] = lut[combo[mask]]
    # renumerar solo las combinaciones usadas
    used = np.unique(combo)
    used = used[used != 0]
    lut = np.zeros(len(keys), np.uint16)
    previos = []
    for j, u in enumerate(used):
        lut[u] = j + 1
        previos.append(list(keys[u]))
    assert len(previos) < 65535 and len(props) < 65535
    previos_l = lut[combo]

    tw, th = math.ceil(W / TILE), math.ceil(H / TILE)
    offsets = [0]
    out = bytearray()
    for ty in range(th):
        for tx in range(tw):
            y0, x0 = ty * TILE, tx * TILE
            sl = (slice(y0, min(y0 + TILE, H)), slice(x0, min(x0 + TILE, W)))
            raw = grid[:, sl[0], sl[1]].tobytes() + monte[sl].astype("<u2").tobytes() + previos_l[sl].astype("<u2").tobytes()
            out += gzip.compress(raw, compresslevel=9, mtime=0)
            offsets.append(len(out))
    with open(os.path.join(d, "point.bin.gz"), "wb") as f:
        f.write(out)
    idx = {"v": 1, "tile": TILE, "width": W, "height": H, "bounds": meta["bounds"], "tiles_x": tw, "tiles_y": th,
           "layers": layers, "extra": ["monte", "previos"], "offsets": offsets, "montes": props, "previos": previos}
    with open(os.path.join(d, "point.json"), "w") as f:
        json.dump(idx, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{key}: {tw}×{th} teselas, point.bin.gz {len(out) / 1e6:.1f} MB (máx. tesela {max(np.diff(offsets)) / 1e3:.0f} KB), "
          f"point.json {os.path.getsize(os.path.join(d, 'point.json')) / 1e3:.0f} KB, {len(props)} montes, {len(previos)} combinaciones de incendios previos")


if __name__ == "__main__":
    for k in sys.argv[1:] or list(DIRS):
        build(k)
