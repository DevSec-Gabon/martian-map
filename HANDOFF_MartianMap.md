# Martian Map – Fichier de passation (NASA Space Apps Challenge 2026, Libreville)

> À donner en premier à une nouvelle session Claude (Claude Code ou claude.ai).
> **Langue : français.** Réponses brèves, instructions précises pas à pas. Rester honnête sur les hypothèses.
> Fichiers à joindre avec ce document : `MartianMap_Colab_v2.ipynb`, `martian_map_pipeline.py`,
> `app.html`, `curiosity_boxworks_waypoints.geojson`, et le contenu du dossier `sortie/` (résultats).

---

## 1. Contexte

- **Événement** : NASA Space Apps Challenge 2026, édition locale de Libreville (Gabon), 13–15 novembre 2026.
- **Défi** : *Interplanetary Survival Guide: Martian Map*. Créer une vue **en couches et intégrée** d'un lieu ou
  d'un itinéraire sur Mars, avec des données de **plusieurs missions NASA**, pour aider un astronaute à planifier
  et réussir une sortie à pied (« Marswalk ») en sécurité tout en faisant de la science. Échelle **hyper-locale**
  (les outils existants comme Mars Trek sont régionaux/globaux). L'énoncé suggère **au moins 3 types de données**,
  insiste sur la **sécurité** (radiations, mobilité en combinaison, obstacles) et sur un **itinéraire**.
- **Équipe** : 4 membres. Gédéon (chef de projet, IA & Big Data) + 1 autre profil IA & Big Data + 2 profils
  Réseaux & Systèmes d'information. Des coachs (dev, IA/data, marketing, business) font des points réguliers.
- **Retour du jury** : le premier pitch partait « dans tous les sens » (trop d'interfaces). Il faut **une seule
  direction claire**.

## 2. Échéances (dimanche 15 novembre)

| Heure (locale, UTC+1) | Échéance |
| --- | --- |
| 13h00 | Gel : plus aucune nouvelle fonctionnalité |
| 14h00 | **Soumission sur spaceappschallenge.org** (ne pas attendre la limite) |
| 16h00 | Pitch final devant le jury local |
| 22h00 / 23h59 | Clôture des soumissions (programme local / règle mondiale) – viser bien avant |

**Règles de soumission à respecter** (à revérifier dans le guide de soumission 2026) :
tout le formulaire, les slides et la vidéo **en anglais** (vidéo sous-titrée en anglais) ; démo courte
(les éditions précédentes : vidéo ≤ 30 s **ou** ≤ 7 slides) ; liens **publics** sans connexion ;
**données NASA obligatoires** pour les prix mondiaux ; **déclarer l'usage d'outils d'IA** (la NASA dit
« Super Intelligence (SI) ») ; citer toutes les sources (code, données, images) ; pas de logo NASA modifié.

## 3. Décisions prises (ne pas rouvrir sans raison)

- **Site** : mont Sharp (Aeolis Mons), cratère Gale. Raison : c'est l'exemple cité dans l'énoncé (boxworks
  étudiés par Curiosity), données haute résolution, radiations mesurées sur place (RAD), relief = vrai enjeu de
  sécurité. Jezero a été étudié puis écarté.
- **Objectif scientifique** : les **boxworks** (réseaux de crêtes). Curiosity y a trouvé des argiles sur les crêtes
  et des carbonates dans les creux → une cible **crête** + une cible **creux**.
- **Zone** : carré de **2 × 2 km** centré sur **137,38129° E / −4,80491°** (centre de la traversée des boxworks
  par Curiosity, sols 4534 à 4830, 73 positions, ~1,65 km parcourus, altitude −3 658 à −3 605 m,
  inclinaison max du rover 17,5°).
  - bbox (lon_min, lat_min, lon_max, lat_max) =
    `(137.36435825366365, -4.821777591159486, 137.39821845866513, -4.788036381443255)`
- **Points de mission** (avant recalage sur la grille de 4 m) :
  - Habitat (rover pressurisé garé) : `137.38566, -4.79796` (sol 4544, rover presque à plat, 2,3°)
  - Cible A – crête : `137.37827, -4.80492` (relief local +1,13 m)
  - Cible B – creux : `137.37909, -4.80794` (relief local −0,77 m)
- **Scénario de mission (cohérent avec les études NASA, préliminaires)** : 4 astronautes vers Mars, **2 en surface**
  ~30 jours, vivant dans un **rover pressurisé** (pas de base construite) ; sorties à pied **toujours à deux**
  (règle NASA) ; 2 en orbite + la Terre suivent la mission ; délai de communication Mars–Terre 3 à 22 min →
  l'outil doit guider en **autonomie**.
