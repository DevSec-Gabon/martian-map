"""
Martian Map – pipeline de préparation des couches et de l'itinéraire (mont Sharp, cratère Gale)

Ce que fait ce script :
  1. définit une petite zone (par défaut 3 x 3 km) autour d'un centre lon/lat ;
  2. découpe UNIQUEMENT cette zone dans le modèle de terrain 1 m (DEM) et l'orthomosaïque
     couleur HiRISE de Gale (USGS), en lecture distante, sans télécharger les fichiers entiers ;
  3. calcule les couches dérivées : ombrage du relief, pentes, rugosité, carte des dangers ;
  4. calcule l'itinéraire le moins risqué entre l'habitat et les cibles (chemin de moindre coût) ;
  5. exporte les couches (PNG), l'itineraire (GeoJSON) et mission.json, lu par app.html.

Installation :
  pip install rasterio pyproj numpy scipy scikit-image pillow

Conseil : lancez-le dans Google Colab si le réseau sur place est lent.
Les seuils de pente sont des HYPOTHÈSES de travail : ajustez-les et justifiez-les au pitch.
"""

import json
import math
import os
import shutil

import numpy as np
import rasterio
from rasterio.windows import from_bounds
from rasterio.enums import Resampling
from pyproj import Transformer, CRS
from scipy import ndimage
from skimage.graph import route_through_array
from PIL import Image

# ----------------------------------------------------------------------------
# 1. PARAMÈTRES À REMPLIR PAR L'ÉQUIPE
# ----------------------------------------------------------------------------

# Données USGS (MSL Gale). Vérifiez les URL sur astrogeology.usgs.gov si une lecture échoue.
DEM_URL = "/vsicurl/https://planetarymaps.usgs.gov/mosaic/Mars/MSL/MSL_Gale_DEM_Mosaic_1m_v3.tif"
ORTHO_URL = "/vsicurl/https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/Mars/MSL/MSL_Gale_HiRISE-LRGB_78quads_sharp_cog.tif"

# Positions de Curiosity exportées en GeoJSON (carte « Where is Curiosity », couche Waypoints).
# Laissez None pour fixer le centre à la main (CENTER_LON / CENTER_LAT).
WAYPOINTS_GEOJSON = "curiosity_boxworks_waypoints.geojson"   # fourni avec ce script
SOL_MIN, SOL_MAX = 4534, 4830   # traversée des boxworks par Curiosity (mai 2025 -> début 2026)

CENTER_LON = 137.38129   # centre de la traversée (calculé sur les 73 positions)
CENTER_LAT = -4.80491
ZONE_KM = 2.0            # carré de 2 x 2 km : couvre toute la traversée avec de la marge

# Points de la mission (lon, lat), pris sur les positions réelles de Curiosity.
HABITAT = (137.38566, -4.79796)   # sol 4544 : rover presque à plat (inclinaison 2,3°)
CIBLES = [
    (137.37941, -4.80680),        # cible A, sol 4643 : point le plus haut de la traversée
    (137.38101, -4.80800),        # cible B, sols 4684-4789 : site où Curiosity est resté le plus longtemps
]

# Hypothèses de sécurité (à justifier) : pente en degrés
PENTE_PRUDENCE = 10.0
PENTE_INTERDITE = 20.0
RUGOSITE_INTERDITE = 1.5   # écart-type local d'altitude (m) sur 5 x 5 m
PAS_ITINERAIRE_M = 4       # rééchantillonnage pour accélérer le calcul (1 m -> 4 m)
LISSAGES_M = [0, 1, 2, 3, 5]   # échelles testées pour calibrer la pente sur l'inclinaison réelle de Curiosity

# Couche « crêtes et creux » : indice de position topographique (altitude - moyenne du voisinage)
FENETRE_TPI_M = 21           # taille du voisinage comparé (m)
CIBLES_AUTO = True           # cherche la crête la plus nette autour de A et le creux le plus net autour de B
RAYON_RECHERCHE_M = 120      # rayon de recherche autour des points de départ

# Temps de marche : règle de Tobler (vitesse d'un randonneur selon la pente), puis scénario prudent
FACTEUR_VITESSE_PRUDENT = 0.5   # HYPOTHÈSE : combinaison + charge divisent la vitesse par 2 (à justifier)
DOSE_RAD_MSV_JOUR = 0.67        # dose moyenne mesurée par RAD (Curiosity, Gale) en surface, 2012-2013
DUREE_SOL_H = 24.66             # durée d'un jour martien
DUREE_ARRET_MIN = 20            # arrêt scientifique prévu sur chaque cible (minutes)
OPTIQUE_WEB_PX = 4096           # largeur max de l'image optique servie au navigateur (GitHub Pages)

