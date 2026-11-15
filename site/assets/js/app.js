/* ===========================================================================
   MARTIAN MAP — orchestration
   Un seul outil, trois vues : carte 2D, terrain 3D, visière.
   Un seul jeu de données : assets/data/mission.json, produit par le pipeline.
   =========================================================================== */
import { creerTerrain } from './terrain3d.js';

(function () {
  'use strict';
  var $ = MM.$, $$ = MM.$$, fr = MM.fr;

  var sess = MM.session.exiger('index.html');
  if (!sess) return;
  var POSTE = MM.POSTES[sess.role] || MM.POSTES.rover;

  var M, IT, T3D = null, parcours = 0, lecture = null, cibleEnCours = null;
  var atteintes = {}, ecran = 'plan', vue = '2d';
  var PAS_DEMO = 6;              // mètres gagnés à chaque image en lecture

  /* ======================================================= état du parcours */
  function index(s) {
    var D = IT.distance_cum_m, lo = 0, hi = D.length - 1;
    while (hi - lo > 1) { var m = (lo + hi) >> 1; if (D[m] <= s) lo = m; else hi = m; }
    return lo;
  }
  function etat(s) {
    var D = IT.distance_cum_m, C = IT.coordinates;
    var fin = D[D.length - 1];
    s = Math.max(0, Math.min(s, fin));
    var i = index(s), j = Math.min(i + 1, D.length - 1);
    var f = D[j] > D[i] ? (s - D[i]) / (D[j] - D[i]) : 0;
    var mix = function (A) { return A[i] + (A[j] - A[i]) * f; };
    var e = {
      s: s, i: i, fin: fin,
      lon: C[i][0] + (C[j][0] - C[i][0]) * f,
      lat: C[i][1] + (C[j][1] - C[i][1]) * f,
      alt: mix(IT.altitude_m), pente: mix(IT.pente_deg), t: mix(IT.temps_cum_s)
    };

    // cap suivi : on vise un point de l'itinéraire 20 m plus loin, jamais la
    // ligne droite vers la cible — c'est tout l'intérêt d'un trajet validé.
    var av = Math.min(s + 20, fin - 0.1);
    var ia = index(av), ja = Math.min(ia + 1, C.length - 1);
    var fa = D[ja] > D[ia] ? (av - D[ia]) / (D[ja] - D[ia]) : 0;
    var pa = [C[ia][0] + (C[ja][0] - C[ia][0]) * fa, C[ia][1] + (C[ja][1] - C[ia][1]) * fa];
    e.cap = MM.metres([e.lon, e.lat], pa) < 0.4 ? IT.cap_deg[i] : MM.cap([e.lon, e.lat], pa);

    // étape courante = première dont l'arrivée est encore devant
    var k = -1;
    for (var n = 0; n < M.etapes.length; n++) { if (D[M.etapes[n].i_fin] > s + 0.01) { k = n; break; } }
    if (k < 0) k = M.etapes.length - 1;
    e.k = k; e.etape = M.etapes[k];
    e.cible = M.cibles.filter(function (c) { return c.nom === e.etape.arrivee; })[0] || null;
    e.capCible = e.cible ? MM.cap([e.lon, e.lat], [e.cible.lon, e.cible.lat])
                         : MM.cap([e.lon, e.lat], [M.habitat.lon, M.habitat.lat]);

    e.dRest = Math.max(0, D[e.etape.i_fin] - s);
    e.tRest = Math.max(0, (IT.temps_cum_s[e.etape.i_fin] - e.t) / 60 / M.stats.facteur_prudent);

    var arretsRestants = M.cibles.filter(function (c) {
      var ee = M.etapes.filter(function (x) { return x.arrivee === c.nom; })[0];
      return ee && D[ee.i_fin] > s;
    }).reduce(function (a, c) { return a + c.duree_arret_min; }, 0);
    e.tHab = (IT.temps_cum_s[IT.temps_cum_s.length - 1] - e.t) / 60 / M.stats.facteur_prudent + arretsRestants;

    var total = M.cibles.reduce(function (a, c) { return a + c.duree_arret_min; }, 0);
    var heures = (e.t / 60 / M.stats.facteur_prudent + (total - arretsRestants)) / 60;
    e.dose = M.stats.dose_jour * heures / M.stats.duree_sol_h;
    return e;
  }

  /* ============================================================ progression */
  function avancer(s) {
    if (MMHud.enArret()) return;
    parcours = Math.max(0, Math.min(s, IT.distance_cum_m[IT.distance_cum_m.length - 1]));
    var e = etat(parcours);

    MMCarte.position(e.lon, e.lat);
    MMCarte.profil(parcours);
    if (T3D) T3D.position(e);
    if (ecran === 'marche') MMHud.maj(e);

    // arrivée sur une cible : information dans la visière ET dans l'outil
    if (e.cible && e.dRest < 6 && !atteintes[e.cible.nom]) {
      atteintes[e.cible.nom] = true;
      cibleEnCours = e.cible;
      if (lecture) basculerLecture();
      MMHud.arrivee(e.cible, function () {
        cibleEnCours = null;
        alerte('Relevé terminé', e.cible.nom + ' — échantillon enregistré, reprise de la marche.', 'info');
        MM.comms.envoyer({de: sess.ident, role: sess.role, sujet: 'Cible atteinte',
          texte: e.cible.nom + ' : relevé terminé (' + fr(e.cible.duree_arret_min) + ' min).', prio: 'info'});
        avancer(parcours + 7);
      });
      alerte('Cible atteinte — ' + e.cible.nom, e.cible.science, 'info');
      MMCarte.viserEtape(e.k + 1);
    }
    return e;
  }

  function basculerLecture() {
    var b = $('#c-lecture');
    if (lecture) {
      cancelAnimationFrame(lecture); lecture = null;
      b.textContent = 'Avancer'; b.classList.add('btn-cle');
      return;
    }
    b.textContent = 'Pause'; b.classList.remove('btn-cle');
    var pas = function () {
      lecture = requestAnimationFrame(pas);
      if (MMHud.enArret()) return;
      if (parcours >= IT.distance_cum_m[IT.distance_cum_m.length - 1]) {
        basculerLecture();
        alerte('Sortie terminée', 'Retour à l\'habitat. Dose reçue ' + fr(etat(parcours).dose, 3) + ' mSv.', 'info');
        MM.retour('valide');
        return;
      }
      avancer(parcours + PAS_DEMO);
    };
    lecture = requestAnimationFrame(pas);
  }

  /* ================================================================ écrans */
  function allerEcran(e) {
    if (e === 'marche' && POSTE.droits.indexOf('marche') < 0) {
      alerte('Accès refusé', 'Le poste « ' + POSTE.court + ' » suit la sortie, il ne la conduit pas.', 'prudence');
      MM.retour('refus');
      return;
    }
    ecran = e;
    document.body.dataset.ecran = e;
    $$('#barre .segments [data-ecran]').forEach(function (b) {
      b.setAttribute('aria-selected', b.dataset.ecran === e ? 'true' : 'false');
    });
    $('#hud').setAttribute('aria-hidden', e !== 'marche');
    if (T3D) {
      T3D.position(etat(parcours));
      T3D.mode(e === 'marche' ? 'visiere' : 'orbite');
      T3D.visible(e === 'marche' || vue === '3d');
    }
    if (e === 'marche') { MMHud.maj(etat(parcours)); }
    else { setTimeout(function () { MMCarte.taille(); }, 60); if (lecture) basculerLecture(); }
    MM.retour('bascule');
  }

  function allerVue(v) {
    if (!T3D && v === '3d') return;
    vue = v;
    document.body.dataset.vue = v;
    $$('#vues button').forEach(function (b) {
      b.setAttribute('aria-selected', b.dataset.vue === v ? 'true' : 'false');
    });
    if (T3D) { T3D.visible(v === '3d' || ecran === 'marche'); T3D.mode(ecran === 'marche' ? 'visiere' : 'orbite'); }
    if (v === '2d') setTimeout(function () { MMCarte.taille(); }, 60);
    MM.retour('bascule');
  }

  /* =============================================================== alertes */
  function alerte(titre, texte, prio) {
    var d = document.createElement('div');
    d.className = 'alerte verre';
    d.dataset.prio = prio || 'info';
    d.innerHTML = '<div class="e"><span class="puce-etat etat" data-n="' + (prio || 'info') +
      '" style="border:0;padding:0"></span><span class="etiq">' + titre + '</span>' +
      '<span class="etiq data" style="margin-left:auto;color:var(--txt-4)">' + MM.heure(Date.now()) + '</span></div>' +
      '<div class="t">' + texte + '</div>';
    $('#alertes').appendChild(d);
    var vie = prio === 'danger' ? 13000 : 7500;
    setTimeout(function () {
      d.classList.add('part');
      setTimeout(function () { d.remove(); }, 400);
    }, vie);
    d.addEventListener('click', function () { d.remove(); });
  }

  /* ================================================================ liaison */
  var ENVOIS = {
    rover:  ['cible', 'equipement', 'ok'],
    orbite: ['radiations', 'meteo', 'retour', 'ok'],
    terre:  ['radiations', 'retour', 'ok']
  };

  function filRendu() {
    var l = MM.comms.journal().slice(-14).reverse();
    if (!l.length) { $('#fil').innerHTML = '<div class="vide">Aucun échange sur ce créneau.</div>'; return; }
    $('#fil').innerHTML = l.map(function (m) {
      var p = MM.POSTES[m.role] || {court: m.role};
      return '<div class="msg-l" data-prio="' + m.prio + '">' +
        '<div class="e"><span class="puce-etat etat" data-n="' + m.prio + '" style="border:0;padding:0"></span>' +
        '<span class="qui">' + p.court + (m.delai_min >= 1 ? ' · +' + fr(m.delai_min) + ' min' : '') + '</span>' +
        '<span class="h">' + MM.heure(m.t) + '</span></div>' +
        (m.sujet ? '<b>' + m.sujet + '</b> — ' : '') + m.texte + '</div>';
    }).join('');
  }

  function brancherLiaison() {
    $('#delai').textContent = POSTE.delai
      ? 'délai ' + fr(POSTE.delai) + ' min' : 'liaison directe';

    var types = MM.comms.TYPES.filter(function (t) { return ENVOIS[sess.role].indexOf(t.id) >= 0; });
    $('#envois').innerHTML = types.map(function (t) {
      return '<button class="btn" data-t="' + t.id + '">' + t.nom + '</button>';
    }).join('');
    $$('#envois .btn').forEach(function (b) {
      b.addEventListener('click', function () {
        var t = types.filter(function (x) { return x.id === b.dataset.t; })[0];
        MM.comms.envoyer({de: sess.ident, role: sess.role, sujet: t.nom, texte: t.texte,
          prio: t.prio, delai_min: POSTE.delai});
        MM.retour('valide', b);
      });
    });

    MM.comms.sur(function (m, local) {
      filRendu();
      if (local || !m.t) return;
      alerte(m.sujet || 'Message', m.texte, m.prio);
      MM.retour(m.prio === 'danger' ? 'danger' : m.prio === 'prudence' ? 'prudence' : 'message');
    });
    filRendu();
  }

  /* ============================================================== branchement */
  function brancher() {
    $$('#barre .segments [data-ecran]').forEach(function (b) {
      b.addEventListener('click', function () { allerEcran(b.dataset.ecran); });
    });
    $$('#vues button').forEach(function (b) {
      b.addEventListener('click', function () { allerVue(b.dataset.vue); });
    });
    $('#vers-marche').addEventListener('click', function () { allerEcran('marche'); });

    $$('[data-repli]').forEach(function (b) {
      b.addEventListener('click', function () {
        b.closest('.panneau').classList.toggle('ferme');
        MM.retour('clic');
        setTimeout(function () { MMCarte.taille(); }, 260);
      });
    });

    $('#c-avance').addEventListener('click', function () { avancer(parcours + 25); MM.retour('clic'); });
    $('#c-recul').addEventListener('click', function () { avancer(parcours - 25); MM.retour('clic'); });
    $('#c-lecture').addEventListener('click', function () { basculerLecture(); MM.retour('clic'); });
    $('#c-reset').addEventListener('click', function () {
      if (lecture) basculerLecture();
      atteintes = {}; MMHud.finArret(); avancer(0); MM.retour('bascule');
    });
    $('#c-curseur').addEventListener('input', function (e) { avancer(+e.target.value); });

    var bs = $('#b-son');
    bs.setAttribute('aria-pressed', MM.son.actif ? 'true' : 'false');
    bs.style.opacity = MM.son.actif ? '1' : '.45';
    bs.addEventListener('click', function () {
      var a = MM.son.basculer();
      bs.setAttribute('aria-pressed', a ? 'true' : 'false');
      bs.style.opacity = a ? '1' : '.45';
      bs.title = a ? 'Couper les sons' : 'Activer les sons';
    });

    $('#b-sortie').addEventListener('click', function () {
      MM.session.fermer(); MM.retour('bascule');
      location.href = 'index.html';
    });

    document.addEventListener('keydown', function (ev) {
      if (/input|textarea/i.test((ev.target.tagName || ''))) return;
      if (ev.key === 'Escape') { allerEcran('plan'); return; }
      if (ecran !== 'marche') return;
      if (ev.key === 'ArrowRight') { avancer(parcours + 25); ev.preventDefault(); }
      if (ev.key === 'ArrowLeft') { avancer(parcours - 25); ev.preventDefault(); }
      if (ev.key === ' ') { basculerLecture(); ev.preventDefault(); }
    });

    // le poste pilote les droits
    $('#p-nom').textContent = POSTE.court;
    $('#p-lieu').textContent = POSTE.lieu.split('—')[0].trim();
    if (POSTE.droits.indexOf('marche') < 0) {
      var o = $('#ong-marche');
      o.disabled = true; o.style.opacity = '.4';
      o.title = 'Réservé à l\'équipe de surface';
      var vm = $('#vers-marche');
      vm.disabled = true;
      vm.className = 'btn';
      vm.style.cssText = 'width:100%;opacity:.55';
      vm.textContent = "Conduite réservée à l'équipe de surface";
    }
    if (POSTE.droits.indexOf('comms') < 0) $('#envois').innerHTML =
      '<span class="vide" style="padding:4px">Poste en écoute seule.</span>';
  }

  /* ================================================================ départ */
  function fini(msg) {
    $('#ch-txt').textContent = msg;
    setTimeout(function () {
      $('#chargement').classList.add('parti');
      setTimeout(function () { $('#chargement').remove(); }, 600);
      MM.son.jouer('demarrage');
    }, 220);
  }

  MM.charger('assets/data/mission.json').then(function (mission) {
    M = mission; IT = M.itineraire;
    $('#ch-txt').textContent = 'Couches cartographiques';

    MMCarte.init(M, {surEtape: function () {}});
    MMHud.init(M);
    brancher();
    brancherLiaison();
    MMCarte.viserEtape(0);
    avancer(0);

    requestAnimationFrame(function () {
      requestAnimationFrame(function () { MMCarte.recadrer(); });
    });

    // le terrain 3D se charge après la carte : l'outil est utilisable avant.
    $('#ch-txt').textContent = 'Modèle de terrain 1 m';
    var t = creerTerrain($('#vue3d'), {mission: M});
    return t.charger().then(function (api) {
      T3D = api;
      T3D.position(etat(parcours));
      T3D.visible(ecran === 'marche' || vue === '3d');
      T3D.mode(ecran === 'marche' ? 'visiere' : 'orbite');
      fini('Prêt');
    }).catch(function (err) {
      console.warn('Terrain 3D indisponible :', err);
      document.body.classList.add('sans3d');
      $('#vues').style.display = 'none';
      fini('Prêt — vue 3D indisponible');
    });
  }).catch(function (err) {
    $('#ch-txt').innerHTML = 'Données de mission illisibles.<br>' +
      '<span style="color:var(--txt-3)">Servez le dossier par HTTP : <code>python -m http.server 8000</code></span>';
    console.error(err);
  });
})();