- **Direction produit (décidée après le retour du jury)** :
  > Un outil **web** de planification et de suivi d'une sortie à pied, utilisé dans le rover pressurisé.
  > Le HUD n'est pas une 2ᵉ appli : c'est un **« mode marche »** simplifié du même outil.
  > L'équipage en orbite et la Terre ouvrent le **même lien**.
  - Justification : la NASA suit ses rovers avec **MMGIS** (outil cartographique web open source du JPL –
    les positions de Curiosity utilisées viennent de lui) ; Mars Trek est web ; les interfaces de visière sont
    étudiées par le programme étudiant **NASA SUITS** (notre mode marche = maquette web de ce type d'interface).
  - Données « temps réel » : impossible depuis la Terre (délai), plus de sismomètre actif (InSight arrêté fin 2022).
    → Panneau **Conditions** = dernières mesures connues (radiations RAD, météo REMS de Curiosity), présenté
    comme alimentable en direct par la station météo du rover lors d'une vraie mission.

## 4. Données et sources (toutes NASA ou programme USGS-NASA)

| Donnée | Source / URL |
| --- | --- |
| Modèle de terrain 1 m de Gale (MSL merged DEM, v3) | USGS Astrogeology – `https://planetarymaps.usgs.gov/mosaic/Mars/MSL/MSL_Gale_DEM_Mosaic_1m_v3.tif` |
| Orthomosaïque HiRISE couleur (COG) | `https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/Mars/MSL/MSL_Gale_HiRISE-LRGB_78quads_sharp_cog.tif` |
| Orthomosaïque HiRISE 25 cm (gris, 23 Go, secours) | `https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/MSL_Gale_Orthophoto_Mosaic_25cm_v3.tif` |
| Positions de Curiosity | NASA/JPL MMGIS – `https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints.json` (extrait : `curiosity_boxworks_waypoints.geojson`) |
| Radiations | RAD (Curiosity) : ~0,67 mSv/jour en surface (moyenne 2012–2013, Hassler et al., Science 2013) |
| Ressources officielles du défi | Mars Trek, USGS-NASA Planetary Geologic Mapping, itinéraire de Curiosity sur le mont Sharp, NASA Worldview, images brutes de Perseverance |

Toutes les URL de données USGS se lisent à distance via GDAL (`/vsicurl/…`) : on ne télécharge que la zone.

## 5. Le pipeline (fait, fonctionne)

- **Exécution** : dans **Google Colab**, notebook `MartianMap_Colab_v2.ipynb` (autonome : il recrée le script et
  le GeoJSON). Étapes 1 à 6 dans l'ordre ; l'étape 6 télécharge `sortie.zip`.
- **Script** `martian_map_pipeline.py` (Python : rasterio, pyproj, numpy, scipy, scikit-image, Pillow) :
  1. découpe la zone dans le DEM et l'orthomosaïque (lecture distante) ;
  2. **calibre** l'échelle de lissage de la pente sur l'inclinaison mesurée par Curiosity aux 73 positions ;
  3. rugosité (écart-type local 5 × 5 m), seuil interdit = max(1,5 m ; 1,1 × rugosité max franchie par Curiosity) ;
  4. classes de danger : facile < 10° ≤ prudence < 20° ≤ interdit (ou rugosité ≥ seuil) ;
  5. couche **crêtes/creux** = indice de position topographique (altitude lissée − moyenne sur 21 m) ;
  6. choix auto des cibles : crête la plus nette ≤ 120 m de A, creux le plus net ≤ 120 m de B, hors zone interdite ;
  7. itinéraire = **Dijkstra** (`skimage.graph.route_through_array`) sur une grille de **temps de marche**
     (**règle de Tobler** : v = 6·exp(−3,5·(tan θ + 0,05)) km/h), cases de 4 m, zones interdites exclues,
     points en zone interdite recalés sur la case autorisée la plus proche ;
  8. temps prudent = temps Tobler / 0,5 (**hypothèse** combinaison) ; dose = 0,67 mSv/jour × durée / 24,66 h ;
  9. exports dans `sortie/` : couches PNG, `itineraire.geojson`, **`mission.json`**, `carte.html`
     (visionneuse simple) et recopie de **`app.html`** + `leaflet/` (interface finale, voir §7).
- **Correctifs déjà intégrés** : `profile.pop("photometric")` (erreur « PHOTOMETRIC=YCBCR requires COMPRESS=JPEG »).
- **Version 3 (15 nov.)** : ajout de `construire_mission()` → `mission.json` + `mission.js` ;
  export d'un `optique.jpg` allégé (4 096 px) car `optique.png` fait 135 Mo, au-delà de la limite GitHub ;
  points de l'itinéraire dédoublonnés aux jonctions, avec altitude, pente, cap, distance et temps cumulés
  en chaque point. Le notebook écrit aussi `app.html` et télécharge Leaflet en local (étape 2).

### Fichiers produits dans `sortie/`

| Fichier | Rôle | Taille |
| --- | --- | --- |
| `app.html` | **interface finale, 2 écrans** (§7) | 36 Ko |
| `mission.json` | toutes les données lues par `app.html` | 20 Ko |
| `mission.js` | même contenu en `window.MISSION` → ouverture en double-clic (`file://`) | 20 Ko |
| `optique.jpg` | HiRISE 4 014 px (50 cm/px) — **c'est celui qu'affiche `app.html`** | 5,7 Mo |
| `relief.png`, `pentes.png`, `dangers.png`, `cretes_creux.png` | couches calées sur la bbox | 0,2 à 2,6 Mo |
| `itineraire.geojson` | LineString lon/lat + stats | 13 Ko |
| `leaflet/` | copie locale de Leaflet 1.9.4 (fonctionne sans réseau) | 165 Ko |
| `carte.html` | visionneuse simple de la v2 (secours ; données en dur dans son JS) | 17 Ko |
| `optique.png` | HiRISE pleine résolution (8 028 px) | **135 Mo** |
| `ortho.tif`, `dem.tif` | découpes brutes | **161 Mo** / 11 Mo |

> **À ne pas pousser sur GitHub** : `optique.png`, `ortho.tif` (limite de 100 Mo par fichier).
> Mettre en ligne `app.html`, `mission.json`, `mission.js`, `optique.jpg`, les 4 PNG, `leaflet/`,
> `itineraire.geojson` (≈ 12 Mo au total) — et ajouter un `.gitignore` avec `optique.png`, `*.tif`.

### Résultats de la version 2 (Colab, données réelles)

```
Calibration (écart moyen pente calculée vs inclinaison Curiosity) :
  lissage 0 m 7,6° · 1 m 6,3° · 2 m 4,8° · 3 m 3,6° · 5 m 2,8°   -> retenu 5 m
Validation : pente moyenne calculée 8,7° vs 8,5° mesurés (73 positions)
Rugosité max franchie par Curiosity 1,41 m -> seuil interdit 1,56 m
Zone : facile 40 %, prudence 35 %, interdite 25 %
Itinéraire : 1,57 km (boucle Habitat → crête → creux → Habitat), D+ 88 m, pente max 19,8°, 13 % en prudence
Temps de marche : 27 min (Tobler) ; 54 min (scénario prudent)
Radiations : ≈ 0,024 mSv pendant la marche
```

Limites connues : 5 m est la plus grande échelle testée (tester 7 et 10 m) ; pente max proche du seuil de 20° ;
facteur 0,5 = hypothèse ; couches spectrale (CRISM) et thermique (THEMIS) **non intégrées**.

## 6. État d'avancement

- [x] Compréhension du sujet, choix du site et de la zone, scénario de mission
- [x] Pipeline de données + carte Leaflet (version 2)
- [x] Deck de présentation (artefact Slides sur le compte de Gédéon ; exportable en PDF/PPTX depuis Partager › Exporter) :
      contexte, demande, contraintes, livrables, ressources, choix, MVP, validation, technologies, limites
- [x] **Interface finale `app.html`** : 2 écrans, lit `mission.json` (voir §7) — testée dans Chrome,
      en HTTP et en double-clic
- [ ] Mise en ligne GitHub Pages (dépôt public `martian-map`, contenu de `sortie/` à la racine, **sauf**
      `optique.png` et `*.tif`) – lien : `[À COMPLÉTER]`
- [ ] Photos au sol de Curiosity pour les cibles (galerie des images brutes, sols 4643 et 4684)
- [ ] Slide « Notre direction » (outil web + mode marche) – à ajouter si absente
- [ ] Page projet **en anglais** sur spaceappschallenge.org + déclaration de l'usage de l'IA + liste des sources
- [ ] Vidéo / slides de démo au format exigé par le guide 2026
- [ ] (Bonus) démo terrestre avec NASA Worldview (forêt gabonaise)

## 7. L'interface `app.html` (faite le 15 nov.)

Une seule page HTML autonome, en français, thème sombre Mars (#1B1512 / #F6F0E8 / #E59A6B / #B5462A).
Elle charge **tout** depuis `mission.json` — aucune donnée en dur. Leaflet est servi depuis `leaflet/`
(copie locale) et bascule sur unpkg si le dossier est absent.

**Comment l'ouvrir**
- Double-clic sur `sortie/app.html` : fonctionne, grâce à `mission.js` (`file://` interdit `fetch`).
- Ou, pour être dans les mêmes conditions que GitHub Pages :
  `python -m http.server 8000` dans le dossier, puis `http://localhost:8000/app.html`.

**Écran 1 · Planification (dans le rover pressurisé)**
- Carte Leaflet (`L.CRS.EPSG4326`, `imageOverlay` sur la bbox) ; fond au choix **optique HiRISE** ou
  **relief ombré** ; couches **pentes**, **dangers**, **crêtes/creux**, **itinéraire**, **trajet de Curiosity** ;
  curseur d'opacité et légende des 3 classes de danger.
- Panneau droit : bilan (1,57 km · 54 min · D+ 88 m · pente max 19,8° · ≈ 0,024 mSv · 2 cibles),
  **profil d'altitude** avec un ruban vert/orange/rouge sous la courbe, puis les 4 étapes
  (Habitat → crête → creux → Habitat) avec distance, temps, D+, pente max et la cible scientifique visée.
  Un clic sur une étape **zoome la carte sur ce segment** et le surligne dans le profil.
- Bas : panneau **Conditions** (radiations RAD, température, pression, vent, opacité, sismicité), chaque
  mesure avec sa source et la mention « dernières mesures publiées ».  Liste des sources dépliable.
- Bouton **« Passer en mode marche »**.

**Écran 2 · Mode marche (maquette du HUD de visière)**
- Boussole : **cap à suivre** (il suit l'itinéraire validé, pas la ligne droite vers la cible — c'est tout
  l'intérêt du produit), aiguille colorée selon la pente.
- Trois grands nombres : **distance** et **temps** jusqu'au prochain point, **temps de retour à l'habitat**
  (marche prudente + les arrêts scientifiques restants, 20 min par cible).
- **Alerte de pente** : vert < 10°, orange ≥ 10°, rouge (clignotant) ≥ 17°, seuil de sécurité 20°.
- Mini-carte de la position sur l'itinéraire, barre de progression, dose cumulée.
- Commandes de démo : `− 25 m`, `Avancer + 25 m`, `▶ Lecture`, curseur ; au clavier `←` `→`, `espace`, `échap`.

**Structure de `mission.json`** : `site`, `bounds`/`bbox`, `seuils`, `couches[]` (fichier + opacité),
`habitat`, `cibles[]` (nature, science, durée d'arrêt), `itineraire` (`coordinates`, `altitude_m`,
`pente_deg`, `distance_cum_m`, `temps_cum_s`, `cap_deg`), `etapes[]` (`i_debut`/`i_fin` + stats),
`stats`, `waypoints_curiosity`, `conditions`, `sources`.
Les textes du panneau Conditions et les sources se modifient dans les constantes `CONDITIONS`,
`SOURCES`, `SCIENCE_CIBLES` en haut de `martian_map_pipeline.py`.

**Vérifié** : chargement en HTTP et en `file://`, bascule des 5 couches, zoom par étape, parcours complet
du mode marche (l'alerte rouge se déclenche bien à 19,4° vers 608 m).
**Non vérifié** : rendu sur mobile et sur un écran < 1 100 px (une règle CSS empile les panneaux,
mais ça n'a pas été testé) ; `construire_mission()` a été testée sur les données réelles déjà calculées,
le pipeline complet n'a pas été relancé depuis Colab après la mise à jour.

**Si vous relancez le notebook** : exécutez les cellules dans l'ordre ; les deux nouvelles cellules de
l'étape 2 écrivent `app.html` et téléchargent Leaflet. `sortie.zip` contient alors le site complet.

**Restes possibles, si le temps le permet** (gel à 13h) : photos au sol de Curiosity sur les deux cibles ;
bouton « ×1 / ×2 » pour régler le facteur de vitesse en direct devant le jury ; version anglaise de l'interface.

## 8. Arguments clés pour le jury

1. **Hyper-local** : la carte d'une seule sortie, pas de la planète (le vide décrit par l'énoncé).
2. **Validé sur le terrain réel** : pente calibrée sur 73 mesures de Curiosity (écart 7,6° → 2,8°).
3. **Le chemin le plus rapide ET sûr** : Dijkstra sur le temps de marche (Tobler), zones dangereuses exclues.
4. **Données NASA** : HiRISE, DEM USGS-NASA, positions et radiations de Curiosity.
5. **Une direction** : un outil web dans le rover + un mode marche ; même lien pour l'orbite et la Terre.
6. **Hypothèses assumées et réglables** (vitesse en combinaison, seuils de pente).
