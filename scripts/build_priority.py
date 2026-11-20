"""Zonas prioritarias de cada incendio → public/api/<slug>.prioridades.json (para el MCP y la API REST).

Ejecutar después de build_data.py, trees.py, build_api.mjs y build_point.py:  python3 scripts/build_priority.py [slug ...]

Criterio según el tiempo transcurrido desde el incendio (fecha de la imagen "después" frente a la última imagen):
  - menos de 12 meses → "erosion": píxeles forestales quemados con riesgo de erosión alto o muy alto (eros ≥ 3).
    Lo urgente es estabilizar el suelo; aún no se sabe qué rebrotará.
  - 12 meses o más → "regeneracion": además, cobertura vegetal por debajo del 30 % (criterio CEAM, capa ceam == 1).
Las zonas son ventanas de 1 km × 1 km con más superficie que cumple el criterio, elegidas de mayor a menor sin solaparse.
Es un cálculo propio sobre las capas de Fénix: sirve para orientar una visita de campo, no para decidir sin ella.
"""
import gzip
import json
import math
import os
import sys
from collections import Counter
from datetime import date

import numpy as np
import shapely
from shapely.geometry import shape

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUB = os.path.join(ROOT, "public")
SITE = "https://jgarnie.github.io/fenix/"
FIRES = {"espada": "", "bejis": "bejis", "tietar": "tietar", "villanueva-de-viver": "villanueva-de-viver"}
R = 6378137.0
NO_FOREST = (0, 10, 11, 12)
PUBLIC = (1, 2, 3)
TOP, TOP_MUN, MIN_MUN_HA = 8, 2, 5.0
REB_YEARS = 15
# pinares que solo se regeneran por semilla (leyenda veg de build_data.py): rodeno/resinero, carrasco, mixto pino +
# frondosas, montaña (laricio/silvestre), piñonero y mezcla de pinos. El resto de lo forestal rebrota en buena parte.
PINAR = (2, 3, 4, 14, 16, 18)


def merc(lat, lon):
    return R * math.radians(lon), R * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))


