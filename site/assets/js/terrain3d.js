/* ===========================================================================
   MARTIAN MAP — terrain 3D
   Le relief n'est pas une illustration : c'est le modèle de terrain 1 m de
   l'USGS (MSL Gale DEM v3), ré-échantillonné à 512 × 512 et encodé sur
   16 bits, habillé de l'orthomosaïque HiRISE. La même scène sert à deux
   choses : la vue d'ensemble du site, et la vision de l'astronaute en marche.

   Repère : X vers l'est, Z vers le sud, Y vers le haut. Origine au centre
   de l'emprise. Unité : le mètre.
   =========================================================================== */
import * as THREE from '../vendor/three.module.min.js';

var R_MARS = 3396190, RAD = Math.PI / 180;

export function creerTerrain(toile, options) {
  var opt = options || {};
  var scene, cam, rendu, terrain, marcheur, groupe;
  var meta = null, hauteurs = null, N = 0;
  var bbox, lon0, lat0, largeur, profondeur;
  var mode = 'orbite';
  var orbite = {rayon: 980, theta: 212 * RAD, phi: 55 * RAD, cible: new THREE.Vector3()};
  var anim = null, pret = false, visible = false;

  /* ------------------------------------------------- conversions lon/lat */
  function versScene(lon, lat, y) {
    return new THREE.Vector3(
      (lon - lon0) * RAD * R_MARS * Math.cos(lat * RAD),
      y === undefined ? 0 : y,
      -(lat - lat0) * RAD * R_MARS
    );
  }
  function altitude(lon, lat) {
    if (!hauteurs) return 0;
    var u = (lon - bbox[0]) / (bbox[2] - bbox[0]);
    var v = (bbox[3] - lat) / (bbox[3] - bbox[1]);
    var c = Math.min(Math.max(u, 0), 1) * (N - 1);
    var r = Math.min(Math.max(v, 0), 1) * (N - 1);
    var c0 = Math.floor(c), r0 = Math.floor(r);
    var c1 = Math.min(c0 + 1, N - 1), r1 = Math.min(r0 + 1, N - 1);
    var fc = c - c0, fr = r - r0;
    var h = function (rr, cc) { return hauteurs[rr * N + cc]; };
    return (1 - fr) * ((1 - fc) * h(r0, c0) + fc * h(r0, c1))
         + fr * ((1 - fc) * h(r1, c0) + fc * h(r1, c1));
  }

  /* ------------------------------------------------------------ chargement */
  function image(src) {
    return new Promise(function (ok, ko) {
      var i = new Image();
      i.crossOrigin = 'anonymous';
      i.onload = function () { ok(i); };
      i.onerror = function () { ko(new Error('image ' + src)); };
      i.src = src;
    });
  }

  function decoder(img) {
    var cv = document.createElement('canvas');
    cv.width = img.width; cv.height = img.height;
    var cx = cv.getContext('2d', {willReadFrequently: true});
    cx.drawImage(img, 0, 0);
    var d = cx.getImageData(0, 0, cv.width, cv.height).data;
    var n = cv.width, t = new Float32Array(n * n);
    var min = meta.alt_min_m, ech = (meta.alt_max_m - meta.alt_min_m) / 65535;
    for (var i = 0; i < n * n; i++) t[i] = min + (d[i * 4] * 256 + d[i * 4 + 1]) * ech;
    return {n: n, t: t};
  }

  /* ------------------------------------------------------------- la scène */
  function batir(texture) {
    scene = new THREE.Scene();
    // ciel martien : poussière fine, horizon chaud. Le verre cyan de la
    // visière se détache nettement dessus.
    scene.background = new THREE.Color(0x30231A);
    scene.fog = new THREE.Fog(0x30231A, 520, 2700);

    cam = new THREE.PerspectiveCamera(52, 1, 0.8, 9000);

    rendu = new THREE.WebGLRenderer({canvas: toile, antialias: true, powerPreference: 'high-performance'});
    rendu.setPixelRatio(Math.min(devicePixelRatio || 1, 1.6));
    rendu.outputColorSpace = THREE.SRGBColorSpace;

    groupe = new THREE.Group();
    scene.add(groupe);

    // --- relief
    var geo = new THREE.PlaneGeometry(largeur, profondeur, N - 1, N - 1);
    var pos = geo.attributes.position;
    for (var i = 0; i < pos.count; i++) pos.setZ(i, hauteurs[i]);
    geo.rotateX(-Math.PI / 2);
    geo.computeVertexNormals();

    var tex = new THREE.Texture(texture);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = Math.min(8, rendu.capabilities.getMaxAnisotropy());
    tex.needsUpdate = true;

    terrain = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      map: tex, roughness: 1, metalness: 0
    }));
    // on recentre le relief sur l'altitude moyenne pour rester près de l'origine
    terrain.position.y = 0;
    groupe.add(terrain);

    // --- lumière : même azimut que l'ombrage calculé par le pipeline (315°, 45°)
    var az = 315 * RAD, el = 45 * RAD;
    var soleil = new THREE.DirectionalLight(0xFFE8D2, 2.1);
    soleil.position.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el))
      .multiplyScalar(3000);
    scene.add(soleil);
    scene.add(new THREE.HemisphereLight(0xC98B63, 0x2A1B13, 0.85));
    scene.add(new THREE.AmbientLight(0xFFFFFF, 0.18));

    ajouterItineraire();
    ajouterPoints();

    // --- marcheur (visible seulement en vue d'ensemble)
    marcheur = new THREE.Group();
    var corps = new THREE.Mesh(
      new THREE.ConeGeometry(2.6, 9, 14),
      new THREE.MeshBasicMaterial({color: 0x2FD0E6}));
    corps.position.y = 5;
    var halo = new THREE.Mesh(
      new THREE.CylinderGeometry(3.2, 3.2, 70, 16, 1, true),
      new THREE.MeshBasicMaterial({color: 0x2FD0E6, transparent: true, opacity: .16,
        side: THREE.DoubleSide, depthWrite: false}));
    halo.position.y = 35;
    marcheur.add(corps); marcheur.add(halo);
    groupe.add(marcheur);

    pret = true;
  }

  /* ------------------------------------------------------- l'itinéraire 3D */
  function ruban(points, largeurM, couleur, opacite, hauteurSol) {
    var s = [], uv = [], idx = [];
    for (var i = 0; i < points.length; i++) {
      // tangente prise sur ±2 points : évite le repli du ruban dans les angles
      var a = points[Math.max(i - 2, 0)], b = points[Math.min(i + 2, points.length - 1)];
      var tx = b.x - a.x, tz = b.z - a.z;
      var n = Math.hypot(tx, tz) || 1;
      var px = (tz / n) * largeurM / 2, pz = (-tx / n) * largeurM / 2;
      var p = points[i];
      s.push(p.x + px, p.y + hauteurSol, p.z + pz);
      s.push(p.x - px, p.y + hauteurSol, p.z - pz);
      uv.push(0, i / points.length, 1, i / points.length);
      if (i < points.length - 1) {
        var k = i * 2;
        idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      }
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(s, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return new THREE.Mesh(g, new THREE.MeshBasicMaterial({
      color: couleur, transparent: true, opacity: opacite,
      side: THREE.DoubleSide, depthWrite: false
    }));
  }

  // Deux représentations du même itinéraire. Vue d'ensemble : un ruban large,
  // lisible à 1 km. Visière : un sentier d'1,8 m jalonné de balises tous les
  // 25 m — à hauteur d'œil, un ruban de 13 m ressemblerait à une autoroute.
  var ptsRoute = [], gOrbite, gVisiere;
  function ajouterItineraire() {
    var IT = opt.mission.itineraire;
    ptsRoute = IT.coordinates.map(function (c, i) {
      return versScene(c[0], c[1], IT.altitude_m[i]);
    });

    gOrbite = new THREE.Group();
    gOrbite.add(ruban(ptsRoute, 13, 0x02080A, .5, 0.5));
    gOrbite.add(ruban(ptsRoute, 8, 0x2FD0E6, .5, 0.9));
    gOrbite.add(ruban(ptsRoute, 3.4, 0xDFFBFF, .95, 1.25));
    var w = opt.mission.waypoints_curiosity.coordinates.map(function (c) {
      return versScene(c[0], c[1], altitude(c[0], c[1]));
    });
    gOrbite.add(ruban(w, 4, 0x7FB3D5, .5, 0.6));
    groupe.add(gOrbite);

    gVisiere = new THREE.Group();
    gVisiere.add(ruban(ptsRoute, 1.0, 0x0A1A1F, .45, 0.05));
    gVisiere.add(ruban(ptsRoute, 0.55, 0x7FE8F7, .5, 0.09));

    // jalons : petits piquets plantés le long du trajet
    var geoP = new THREE.CylinderGeometry(0.055, 0.055, 1.25, 6);
    var matP = new THREE.MeshBasicMaterial({color: 0x9BE9F6, transparent: true, opacity: .75});
    var geoT = new THREE.SphereGeometry(0.13, 8, 6);
    var matT = new THREE.MeshBasicMaterial({color: 0x2FD0E6});
    // Les jalons sont plantés 1,3 m SUR LE CÔTÉ du cheminement : on ne marche
    // pas dedans, et on ne les a jamais collés à l'objectif.
    var D = IT.distance_cum_m, prochain = 0;
    for (var i = 0; i < ptsRoute.length; i++) {
      if (D[i] < prochain) continue;
      prochain = D[i] + 25;
      var p = ptsRoute[i];
      var av = ptsRoute[Math.min(i + 2, ptsRoute.length - 1)];
      var ar = ptsRoute[Math.max(i - 2, 0)];
      var tx = av.x - ar.x, tz = av.z - ar.z;
      var n = Math.hypot(tx, tz) || 1;
      var ox = (tz / n) * 1.3, oz = (-tx / n) * 1.3;
      var piquet = new THREE.Mesh(geoP, matP);
      piquet.position.set(p.x + ox, p.y + 0.62, p.z + oz);
      var tete = new THREE.Mesh(geoT, matT);
      tete.position.set(p.x + ox, p.y + 1.3, p.z + oz);
      gVisiere.add(piquet); gVisiere.add(tete);
    }
    gVisiere.visible = false;
    groupe.add(gVisiere);
  }

  function balise(lon, lat, couleur, hauteur) {
    var g = new THREE.Group();
    var y = altitude(lon, lat);
    var p = versScene(lon, lat, y);
    var faisceau = new THREE.Mesh(
      new THREE.CylinderGeometry(2.4, 2.4, hauteur, 18, 1, true),
      new THREE.MeshBasicMaterial({color: couleur, transparent: true, opacity: .38,
        side: THREE.DoubleSide, depthWrite: false}));
    faisceau.position.set(p.x, y + hauteur / 2, p.z);
    var anneau = new THREE.Mesh(
      new THREE.RingGeometry(9, 12, 44),
      new THREE.MeshBasicMaterial({color: couleur, transparent: true, opacity: .85,
        side: THREE.DoubleSide, depthWrite: false}));
    anneau.rotation.x = -Math.PI / 2;
    anneau.position.set(p.x, y + 0.6, p.z);
    g.add(faisceau); g.add(anneau);
    g.userData.anneau = anneau;
    g.userData.faisceau = faisceau;
    g.userData.lonlat = [lon, lat];
    return g;
  }

  var balises = [];
  function ajouterPoints() {
    var m = opt.mission;
    var bh = balise(m.habitat.lon, m.habitat.lat, 0xFFFFFF, 60);
    groupe.add(bh); balises.push(bh);
    m.cibles.forEach(function (c) {
      var b = balise(c.lon, c.lat, c.nature === 'creux' ? 0x6FA8FF : 0x2FD0E6, 46);
      groupe.add(b); balises.push(b);
    });
  }

  /* -------------------------------------------------------------- caméras */
  function majCamera(etat) {
    if (!pret) return;
    if (mode === 'visiere' && etat) {
      var y = altitude(etat.lon, etat.lat) + 1.72;          // hauteur des yeux
      var p = versScene(etat.lon, etat.lat, y);
      cam.fov = 68;
      cam.position.copy(p);
      var c = etat.cap * RAD;
      cam.lookAt(p.x + Math.sin(c) * 60, y - 2.4, p.z - Math.cos(c) * 60);
      cam.updateProjectionMatrix();
      marcheur.visible = false;
    } else {
      cam.fov = 52;
      var o = orbite;
      cam.position.set(
        o.cible.x + o.rayon * Math.sin(o.phi) * Math.sin(o.theta),
        o.cible.y + o.rayon * Math.cos(o.phi),
        o.cible.z + o.rayon * Math.sin(o.phi) * Math.cos(o.theta));
      cam.lookAt(o.cible);
      cam.updateProjectionMatrix();
      marcheur.visible = true;
    }
  }

  /* ------------------------------------------- commande d'orbite (souris) */
  function brancherOrbite() {
    var bas = false, x0 = 0, y0 = 0;
    toile.addEventListener('pointerdown', function (e) {
      if (mode !== 'orbite') return;
      bas = true; x0 = e.clientX; y0 = e.clientY; toile.setPointerCapture(e.pointerId);
      toile.style.cursor = 'grabbing';
    });
    toile.addEventListener('pointermove', function (e) {
      if (!bas || mode !== 'orbite') return;
      orbite.theta -= (e.clientX - x0) * 0.005;
      orbite.phi = Math.min(Math.max(orbite.phi - (e.clientY - y0) * 0.004, 0.12), 1.45);
      x0 = e.clientX; y0 = e.clientY;
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (t) {
      toile.addEventListener(t, function () { bas = false; toile.style.cursor = 'grab'; });
    });
    toile.addEventListener('wheel', function (e) {
      if (mode !== 'orbite') return;
      e.preventDefault();
      orbite.rayon = Math.min(Math.max(orbite.rayon * (1 + Math.sign(e.deltaY) * 0.1), 180), 4200);
    }, {passive: false});
    toile.style.cursor = 'grab';
  }

  /* ---------------------------------------------------------------- boucle */
  var dernier = null;
  function boucle() {
    anim = requestAnimationFrame(boucle);
    if (!pret || !visible) return;
    var t = performance.now() / 1000;
    balises.forEach(function (b, i) {
      var a = b.userData.anneau, f = b.userData.faisceau;
      var battement = Math.sin(t * 1.6 + i);
      a.scale.setScalar(1 + battement * 0.11);

      var proche = 1;
      if (mode === 'visiere' && dernier) {
        var d = Math.hypot(
          (dernier.lon - b.userData.lonlat[0]) * RAD * R_MARS * Math.cos(dernier.lat * RAD),
          (dernier.lat - b.userData.lonlat[1]) * RAD * R_MARS);
        proche = Math.min(Math.max((d - 14) / 26, 0), 1);   // effacement sous 40 m
      }
      a.material.opacity = (.6 + battement * .25) * proche;
      f.material.opacity = .38 * proche;
      a.visible = f.visible = proche > 0.02;
    });
    if (mode === 'orbite') orbite.theta += 0.00035;          // dérive très lente
    majCamera(dernier);
    rendu.render(scene, cam);
  }

  function dimensionner() {
    if (!rendu) return;
    var l = toile.clientWidth || window.innerWidth, h = toile.clientHeight || window.innerHeight;
    rendu.setSize(l, h, false);
    cam.aspect = l / h; cam.updateProjectionMatrix();
  }

  /* ---------------------------------------------------------------- public */
  var api = {
    charger: function () {
      return fetch('assets/data/terrain.json').then(function (r) { return r.json(); })
        .then(function (m) {
          meta = m; bbox = m.bbox;
          lon0 = (bbox[0] + bbox[2]) / 2; lat0 = (bbox[1] + bbox[3]) / 2;
          largeur = m.largeur_m; profondeur = m.hauteur_m;
          return Promise.all([image('assets/data/terrain-hauteur.png'),
                              image('assets/data/terrain-texture.jpg')]);
        })
        .then(function (im) {
          var d = decoder(im[0]);
          N = d.n; hauteurs = d.t;
          batir(im[1]);
          // centre d'orbite : le barycentre de la boucle de marche
          var c = opt.mission.itineraire.coordinates;
          var mx = 0, my = 0;
          c.forEach(function (p) { mx += p[0]; my += p[1]; });
          var v = versScene(mx / c.length, my / c.length, altitude(mx / c.length, my / c.length));
          orbite.cible.copy(v);
          dimensionner();
          brancherOrbite();
          window.addEventListener('resize', dimensionner);
          boucle();
          return api;
        });
    },
    mode: function (m) {
      mode = m;
      if (gOrbite) gOrbite.visible = (m !== 'visiere');
      if (gVisiere) gVisiere.visible = (m === 'visiere');
      if (scene) scene.fog = (m === 'visiere')
        ? new THREE.Fog(0x3A2A1F, 90, 1150) : new THREE.Fog(0x30231A, 520, 2700);
      majCamera(dernier);
    },
    visible: function (v) { visible = v; if (v) dimensionner(); },
    position: function (etat) {
      dernier = etat;
      if (pret && marcheur) {
        var y = altitude(etat.lon, etat.lat);
        var p = versScene(etat.lon, etat.lat, y);
        marcheur.position.set(p.x, y, p.z);
      }
    },
    cadrer: function () {
      orbite.rayon = 980; orbite.phi = 55 * RAD; orbite.theta = 212 * RAD;
    },
    altitude: altitude,
    pret: function () { return pret; },
    arreter: function () { if (anim) cancelAnimationFrame(anim); }
  };
  return api;
}
