# Martian Map – Fichier de passation (NASA Space Apps Challenge 2026, Libreville)

> À donner en premier à une nouvelle session Claude (Claude Code ou claude.ai).
> **Langue : français.** Réponses brèves, instructions précises pas à pas. Rester honnête sur les hypothèses.
> Le projet est désormais un dépôt git. Tout est dans le dossier : il suffit de le donner en entier.
> Point d'entrée du produit : **`site/index.html`** (voir §9).

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
- [x] **Interface v2 `sortie/sortie/app.html`** : 2 écrans, lit `mission.json` (voir §7)
- [x] **Interface v3 `site/`** : identité DEVSEC, authentification, terrain 3D réel, visière,
      liaison entre postes (voir §9). C'est **elle** qu'on montre au jury.
- [x] Dépôt git initialisé, `.gitignore` qui exclut la clé SSH et les fichiers > 100 Mo
- [x] Site déposé sur le VPS Devs Solutions (zone d'attente `~/martian-map.nouveau`)
- [ ] **DNS `martian-map.devs-solutions.tech` → 37.59.100.251**, puis `bash ~/mise-en-ligne.sh`
      (voir `deploiement/DEPLOIEMENT.md`) – lien : `[À COMPLÉTER]`
- [ ] Photos au sol de Curiosity pour les cibles (galerie des images brutes, sols 4643 et 4684)
- [ ] Slide « Notre direction » (outil web + mode marche) – à ajouter si absente
- [ ] Changer les codes d'accès de démonstration avant toute diffusion publique
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
5. **Une direction** : un outil web dans le rover + un mode marche ; même lien pour l'orbite et la Terre,
   avec des droits différents selon le poste.
6. **Hypothèses assumées et réglables** (vitesse en combinaison, seuils de pente).
7. **Le relief est réel, pas illustré** : la vue 3D et la vision de l'astronaute sont construites sur le
   modèle de terrain 1 m de l'USGS, texturé par HiRISE. Ce que voit l'astronaute dans la visière est
   la vraie topographie du mont Sharp.
8. **Un design argumenté, pas décoratif** : accent froid parce que le sol est rouille, chaud réservé aux
   alertes, centre de la visière laissé libre pour la vision. Chaque choix se justifie en une phrase (§9.2).

## 9. Le site `site/` — version 3 (15 nov., design DEVSEC)

C'est le livrable montré au jury. `sortie/sortie/app.html` (§7) reste comme
version de secours, sans dépendance au serveur.

### 9.1 Organisation

```
site/
  index.html              écran d'accès (poste + identifiant + code)
  app.html                l'outil : carte 2D, terrain 3D, visière
  assets/
    css/martian.css       le système de design (tout y est commenté)
    js/noyau.js           formats, géométrie Mars, session, sons, vibrations, liaison
    js/auth.js            vérification du code (SHA-256), blocage après 5 échecs
    js/carte2d.js         Leaflet, couches, profil en long, panneau de mission
    js/terrain3d.js       three.js : relief réel, itinéraire, balises, deux caméras
    js/hud.js             visière : bande de cap, minicarte inclinée, arrivée sur cible
    js/app.js             orchestration, progression, droits par poste
    fonts/                Space Grotesk, Inter, JetBrains Mono (servies localement)
    vendor/               Leaflet 1.9.4, three.js r160 (aucun CDN)
    img/                  logos détourés, image d'accueil, texture de la palette
    data/                 mission.json + couches + terrain (copie de sortie/)
deploiement/              vhost nginx, script de mise en ligne, DEPLOIEMENT.md
```

### 9.2 Les quatre règles du design (à citer au jury)

1. **Verre gris.** Les panneaux sont des plaques translucides tirées de la
   palette fournie (gris neutre #6E6F71 → #FFFFFF). L'instrument se pose sur
   le terrain sans jamais l'effacer — comme une visière.
2. **L'accent est froid.** Le sol de Gale est rouille ; un accent chaud s'y
   noie. L'accent instrument est donc **cyan** : contraste maximal sur la
   roche, et lecture immédiate de « ceci est une donnée, pas du paysage ».
3. **Le chaud est réservé au danger.** Ambre = prudence, rouge = limite,
   nulle part ailleurs. Dans une interface de sécurité, une couleur d'alerte
   utilisée pour décorer est une faute.
4. **Le centre est libre.** En mode marche, rien n'est posé au centre de
   l'écran : c'est le champ de vision de l'astronaute.

Toutes les couleurs sont des variables CSS en haut de `martian.css` : changer
l'accent, c'est changer une ligne.

### 9.3 Écran d'accès (`index.html`)

Formulaire à gauche, imagerie réelle du site à droite (HiRISE recadré sur la
boucle, l'itinéraire tracé dessus, texte minimal). Le **poste** choisi décide
des droits :

| Poste | Voit la carte | Conduit la marche | Émet des messages | Délai affiché |
| --- | --- | --- | --- | --- |
| Rover (surface) | oui | **oui** | oui | direct |
| Orbite | oui | non | oui | direct |
| Terre | oui | non | non (écoute) | 12 min |

Identifiants de démonstration : `ged.rover` / `ARES-01`, `crew.orbite` /
`ARES-02`, `sol.terre` / `ARES-03`. Les champs sont pré-remplis.
**L'authentification est une maquette côté navigateur** — c'est écrit dans
`deploiement/DEPLOIEMENT.md`, à assumer si le jury pose la question.

L'insigne NASA n'est **pas** la marque du produit : il figure en bas de page
comme **source de données**, avec la mention « projet indépendant DEVSEC, sans
affiliation ni validation de la NASA ». C'est ce que demandent les règles du
concours, et c'est plus défendable qu'un logo NASA en en-tête.

### 9.4 Écran de planification

Carte **plein écran** (cadrage « cover » : l'emprise remplit la fenêtre), les
panneaux flottent dessus et se replient tous. Couches : optique HiRISE ou
relief ombré en fond ; pentes, dangers, crêtes/creux, itinéraire, traces de
Curiosity en superposition, avec un curseur d'opacité.

Les PNG de couches ont été **redessinés** : on ne colore que ce qui contraint
la marche (terrain praticable presque transparent, prudence en ambre léger,
interdit en rouge dense avec un liseré sur la limite). Les chiffres sont
identiques au pipeline : 40 % facile, 35 % prudence, 25 % interdit.

Bouton **Terrain 3D** : le vrai modèle de terrain 1 m, 512 × 512, texturé par
l'orthomosaïque HiRISE, avec l'itinéraire, les balises de cible et la position
du marcheur. Souris : glisser pour tourner, molette pour zoomer.

### 9.5 Mode marche (visière)

Le fond n'est plus une carte : c'est le **terrain 3D vu depuis les yeux de
l'astronaute** (1,72 m, caméra orientée sur le cap suivi). L'itinéraire y
apparaît comme un sentier d'un mètre, jalonné de balises tous les 25 m,
posées sur le côté du cheminement.

Disposition : bande de cap en haut, bloc « prochain point / distance / temps »
à gauche, « pente / retour habitat / dose / cap » à droite, minicarte inclinée
façon jeu vidéo en bas à gauche, commandes de démonstration en bas à droite.
Centre vide.

**Arrivée sur une cible** : la marche s'arrête, une carte apparaît avec
l'objectif scientifique et un chronomètre de relevé (20 min de temps mission,
défilement accéléré ×60 pour la démo), son + vibration, et un message est
émis automatiquement vers l'orbite. À la fin du relevé, la marche reprend.

Clavier : `←` `→` avancer de 25 m, `espace` lecture/pause, `échap` revenir à
la planification.

### 9.6 Retours sensoriels

Sons **de synthèse** (Web Audio, aucun fichier) avec un vocabulaire cohérent :
montant = confirmation, battement grave = danger. Vibrations via
`navigator.vibrate` (tablette, téléphone). **Coupables d'un clic** dans la
barre haute — une interface qui bipe sans arrêt pendant un pitch est une
interface ratée.

### 9.7 Liaison surface ↔ orbite ↔ Terre

`BroadcastChannel` + `localStorage` : aucun serveur. **Démonstration qui
marche à tous les coups** : ouvrir deux fenêtres, se connecter en « Rover »
dans l'une et en « Orbite » dans l'autre. Un message émis depuis l'orbite
(« Hausse des radiations ») s'affiche en alerte rouge **dans la visière** du
rover, avec son et vibration. Le rover répond, le message remonte.

Limite assumée : c'est une liaison entre deux onglets du même navigateur, pas
un vrai réseau. Le point démontré est l'**usage**, pas le transport.

### 9.8 Vérifié / non vérifié

**Vérifié dans Chrome** : accès et redirection sans session, les trois postes
et leurs droits, les sept couches, le cadrage par étape, le terrain 3D, la
vision première personne, l'arrivée sur cible avec chronomètre, la liaison
entre deux onglets dans les deux sens, aucune erreur en console.

**Non vérifié** : affichage sur mobile et tablette (les règles CSS existent,
rien n'a été testé) ; Firefox et Safari ; le rendu 3D sur une machine sans
accélération graphique (l'application bascule alors sur la carte 2D seule et
masque le bouton 3D — le chemin de secours existe mais n'a pas été provoqué).

### 9.9 Mise en ligne

Tout est dans **`deploiement/DEPLOIEMENT.md`**. En résumé : le site (18 Mo)
est déjà déposé sur le VPS dans `~/martian-map.nouveau`, rien de live n'a été
touché. Il reste à pointer le DNS puis à lancer `bash ~/mise-en-ligne.sh`.

## 10. Version 4 (15 nov., matin) — design, réalisme, liaison

Non déployée : à valider en local (`cd site && python -m http.server 8000`).

**Système de design.** Verre gris réel : les plaques floutent, teintent en gris
et **désaturent** ce qu'elles recouvrent (`--verre-fume`, `--flou-fume` dans
`martian.css`). Ne pas utiliser `brightness()` dans `backdrop-filter` : il
bloque le rendu de Chrome sur cette page (constaté). Typographie agrandie
(corps 17 px), textes secondaires éclaircis.

**Écran d'accès.** Gauche : surface claire tirée de la palette, carte de
verre dépoli blanc, logos DEVSEC + NASA en tête (« Données NASA »).
Droite : **casque NASA en 3D** (modèle officiel *Helmet*, NASA 3D Resources),
visière dorée qui reflète un ciel martien, rotation au doigt/souris, il se
tourne vers l'utilisateur à l'entrée.

**Mise à jour (même jour) : plus d'authentification et interface 100 % en
anglais**, à la demande de l'équipe (authentification non autorisée par le
concours, soumission en anglais). L'écran d'entrée (`index.html` +
`assets/js/entree.js`) propose seulement « Choose your station » : Surface
crew / Orbit relay / Mission control. `auth.js` est supprimé. Les textes de
`mission.json` sont traduits à la main (le pipeline produit encore du
français). Les clés de stockage local sont passées en `mm.en.*`.

**Visière.**
- Vitesse réelle : la marche suit la vitesse prudente calculée point par
  point (≈ 1,7–2,9 km/h), accélérable ×1 / ×10 / ×30. Les ±25 m glissent.
- Caméra lissée (cap et position), balancement de pas, regard un peu plongeant,
  bruit de pas synthétique.
- Ciel martien en dégradé + brume assortie ; texture HiRISE 0,5 m (la même
  que la carte 2D) ; grain de sol procédural de près seulement.
- Sentier = régolithe tassé **peint dans le terrain** (masque), plus de
  ruban cyan flottant ; chevrons de guidage discrets sur 35 m ; jalons en
  aluminium éclairés tous les 25 m.
- Habitat : rover pressurisé **Space Exploration Vehicle** (modèle NASA),
  plus aucun point clignotant (ni dans la barre, ni à l'habitat).
- Radar à couches (touche R) : « Zones » = dangers du pipeline + zones
  signalées par l'orbite, distance à l'interdit le plus proche ; « Trajet ».
  Portée 160 / 320 m.

**Liaison.** Messages libres avec priorité, accusés de réception
automatiques (« ✓✓ reçu · Rover 09:17 »), télémétrie du marcheur en direct
chez l'orbite et la Terre, **zone à éviter** posée au clic par l'orbite →
carte 2D, terrain 3D (paroi rouge qui suit le relief) et radar de la visière.
Nouveaux messages : éruption solaire (SPE), assistance, retour engagé. Dans
la visière, réponses rapides 1 / 2 / 3.

**Modèles 3D** (`site/assets/modeles/`) recompressés avec gltf-transform
(Draco) : SEV 22 Mo → 750 Ko, casque 170 Ko, MRO 107 Ko (non utilisé pour
l'instant). Décodeur Draco servi localement (`assets/vendor/draco/`).

**Non vérifié v4** : mobile/tablette, Firefox/Safari, vibrations sur appareil réel.
**Point à arbitrer** : le logo NASA est désormais en tête de l'écran d'accès
et de la barre, avec la mention « Données NASA » et la clause de
non-affiliation. Les règles Space Apps interdisent de suggérer un
partenariat avec la NASA : à confirmer avant soumission.
