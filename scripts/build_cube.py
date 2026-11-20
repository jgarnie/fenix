"""Tabla de superficies de cada incendio → public/api/<slug>.superficies.json (consultas libres del MCP y de la API REST).

Ejecutar después de build_data.py (y de build_api.mjs, de donde toma el nombre del espacio protegido):
    python3 scripts/build_cube.py [slug ...]

Cuenta los píxeles de 25 m dentro del área quemada (inside == 1) por cada combinación de:
municipio, severidad, propiedad, vegetación antes, sustrato, serie potencial, actuación, erosión, espacio protegido,
año del incendio anterior (capa last) y cobertura según el criterio CEAM. Son unas 2.000–9.000 combinaciones por incendio,
así que el servidor remoto (Cloudflare Worker gratuito, 10 ms de CPU) puede filtrar y agrupar la tabla entera en cada
consulta sin recorrer la rejilla. Formato columnar: una lista de códigos por dimensión y la lista de píxeles de cada fila.
"""
import gzip
import json
import os
import sys

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUB = os.path.join(ROOT, "public")
FIRES = {"espada": "", "bejis": "bejis", "tietar": "tietar", "villanueva-de-viver": "villanueva-de-viver"}
SEV = {"1": "No quemado", "2": "Baja", "3": "Moderada-baja", "4": "Moderada-alta", "5": "Alta"}
# (clave en la tabla, capa de la rejilla)
DIMS = [("municipio", "mun"), ("severidad", "sev"), ("propiedad", "owner"), ("vegetacion_antes", "veg"),
        ("sustrato", "sub"), ("serie_potencial", "pot"), ("actuacion", "act"), ("erosion", "eros"),
        ("espacio_protegido", "pn"), ("incendio_previo", "last"), ("cobertura_ceam", "ceam")]


def build(slug):
    d = os.path.join(PUB, FIRES[slug], "data")
    meta = json.load(open(os.path.join(d, "meta.json")))
    N = meta["width"] * meta["height"]
    b = np.frombuffer(gzip.open(os.path.join(d, "grid.bin.gz")).read(), np.uint8)
    G = {k: b[i * N:(i + 1) * N] for i, k in enumerate(meta["layers"])}
    L, S = meta["legends"], meta["stats"]
    api = json.load(open(os.path.join(PUB, "api", f"{slug}.json")))
    pn_name = (api.get("parque_natural") or {}).get("nombre")

    ins = G["inside"] == 1
    A = np.stack([G[layer][ins] for _, layer in DIMS], 1)
    rows, counts = np.unique(A, axis=0, return_counts=True)

    def labels(key, layer, vals):
        if key == "municipio":
            return {str(v): (meta["municipios"][v - 1] if v else "Sin datos") for v in vals}
        if key == "severidad":
            return {str(v): SEV.get(str(v), "Sin datos") for v in vals}
        if key == "espacio_protegido":
            return {str(v): (f"Dentro: {pn_name}" if v and pn_name else "Dentro" if v else "Fuera") for v in vals}
        if key == "incendio_previo":
            return {str(v): (str(1900 + v) if v else "Ninguno") for v in vals}
        leg = L.get(layer, {})
        return {str(v): leg.get(str(v), "Sin datos") for v in vals}

    dims = []
    for j, (key, layer) in enumerate(DIMS):
        vals = sorted(set(int(x) for x in rows[:, j]))
        dims.append({"clave": key, "valores": labels(key, layer, vals)})
    out = {
        "slug": slug,
        "nombre": api.get("subtitulo"),
        "pixel_ha": meta["pixel_ha"],
        "ano_incendio": int(S.get("fire_year") or 0),
        "superficie_quemada_ha": round(float(ins.sum() * meta["pixel_ha"]), 1),
        "fecha_cobertura_ceam": S["scenes"].get(S.get("ceam_scene") or "ahora"),
        "fechas": {"despues": S["scenes"]["despues"], "ultima_imagen": S["scenes"]["ahora"]},
        "no_forestal_vegetacion": [0, 10, 11, 12],
        "propiedad_publica": [1, 2, 3],
        "dimensiones": dims,
        "filas": {key: rows[:, j].astype(int).tolist() for j, (key, _) in enumerate(DIMS)},
        "pixeles": counts.astype(int).tolist(),
        "nota": "Superficie vista quemada por satélite (perímetro Copernicus EMS) a 25 m; capas de Fénix (elaboración propia sobre "
                "Mapa Forestal, catálogos de montes, IGME, Rivas-Martínez y Sentinel-2). Orientativo: comprobar en campo.",
    }
    path = os.path.join(PUB, "api", f"{slug}.superficies.json")
    with open(path, "w") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"{slug}: {len(counts)} filas, {os.path.getsize(path) / 1024:.0f} KB")


if __name__ == "__main__":
    for s in sys.argv[1:] or list(FIRES):
        build(s)
