/* ===========================================================================
   MARTIAN MAP — terrain 3D
   Le relief n'est pas une illustration : c'est le modèle de terrain 1 m de
   l'USGS (MSL Gale DEM v3), ré-échantillonné à 512 × 512 et encodé sur
   16 bits, habillé de l'orthomosaïque HiRISE. La même scène sert à deux
   choses : la vue d'ensemble du site, et la vision de l'astronaute en marche.

   Réalisme de la visière (v4) :
   - ciel martien de jour (caramel, horizon voilé de poussière) et brume
     de la même couleur : le terrain se fond dans l'horizon au lieu de
     s'arrêter sur un fond uni ;
   - grain du sol : l'orthomosaïque fait 4 m par pixel de maillage, ce qui
     est flou à hauteur d'œil. Un bruit procédural (cailloux, rides de
     sable) est ajouté dans le shader, seulement de près ;
   - le sentier n'est plus un ruban posé sur le sol : c'est une trace de
     régolithe tassé PEINTE dans le terrain (masque projeté), qui épouse
     donc le relief exactement. Le guidage est une projection discrète de
     la visière (chevrons fins sur les 35 m à venir) ;
   - jalons en métal éclairés par le soleil, plus de bâtons lumineux ;
   - à l'habitat : le Space Exploration Vehicle de la NASA (modèle 3D
     officiel), immobile — aucun point clignotant.

   Repère : X vers l'est, Z vers le sud, Y vers le haut. Origine au centre
   de l'emprise. Unité : le mètre.
   =========================================================================== */
import * as THREE from '../vendor/three.module.min.js';
import { GLTFLoader } from '../vendor/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from '../vendor/jsm/loaders/DRACOLoader.js';

var R_MARS = 3396190, RAD = Math.PI / 180;
var HORIZON = 0xC9A07A, ZENITH = 0x8E6A50, SOL_LOIN = 0x6B4632;

