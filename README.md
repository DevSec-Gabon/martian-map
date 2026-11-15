# Martian Map

**Plan and walk a safe EVA on Mars, using real NASA terrain data.**

Martian Map is a hyper-local planning and guidance tool for a Mars surface walk
("Marswalk"). It covers one 2 × 2 km site — the boxwork ridges of Mount Sharp
(Aeolis Mons), Gale crater, where the Curiosity rover is working — and turns
orbital imagery and a 1 m terrain model into a safe walking route, a heads-up
visor for the astronaut, and a live link with the crew in orbit.

Built for the **NASA Space Apps Challenge 2026** — challenge *Interplanetary
Survival Guide: Martian Map* — by **Team DevSec** (Libreville, Gabon).

**Live demo:** https://martian-map.devs-solutions.tech

---

## The problem

Existing Mars maps (Mars Trek, MMGIS) are regional or global. An astronaut on
foot needs something else: *this* slope, *this* boulder field, *this* route,
and how long it takes in a pressure suit. With a 3 to 22 minute light delay to
Earth, the crew must decide on their own.

## What it does

**One tool, three views, one shared link.**

| View | Used by | What it shows |
| --- | --- | --- |
| **Planning** (2D map) | Everyone | HiRISE imagery or shaded relief, slope / hazard / ridge-and-trough layers, the planned route, Curiosity's traverse, elevation profile, step-by-step plan, latest RAD and REMS conditions |
| **3D terrain** | Everyone | The real 1 m terrain model draped with HiRISE imagery; the route and the walker's live trail |
| **Walk mode** (visor) | Surface crew | First-person view at eye height, heading tape, distance and time to the next waypoint, slope alert, time back to the habitat, radiation dose, layered radar |

### The route

The route is not drawn by hand. It is computed:

1. Slope is derived from the USGS 1 m DEM and **calibrated against the tilt
   Curiosity actually measured** at 73 positions (mean error 7.6° → 2.8°).
2. Terrain is classified: easy (< 10°), caution (10–20°), no-go (> 20° or
   rough boulder fields, using the roughest ground Curiosity crossed as the limit).
3. The path is the **fastest safe path** (Dijkstra) on a walking-time grid
   using **Tobler's hiking function**, with no-go cells excluded.
4. Walking time is doubled for a pressure suit (an explicit, adjustable assumption);
   dose uses the RAD surface average of 0.67 mSv/day.

Result for EVA 01: a 1.57 km loop, habitat → ridge (clays) → trough (carbonates)
→ habitat, 54 min of walking, +88 m elevation gain, 0.024 mSv.

### Walk mode (visor)

- Real walking pace computed point by point along the route, with ×1 / ×10 / ×30
  time acceleration for demos.
- Mars sky and dust haze, 0.5 m HiRISE texture with fine ground detail up close,
  the trail as packed regolith, discreet guidance chevrons, survey stakes.
- NASA's **Space Exploration Vehicle** (pressurized rover) parked at the habitat.
- **Layered radar**: hazard zones from the pipeline plus zones reported from
  orbit, with the distance to the nearest no-go area.
- Arrival on a science target: sampling timer, sound and vibration, automatic
  message to orbit, then the walk resumes.
- The centre of the screen stays free: it is the astronaut's field of view.

### Crew link (surface ↔ orbit ↔ Earth)

Open the site in two windows, one as **Surface crew** and one as **Orbit relay**:

- the orbit sees the walker **live** on the 2D map and the 3D terrain (smooth
  position, walked trail, auto-follow);
- free-text messages with priority, and **automatic delivery receipts**;
- one-click alerts: solar particle event, radiation rising, dust, equipment issue,
  return now;
- **no-go zones** placed on the map by the orbit appear in the astronaut's radar
  and as a red wall in the visor;
- quick replies from the visor (keys 1, 2, 3);
- **Mission control** (Earth) listens only, with a 12 min light delay shown.

The link uses the browser's `BroadcastChannel`: it demonstrates the workflow
between stations, not a real network transport.

## Design

Four rules, each with a reason:

1. **Grey glass.** Panels are smoked glass that blurs, tints and desaturates
   what is behind them: the terrain stays visible, the data stands out.
2. **A cold accent.** Gale's ground is rust-coloured; a warm accent would
   disappear. Cyan reads instantly as "data, not landscape".
3. **Warm colours mean danger.** Amber is caution, red is the limit — nowhere else.
4. **The centre is free.** In walk mode nothing sits in the astronaut's line of sight.

Synthesized sounds (no audio files) with a consistent vocabulary — rising
tones confirm, low beats warn — and device vibration on tablets and phones.
Sounds can be muted with one click.

## Run it locally

The site is fully static — no build step, no dependencies to install, no CDN.

```bash
cd site
python -m http.server 8000
# open http://localhost:8000
```

A local HTTP server is required (browsers block `fetch` on `file://`).

## Regenerate the data

The data pipeline runs in Google Colab: open `MartianMap_Colab_v2.ipynb` and run
the cells in order. It reads only the study area from the remote USGS
GeoTIFFs (GDAL `/vsicurl/`) and writes the layers, the route and
`mission.json` to `sortie/`.

## Repository layout

```
site/                      the web application (what is deployed)
  index.html               entry screen (choose your station)
  app.html                 planning, 3D terrain and walk mode
  assets/js/               noyau (core), carte2d, terrain3d, hud, app, entree, acces3d
  assets/css/martian.css   design system
  assets/data/             mission.json, map layers, terrain height map
  assets/modeles/          NASA 3D models (glTF, Draco-compressed)
  assets/vendor/           Leaflet, three.js, Draco decoder (served locally)
martian_map_pipeline.py    data pipeline (terrain, slope, hazards, route)
MartianMap_Colab_v2.ipynb  notebook that runs the pipeline in Colab
deploiement/               nginx virtual host and publishing notes
```

## Data sources

| Data | Source |
| --- | --- |
| 1 m terrain model of Gale crater (MSL Gale DEM Mosaic v3) | USGS Astrogeology |
| HiRISE colour orthomosaic | NASA / JPL-Caltech / University of Arizona, via USGS |
| Curiosity positions and tilts | NASA/JPL MMGIS (`MSL_waypoints`) |
| Surface radiation | MSL/RAD — Hassler et al., *Science* 2013 |
| Weather | MSL/REMS — Centro de Astrobiología (CSIC-INTA) / NASA JPL |
| 3D models (helmet, Space Exploration Vehicle) | NASA 3D Resources |

## Known limits

- Suit walking speed (× 0.5 of Tobler) and slope thresholds are assumptions,
  shown in the interface and easy to change.
- Conditions are the latest published Curiosity measurements, not live data.
- Spectral (CRISM) and thermal (THEMIS) layers are not integrated yet.
- The crew link works between windows of the same browser.
- There is no authentication; the station choice only sets what the interface offers.

## Team and credits

Designed and built by **Team DevSec** (Libreville, Gabon), with the assistance
of an AI tool (Claude, Anthropic) for code and texts.

Independent project for the NASA Space Apps Challenge 2026 — not affiliated
with or endorsed by NASA.
