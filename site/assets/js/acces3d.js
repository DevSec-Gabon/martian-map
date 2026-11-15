/* ===========================================================================
   MARTIAN MAP — casque 3D de l'écran d'accès
   Modèle : « Helmet », NASA 3D Resources (github.com/nasa/NASA-3D-Resources),
   recompressé (Draco) pour le web. C'est un objet réel, pas une illustration :
   on le fait tourner à la souris ou au doigt, il suit légèrement le regard,
   et il se tourne vers l'utilisateur quand l'accès est accordé.
   Sans WebGL, l'image du site reste seule : rien ne casse.
   =========================================================================== */
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from '../vendor/jsm/loaders/DRACOLoader.js';

var toile = document.getElementById('casque');
var zone = document.getElementById('vision');
var reduit = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Environnement de reflets : un ciel martien de jour (caramel au zénith,
// plus clair à l'horizon), un sol rouille et un soleil. C'est ce que la
// visière dorée et la coque blanche renvoient.
function cielMars() {
  var sc = new THREE.Scene();
  var geo = new THREE.SphereGeometry(10, 48, 24);
  var cols = [], p = geo.attributes.position;
  var zen = new THREE.Color(0xB88E6C), hor = new THREE.Color(0xF1D6B2), sol = new THREE.Color(0x4A2C1C);
  for (var i = 0; i < p.count; i++) {
    var y = p.getY(i) / 10, c = new THREE.Color();
    if (y >= 0) c.copy(hor).lerp(zen, Math.pow(y, 0.6)); else c.copy(hor).lerp(sol, Math.min(1, -y * 3));
    cols.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  sc.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({vertexColors: true, side: THREE.BackSide})));
  var soleil = new THREE.Mesh(new THREE.SphereGeometry(0.7, 16, 8),
    new THREE.MeshBasicMaterial({color: new THREE.Color(9, 8.4, 7.6)}));
  soleil.position.set(-5, 5.5, 6);
  sc.add(soleil);
  // deux bandeaux clairs : donnent des reflets nets sur la coque
  [[6, 1.5, -4], [-6, 0.6, -5]].forEach(function (q) {
    var b = new THREE.Mesh(new THREE.PlaneGeometry(5, 1.2),
      new THREE.MeshBasicMaterial({color: new THREE.Color(2.2, 2.2, 2.3), side: THREE.DoubleSide}));
    b.position.set(q[0], q[1], q[2]); b.lookAt(0, 0, 0); sc.add(b);
  });
  return sc;
}

function sans3d() { zone.classList.add('sans3d'); }

try { demarrer(); } catch (e) { console.warn('Casque 3D indisponible :', e); sans3d(); }