def build(slug):
    d = os.path.join(PUB, FIRES[slug], "data")
    meta = json.load(open(os.path.join(d, "meta.json")))
    W, H, ph = meta["width"], meta["height"], meta["pixel_ha"]
    N = W * H
    raw = gzip.open(os.path.join(d, "grid.bin.gz")).read()
    b = np.frombuffer(raw, np.uint8)
    G = {k: b[i * N:(i + 1) * N].reshape(H, W) for i, k in enumerate(meta["layers"])}
    L, muns, S = meta["legends"], meta["municipios"], meta["stats"]
    step, off = meta.get("elev_step", 5), meta.get("elev_offset", 0)

    scenes = S["scenes"]
    f0, f1 = date.fromisoformat(scenes["despues"]), date.fromisoformat(scenes["ahora"])
    meses = (f1.year - f0.year) * 12 + f1.month - f0.month
    forest = (G["inside"] == 1) & ~np.isin(G["veg"], NO_FOREST)
    if meses < 12:
        modo = "erosion"
        crit = ("Superficie forestal quemada con riesgo de erosión alto o muy alto (severidad × pendiente). "
                f"La última imagen es de {meses} {'mes' if meses == 1 else 'meses'} después del incendio: lo urgente es proteger el suelo antes y durante las lluvias; "
                "qué rebrota y dónde hace falta plantar se ve a partir de la primera primavera (el CEAM evalúa a 1–2 años).")
        q = forest & (G["eros"] >= 3)
    else:
        modo = "regeneracion"
        crit = ("Superficie forestal quemada con riesgo de erosión alto o muy alto y cobertura vegetal todavía por debajo del 30 % "
                f"(criterio CEAM, imagen del {scenes[S.get('ceam_scene') or 'ahora']}). Es donde ni el suelo ni la vegetación se han "
                "recuperado: candidata a siembra o plantación y a revisar obras contra la erosión."
                + ("" if slug in ("espada", "bejis", "villanueva-de-viver") else
                   " El umbral del 30 % es del protocolo de la Fundación CEAM (Comunitat Valenciana); aquí se usa como referencia."))
        q = forest & (G["eros"] >= 3) & (G["ceam"] == 1)
    pub = np.isin(G["owner"], PUBLIC)
    # reincendio en intervalo corto: el incendio anterior (capa last = año − 1900) fue menos de 15 años antes
    fy = int(S.get("fire_year") or f0.year)
    prev = np.where(G["last"] > 0, G["last"].astype(int) + 1900, 0)
    reb = forest & (prev > 0) & (fy - prev < REB_YEARS) & (fy - prev >= 1)

    # coordenadas de los centros de píxel
    (s, w), (n, e) = meta["bounds"]
    x0, y0 = merc(s, w)
    x1, y1 = merc(n, e)

    def ll(r, c):
        x = x0 + (c + .5) / W * (x1 - x0)
        y = y1 - (r + .5) / H * (y1 - y0)
        return round(math.degrees(2 * math.atan(math.exp(y / R)) - math.pi / 2), 5), round(math.degrees(x / R), 5)

    montes = json.load(open(os.path.join(d, "montes.geojson")))["features"]
    mgeom = [shape(f["geometry"]) for f in montes if f.get("geometry")]
    mprops = [f["properties"] for f in montes if f.get("geometry")]
    for g in mgeom:
        shapely.prepare(g)

    fire = next(f for f in json.load(open(os.path.join(PUB, "api", "incendios.json")))["incendios"] if f["slug"] == slug)
    mapa = fire["mapa"]
    k = max(1, round(1000 / meta["ground_m"]))

    def top(layer, sl, msk, n, legend=True):
        cnt = Counter(G[layer][sl][msk].tolist())
        return [{"clave": int(v), "nombre": (L[layer].get(str(v), str(v)) if legend else None), "ha": round(c * ph, 1)}
                for v, c in cnt.most_common(n) if c * ph >= 0.5]

    def zone(r, c, mask):
        sl = (slice(r, r + k), slice(c, c + k))
        msk = mask[sl]
        rr, cc = np.nonzero(msk)
        lat, lon = ll(r + rr.mean(), c + cc.mean())
        ha_q = round(msk.sum() * ph, 1)
        # monte: mayoritario entre píxeles de la zona (muestra de hasta 200)
        idx = np.linspace(0, len(rr) - 1, min(200, len(rr))).astype(int)
        pts = [ll(r + rr[i], c + cc[i]) for i in idx]
        mc = Counter()
        for la, lo in pts:
            for j, g in enumerate(mgeom):
                if shapely.contains_xy(g, lo, la):
                    mc[j] += 1
                    break
        monte = None
        if mc and mc.most_common(1)[0][1] >= 0.1 * len(pts):   # el monte cubre al menos el 10 % de la zona
            j, cnt = mc.most_common(1)[0]
            p = mprops[j]
            monte = {"nombre": str(p.get("denominacion") or "").strip() or None,
                     "numero": str(p.get("num_up") or "").strip() or None,
                     "municipio": p.get("municipio"), "titular": p.get("owner_label"),
                     "parte_zona_pct": round(100 * cnt / len(pts))}
        mun_i = Counter(G["mun"][sl][msk].tolist()).most_common(1)[0][0]
        mun = muns[mun_i - 1] if mun_i else None
        sev = Counter(G["sev"][sl][msk].tolist())
        veg = top("veg", sl, msk, 3)
        flags = []
        vtot = msk.sum()
        v14 = (G["veg"][sl][msk] == 14) & (G["sev"][sl][msk] >= 4)
        if v14.sum() * ph >= 3:
            flags.append(f"{round(v14.sum() * ph)} ha de pinar de montaña (pino laricio o silvestre) quemado con severidad moderada-alta o alta: "
                         "estos pinos no guardan piñas cerradas que se abran con el fuego y no se regeneran solos donde ardió el arbolado.")
        v1 = G["veg"][sl][msk] == 1
        if v1.sum() * ph >= 3:
            flags.append(f"{round(v1.sum() * ph)} ha de alcornocal: el alcornoque rebrota de copa y tronco; no cortar árboles que parezcan "
                         "muertos hasta ver la primavera, proteger los rebrotes del ganado y la fauna y no descorchar durante varios años "
                         "(hasta que el árbol recupere la copa), según la normativa autonómica de descorche.")
        rb = reb[sl] & msk
        if rb.sum() * ph >= 3 and rb.sum() >= 0.2 * msk.sum():
            yrs = ", ".join(str(y) for y, _ in Counter(prev[sl][rb].tolist()).most_common(3))
            rbp = rb & np.isin(G["veg"][sl], PINAR)
            if rbp.sum() >= 0.2 * rb.sum() and rbp.sum() * ph >= 3:
                flags.append(f"{round(rb.sum() * ph)} ha ya habían ardido hace menos de {REB_YEARS} años ({yrs}), de ellas {round(rbp.sum() * ph)} de pinar: "
                             "reincendio en intervalo corto; ese pinar, que solo se regenera por semilla, probablemente no habrá formado aún un "
                             "banco de piñas suficiente. Lo que rebrota (frondosas y matorral) sí volverá.")
            else:
                flags.append(f"{round(rb.sum() * ph)} ha ya habían ardido hace menos de {REB_YEARS} años ({yrs}), casi sin pinar: es sobre todo "
                             "vegetación que rebrota (frondosas y matorral), que suele recuperarse sola; vigilar la erosión y el ramoneo.")
        rec2 = G["recur"][sl][msk] >= 2
        if rec2.sum() >= 0.2 * vtot and rec2.sum() * ph >= 3:
            flags.append(f"{round(rec2.sum() * ph)} ha ya habían ardido dos o más veces antes: si era pinar, los incendios repetidos reducen "
                         "mucho su capacidad de regenerarse por semilla (comprobar en campo).")
        z = {
            "lat": lat, "lon": lon, "municipio": mun, "ha": ha_q,
            "ha_monte_publico": round((msk & pub[sl]).sum() * ph, 1),
            "monte": monte,
            "parque_natural_pct": round(100 * float(G["pn"][sl][msk].mean())) if "pn" in G else 0,
            "vegetacion_antes": veg,
            "sustrato": top("sub", sl, msk, 2),
            "vegetacion_potencial": top("pot", sl, msk, 2),
            "severidad_ha": {k_: round(sev.get(v, 0) * ph, 1) for v, k_ in
                             [(5, "alta"), (4, "moderada-alta"), (3, "moderada-baja"), (2, "baja")] if sev.get(v, 0)},
            "pendiente_pct": int(np.median(G["slope"][sl][msk])),
            "altitud_m": int(np.median(G["elev"][sl][msk].astype(int)) * step + off),
            "cobertura_pct": int(np.median(G["recov"][sl][msk])) if modo == "regeneracion" else None,
            "actuaciones": top("act", sl, msk, 3),
            "incendios_previos_ha": round((G["recur"][sl][msk] >= 1).sum() * ph, 1),
            "reincendio_corto_ha": round((reb[sl] & msk).sum() * ph, 1),
            "reincendio_corto_pinar_ha": round((reb[sl] & msk & np.isin(G["veg"][sl], PINAR)).sum() * ph, 1),
            "avisos": flags,
            "mapa": f"{mapa}#municipio={__import__('urllib.parse').parse.quote(mun)}" if mun else mapa,
        }
        return z

    def hotspots(mask, n, rank=None):
        # rank: máscara con la que se ordenan las ventanas (por defecto, la misma); las cifras de la zona son de mask
        cs = np.pad((mask if rank is None else rank).astype(np.int32).cumsum(0).cumsum(1), ((1, 0), (1, 0)))
        win = (cs[k:, k:] - cs[:-k, k:] - cs[k:, :-k] + cs[:-k, :-k]).astype(float)
        out = []
        for _ in range(n):
            r, c = np.unravel_index(np.argmax(win), win.shape)
            if win[r, c] * ph < 1:
                break
            if not mask[r:r + k, c:c + k].any():
                break
            out.append(zone(r, c, mask))
            win[max(0, r - k + 1):r + k, max(0, c - k + 1):c + k] = 0
        for i, z in enumerate(out):
            z["rango"] = i + 1
        return out

    por_mun = {}
    mun_tot = {}
    for i, name in enumerate(muns, start=1):
        mm = q & (G["mun"] == i)
        h = mm.sum() * ph
        if h >= MIN_MUN_HA:
            mun_tot[name] = {"ha": round(h, 1), "ha_monte_publico": round((mm & pub).sum() * ph, 1)}
            por_mun[name] = hotspots(mm, TOP_MUN)
    def tops(layer, mask, n):
        cnt = Counter(G[layer][mask].tolist())
        return [{"clave": int(v), "nombre": L[layer].get(str(v), str(v)), "ha": round(c * ph, 1)}
                for v, c in cnt.most_common(n) if c * ph >= 0.5]

    rpin_all = reb & np.isin(G["veg"], PINAR)
    hi = G["sev"] >= 4   # dentro del reincendio, primero donde ardió con severidad moderada-alta o alta
    rb_mun, rb_por_mun = {}, {}
    for i, name in enumerate(muns, start=1):
        mm = reb & (G["mun"] == i)
        h = mm.sum() * ph
        if h >= MIN_MUN_HA:
            rb_mun[name] = {"ha": round(h, 1), "ha_pinar": round((mm & rpin_all).sum() * ph, 1), "ha_monte_publico": round((mm & pub).sum() * ph, 1)}
            rb_por_mun[name] = hotspots(mm, 1, mm & hi)
    sev_r = Counter(G["sev"][reb].tolist())
    rpin = reb & np.isin(G["veg"], PINAR)
    # nombres de los pinos presentes en el reincendio (el P. pinaster es "rodeno" en el levante y "resinero" en el centro)
    pin_names = {2: "pino resinero (P. pinaster)" if slug == "tietar" else "pino rodeno (P. pinaster)",
                 3: "pino carrasco (P. halepensis)", 14: "pino laricio o silvestre (P. nigra, P. sylvestris)",
                 16: "pino piñonero (P. pinea)", 18: "pino resinero y piñonero"}
    pin_rank = rpin.sum() >= 0.3 * max(1, reb.sum())   # con bastante pinar, las zonas se ordenan por el pinar reincendiado
    pres = [pin_names[v] for v, c in Counter(G["veg"][rpin].tolist()).most_common() if v in pin_names and c * ph >= 5]
    reincendio = {
        "criterio": (f"Superficie forestal quemada que ya había ardido menos de {REB_YEARS} años antes (incendio anterior entre "
                     f"{fy - REB_YEARS + 1} y {fy - 1}): {round(rpin.sum() * ph)} ha eran pinar"
                     f"{' — ' + ', '.join(pres) + ' —' if pres else ''} y {round((reb & ~rpin).sum() * ph)} ha otra vegetación (frondosas que rebrotan, "
                     "matorral y otros). El pino carrasco necesita años para acumular piñas serótinas: si vuelve a arder antes, apenas se "
                     "regenera («riesgo de inmadurez», Keeley et al. 1999); en Cataluña, los pinares de pino carrasco quemados dos veces en "
                     "16 años tenían un banco de semillas en copa un 80 % menor (Espelta et al. 2008). La serotinia del pino rodeno o resinero "
                     "varía mucho según la población, y el piñonero, el laricio y el silvestre apenas se regeneran por semilla tras un fuego "
                     "intenso salvo cerca de árboles vivos. Las frondosas y el matorral rebrotan, y la zona tiende a quedarse como matorral. "
                     + ("Por eso, en el pinar reincendiado está justificado actuar pronto (siembra de bellota y plantación en núcleos el primer "
                        "otoño-invierno) en lugar de esperar 1–2 años. " if rpin.sum() >= 0.3 * max(1, reb.sum()) else
                        "Aquí el reincendio es sobre todo vegetación que rebrota: actuar pronto solo tiene sentido en las manchas de pinar; "
                        "en el resto basta con seguimiento y control de la erosión. ")
                     + "La vegetación previa es la del Mapa Forestal de España, anterior al "
                     "incendio previo: describe lo que había antes de ese incendio, no lo que había justo antes de este."),
        "pinar_ha": round(rpin.sum() * ph, 1),
        "otra_vegetacion_ha": round((reb & ~rpin).sum() * ph, 1),
        "anos_umbral": REB_YEARS,
        "total_ha": round(reb.sum() * ph, 1),
        "total_monte_publico_ha": round((reb & pub).sum() * ph, 1),
        "parque_natural_ha": round((reb & (G["pn"] == 1)).sum() * ph, 1) if "pn" in G else 0,
        "por_ano_incendio_previo": {str(y): round(c * ph, 1) for y, c in sorted(Counter(prev[reb].tolist()).items())},
        "municipios": dict(sorted(rb_mun.items(), key=lambda x: -x[1]["ha"])),
        "vegetacion_antes": tops("veg", reb, 4), "sustrato": tops("sub", reb, 3),
        "vegetacion_potencial": tops("pot", reb, 3), "propiedad": tops("owner", reb, 3),
        "severidad_ha": {k_: round(sev_r.get(v, 0) * ph, 1) for v, k_ in
                         [(5, "alta"), (4, "moderada-alta"), (3, "moderada-baja"), (2, "baja")] if sev_r.get(v, 0)},
        "zonas": hotspots(reb, 8, reb & hi & (rpin if pin_rank else True)),
        "zonas_monte_publico": hotspots(reb & pub, 3, reb & pub & hi & (rpin if pin_rank else True)),
        "orden_zonas": ("superficie de pinar reincendiado con severidad moderada-alta o alta en la ventana" if pin_rank
                        else "superficie reincendiada con severidad moderada-alta o alta en la ventana"),
        "zonas_por_municipio": rb_por_mun,
    }
    out = {
        "slug": slug, "modo": modo, "criterio": crit,
        "fechas": {"despues": scenes["despues"], "ultima_imagen": scenes["ahora"], "meses_desde_incendio": meses},
        "ventana": "1 km × 1 km", "resolucion_m": meta["ground_m"],
        "total_ha": round(q.sum() * ph, 1), "total_monte_publico_ha": round((q & pub).sum() * ph, 1),
        "municipios": dict(sorted(mun_tot.items(), key=lambda x: -x[1]["ha"])),
        "zonas": hotspots(q, TOP),
        "zonas_monte_publico": hotspots(q & pub, 5),
        "zonas_por_municipio": por_mun,
        "reincendio": reincendio,
        "nota": "Cálculo propio de Fénix sobre capas de satélite y cartografía oficial. Orienta una visita de campo; "
                "cualquier actuación necesita permiso del propietario y de la administración forestal.",
    }
    path = os.path.join(PUB, "api", f"{slug}.prioridades.json")
    with open(path, "w") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"{slug}: {modo}, {out['total_ha']} ha ({out['total_monte_publico_ha']} públicas), "
          f"{len(out['zonas'])} zonas, {len(por_mun)} municipios; reincendio <{REB_YEARS} años {reincendio['total_ha']} ha → {os.path.getsize(path) / 1024:.0f} KB")


if __name__ == "__main__":
    for s in (sys.argv[1:] or FIRES):
        build(s)