# Mesures d'ambiance affichées par le panneau « Conditions » de app.html.
# Ce sont les dernières valeurs PUBLIÉES par les instruments de Curiosity : lors d'une vraie
# mission, cette liste serait alimentée en direct par la station météo du rover.
CONDITIONS = {
    "maj": "Dernières mesures publiées de Curiosity – un équipage lirait ici la station météo du rover.",
    "mesures": [
        {"nom": "Radiations en surface", "valeur": f"{DOSE_RAD_MSV_JOUR} mSv/jour".replace('.', ','),
         "detail": "RAD, moyenne 2012–2013 (Hassler et al., Science 2013)", "etat": "ok"},
        {"nom": "Température de l'air", "valeur": "−70 à −10 °C",
         "detail": "REMS, cycle jour/nuit typique au cratère Gale", "etat": "ok"},
        {"nom": "Pression", "valeur": "≈ 750 Pa",
         "detail": "REMS, variation saisonnière 700 à 900 Pa", "etat": "ok"},
        {"nom": "Vent", "valeur": "2 à 10 m/s", "detail": "REMS, vents de pente diurnes", "etat": "ok"},
        {"nom": "Opacité de poussière", "valeur": "τ ≈ 0,3 à 0,6",
         "detail": "Ciel clair à voilé (Mastcam / REMS)", "etat": "ok"},
        {"nom": "Sismicité", "valeur": "pas de mesure active",
         "detail": "InSight arrêté fin 2022 – aucune surveillance sismique à Gale", "etat": "info"},
    ],
}
SOURCES = [
    "Modèle de terrain 1 m : USGS Astrogeology, MSL Gale DEM Mosaic 1 m v3",
    "Orthomosaïque HiRISE LRGB : USGS / NASA / JPL-Caltech / Univ. of Arizona",
    "Positions et inclinaisons de Curiosity : NASA/JPL MMGIS, MSL_waypoints",
    "Radiations : MSL/RAD (Hassler et al., Science 2013)",
    "Météo : MSL/REMS (Centro de Astrobiología CSIC-INTA / NASA JPL)",
]
SCIENCE_CIBLES = [
    "Argiles sur les crêtes des boxworks (Curiosity, sol 4643)",
    "Carbonates dans les creux des boxworks (Curiosity, sols 4684–4789)",
]

SORTIE = "sortie"
RAYON_MARS = 3396190.0

# ----------------------------------------------------------------------------
# 2. OUTILS
# ----------------------------------------------------------------------------

LONLAT_MARS = CRS.from_proj4(f"+proj=longlat +a={RAYON_MARS} +b={RAYON_MARS} +no_defs")


def centre_depuis_waypoints(path, sol_min, sol_max):
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    pts = []
    for feat in data.get("features", []):
        props = feat.get("properties", {})
        sol = props.get("sol")
        try:
            sol = int(sol)
        except (TypeError, ValueError):
            continue
        if sol_min <= sol <= sol_max and feat.get("geometry", {}).get("type") == "Point":
            lon, lat = feat["geometry"]["coordinates"][:2]
            pts.append((lon, lat))
    if not pts:
        raise ValueError("Aucun waypoint dans l'intervalle de sols : élargissez SOL_MIN/SOL_MAX.")
    lons, lats = zip(*pts)
    return float(np.mean(lons)), float(np.mean(lats)), pts


def bbox_lonlat(lon, lat, cote_km):
    demi = cote_km * 1000 / 2
    dlat = math.degrees(demi / RAYON_MARS)
    dlon = math.degrees(demi / (RAYON_MARS * math.cos(math.radians(lat))))
    return lon - dlon, lat - dlat, lon + dlon, lat + dlat


def decouper(url, bbox, out_tif, out_shape=None):
    with rasterio.open(url) as src:
        tr = Transformer.from_crs(LONLAT_MARS, src.crs, always_xy=True)
        xs, ys = tr.transform([bbox[0], bbox[2], bbox[0], bbox[2]], [bbox[1], bbox[1], bbox[3], bbox[3]])
        win = from_bounds(min(xs), min(ys), max(xs), max(ys), src.transform)
        kw = {}
        if out_shape:
            kw = {"out_shape": (src.count, *out_shape), "resampling": Resampling.bilinear}
        data = src.read(window=win, boundless=False, **kw)
        transform = src.window_transform(win)
        if out_shape:
            transform = transform * transform.scale(win.width / out_shape[1], win.height / out_shape[0])
        profile = src.profile.copy()
        profile.update(height=data.shape[1], width=data.shape[2], transform=transform, driver="GTiff",
                       tiled=False, compress="deflate")
        profile.pop("blockxsize", None)
        profile.pop("blockysize", None)
        profile.pop("photometric", None)   # évite l'erreur YCbCr de l'orthomosaïque couleur
        with rasterio.open(out_tif, "w", **profile) as dst:
            dst.write(data)
        return data, transform, src.crs, src.nodata