function demarrer() {
  var rendu = new THREE.WebGLRenderer({canvas: toile, antialias: true, alpha: true});
  rendu.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  rendu.outputColorSpace = THREE.SRGBColorSpace;
  rendu.toneMapping = THREE.ACESFilmicToneMapping;
  rendu.toneMappingExposure = 1.05;

  var scene = new THREE.Scene();
  var pmrem = new THREE.PMREMGenerator(rendu);
  scene.environment = pmrem.fromScene(cielMars(), 0.02).texture;

  var cam = new THREE.PerspectiveCamera(30, 1, 0.01, 50);
  cam.position.set(0, 0.02, 3.2);

  // lumière : soleil martien bas et chaud d'un côté, liseré froid (la
  // couleur instrument) de l'autre — le casque sort du fond.
  var soleil = new THREE.DirectionalLight(0xFFD7B0, 2.6);
  soleil.position.set(-2.5, 1.6, 2.2);
  var liseré = new THREE.DirectionalLight(0x6FE2F2, 2.2);
  liseré.position.set(2.8, 0.6, -1.8);
  scene.add(soleil, liseré, new THREE.AmbientLight(0xffffff, 0.15));

  var pivot = new THREE.Group();
  scene.add(pivot);

  // ombre portée douce sous le casque
  var ombre = new THREE.Mesh(new THREE.CircleGeometry(0.46, 48),
    new THREE.MeshBasicMaterial({color: 0x000000, transparent: true, opacity: 0.38, depthWrite: false}));
  ombre.rotation.x = -Math.PI / 2;
  ombre.position.y = -0.62;
  ombre.scale.set(1, 0.55, 1);
  scene.add(ombre);

  var draco = new DRACOLoader().setDecoderPath('assets/vendor/draco/');
  new GLTFLoader().setDRACOLoader(draco).load('assets/modeles/casque.glb', function (g) {
    var m = g.scene;
    // normalisation : le modèle est livré à l'échelle 1:30 environ
    var b = new THREE.Box3().setFromObject(m), t = new THREE.Vector3(), c = new THREE.Vector3();
    b.getSize(t); b.getCenter(c);
    var k = 0.74 / Math.max(t.x, t.y, t.z);
    m.position.sub(c.multiplyScalar(k));
    m.scale.setScalar(k);
    // le fichier NASA contient deux objets de scène parasites (une sphère et
    // un cube) : on ne garde que la coque du casque
    var parasites = [];
    m.traverse(function (o) {
      if (!o.isMesh) return;
      if (/^p(Sphere|Cube)/.test(o.name)) { parasites.push(o); return; }
      o.material.envMapIntensity = 1.15;
      o.material.roughness = Math.min(o.material.roughness, 0.42);
    });
    parasites.forEach(function (o) { o.parent.remove(o); });

    // remise à l'endroit : la coque est livrée couchée, ouverture vers +X
    var face = new THREE.Group(), socle = new THREE.Group();
    socle.rotation.x = -0.45;
    socle.add(m); face.add(socle);
    face.rotation.y = -0.35;
    pivot.add(face);

    // recentrage sur la coque seule
    var cc = new THREE.Box3().setFromObject(face).getCenter(new THREE.Vector3());
    face.position.sub(cc);

    // visière : la bulle avant du modèle, habillée du film d'or des
    // visières EVA (protection solaire) — elle reflète la lumière du site
    var or = new THREE.MeshPhysicalMaterial({color: 0xF2C46A, metalness: 1, roughness: 0.1,
      clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 3});
    face.traverse(function (o) { if (o.isMesh && o.name === 'helmet_uv2_2') o.material = or; });
    pivot.rotation.y = DEPART;
    toile.style.opacity = 0;
    toile.style.transition = 'opacity .9s ease';
    requestAnimationFrame(function () { toile.style.opacity = 1; });
  }, undefined, function (e) { console.warn('casque.glb', e); sans3d(); });

  /* ------------------------------------------------ interaction */
  var DEPART = -0.55, cibleY = DEPART, cibleX = 0, vitY = 0, glisse = false, x0 = 0, y0 = 0, regard = {x: 0, y: 0};
  var derniereAction = 0;

  toile.addEventListener('pointerdown', function (e) {
    glisse = true; x0 = e.clientX; y0 = e.clientY; toile.setPointerCapture(e.pointerId);
    derniereAction = performance.now();
  });
  toile.addEventListener('pointermove', function (e) {
    var r = toile.getBoundingClientRect();
    regard.x = (e.clientX - r.left) / r.width - 0.5;
    regard.y = (e.clientY - r.top) / r.height - 0.5;
    if (!glisse) return;
    vitY = (e.clientX - x0) * 0.008;
    cibleY += vitY;
    cibleX = Math.max(-0.5, Math.min(0.5, cibleX + (e.clientY - y0) * 0.004));
    x0 = e.clientX; y0 = e.clientY;
    derniereAction = performance.now();
  });
  ['pointerup', 'pointercancel'].forEach(function (t) {
    toile.addEventListener(t, function () {
      if (glisse && Math.abs(vitY) > 0.02) MM.retour('clic');
      glisse = false;
    });
  });

  // accès accordé : le casque se tourne face à l'utilisateur
  var accorde = false;
  document.addEventListener('mm:acces', function () {
    accorde = true; cibleX = 0;
    cibleY = DEPART + 0.55 + Math.round((pivot.rotation.y - DEPART) / (Math.PI * 2)) * Math.PI * 2;
  });

  /* ------------------------------------------------ boucle */
  function dimensionner() {
    var l = toile.clientWidth, h = toile.clientHeight;
    if (!l || !h) return;
    rendu.setSize(l, h, false);
    cam.aspect = l / h;
    // on garde le casque lisible en portrait comme en paysage
    cam.position.z = cam.aspect < 1 ? 3.2 / Math.max(cam.aspect, 0.55) : 3.2;
    cam.updateProjectionMatrix();
  }
  addEventListener('resize', dimensionner);
  dimensionner();

  var img = document.getElementById('vision-img');
  var t0 = performance.now();
  (function boucle() {
    requestAnimationFrame(boucle);
    var t = (performance.now() - t0) / 1000;
    var inactif = performance.now() - derniereAction > 2600;
    if (!glisse && !accorde) {
      vitY *= 0.94;                                   // inertie après un lancer
      cibleY += vitY * 0.5;
      if (inactif && !reduit) cibleY += 0.0024;       // rotation lente au repos
    }
    pivot.rotation.y += (cibleY - pivot.rotation.y) * (accorde ? 0.09 : 0.12);
    pivot.rotation.x += (cibleX + regard.y * 0.18 - pivot.rotation.x) * 0.08;
    pivot.rotation.z = regard.x * -0.06;
    pivot.position.y = 0.16 + (reduit ? 0 : Math.sin(t * 0.9) * 0.035);   // flottement
    ombre.scale.set(1 - (pivot.position.y - .16) * 0.6, 0.55 - (pivot.position.y - .16) * 0.3, 1);
    if (accorde) { pivot.scale.setScalar(pivot.scale.x + (1.16 - pivot.scale.x) * 0.06); }
    if (img && !reduit) img.style.transform =
      'scale(1.06) translate(' + (regard.x * -14).toFixed(1) + 'px,' + (regard.y * -10).toFixed(1) + 'px)';
    rendu.render(scene, cam);
  })();
}
