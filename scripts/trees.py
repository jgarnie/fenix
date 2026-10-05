"""
Estimación del número de árboles quemados a partir del Tercer Inventario Forestal
Nacional (IFN3, Castellón, trabajo de campo 2006).

Requiere haber ejecutado antes scripts/build_data.py (usa public/data/grid.bin y meta.json).
Escribe public/data/arboles.json y añade el resumen a meta.json.

Método:
  1. Parcelas IFN3 de Castellón (malla de 1 km) que caen dentro del área quemada.
  2. Árboles por hectárea de cada parcela: pies mayores (diámetro >= 7,5 cm) de
     Parcelas_exs, separados en coníferas y frondosas.
  3. Estimación estratificada por la vegetación previa (Mapa Forestal): densidad media de
     las parcelas de cada clase × hectáreas quemadas de esa clase. Si una clase tiene
     menos de 3 parcelas dentro, se completan con las parcelas más cercanas de esa clase.
     En matorral y pastizal sin parcelas suficientes se cuentan 0 árboles.
  4. Mortalidad según la severidad (dNBR) en cada parcela: las coníferas no rebrotan;
     las frondosas (alcornoque, carrasca...) suelen rebrotar aunque ardan.
  5. Intervalo del 90 % por remuestreo (bootstrap) de las parcelas.

Uso:  python3 scripts/trees.py
"""
import io
import json
import os
import urllib.request
import zipfile

import numpy as np
import pandas as pd
from access_parser import AccessParser
from pyproj import Transformer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "data-raw", "ifn3")
OUT = os.path.join(ROOT, "public", "data")
IFN = "https://www.miteco.gob.es/content/dam/miteco/es/biodiversidad/servicios/banco-datos-naturaleza/"
os.makedirs(RAW, exist_ok=True)

for z, f in (("Sig_12.zip", "Sig_12.accdb"), ("Ifn3p12.zip", "Ifn3p12.accdb")):
    if not os.path.exists(os.path.join(RAW, f)):
        req = urllib.request.Request(IFN + z, headers={"User-Agent": "Mozilla/5.0"})
        zipfile.ZipFile(io.BytesIO(urllib.request.urlopen(req, timeout=300).read())).extractall(RAW)

campo = AccessParser(os.path.join(RAW, "Ifn3p12.accdb"))
sig = AccessParser(os.path.join(RAW, "Sig_12.accdb"))
plots = pd.DataFrame(campo.parse_table("PCDatosMap"))[["Estadillo", "CoorX", "CoorY"]].drop_duplicates("Estadillo")
plots[["CoorX", "CoorY"]] = plots[["CoorX", "CoorY"]].astype(float)
exs = pd.DataFrame(sig.parse_table("Parcelas_exs"))
exs["NPies"] = exs["NPies"].astype(float)
# códigos IFN: 2x-3x coníferas (pinos, sabinas, enebros...), 4x en adelante frondosas
exs["conifera"] = exs["Especie"].astype(int) < 40
dens = exs.groupby(["Estadillo", "conifera"])["NPies"].sum().unstack(fill_value=0)
dens.columns = ["frondosas" if not c else "coniferas" for c in dens.columns]
plots = plots.merge(dens, left_on="Estadillo", right_index=True, how="left").fillna({"coniferas": 0, "frondosas": 0})

# --- rejilla del análisis
meta = json.load(open(os.path.join(OUT, "meta.json")))
W, H = meta["width"], meta["height"]
raw = np.fromfile(os.path.join(OUT, "grid.bin"), dtype="uint8")
G = {k: raw[i * W * H:(i + 1) * W * H].reshape(H, W) for i, k in enumerate(meta["layers"])}
(s, w), (n, e) = meta["bounds"]
to_m = Transformer.from_crs(4326, 3857, always_xy=True)
x0, y0 = to_m.transform(w, s)
x1, y1 = to_m.transform(e, n)
# coordenadas IFN3: UTM huso 30, ED50
ed50 = Transformer.from_crs(23030, 3857, always_xy=True)
px, py = ed50.transform(plots.CoorX.values, plots.CoorY.values)
plots["col"] = ((px - x0) / (x1 - x0) * W).astype(int)
plots["row"] = ((y1 - py) / (y1 - y0) * H).astype(int)
plots["dist_km"] = np.hypot(px - (x0 + x1) / 2, py - (y0 + y1) / 2) / 1000 * np.cos(np.radians((s + n) / 2))
ok = plots.col.between(0, W - 1) & plots.row.between(0, H - 1)
plots = plots[ok].copy()
for k in ("inside", "veg", "sev"):
    plots[k] = G[k][plots.row, plots.col]