def to_png(arr, path, cmap):
    """arr : float 0..1 (NaN = transparent) ; cmap : fonction -> (r, g, b)."""
    h, w = arr.shape
    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    ok = ~np.isnan(arr)
    r, g, b = cmap(np.clip(np.nan_to_num(arr), 0, 1))
    rgba[..., 0], rgba[..., 1], rgba[..., 2] = r, g, b
    rgba[..., 3] = np.where(ok, 255, 0)
    Image.fromarray(rgba).save(path)


def cmap_gris(x):
    v = (x * 255).astype(np.uint8)
    return v, v, v


def cmap_pente(x):
    # vert -> jaune -> rouge
    r = np.clip(2 * x, 0, 1) * 255
    g = np.clip(2 * (1 - x), 0, 1) * 255
    return r.astype(np.uint8), g.astype(np.uint8), np.full_like(r, 40, dtype=np.uint8)


# ----------------------------------------------------------------------------
# 3. PIPELINE
# ----------------------------------------------------------------------------

def main():
    os.makedirs(SORTIE, exist_ok=True)

    # Zone
    if WAYPOINTS_GEOJSON and os.path.exists(WAYPOINTS_GEOJSON):
        lon0, lat0, wpts = centre_depuis_waypoints(WAYPOINTS_GEOJSON, SOL_MIN, SOL_MAX)
    elif CENTER_LON is not None and CENTER_LAT is not None:
        lon0, lat0, wpts = CENTER_LON, CENTER_LAT, []
    else:
        raise SystemExit("Renseignez WAYPOINTS_GEOJSON ou CENTER_LON / CENTER_LAT.")
    bbox = bbox_lonlat(lon0, lat0, ZONE_KM)
    print(f"Zone centrée sur lon {lon0:.4f}, lat {lat0:.4f} ; bbox {bbox}")

    # Couche topographique (DEM 1 m)
    dem, dem_tr, dem_crs, nodata = decouper(DEM_URL, bbox, f"{SORTIE}/dem.tif")
    z = dem[0].astype("float32")
    if nodata is not None:
        z[z == nodata] = np.nan
    px = abs(dem_tr.a)
    print(f"DEM découpé : {z.shape}, pixel ~{px:.2f} m")

    # Couche optique (orthomosaïque couleur) au même cadrage
    try:
        ortho, _, _, _ = decouper(ORTHO_URL, bbox, f"{SORTIE}/ortho.tif")
        bandes = (ortho[:3] if ortho.shape[0] >= 3 else np.repeat(ortho[:1], 3, axis=0)).astype("float32")
        lo, hi = np.percentile(bandes[bandes > 0], [1, 99])
        img = np.clip((bandes - lo) / max(hi - lo, 1e-6) * 255, 0, 255).astype("uint8")
        im_opt = Image.fromarray(np.moveaxis(img, 0, -1))
        im_opt.save(f"{SORTIE}/optique.png")
        # version web : optique.png fait souvent > 100 Mo, ce que GitHub refuse et
        # ce qu'un navigateur met longtemps à décoder. app.html utilise ce JPEG.
        if im_opt.width > OPTIQUE_WEB_PX:
            h_web = round(im_opt.height * OPTIQUE_WEB_PX / im_opt.width)
            im_opt = im_opt.resize((OPTIQUE_WEB_PX, h_web), Image.LANCZOS)
        im_opt.save(f"{SORTIE}/optique.jpg", quality=85, optimize=True, progressive=True)
        print(f"Image optique : {im_opt.width} x {im_opt.height} px pour le web (optique.jpg)")
    except Exception as e:  # noqa: BLE001
        print("Orthomosaïque non lue :", e, "(gardez optique.png obtenu par la cellule de secours)")

    zf = np.where(np.isnan(z), np.nanmean(z), z)
    mask = np.isnan(z)
    tr_inv = Transformer.from_crs(LONLAT_MARS, dem_crs, always_xy=True)
    tr_fwd = Transformer.from_crs(dem_crs, LONLAT_MARS, always_xy=True)

    def pixel(lon, lat):
        x, y = tr_inv.transform(lon, lat)
        col, row = ~dem_tr * (x, y)
        return int(row), int(col)

    # Positions et inclinaisons réelles de Curiosity (vérité terrain)
    verite = []
    if WAYPOINTS_GEOJSON and os.path.exists(WAYPOINTS_GEOJSON):
        with open(WAYPOINTS_GEOJSON, encoding="utf-8") as fh:
            for ft in json.load(fh)["features"]:
                tilt = ft["properties"].get("tilt_deg")
                r, c = pixel(*ft["geometry"]["coordinates"][:2])
                if tilt is not None and 0 <= r < z.shape[0] and 0 <= c < z.shape[1]:
                    verite.append((r, c, float(tilt)))

    def calcul_pente(sigma_m):
        zs = ndimage.gaussian_filter(zf, sigma_m / px) if sigma_m > 0 else zf
        gy, gx = np.gradient(zs, px)
        return np.degrees(np.arctan(np.hypot(gx, gy))), gx, gy

    # Calibration : à quelle échelle la pente calculée colle-t-elle au terrain vécu par Curiosity ?
    meilleur = 2
    if verite:
        rr, cc, tt = map(np.array, zip(*verite))
        print("Calibration de l'échelle de pente sur les inclinaisons mesurées par Curiosity :")
        scores = {}
        for s in LISSAGES_M:
            p, _, _ = calcul_pente(s)
            scores[s] = float(np.abs(p[rr, cc] - tt).mean())
            print(f"  lissage {s} m -> écart moyen {scores[s]:.1f}°")
        meilleur = min(scores, key=scores.get)
    pente, gx, gy = calcul_pente(meilleur)
    if verite:
        print(f"Validation (lissage retenu {meilleur} m) sur {len(verite)} positions : pente calculée moyenne "
              f"{pente[rr, cc].mean():.1f}°, inclinaison du rover {tt.mean():.1f}°, écart moyen "
              f"{np.abs(pente[rr, cc] - tt).mean():.1f}°")

    # Rugosité (blocs, crêtes) et seuil calibré : au moins ce que Curiosity a franchi
    moy = ndimage.uniform_filter(zf, 5)
    rug = np.sqrt(np.maximum(ndimage.uniform_filter(zf ** 2, 5) - moy ** 2, 0))
    seuil_rug = RUGOSITE_INTERDITE
    if verite:
        seuil_rug = max(RUGOSITE_INTERDITE, float(rug[rr, cc].max()) * 1.1)
        print(f"Rugosité maximale franchie par Curiosity : {rug[rr, cc].max():.2f} m -> seuil interdit {seuil_rug:.2f} m")

    pent_hs = np.arctan(np.hypot(gx, gy))
    az, alt = math.radians(315), math.radians(45)
    hill = np.sin(alt) * np.cos(pent_hs) + np.cos(alt) * np.sin(pent_hs) * np.cos(az - np.arctan2(-gx, gy))

    danger = np.zeros_like(pente)
    danger[pente >= PENTE_PRUDENCE] = 1
    danger[(pente >= PENTE_INTERDITE) | (rug >= seuil_rug)] = 2
    print(f"Part de la zone : facile {np.mean(danger == 0):.0%}, prudence {np.mean(danger == 1):.0%}, "
          f"interdite {np.mean(danger == 2):.0%}")

    to_png(np.where(mask, np.nan, (hill + 1) / 2), f"{SORTIE}/relief.png", cmap_gris)
    to_png(np.where(mask, np.nan, np.clip(pente / 30, 0, 1)), f"{SORTIE}/pentes.png", cmap_pente)
    to_png(np.where(mask, np.nan, danger / 2), f"{SORTIE}/dangers.png", cmap_pente)

    # Couche crêtes / creux (indice de position topographique, TPI)
    zs = ndimage.gaussian_filter(zf, meilleur / px) if meilleur > 0 else zf
    w = max(3, int(round(FENETRE_TPI_M / px)) | 1)
    tpi = zs - ndimage.uniform_filter(zs, w)
    lim = float(np.nanpercentile(np.abs(tpi), 98)) or 1.0
    a = np.clip(np.abs(tpi) / lim, 0, 1)
    rgba = np.zeros((*tpi.shape, 4), dtype=np.uint8)
    rgba[..., 0] = np.where(tpi > 0, 229, 70)
    rgba[..., 1] = np.where(tpi > 0, 120, 140)
    rgba[..., 2] = np.where(tpi > 0, 50, 230)
    rgba[..., 3] = np.where(mask, 0, (a * 220).astype(np.uint8))
    Image.fromarray(rgba).save(f"{SORTIE}/cretes_creux.png")
    print(f"Couche crêtes/creux : relief local de -{lim:.1f} m (creux) à +{lim:.1f} m (crêtes)")

    def vers_lonlat_px(r, c):
        x, y = dem_tr * (c + 0.5, r + 0.5)
        return tr_fwd.transform(x, y)

    # Cibles géologiques : la crête la plus nette autour de A, le creux le plus net autour de B
    cibles = list(CIBLES)
    noms_cibles = [f"Cible {chr(65 + i)}" for i in range(len(cibles))]
    if CIBLES_AUTO and len(cibles) >= 2:
        R = int(RAYON_RECHERCHE_M / px)
        for i, (signe, nature) in enumerate([(1, "crête"), (-1, "creux")]):
            r0, c0 = pixel(*cibles[i])
            r1, r2, c1, c2 = max(r0 - R, 0), min(r0 + R, z.shape[0]), max(c0 - R, 0), min(c0 + R, z.shape[1])
            score = signe * tpi[r1:r2, c1:c2]
            score = np.where((danger[r1:r2, c1:c2] < 2) & ~mask[r1:r2, c1:c2], score, -np.inf)
            rr_, cc_ = np.unravel_index(np.argmax(score), score.shape)
            rn, cn = r1 + rr_, c1 + cc_
            cibles[i] = vers_lonlat_px(rn, cn)
            noms_cibles[i] = f"Cible {chr(65 + i)} – {nature}"
            print(f"{noms_cibles[i]} : lon {cibles[i][0]:.5f}, lat {cibles[i][1]:.5f}, relief local "
                  f"{tpi[rn, cn]:+.2f} m, à {math.hypot(rn - r0, cn - c0) * px:.0f} m du point de départ")

    # Itinéraire le plus rapide et sûr : Dijkstra sur une grille de TEMPS de marche (règle de Tobler)
    itineraire, points, stats = [], {"habitat": HABITAT, "cibles": cibles, "noms": noms_cibles}, {}
    if HABITAT and cibles:
        f = max(1, int(round(PAS_ITINERAIRE_M / px)))
        v_ms = 6.0 * np.exp(-3.5 * (np.tan(np.radians(pente)) + 0.05)) / 3.6   # Tobler, en m/s
        cout = (f * px) / v_ms                                              # secondes pour traverser une case
        cout[danger == 2] = 1e6
        cout[mask] = 1e6
        cout_r = cout[::f, ::f]
        autorise = cout_r < 1e6
        _, (ir, ic) = ndimage.distance_transform_edt(~autorise, return_indices=True)

        def cellule(lon, lat, nom):
            r, c = pixel(lon, lat)
            r, c = r // f, c // f
            r2, c2 = int(ir[r, c]), int(ic[r, c])
            if (r2, c2) != (r, c):
                print(f"{nom} était en zone interdite : déplacé de {math.hypot(r2 - r, c2 - c) * f * px:.0f} m")
            return r2, c2

        def vers_lonlat(r, c):
            x, y = dem_tr * (c * f + f / 2, r * f + f / 2)
            return tr_fwd.transform(x, y)

        cells = [cellule(*p, n) for p, n in zip([HABITAT, *cibles], ["Habitat", *noms_cibles])]
        points["habitat"] = vers_lonlat(*cells[0])
        points["cibles"] = [vers_lonlat(*cc_) for cc_ in cells[1:]]
        boucle = cells + [cells[0]]

        # une seule liste de cases, sans doublon aux jonctions : bornes[k] = index d'arrivée de l'étape k
        bornes, cases = [0], []
        for a_, b_ in zip(boucle[:-1], boucle[1:]):
            chemin, _ = route_through_array(cout_r, a_, b_, fully_connected=True, geometric=True)
            chemin = list(chemin)
            if cases and chemin and chemin[0] == cases[-1]:
                chemin = chemin[1:]
            cases += chemin
            bornes.append(len(cases) - 1)

        itineraire = [vers_lonlat(r, c) for r, c in cases]
        pentes_route = [float(pente[r * f, c * f]) for r, c in cases]
        alt_route = [float(zf[r * f, c * f]) for r, c in cases]

        # distance et temps cumulés le long du parcours (règle de Tobler sur la pente locale)
        longueur, d_plus = 0.0, 0.0
        d_cum, t_cum = [0.0], [0.0]
        for i in range(1, len(cases)):
            (r1, c1), (r2, c2) = cases[i - 1], cases[i]
            pas = math.hypot((r2 - r1) * f * px, (c2 - c1) * f * px)
            longueur += pas
            d_plus += max(0.0, alt_route[i] - alt_route[i - 1])
            p_moy = (pentes_route[i - 1] + pentes_route[i]) / 2
            v = 6.0 * math.exp(-3.5 * (abs(math.tan(math.radians(p_moy))) + 0.05)) / 3.6
            d_cum.append(longueur)
            t_cum.append(t_cum[-1] + pas / v)

        # cap à suivre en chaque point (azimut vers le point suivant)
        caps = []
        for i in range(len(itineraire)):
            a_pt, b_pt = itineraire[i], itineraire[min(i + 1, len(itineraire) - 1)]
            dx = RAYON_MARS * math.radians(b_pt[0] - a_pt[0]) * math.cos(math.radians((a_pt[1] + b_pt[1]) / 2))
            dy = RAYON_MARS * math.radians(b_pt[1] - a_pt[1])
            caps.append(0.0 if dx == 0 and dy == 0 else (math.degrees(math.atan2(dx, dy)) + 360) % 360)
        if len(caps) > 1:
            caps[-1] = caps[-2]

        pr = np.array(pentes_route)
        t_ref = t_cum[-1] / 60
        t_prud = t_ref / FACTEUR_VITESSE_PRUDENT
        dose = DOSE_RAD_MSV_JOUR * (t_prud / 60) / DUREE_SOL_H
        stats = {"longueur_km": round(longueur / 1000, 2), "denivele_m": round(d_plus), "pente_max": round(float(pr.max()), 1),
                 "prudence_pct": round(float(np.mean(pr >= PENTE_PRUDENCE)) * 100), "temps_ref_min": round(t_ref),
                 "temps_prudent_min": round(t_prud), "dose_msv": round(dose, 3), "dose_jour": DOSE_RAD_MSV_JOUR}
        print(f"Itinéraire : {stats['longueur_km']} km, dénivelé positif {stats['denivele_m']} m, pente max "
              f"{stats['pente_max']}°, {stats['prudence_pct']} % du trajet en zone de prudence")
        print(f"Temps de marche : {stats['temps_ref_min']} min (vitesse de randonnée, règle de Tobler) ; "
              f"{stats['temps_prudent_min']} min en scénario prudent (vitesse x {FACTEUR_VITESSE_PRUDENT})")
        print(f"Radiations : environ {stats['dose_msv']} mSv pendant la marche (scénario prudent), "
              f"sur une base de {DOSE_RAD_MSV_JOUR} mSv/jour mesurés par RAD")
        stats.update({"longueur_m": round(longueur), "alt_min_m": round(min(alt_route), 1),
                      "alt_max_m": round(max(alt_route), 1),
                      "facteur_prudent": FACTEUR_VITESSE_PRUDENT, "duree_sol_h": DUREE_SOL_H})
        with open(f"{SORTIE}/itineraire.geojson", "w", encoding="utf-8") as fh:
            json.dump({"type": "FeatureCollection", "features": [{
                "type": "Feature", "properties": stats,
                "geometry": {"type": "LineString", "coordinates": itineraire}}]}, fh)

        # mission.json : tout ce dont app.html a besoin (les deux écrans lisent ce seul fichier)
        mission = construire_mission({
            "bbox": bbox, "zone_km": ZONE_KM, "itineraire": itineraire, "alt": alt_route,
            "pente": pentes_route, "d_cum": d_cum, "t_cum": t_cum, "caps": caps, "bornes": bornes,
            "habitat": points["habitat"], "habitat_alt": alt_route[0],
            "cibles": points["cibles"], "noms_cibles": noms_cibles,
            "cibles_alt": [alt_route[bornes[k + 1]] for k in range(len(points["cibles"]))],
            "stats": stats, "wpts": wpts, "seuil_rug": seuil_rug, "lissage": meilleur,
        })
        with open(f"{SORTIE}/mission.json", "w", encoding="utf-8") as fh:
            json.dump(mission, fh, ensure_ascii=False, separators=(",", ":"))
        # même contenu en .js : app.html s'ouvre alors d'un simple double-clic (file://)
        with open(f"{SORTIE}/mission.js", "w", encoding="utf-8") as fh:
            fh.write("window.MISSION = " + json.dumps(mission, ensure_ascii=False, separators=(",", ":")) + ";\n")
        print(f"mission.json écrit ({len(itineraire)} points d'itinéraire, {len(mission['etapes'])} étapes)")

    # Visionneuse Leaflet : toutes les couches calées sur les mêmes limites
    bounds = [[bbox[1], bbox[0]], [bbox[3], bbox[2]]]
    html = VIEWER.replace("__BOUNDS__", json.dumps(bounds)) \
                 .replace("__ROUTE__", json.dumps([[lat, lon] for lon, lat in itineraire])) \
                 .replace("__POINTS__", json.dumps(points)) \
                 .replace("__STATS__", json.dumps(stats)) \
                 .replace("__WPTS__", json.dumps([[lat, lon] for lon, lat in wpts]))
    with open(f"{SORTIE}/carte.html", "w", encoding="utf-8") as fh:
        fh.write(html)

    # interface à deux écrans + copie locale de Leaflet, si elles sont à côté du script
    for nom in ("app.html",):
        if os.path.exists(nom):
            shutil.copy(nom, f"{SORTIE}/{nom}")
    if os.path.isdir("leaflet") and not os.path.isdir(f"{SORTIE}/leaflet"):
        shutil.copytree("leaflet", f"{SORTIE}/leaflet")
    cible_finale = "app.html" if os.path.exists(f"{SORTIE}/app.html") else "carte.html"
    print(f"Terminé : ouvrez {SORTIE}/{cible_finale}")

