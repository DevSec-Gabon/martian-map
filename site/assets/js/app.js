/* ===========================================================================
   MARTIAN MAP — orchestration
   Un seul outil, trois vues : carte 2D, terrain 3D, visière.
   Un seul jeu de données : assets/data/mission.json, produit par le pipeline.

   v4 :
   - la marche avance au RYTHME RÉEL de l'itinéraire (vitesse prudente en
     combinaison, calculée point par point), accélérable ×10 / ×30 pour la
     démonstration ; les sauts de ±25 m glissent au lieu de téléporter ;
   - le rover diffuse sa télémétrie (position, progression, dose, pente) :
     l'orbite et la Terre suivent le marcheur en direct sur leur carte ;
   - liaison : messages libres avec priorité, accusés de réception
     automatiques, zones à éviter posées sur la carte par l'orbite et
     reportées dans le radar de la visière.
   =========================================================================== */
import { creerTerrain } from './terrain3d.js?v=17';

(function () {
  'use strict';
  var $ = MM.$, $$ = MM.$$, fr = MM.fr;

  // pas d'authentification : on lit le poste choisi à l'entrée (surface par défaut)
  var sess = MM.session.poste();
  var POSTE = MM.POSTES[sess.role] || MM.POSTES.rover;
  MM.comms.identifier(sess.role, sess.ident);

  var M, IT, T3D = null, parcours = 0, lecture = false, cibleEnCours = null;
  var atteintes = {}, ecran = 'plan', vue = '2d';
  var facteur = 10;               // accélération de la démonstration
  var vise = null;                // position visée lors d'un saut (glissement)
  var pasDernier = 0;
  var reprendreApres = false;     // reprise automatique après un relevé

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
    // vitesse prudente locale (m/s), issue du temps de marche Tobler du pipeline
    var dt = (IT.temps_cum_s[j] - IT.temps_cum_s[i]) / M.stats.facteur_prudent;
    e.v = dt > 0 ? (D[j] - D[i]) / dt : 0.6;

    // cap suivi : on vise un point de l'itinéraire 20 m plus loin, jamais la
    // ligne droite vers la cible — c'est tout l'intérêt d'un trajet validé.
    var av = Math.min(s + 20, fin - 0.1);
    var ia = index(av), ja = Math.min(ia + 1, C.length - 1);
    var fa = D[ja] > D[ia] ? (av - D[ia]) / (D[ja] - D[ia]) : 0;
    var pa = [C[ia][0] + (C[ja][0] - C[ia][0]) * fa, C[ia][1] + (C[ja][1] - C[ia][1]) * fa];
    e.cap = MM.metres([e.lon, e.lat], pa) < 0.4 ? IT.cap_deg[i] : MM.cap([e.lon, e.lat], pa);

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
  // télémétrie vers l'orbite et la Terre : 5 par seconde, plus un envoi
  // immédiat à chaque arrêt (pause, arrivée sur cible) — l'orbite ne doit
  // jamais prolonger un mouvement qui n'a plus lieu.
  var teleDerniere = 0;
  function tele(e, force) {
    if (sess.role !== 'rover' || !IT) return;
    if (!force && performance.now() - teleDerniere < 200) return;
    teleDerniere = performance.now();
    e = e || etat(parcours);
    var bouge = !MMHud.enArret() && (lecture || vise !== null);
    MM.comms.telemetrie({lon: e.lon, lat: e.lat, s: e.s, fin: e.fin, dose: e.dose, pente: e.pente,
      vers: e.etape.arrivee, marche: bouge,
      vitesse: !bouge ? 0 : lecture ? e.v * facteur : 16 * Math.sign(vise - e.s)});
  }
  function avancer(s) {
    if (MMHud.enArret()) return;
    parcours = Math.max(0, Math.min(s, IT.distance_cum_m[IT.distance_cum_m.length - 1]));
    var e = etat(parcours);

    MMCarte.position(e.lon, e.lat);
    MMCarte.profil(parcours);
    MMCarte.parcouru(parcours);
    if (T3D) { T3D.position(e); T3D.parcouru(parcours); }
    if (ecran === 'marche') MMHud.maj(e);
    $('#c-vitesse').textContent = fr(e.v * 3.6, 1) + ' km/h';

    tele(e, false);

    if (e.cible && e.dRest < 6 && !atteintes[e.cible.nom]) {
      atteintes[e.cible.nom] = true;
      cibleEnCours = e.cible;
      // en marche automatique, la marche reprendra seule après le relevé
      reprendreApres = lecture;
      if (lecture) basculerLecture();
      vise = null;
      document.body.classList.add('sur-cible-on');
      setTimeout(function () { tele(null, true); }, 0);
      MMHud.arrivee(e.cible, function () {
        cibleEnCours = null;
        document.body.classList.remove('sur-cible-on');
        alerte('Sampling complete', e.cible.nom + ' — sample logged, resuming the walk.', 'info');
        MM.comms.envoyer({sujet: 'Target reached',
          texte: e.cible.nom + ': sampling complete (' + fr(e.cible.duree_arret_min) + ' min).', prio: 'info'});
        avancer(parcours);
        if (reprendreApres && !lecture) basculerLecture();
        reprendreApres = false;
      });
      alerte('Target reached — ' + e.cible.nom, e.cible.science, 'info');
      MMCarte.viserEtape(e.k + 1);
    }
    return e;
  }

  // Boucle de marche : avance au rythme réel × facteur, ou glisse vers un
  // point visé. Le casque reçoit l'« allure » pour le balancement des pas.
  // La marche avance selon le TEMPS RÉEL écoulé, pas selon les images
  // affichées. Deux horloges l'appellent : l'animation de l'écran (fluide
  // quand la fenêtre est visible) et un battement en worker (qui continue
  // quand on bascule sur la fenêtre de l'orbite). Chaque appel avance du
  // temps écoulé depuis le précédent, par pas de 0,1 s au plus : une arrivée
  // sur cible n'est jamais sautée, même après une seconde en arrière-plan.
  var tPrec = 0;
  function pasDeMarche(t) {
    if (tPrec && t <= tPrec) return;
    var dtTotal = tPrec ? Math.min((t - tPrec) / 1000, 10) : 0;
    tPrec = t;
    if (!IT) return;
    var fin = IT.distance_cum_m[IT.distance_cum_m.length - 1];
    var allure = 0;
    while (dtTotal > 0) {
      var dt = Math.min(dtTotal, 0.1);
      dtTotal -= dt;
      if (MMHud.enArret()) break;
      if (lecture) {
        if (parcours >= fin) {
          basculerLecture();
          alerte('EVA complete', 'Back at the habitat. Dose received ' + fr(etat(parcours).dose, 3) + ' mSv.', 'info');
          MM.retour('valide');
          break;
        }
        avancer(parcours + etat(parcours).v * facteur * dt);
        allure = 1;
      } else if (vise !== null) {
        var d = vise - parcours, pas = Math.sign(d) * Math.min(Math.abs(d), 16 * dt);
        avancer(parcours + pas);
        allure = 0.8;
        if (Math.abs(vise - parcours) < 0.05) { vise = null; tele(null, true); break; }
      } else break;
    }
    if (T3D) T3D.allure(MMHud.enArret() ? 0 : allure);
    // bruit de pas (cadence réelle ~1,3 pas/s, même accéléré : c'est un repère)
    if (allure > 0 && ecran === 'marche' && !document.hidden && t - pasDernier > 760) {
      pasDernier = t; MM.son.jouer('pas');
    }
  }
  function marche(t) { requestAnimationFrame(marche); pasDeMarche(t); }

  function basculerLecture() {
    var b = $('#c-lecture');
    lecture = !lecture;
    vise = null;
    b.textContent = lecture ? 'Pause' : 'Walk';
    b.classList.toggle('btn-cle', !lecture);
    tele(null, true);
  }
  function sauter(d) { vise = Math.max(0, Math.min((vise === null ? parcours : vise) + d, IT.distance_cum_m[IT.distance_cum_m.length - 1])); }

  /* ================================================================ écrans */
  function allerEcran(e) {
    if (e === 'marche' && POSTE.droits.indexOf('marche') < 0) {
      alerte('Not available', 'The ' + POSTE.nom + ' station follows the EVA; only the surface crew walks it.', 'prudence');
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
    else { setTimeout(function () { MMCarte.taille(); }, 60); }   // la marche continue : changer de vue ne l'interrompt pas
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
  function echapper(t) {
    return String(t).replace(/[&<>"']/g, function (c) {
      return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c];
    });
  }
  function alerte(titre, texte, prio) {
    var d = document.createElement('div');
    d.className = 'alerte verre';
    d.dataset.prio = prio || 'info';
    d.innerHTML = '<div class="e"><span class="puce-etat etat" data-n="' + (prio || 'info') +
      '" style="border:0;padding:0"></span><span class="etiq">' + echapper(titre) + '</span>' +
      '<span class="etiq data" style="margin-left:auto;color:var(--txt-4)">' + MM.heure(Date.now()) + '</span></div>' +
      '<div class="t">' + echapper(texte) + '</div>';
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
    rover:  ['cible', 'equipement', 'aide', 'retour-ok', 'ok'],
    orbite: ['spe', 'radiations', 'zone', 'meteo', 'equipement', 'retour', 'ok'],
    terre:  []
  };

  function filRendu() {
    var l = MM.comms.journal().slice(-30).reverse();
    if (!l.length) { $('#fil').innerHTML = '<div class="vide">No messages yet.</div>'; return; }
    $('#fil').innerHTML = l.map(function (m) {
      var p = MM.POSTES[m.role] || {court: m.role};
      var moi = m.role === sess.role;
      var acc = '';
      if (moi) {
        var a = MM.comms.accuses(m.id), qui = Object.keys(a);
        acc = qui.length
          ? '<span class="acc ok">✓✓ received · ' + qui.map(function (r) {
              return (MM.POSTES[r] || {court: r}).court + ' ' + MM.heure(a[r]); }).join(' · ') + '</span>'
          : '<span class="acc">✓ sent · awaiting receipt</span>';
      }
      return '<div class="msg-l" data-prio="' + m.prio + '"' + (moi ? ' data-moi' : '') + '>' +
        '<div class="e"><span class="puce-etat etat" data-n="' + m.prio + '" style="border:0;padding:0"></span>' +
        '<span class="qui">' + (moi ? 'You · ' : '') + p.court + (m.delai_min >= 1 ? ' · +' + fr(m.delai_min) + ' min' : '') + '</span>' +
        '<span class="h">' + MM.heure(m.t) + '</span></div>' +
        (m.sujet ? '<b>' + echapper(m.sujet) + '</b> — ' : '') + echapper(m.texte) +
        (m.zone ? '<span class="zone-l">◎ ' + fr(m.zone.r) + ' m zone added to the map and the radar</span>' : '') +
        acc + '</div>';
    }).join('');
  }

  function zonesRendu() {
    var z = MM.comms.zones();
    MMCarte.zones(z);
    MMHud.zones(z);
    if (T3D) T3D.zones(z);
  }

  // message entrant affiché DANS la visière, avec réponses rapides
  var hlMinuteur = null;
  function visiereMessage(m) {
    var b = $('#h-liaison');
    b.dataset.prio = m.prio;
    $('#hl-puce').dataset.n = m.prio;
    $('#hl-de').textContent = (MM.POSTES[m.role] || {court: m.role}).court + ' · ' + (m.sujet || 'Message');
    $('#hl-h').textContent = MM.heure(m.t);
    $('#hl-t').textContent = m.texte;
    b.classList.remove('vu'); void b.offsetWidth; b.classList.add('vu');
    clearTimeout(hlMinuteur);
    if (m.prio !== 'danger') hlMinuteur = setTimeout(function () { b.classList.remove('vu'); }, 16000);
  }
  function repondre(id) {
    var t = MM.comms.type(id);
    if (!t || POSTE.droits.indexOf('comms') < 0) return;
    MM.comms.envoyer({sujet: t.nom, texte: t.texte, prio: t.prio, delai_min: POSTE.delai});
    $('#h-liaison').classList.remove('vu');
    MM.retour('envoi');
  }

  function emettreType(t, b) {
    if (t.zone) {
      if (vue !== '2d') allerVue('2d');
      alerte('Place the zone', 'Click the map at the centre of the area to avoid (60 m radius). Esc to cancel.', 'prudence');
      MMCarte.poserZone(function (ll) {
        if (!ll) return;
        MM.comms.envoyer({sujet: t.nom, texte: t.texte, prio: t.prio, delai_min: POSTE.delai,
          zone: {lon: ll.lng, lat: ll.lat, r: 60}});
        MM.retour('zone');
      });
      return;
    }
    MM.comms.envoyer({sujet: t.nom, texte: t.texte, prio: t.prio, delai_min: POSTE.delai});
    MM.retour('envoi', b);
  }

  /* --------------------------------------------- suivi en direct (orbite, Terre)
     Les paquets arrivent 5 fois par seconde. Entre deux paquets, le
     marcheur n'est pas figé : sa position est anticipée avec la vitesse
     reçue (au plus 0,6 s), puis lissée. Comme la position est une distance
     le long de l'itinéraire, le marqueur reste exactement sur le trajet. */
  var suivi = {s: 0, v: 0, recu: 0, bouge: false, aff: null, tPrec: 0, profil: 0, cadre: 0, auto: true};
  function suiviRendu(m) {
    if (!m || !m.e || sess.role === 'rover') return;
    var e = m.e;
    suivi.s = e.s; suivi.v = e.vitesse || 0; suivi.bouge = !!e.marche; suivi.recu = performance.now();
    $('#suivi').classList.add('vu');
    $('#suivi').classList.toggle('en-marche', suivi.bouge);
    $('#suivi-txt').textContent = fr(e.s) + ' / ' + fr(e.fin) + ' m · to ' + e.vers.replace(/\s*–.*/, '') +
      ' · ' + fr(e.pente, 1) + '° · ' + fr(e.dose, 3) + ' mSv';
    $('#suivi-h').textContent = (suivi.bouge ? 'walking · ' : 'stopped · ') + MM.heure(m.t);
  }
  function animSuivi(t) {
    if (sess.role === 'rover' || !IT || !suivi.recu) return;
    if (suivi.tPrec && t <= suivi.tPrec) return;
    var dt = suivi.tPrec ? Math.min((t - suivi.tPrec) / 1000, 10) : 0;
    suivi.tPrec = t;
    var fin = IT.distance_cum_m[IT.distance_cum_m.length - 1];
    var avance = suivi.bouge ? suivi.v * Math.min((t - suivi.recu) / 1000, 0.6) : 0;
    var vise = Math.max(0, Math.min(fin, suivi.s + avance));
    if (suivi.aff === null || Math.abs(vise - suivi.aff) > 120) suivi.aff = vise;      // saut (reprise, recul)
    else suivi.aff += (vise - suivi.aff) * (1 - Math.exp(-dt * 9));
    var e = etat(suivi.aff);
    MMCarte.position(e.lon, e.lat);
    MMCarte.parcouru(suivi.aff);
    if (T3D) { T3D.position(e); T3D.parcouru(suivi.aff); }
    if (t - suivi.profil > 200) { suivi.profil = t; MMCarte.profil(suivi.aff); }
    if (suivi.auto && vue === '2d' && t - suivi.cadre > 400) { suivi.cadre = t; MMCarte.garderEnVue(e.lon, e.lat); }
  }
  function basculerSuiviAuto(v) {
    suivi.auto = v;
    $('#suivi-auto').setAttribute('aria-pressed', v ? 'true' : 'false');
    if (T3D) T3D.suivre(v);
  }

  function brancherLiaison() {
    $('#delai').textContent = POSTE.delai ? fr(POSTE.delai) + ' min delay' : 'direct link';

    var types = (ENVOIS[sess.role] || []).map(MM.comms.type).filter(Boolean);
    $('#envois').innerHTML = types.map(function (t) {
      return '<button class="btn" data-t="' + t.id + '" data-prio="' + t.prio + '">' +
        (t.zone ? '◎ ' : '') + t.nom + '</button>';
    }).join('');
    $$('#envois .btn').forEach(function (b) {
      b.addEventListener('click', function () { emettreType(MM.comms.type(b.dataset.t), b); });
    });

    $('#composer').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var t = $('#c-texte').value.trim();
      if (!t) { MM.retour('refus', $('#composer')); return; }
      MM.comms.envoyer({sujet: '', texte: t, prio: $('#c-prio').value, delai_min: POSTE.delai});
      $('#c-texte').value = '';
      MM.retour('envoi', $('#composer'));
    });

    $$('#h-liaison [data-rep]').forEach(function (b) {
      b.addEventListener('click', function () { repondre(b.dataset.rep); });
    });

    MM.comms.sur(function (m, local) {
      if (m.type === 'telemetrie') { suiviRendu(m); return; }
      if (m.type === 'accuse') { filRendu(); return; }
      filRendu();
      if (m.zone || m.type === 'zones' || m.type === 'purge') zonesRendu();
      if (local || m.type !== 'msg') return;
      if (ecran === 'marche') visiereMessage(m);
      else alerte(m.sujet || 'Message', m.texte, m.prio);
      MM.retour(m.prio === 'danger' ? 'danger' : m.prio === 'prudence' ? 'prudence' : 'message');
    });
    filRendu();
    suiviRendu(MM.comms.derniereTelemetrie());
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

    $('#c-avance').addEventListener('click', function () { sauter(25); MM.retour('clic'); });
    $('#c-recul').addEventListener('click', function () { sauter(-25); MM.retour('clic'); });
    $('#c-lecture').addEventListener('click', function () { basculerLecture(); MM.retour('clic'); });
    $('#c-reset').addEventListener('click', function () {
      reprendreApres = false;
      if (lecture) basculerLecture();
      vise = null; atteintes = {}; MMHud.finArret(); avancer(0); MM.retour('bascule');
    });
    $('#c-curseur').addEventListener('input', function (e) { vise = null; avancer(+e.target.value); });
    $$('#c-facteur button').forEach(function (b) {
      b.addEventListener('click', function () {
        facteur = +b.dataset.f;
        $$('#c-facteur button').forEach(function (x) { x.setAttribute('aria-selected', x === b ? 'true' : 'false'); });
        MM.retour('bascule');
      });
    });

    var bs = $('#b-son');
    bs.setAttribute('aria-pressed', MM.son.actif ? 'true' : 'false');
    bs.style.opacity = MM.son.actif ? '1' : '.45';
    bs.addEventListener('click', function () {
      var a = MM.son.basculer();
      bs.setAttribute('aria-pressed', a ? 'true' : 'false');
      bs.style.opacity = a ? '1' : '.45';
      bs.title = a ? 'Mute sounds' : 'Enable sounds';
    });

    $('#b-sortie').addEventListener('click', function () {
      MM.session.fermer(); MM.retour('bascule');
      location.href = 'index.html';
    });

    document.addEventListener('keydown', function (ev) {
      if (/input|textarea|select/i.test((ev.target.tagName || ''))) return;
      if (ev.key === 'Escape') { if (!document.body.classList.contains('pose-zone')) allerEcran('plan'); return; }
      if (ecran !== 'marche') return;
      if (ev.key === 'ArrowRight') { sauter(25); ev.preventDefault(); }
      if (ev.key === 'ArrowLeft') { sauter(-25); ev.preventDefault(); }
      if (ev.key === ' ') { basculerLecture(); ev.preventDefault(); }
      if (ev.key === 'r' || ev.key === 'R') MMHud.couche();
      if ($('#h-liaison').classList.contains('vu')) {
        if (ev.key === '1') repondre('ok');
        if (ev.key === '2') repondre('retour-ok');
        if (ev.key === '3') repondre('aide');
      }
    });

    // le poste pilote les droits
    $('#p-nom').textContent = POSTE.court;
    $('#p-lieu').textContent = POSTE.lieu.split('—')[0].trim();
    if (POSTE.droits.indexOf('marche') < 0) {
      var o = $('#ong-marche');
      o.disabled = true; o.style.opacity = '.4';
      o.title = 'Surface crew only';
      var vm = $('#vers-marche');
      vm.disabled = true;
      vm.className = 'btn';
      vm.style.cssText = 'width:100%;opacity:.55';
      vm.textContent = 'Walk mode: surface crew only';
    }
    if (POSTE.droits.indexOf('comms') < 0) {
      $('#composer').style.display = 'none';
      $('#envois').innerHTML = '<span class="vide" style="padding:4px">Listen-only station — ' +
        fr(POSTE.delai) + ' min light delay.</span>';
    }
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

  MM.charger('assets/data/mission.json?v=7').then(function (mission) {
    M = mission; IT = M.itineraire;
    $('#ch-txt').textContent = 'Map layers';

    MMCarte.init(M, {surEtape: function () {}});
    MMHud.init(M);
    brancher();
    brancherLiaison();
    zonesRendu();
    MMCarte.viserEtape(0);
    avancer(0);
    requestAnimationFrame(marche);
    MM.battement(function (t) { pasDeMarche(t); animSuivi(t); }, 100);
    (function anim(t) { requestAnimationFrame(anim); animSuivi(t); })(performance.now());
    if (sess.role !== 'rover') {
      $('#suivi-auto').addEventListener('click', function () { basculerSuiviAuto(!suivi.auto); MM.retour('bascule'); });
      MMCarte.surGlisser(function () { if (suivi.auto) basculerSuiviAuto(false); });
    }

    requestAnimationFrame(function () {
      requestAnimationFrame(function () { MMCarte.recadrer(); });
    });

    $('#ch-txt').textContent = '1 m terrain model';
    var t = creerTerrain($('#vue3d'), {mission: M});
    return t.charger().then(function (api) {
      T3D = api;
      T3D.position(etat(parcours));
      T3D.visible(ecran === 'marche' || vue === '3d');
      T3D.mode(ecran === 'marche' ? 'visiere' : 'orbite');
      T3D.suivre(sess.role !== 'rover' && suivi.auto);
      T3D.parcouru(sess.role === 'rover' ? parcours : (suivi.aff || 0));
      zonesRendu();
      fini('Ready');
    }).catch(function (err) {
      console.warn('Terrain 3D indisponible :', err);
      document.body.classList.add('sans3d');
      $('#vues').style.display = 'none';
      fini('Ready — 3D view unavailable');
    });
  }).catch(function (err) {
    $('#ch-txt').innerHTML = 'Mission data could not be read.<br>' +
      '<span style="color:var(--txt-3)">Serve the folder over HTTP: <code>python -m http.server 8000</code></span>';
    console.error(err);
  });
})();