export function creerTerrain(toile, options) {
  var opt = options || {};
  var scene, cam, rendu, terrain, marcheur, groupe, ciel, soleil;
  var meta = null, hauteurs = null, N = 0;
  var bbox, lon0, lat0, largeur, profondeur;
  var mode = 'orbite';
  var orbite = {rayon: 980, theta: 212 * RAD, phi: 55 * RAD, cible: new THREE.Vector3()};
  var anim = null, pret = false, visible = false;
  var horloge = new THREE.Clock();

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
    // même découpage en triangles que PlaneGeometry : la hauteur calculée
    // tombe exactement sur la surface affichée (rien ne flotte, rien ne s'enfonce)
    if (fc + fr <= 1) return h(r0, c0) + fc * (h(r0, c1) - h(r0, c0)) + fr * (h(r1, c0) - h(r0, c0));
    return h(r1, c1) + (1 - fc) * (h(r1, c0) - h(r1, c1)) + (1 - fr) * (h(r0, c1) - h(r1, c1));
  }
  function altScene(x, z) {           // altitude au point (x, z) du repère scène
    var lat = lat0 - z / (RAD * R_MARS);
    var lon = lon0 + x / (RAD * R_MARS * Math.cos(lat * RAD));
    return altitude(lon, lat);
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

  /* ---------------------------------------------------------------- ciel */
  function creerCiel() {
    var m = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        zenith: {value: new THREE.Color(ZENITH)}, horizon: {value: new THREE.Color(HORIZON)},
        sol: {value: new THREE.Color(SOL_LOIN)}, dirSoleil: {value: new THREE.Vector3(0, 1, 0)}
      },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position);' +
        ' vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }',
      fragmentShader: [
        'uniform vec3 zenith, horizon, sol, dirSoleil; varying vec3 vDir;',
        'void main(){',
        '  float y = vDir.y;',
        '  vec3 c = y > 0.0 ? mix(horizon, zenith, pow(clamp(y,0.,1.), .55)) : mix(horizon, sol, clamp(-y*6.,0.,1.));',
        // halo autour du soleil : sur Mars il est bleuté (diffusion par la poussière)
        '  float s = max(dot(normalize(vDir), dirSoleil), 0.0);',
        '  c += vec3(.55,.62,.72) * pow(s, 60.0) * .55 + vec3(1.,.95,.88) * pow(s, 900.0) * 2.0;',
        '  gl_FragColor = vec4(c, 1.0);',
        '  #include <colorspace_fragment>',
        '}'].join('\n')
    });
    var s = new THREE.Mesh(new THREE.SphereGeometry(7000, 48, 24), m);
    s.frustumCulled = false;
    s.renderOrder = -10;
    return s;
  }

  /* ------------------------------------------- masque du sentier (projeté) */
  // Le sentier est dessiné dans une texture calée sur l'emprise (2 048 px,
  // ≈ 1 m/px) puis lu par le shader du sol : il épouse le relief au pixel.
  function masqueSentier() {
    var T = 2048, cv = document.createElement('canvas');
    cv.width = cv.height = T;
    var c = cv.getContext('2d');
    c.fillStyle = '#000'; c.fillRect(0, 0, T, T);
    var IT = opt.mission.itineraire;
    function px(p) {
      return [(p[0] - bbox[0]) / (bbox[2] - bbox[0]) * T, (bbox[3] - p[1]) / (bbox[3] - bbox[1]) * T];
    }
    c.lineJoin = c.lineCap = 'round';
    c.strokeStyle = '#fff';
    c.filter = 'blur(1.1px)';
    c.lineWidth = 2.6;
    c.beginPath();
    IT.coordinates.forEach(function (p, i) { var q = px(p); c[i ? 'lineTo' : 'moveTo'](q[0], q[1]); });
    c.stroke();
    var t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.NoColorSpace;
    t.anisotropy = 8;
    return t;
  }

  /* --------------------------------------------- matériau du sol enrichi */
  function materiauSol(tex, masque) {
    var m = new THREE.MeshStandardMaterial({map: tex, roughness: 0.96, metalness: 0});
    m.onBeforeCompile = function (sh) {
      sh.uniforms.masque = {value: masque};
      sh.uniforms.sentier = {value: 0};
      m.userData.sh = sh;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vMonde;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMonde = (modelMatrix * vec4(transformed,1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', [
          '#include <common>',
          'varying vec3 vMonde; uniform sampler2D masque; uniform float sentier;',
          'float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }',
          'float vbruit(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f);',
          '  return mix(mix(h2(i),h2(i+vec2(1,0)),u.x), mix(h2(i+vec2(0,1)),h2(i+vec2(1,1)),u.x), u.y); }',
          'float fbm(vec2 p){ float a=.5, s=0.; for(int k=0;k<5;k++){ s+=a*vbruit(p); p*=2.07; a*=.5; } return s; }',
          // cailloux : cellules aléatoires, un caillou sombre par cellule de 40 cm
          'float cailloux(vec2 p){ vec2 i=floor(p), f=fract(p); float r=h2(i);',
          '  vec2 c=vec2(h2(i+3.1),h2(i+7.7))*.6+.2; float d=length(f-c);',
          '  return r>.62 ? smoothstep(.16+.12*r, .05, d) : 0.; }'
        ].join('\n'))
        .replace('#include <map_fragment>', [
          '#include <map_fragment>',
          'float dCam = length(vMonde - cameraPosition);',
          // détail seulement de près : au-delà, il crénelerait (plus fin que le pixel)
          'float pres = 1. - smoothstep(5., 70., dCam);',
          'float fin = 1. - smoothstep(4., 26., dCam);',
          'vec2 q = vMonde.xz;',
          'float g = fbm(q * .45) * .7 + fbm(q * 2.1) * .3 * fin;',
          'float k = (cailloux(q * 2.5) * .55 + cailloux(q * 1.1 + 9.) * .35) * fin;',
          'diffuseColor.rgb *= mix(1., (.86 + .28 * g) * (1. - k * .45), pres);',
          // sentier tassé : régolithe compacté, un peu plus sombre et plus lisse
          'float tr = texture2D(masque, vMapUv).r * sentier;',
          'diffuseColor.rgb = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, vec3(.33))) * vec3(.62,.5,.42), tr * .9);'
        ].join('\n'))
        .replace('#include <normal_fragment_maps>', [
          '#include <normal_fragment_maps>',
          'if (pres > .001) {',
          '  float e = .18; vec2 q2 = vMonde.xz * 1.6;',
          '  float b0 = fbm(q2), bx = fbm(q2 + vec2(e,0.)), bz = fbm(q2 + vec2(0.,e));',
          '  vec3 nM = normalize(vec3(-(bx-b0)/e * .3, 1., -(bz-b0)/e * .3));',
          '  vec3 nV = normalize((viewMatrix * vec4(nM - vec3(0.,1.,0.), 0.)).xyz);',
          '  normal = normalize(normal + nV * fin * (1. - tr * .7));',
          '}'
        ].join('\n'));
    };
    return m;
  }

  /* ------------------------------------------------------------- la scène */
  var masque;
  function batir(texture) {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(HORIZON);
    scene.fog = new THREE.Fog(HORIZON, 700, 3200);

    cam = new THREE.PerspectiveCamera(52, 1, 0.25, 9000);

    rendu = new THREE.WebGLRenderer({canvas: toile, antialias: true, powerPreference: 'high-performance'});
    rendu.setPixelRatio(Math.min(devicePixelRatio || 1, 1.6));
    rendu.outputColorSpace = THREE.SRGBColorSpace;
    rendu.toneMapping = THREE.ACESFilmicToneMapping;
    rendu.toneMappingExposure = 1.22;

    groupe = new THREE.Group();
    scene.add(groupe);

    ciel = creerCiel();
    scene.add(ciel);

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

    masque = masqueSentier();
    terrain = new THREE.Mesh(geo, materiauSol(tex, masque));
    groupe.add(terrain);

    // --- lumière : même azimut que l'ombrage calculé par le pipeline (315°, 45°)
    var az = 315 * RAD, el = 38 * RAD;
    soleil = new THREE.DirectionalLight(0xFFE6CC, 2.0);   // l'orthophoto porte déjà ses ombres
    soleil.position.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el))
      .multiplyScalar(3000);
    scene.add(soleil);
    ciel.material.uniforms.dirSoleil.value.copy(soleil.position).normalize();
    scene.add(new THREE.HemisphereLight(0xE2BC98, 0x5A3A26, 1.25));

    ajouterItineraire();
    ajouterPoints();
    chargerRover();

    // --- marcheur (vue d'ensemble seulement) : silhouette pleine, pas de halo clignotant
    marcheur = new THREE.Group();
    var corps = new THREE.Mesh(new THREE.ConeGeometry(2.6, 9, 14),
      new THREE.MeshStandardMaterial({color: 0x2FD0E6, emissive: 0x0A5F6E, roughness: .5}));
    corps.position.y = 5;
    var ombre = new THREE.Mesh(new THREE.CircleGeometry(4.5, 24),
      new THREE.MeshBasicMaterial({color: 0x000000, transparent: true, opacity: .35, depthWrite: false}));
    ombre.rotation.x = -Math.PI / 2; ombre.position.y = 0.4;
    marcheur.add(corps, ombre);
    groupe.add(marcheur);

    pret = true;
  }

  /* ------------------------------------------------------- l'itinéraire 3D */
  function ruban(points, largeurM, couleur, opacite, hauteurSol) {
    var s = [], idx = [];
    for (var i = 0; i < points.length; i++) {
      var a = points[Math.max(i - 2, 0)], b = points[Math.min(i + 2, points.length - 1)];
      var tx = b.x - a.x, tz = b.z - a.z;
      var n = Math.hypot(tx, tz) || 1;
      var px = (tz / n) * largeurM / 2, pz = (-tx / n) * largeurM / 2;
      var p = points[i];
      s.push(p.x + px, p.y + hauteurSol, p.z + pz);
      s.push(p.x - px, p.y + hauteurSol, p.z - pz);
      if (i < points.length - 1) { var k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(s, 3));
    g.setIndex(idx);
    return new THREE.Mesh(g, new THREE.MeshBasicMaterial({
      color: couleur, transparent: true, opacity: opacite, side: THREE.DoubleSide, depthWrite: false
    }));
  }

  // Densifie l'itinéraire à un point par mètre, posé sur la surface affichée.
  var dense = [];       // {p: Vector3, s: distance cumulée, dir: Vector3}
  function densifier() {
    var IT = opt.mission.itineraire, C = IT.coordinates, D = IT.distance_cum_m;
    dense = [];
    for (var i = 0; i < C.length - 1; i++) {
      var a = versScene(C[i][0], C[i][1]), b = versScene(C[i + 1][0], C[i + 1][1]);
      var L = Math.max(D[i + 1] - D[i], 0.01), n = Math.max(1, Math.round(L));
      for (var k = 0; k < n; k++) {
        var f = k / n, p = a.clone().lerp(b, f);
        p.y = altScene(p.x, p.z);
        dense.push({p: p, s: D[i] + L * f, dir: b.clone().sub(a).setY(0).normalize()});
      }
    }
  }

  var gOrbite, gVisiere, chevrons = [], traceParcourue = null, suiviActif = false;
  function parcouru(s) {
    if (!traceParcourue || !dense.length) return;
    var lo = 0, hi = dense.length - 1;
    while (hi - lo > 1) { var m = (lo + hi) >> 1; if (dense[m].s <= s) lo = m; else hi = m; }
    traceParcourue.geometry.setDrawRange(0, s <= 0 ? 0 : lo * 6);
  }
  function ajouterItineraire() {
    var IT = opt.mission.itineraire;
    densifier();
    var pts = dense.map(function (d) { return d.p; });

    gOrbite = new THREE.Group();
    gOrbite.add(ruban(pts, 13, 0x02080A, .45, 0.8));
    gOrbite.add(ruban(pts, 7, 0x2FD0E6, .55, 1.1));
    gOrbite.add(ruban(pts, 3, 0x6FE2F2, .9, 1.4));
    // trace déjà parcourue : un ruban blanc plus large, construit une fois,
    // dont on n'affiche que le début (drawRange) — mise à jour gratuite
    traceParcourue = ruban(pts, 9, 0xFFFFFF, 1, 2.2);
    // dessinée en dernier, par-dessus les rubans translucides de l'itinéraire
    traceParcourue.material.depthTest = false;
    traceParcourue.renderOrder = 10;
    traceParcourue.geometry.setDrawRange(0, 0);
    gOrbite.add(traceParcourue);
    var w = opt.mission.waypoints_curiosity.coordinates.map(function (c) {
      return versScene(c[0], c[1], altitude(c[0], c[1]));
    });
    gOrbite.add(ruban(w, 4, 0x7FB3D5, .5, 0.6));
    groupe.add(gOrbite);

    gVisiere = new THREE.Group();

    // Guidage projeté par la visière : chevrons fins tous les 4 m. Seuls
    // les 35 m à venir sont affichés, avec un fondu — c'est une aide, pas
    // une peinture au sol.
    var forme = new THREE.Shape();
    forme.moveTo(-0.28, -0.1); forme.lineTo(0, 0.14); forme.lineTo(0.28, -0.1);
    forme.lineTo(0.28, -0.02); forme.lineTo(0, 0.22); forme.lineTo(-0.28, -0.02); forme.closePath();
    var geoC = new THREE.ShapeGeometry(forme);
    geoC.rotateX(-Math.PI / 2);
    for (var i = 0; i < dense.length; i += 4) {
      var d = dense[i];
      var m = new THREE.Mesh(geoC, new THREE.MeshBasicMaterial({color: 0x8FEFFF, transparent: true,
        opacity: 0, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending}));
      m.position.set(d.p.x, d.p.y + 0.06, d.p.z);
      m.rotation.y = Math.atan2(-d.dir.x, -d.dir.z);
      m.userData.s = d.s;
      m.renderOrder = 5;
      gVisiere.add(m); chevrons.push(m);
    }

    // Jalons d'arpentage tous les 25 m, plantés 1,4 m à côté du sentier :
    // tige en aluminium, bande rétroréfléchissante. Éclairés par le soleil.
    var geoP = new THREE.CylinderGeometry(0.018, 0.022, 1.15, 8);
    var matP = new THREE.MeshStandardMaterial({color: 0xD7DADE, metalness: .25, roughness: .45});
    var geoB = new THREE.CylinderGeometry(0.026, 0.026, 0.12, 8);
    var matB = new THREE.MeshStandardMaterial({color: 0x9FEFFA, emissive: 0x1A6F7C, roughness: .3});
    var geoS = new THREE.CylinderGeometry(0.07, 0.09, 0.05, 10);
    var matS = new THREE.MeshStandardMaterial({color: 0x55585C, roughness: .8});
    var prochain = 12;
    dense.forEach(function (d) {
      if (d.s < prochain) return;
      prochain = d.s + 25;
      var ox = d.dir.z * 1.4, oz = -d.dir.x * 1.4;
      var x = d.p.x + ox, z = d.p.z + oz, y = altScene(x, z);
      var j = new THREE.Group();
      var t = new THREE.Mesh(geoP, matP); t.position.y = 0.55;
      var b = new THREE.Mesh(geoB, matB); b.position.y = 1.02;
      var s = new THREE.Mesh(geoS, matS); s.position.y = 0.01;
      j.add(t, b, s);
      j.position.set(x, y, z);
      j.rotation.z = (Math.random() - .5) * 0.06;     // planté à la main
      gVisiere.add(j);
    });
    gVisiere.visible = false;
    groupe.add(gVisiere);
  }

  // Repère de cible : colonne fine et anneau au sol. Statique : rien ne clignote.
  function repere(lon, lat, couleur, hauteur, rayon) {
    var g = new THREE.Group();
    var y = altitude(lon, lat);
    var p = versScene(lon, lat, y);
    var colonne = new THREE.Mesh(
      new THREE.CylinderGeometry(rayon * .12, rayon * .12, hauteur, 12, 1, true),
      new THREE.MeshBasicMaterial({color: couleur, transparent: true, opacity: .32,
        side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending}));
    colonne.position.set(p.x, y + hauteur / 2, p.z);
    var anneau = new THREE.Mesh(
      new THREE.RingGeometry(rayon * .82, rayon, 56),
      new THREE.MeshBasicMaterial({color: couleur, transparent: true, opacity: .7,
        side: THREE.DoubleSide, depthWrite: false}));
    anneau.rotation.x = -Math.PI / 2;
    anneau.position.set(p.x, y + 0.08, p.z);
    g.add(colonne, anneau);
    g.userData = {anneau: anneau, colonne: colonne, lonlat: [lon, lat], rayon: rayon};
    return g;
  }

  var reperes = [], repHabitat = null;
  function ajouterPoints() {
    var m = opt.mission;
    repHabitat = repere(m.habitat.lon, m.habitat.lat, 0xFFFFFF, 40, 12);
    groupe.add(repHabitat);
    m.cibles.forEach(function (c) {
      var b = repere(c.lon, c.lat, c.nature === 'creux' ? 0x6FA8FF : 0x2FD0E6, 36, 10);
      groupe.add(b); reperes.push(b);
    });
  }

  /* ------------------------------------------- rover pressurisé (NASA SEV) */
  // Space Exploration Vehicle, NASA 3D Resources. Garé 9 m en retrait du
  // départ du sentier, dans l'axe opposé au premier cap : on le voit au
  // départ en se retournant et au retour, sans marcher dedans.
  function chargerRover() {
    var IT = opt.mission.itineraire;
    var p0 = dense[0].p, dir = dense[Math.min(12, dense.length - 1)].p.clone().sub(p0).setY(0).normalize();
    var x = p0.x - dir.x * 9, z = p0.z - dir.z * 9;
    var draco = new DRACOLoader().setDecoderPath('assets/vendor/draco/');
    new GLTFLoader().setDRACOLoader(draco).load('assets/modeles/rover-sev.glb', function (g) {
      var m = g.scene;
      var b = new THREE.Box3().setFromObject(m), t = new THREE.Vector3();
      b.getSize(t);
      // le modèle est livré en mètres (≈ 4 × 6 × 4) ; on le pose au sol
      var hautY = t.y;
      m.position.y = -b.min.y;
      m.traverse(function (o) {
        if (o.isMesh && o.material) { o.material.envMapIntensity = .6; o.castShadow = false; }
      });
      var r = new THREE.Group();
      r.add(m);
      r.position.set(x, altScene(x, z) - 0.05, z);
      r.rotation.y = Math.atan2(dir.x, dir.z) + Math.PI / 2;
      groupe.add(r);
      roverInfo = {x: x, z: z, hauteur: hautY};
    }, undefined, function (e) { console.warn('rover-sev.glb', e); });
  }
  var roverInfo = null;

  /* --------------------------------------------- zones signalées (orbite) */
  var gZones = new THREE.Group();
  // Paroi translucide de 5 m qui suit le relief sur tout le périmètre :
  // visible de loin, et de l'intérieur on voit la limite à franchir.
  var degrade = null;
  function textureDegrade() {
    if (degrade) return degrade;
    var cv = document.createElement('canvas'); cv.width = 4; cv.height = 64;
    var c = cv.getContext('2d'), g = c.createLinearGradient(0, 0, 0, 64);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(.75, 'rgba(255,255,255,.55)');
    g.addColorStop(1, 'rgba(255,255,255,1)');
    c.fillStyle = g; c.fillRect(0, 0, 4, 64);
    degrade = new THREE.CanvasTexture(cv);
    return degrade;
  }
  function zones(liste) {
    if (!pret) { zonesEnAttente = liste; return; }
    while (gZones.children.length) gZones.remove(gZones.children[0]);
    (liste || []).forEach(function (zn) {
      var c = versScene(zn.lon, zn.lat), n = 96, pos = [], uv = [], idx = [];
      for (var i = 0; i <= n; i++) {
        var a = i / n * Math.PI * 2, x = c.x + Math.cos(a) * zn.r, z = c.z + Math.sin(a) * zn.r;
        var y = altScene(x, z);
        pos.push(x, y - 0.3, z, x, y + 5, z);
        uv.push(i / n, 0, i / n, 1);
        if (i < n) { var k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
      }
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      var paroi = new THREE.Mesh(g, new THREE.MeshBasicMaterial({color: 0xFF4D4F, transparent: true,
        alphaMap: textureDegrade(), opacity: .75, side: THREE.DoubleSide, depthWrite: false, fog: false}));
      paroi.renderOrder = 4;
      // trait au sol, posé sur le relief
      var sol = [];
      for (var j = 0; j <= n; j++) {
        var b = j / n * Math.PI * 2, xs = c.x + Math.cos(b) * zn.r, zs = c.z + Math.sin(b) * zn.r;
        sol.push(new THREE.Vector3(xs, altScene(xs, zs) + 0.15, zs));
      }
      var trait = new THREE.Line(new THREE.BufferGeometry().setFromPoints(sol),
        new THREE.LineBasicMaterial({color: 0xFF6B6D}));
      gZones.add(paroi, trait);
    });
  }
  var zonesEnAttente = null;

  /* -------------------------------------------------------------- caméras */
  var vue = {pos: new THREE.Vector3(), cap: null, phase: 0, allure: 0};
  function majCamera(etat, dt) {
    if (!pret) return;
    if (mode === 'visiere' && etat) {
      var sol = altitude(etat.lon, etat.lat);
      var cible = versScene(etat.lon, etat.lat, sol + 1.68);      // yeux, casque compris
      // lissage : la caméra rattrape la position et le cap en douceur —
      // le regard ne pivote jamais d'un coup aux angles du trajet
      var lisse = 1 - Math.exp(-dt * 7);
      if (vue.cap === null || cible.distanceTo(vue.pos) > 40) { vue.pos.copy(cible); vue.cap = etat.cap; }
      vue.pos.lerp(cible, lisse);
      var dc = ((etat.cap - vue.cap + 540) % 360) - 180;
      vue.cap = (vue.cap + dc * (1 - Math.exp(-dt * 2.6)) + 360) % 360;

      // balancement de marche : gravité martienne (0,38 g) → foulée longue
      // et lente, ~1,3 pas/s. Amplitude faible : casque fixé au torse.
      var a = vue.allure;
      vue.phase += dt * 2 * Math.PI * 0.65 * Math.min(a, 1);
      var bob = Math.sin(vue.phase * 2) * 0.03 * a, roulis = Math.sin(vue.phase) * 0.012 * a;

      cam.fov = 66;
      cam.near = 0.25;            // on voit ses pieds
      cam.position.set(vue.pos.x + Math.cos(vue.cap * RAD) * roulis * 0.8, vue.pos.y + bob, vue.pos.z);
      var c = vue.cap * RAD;
      // regard légèrement plongeant (~6°) : on regarde où l'on pose les pieds
      cam.lookAt(cam.position.x + Math.sin(c) * 40, cam.position.y - 4.2, cam.position.z - Math.cos(c) * 40);
      cam.rotateZ(roulis);
      cam.updateProjectionMatrix();
      marcheur.visible = false;

      // chevrons : seuls les 35 m à venir
      var s = etat.s;
      chevrons.forEach(function (m) {
        var d = m.userData.s - s;
        var o = d < 2 || d > 35 ? 0 : Math.min((d - 2) / 3, 1) * (1 - (d - 2) / 33);
        m.material.opacity = o * 0.75;
        m.visible = o > 0.01;
      });
    } else {
      vue.cap = null;
      cam.fov = 52;
      // vue d'ensemble à ~1 km : un plan proche à 5 m garde assez de
      // précision de profondeur pour séparer les rubans posés sur le relief
      cam.near = 5;
      var o = orbite;
      cam.position.set(
        o.cible.x + o.rayon * Math.sin(o.phi) * Math.sin(o.theta),
        o.cible.y + o.rayon * Math.cos(o.phi),
        o.cible.z + o.rayon * Math.sin(o.phi) * Math.cos(o.theta));
      cam.lookAt(o.cible);
      cam.updateProjectionMatrix();
      marcheur.visible = true;
    }
    ciel.position.copy(cam.position);
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
      orbite.rayon = Math.min(Math.max(orbite.rayon * (1 + Math.sign(e.deltaY) * 0.1), 120), 4200);
    }, {passive: false});
    toile.style.cursor = 'grab';
  }

  /* ---------------------------------------------------------------- boucle */
  var dernier = null;
  function boucle() {
    anim = requestAnimationFrame(boucle);
    var dt = Math.min(horloge.getDelta(), 0.1);
    if (!pret || !visible) return;

    reperes.concat([repHabitat]).forEach(function (b) {
      var u = b.userData, proche = 1;
      if (mode === 'visiere' && dernier) {
        var d = Math.hypot(
          (dernier.lon - u.lonlat[0]) * RAD * R_MARS * Math.cos(dernier.lat * RAD),
          (dernier.lat - u.lonlat[1]) * RAD * R_MARS);
        proche = Math.min(Math.max((d - 12) / 28, 0), 1);       // effacement sous 40 m
        if (b === repHabitat) proche = 0;                         // le rover se voit : pas de repère
      }
      u.anneau.material.opacity = .7 * proche;
      u.colonne.material.opacity = .32 * proche;
      b.visible = proche > 0.02;
    });
    if (mode === 'orbite') orbite.theta += 0.0003;          // dérive très lente
    // suivi du marcheur : la vue d'ensemble glisse avec lui, quel que soit
    // l'angle choisi à la souris (seul le centre bouge, pas l'orientation)
    if (mode === 'orbite' && suiviActif && marcheur) orbite.cible.lerp(marcheur.position, 1 - Math.exp(-dt * 1.6));
    var sh = terrain.material.userData.sh;
    if (sh) sh.uniforms.sentier.value = (mode === 'visiere') ? 1 : 0;
    majCamera(dernier, dt);
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
                              image('assets/data/optique.jpg')]);
        })
        .then(function (im) {
          var d = decoder(im[0]);
          N = d.n; hauteurs = d.t;
          batir(im[1]);
          groupe.add(gZones);
          if (zonesEnAttente) zones(zonesEnAttente);
          var c = opt.mission.itineraire.coordinates;
          var mx = 0, my = 0;
          c.forEach(function (p) { mx += p[0]; my += p[1]; });
          orbite.cible.copy(versScene(mx / c.length, my / c.length, altitude(mx / c.length, my / c.length)));
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
        ? new THREE.Fog(HORIZON, 140, 1300) : new THREE.Fog(HORIZON, 900, 3600);
      majCamera(dernier, 1);
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
    parcouru: parcouru,
    suivre: function (v) { suiviActif = !!v; },
    allure: function (a) { vue.allure = Math.max(0, Math.min(1, a)); },   // 0 arrêt → 1 marche
    zones: zones,
    cadrer: function () {
      orbite.rayon = 980; orbite.phi = 55 * RAD; orbite.theta = 212 * RAD;
    },
    altitude: altitude,
    pret: function () { return pret; },
    arreter: function () { if (anim) cancelAnimationFrame(anim); }
  };
  return api;
}