def construire_mission(c):
    """Assemble le fichier mission.json lu par app.html.

    Ne touche à aucun raster : tout arrive déjà calculé dans le dictionnaire `c`,
    ce qui permet de tester cette fonction seule.
    """
    bbox, bornes, stats = c["bbox"], c["bornes"], c["stats"]
    noms = c["noms_cibles"]
    natures = ["crête", "creux"]
    arrivees = list(noms) + ["Habitat"]

    etapes = []
    for k in range(len(bornes) - 1):
        i1, i2 = bornes[k], bornes[k + 1]
        seg = c["pente"][i1:i2 + 1]
        d_pos = sum(max(0.0, c["alt"][i + 1] - c["alt"][i]) for i in range(i1, i2))
        d_neg = sum(min(0.0, c["alt"][i + 1] - c["alt"][i]) for i in range(i1, i2))
        t_ref = (c["t_cum"][i2] - c["t_cum"][i1]) / 60
        depart = "Habitat" if k == 0 else arrivees[k - 1]
        etapes.append({
            "titre": f"{depart} vers {arrivees[k]}", "arrivee": arrivees[k], "i_debut": i1, "i_fin": i2,
            "distance_m": round(c["d_cum"][i2] - c["d_cum"][i1]),
            "denivele_pos_m": round(d_pos), "denivele_neg_m": round(d_neg),
            "pente_max": round(max(seg), 1), "pente_moy": round(sum(seg) / len(seg), 1),
            "temps_ref_min": round(t_ref), "temps_prudent_min": round(t_ref / FACTEUR_VITESSE_PRUDENT),
            "prudence_pct": round(100 * sum(1 for p in seg if p >= PENTE_PRUDENCE) / len(seg)),
        })

    return {
        "nom": "Sortie à pied 01 – boxworks du mont Sharp",
        "site": {"nom": "Mont Sharp (Aeolis Mons), cratère Gale",
                 "centre": [round((bbox[0] + bbox[2]) / 2, 5), round((bbox[1] + bbox[3]) / 2, 5)],
                 "zone_km": c["zone_km"], "corps": "Mars"},
        "bounds": [[bbox[1], bbox[0]], [bbox[3], bbox[2]]],
        "bbox": list(bbox),
        "seuils": {"prudence_deg": PENTE_PRUDENCE, "interdit_deg": PENTE_INTERDITE,
                   "rugosite_interdite_m": round(c["seuil_rug"], 2),
                   "lissage_pente_m": c["lissage"], "pas_grille_m": PAS_ITINERAIRE_M},
        "couches": [
            {"id": "optique", "nom": "Optique HiRISE", "fichier": "optique.jpg", "type": "base", "opacite": 1},
            {"id": "relief", "nom": "Relief ombré (DEM 1 m)", "fichier": "relief.png", "type": "base", "opacite": 1},
            {"id": "pentes", "nom": f"Pentes (0 à 30°)", "fichier": "pentes.png", "type": "overlay", "opacite": 0.55},
            {"id": "dangers", "nom": "Dangers (facile / prudence / interdit)", "fichier": "dangers.png",
             "type": "overlay", "opacite": 0.45, "defaut": True},
            {"id": "cretes_creux", "nom": "Crêtes et creux (boxworks)", "fichier": "cretes_creux.png",
             "type": "overlay", "opacite": 0.8},
        ],
        "habitat": {"nom": "Habitat – rover pressurisé", "lon": c["habitat"][0], "lat": c["habitat"][1],
                    "alt_m": round(c["habitat_alt"], 1), "sol_curiosity": 4544},
        "cibles": [{"nom": noms[i], "lon": p[0], "lat": p[1], "alt_m": round(c["cibles_alt"][i], 1),
                    "nature": natures[i] if i < len(natures) else "cible",
                    "science": SCIENCE_CIBLES[i] if i < len(SCIENCE_CIBLES) else "",
                    "duree_arret_min": DUREE_ARRET_MIN}
                   for i, p in enumerate(c["cibles"])],
        "itineraire": {
            "coordinates": [[round(lon, 7), round(lat, 7)] for lon, lat in c["itineraire"]],
            "altitude_m": [round(v, 2) for v in c["alt"]],
            "pente_deg": [round(v, 1) for v in c["pente"]],
            "distance_cum_m": [round(v, 1) for v in c["d_cum"]],
            "temps_cum_s": [round(v, 1) for v in c["t_cum"]],
            "cap_deg": [round(v, 1) for v in c["caps"]],
        },
        "etapes": etapes,
        "stats": stats,
        "waypoints_curiosity": {"sols": [SOL_MIN, SOL_MAX], "n": len(c["wpts"]),
                                "coordinates": [[lon, lat] for lon, lat in c["wpts"]]},
        "conditions": CONDITIONS,
        "sources": SOURCES,
    }