FOREST_VEG = [1, 2, 3, 4, 5, 6, 7, 8, 9, 13]
inside, veg, sev = G["inside"] == 1, G["veg"], G["sev"]
area = {v: float(((veg == v) & inside).sum()) * meta["pixel_ha"] for v in FOREST_VEG}

# fracción de pies muertos según severidad (coníferas: no rebrotan)
MORT_CON = {0: 0.5, 1: 0.0, 2: 0.1, 3: 0.5, 4: 0.9, 5: 1.0}
# frondosas: mueren pocas, la mayoría rebrota de cepa o de yemas protegidas por el corcho
MORT_FRO = {0: 0.1, 1: 0.0, 2: 0.0, 3: 0.05, 4: 0.15, 5: 0.25}

# severidad media de cada clase dentro del área quemada → fracción de muertos por clase
def mort_by_class(table):
    out = {}
    for v in FOREST_VEG:
        m = (veg == v) & inside
        if not m.any():
            continue
        sv = sev[m]
        out[v] = float(np.mean([table[int(x)] for x in sv]))
    return out


mcon, mfro = mort_by_class(MORT_CON), mort_by_class(MORT_FRO)

ins = plots[plots.inside == 1]
pool = {}
for v in FOREST_VEG:
    p = ins[ins.veg == v]
    if v in (8, 9) and len(p) < 3:
        # el IFN solo mide terreno arbolado: en matorral y pastizal no se cuentan árboles
        # dispersos salvo que haya parcelas suficientes dentro (estimación conservadora)
        p = p.iloc[0:0]
    elif len(p) < 3:  # completar con parcelas cercanas de la misma clase
        near = plots[(plots.veg == v) & (plots.inside == 0)].sort_values("dist_km")
        p = pd.concat([p, near.head(3 - len(p) + 5)])
    pool[v] = p


def estimate(sample):
    tot = {"coniferas": 0.0, "frondosas": 0.0, "muertos_con": 0.0, "muertos_fro": 0.0}
    for v, p in sample.items():
        if area.get(v, 0) == 0 or len(p) == 0:
            continue
        c, f = p.coniferas.mean() * area[v], p.frondosas.mean() * area[v]
        tot["coniferas"] += c
        tot["frondosas"] += f
        tot["muertos_con"] += c * mcon.get(v, 0)
        tot["muertos_fro"] += f * mfro.get(v, 0)
    tot["total"] = tot["coniferas"] + tot["frondosas"]
    tot["muertos"] = tot["muertos_con"] + tot["muertos_fro"]
    return tot


best = estimate(pool)
rng = np.random.default_rng(42)
boot = [estimate({v: p.sample(len(p), replace=True, random_state=int(rng.integers(1e9))) for v, p in pool.items()})
        for _ in range(500)]
ci = {k: [float(np.percentile([b[k] for b in boot], 5)), float(np.percentile([b[k] for b in boot], 95))] for k in best}

r = lambda x: int(round(x, -3))
result = {
    "total": r(best["total"]), "total_ci90": [r(x) for x in ci["total"]],
    "coniferas": r(best["coniferas"]), "frondosas": r(best["frondosas"]),
    "muertos": r(best["muertos"]), "muertos_ci90": [r(x) for x in ci["muertos"]],
    "muertos_coniferas": r(best["muertos_con"]), "muertos_frondosas": r(best["muertos_fro"]),
    "parcelas_dentro": int(len(ins)),
    "parcelas_usadas": int(sum(len(p) for v, p in pool.items() if area.get(v, 0) > 0)),
    "densidad_media_ha": round(float(ins[["coniferas", "frondosas"]].sum(axis=1).mean()), 0),
    "por_clase": {meta["legends"]["veg"][str(v)]: {
        "ha": round(area[v], 0), "parcelas": int(len(pool[v])),
        "pies_ha": round(float(pool[v][["coniferas", "frondosas"]].sum(axis=1).mean()), 0) if len(pool[v]) else 0,
        "arboles": r((pool[v][["coniferas", "frondosas"]].sum(axis=1).mean() if len(pool[v]) else 0) * area[v])}
        for v in FOREST_VEG if area.get(v, 0) > 0},
    "fuente": "IFN3 Castellón (MITECO, campo 2006), pies mayores con diámetro ≥ 7,5 cm",
}
json.dump(result, open(os.path.join(OUT, "arboles.json"), "w"), ensure_ascii=False, indent=1)
meta["stats"]["arboles"] = result
json.dump(meta, open(os.path.join(OUT, "meta.json"), "w"), ensure_ascii=False, indent=1)
print(json.dumps(result, ensure_ascii=False, indent=1))