VIEWER = """<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Martian Map</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<style>html,body,#map{height:100%;margin:0;background:#1B1512}</style></head><body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
const b = __BOUNDS__, route = __ROUTE__, pts = __POINTS__, wpts = __WPTS__, st = __STATS__;
const map = L.map('map', {crs: L.CRS.EPSG4326, attributionControl: true});
map.fitBounds(b);
const layer = (f, o) => L.imageOverlay(f, b, {opacity: o});
const base = {"Optique (HiRISE)": layer('optique.png', 1), "Relief ombré (DEM 1 m)": layer('relief.png', 1)};
base["Optique (HiRISE)"].addTo(map);
const over = {
  "Pentes": layer('pentes.png', 0.55),
  "Dangers (vert / orange / rouge)": layer('dangers.png', 0.5).addTo(map),
  "Crêtes (orange) et creux (bleu)": layer('cretes_creux.png', 0.8),
  "Trajet de Curiosity (2025)": L.polyline(wpts, {color: '#7FB3D5', weight: 2}),
};
if (route.length) over["Itinéraire le plus rapide et sûr"] = L.polyline(route, {color: '#F6F0E8', weight: 4, dashArray: '8 6'}).addTo(map);
if (pts.habitat) L.marker([pts.habitat[1], pts.habitat[0]]).addTo(map).bindTooltip('Habitat', {permanent: true});
(pts.cibles || []).forEach((c, i) => L.circleMarker([c[1], c[0]], {radius: 9, color: '#E59A6B', weight: 3}).addTo(map).bindTooltip((pts.noms || [])[i] || ('Cible ' + (i + 1)), {permanent: true}));
L.control.layers(base, over, {collapsed: false}).addTo(map);
const info = L.control({position: 'bottomleft'});
info.onAdd = () => { const d = L.DomUtil.create('div'); d.style.cssText = 'background:#1B1512ee;color:#F6F0E8;padding:12px 16px;border-radius:10px;font:14px/1.5 system-ui,sans-serif;max-width:320px';
  d.innerHTML = st.longueur_km ? `<b>Sortie à pied – mont Sharp (boxworks)</b><br>Distance : ${st.longueur_km} km (boucle)<br>Dénivelé positif : ${st.denivele_m} m · pente max ${st.pente_max}°<br>Temps de marche : ${st.temps_ref_min} à ${st.temps_prudent_min} min<br><b>Radiations</b> (RAD, Curiosity) : ${st.dose_jour} mSv/jour en surface<br>Dose pendant la marche : ≈ ${st.dose_msv} mSv` : '<b>Martian Map</b>';
  return d; };
info.addTo(map);
map.attributionControl.addAttribution('Données : NASA/JPL-Caltech/UArizona, USGS, MSL/RAD');
</script></body></html>"""


if __name__ == "__main__":
    main()
