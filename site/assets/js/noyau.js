/* ===========================================================================
   MARTIAN MAP — noyau commun
   Formats, géométrie martienne, session, retours sensoriels (son / vibration),
   liaison surface ↔ orbite. Chargé par toutes les pages.
   =========================================================================== */
(function (racine) {
  'use strict';

  var R_MARS = 3396190;          // rayon moyen de Mars, en mètres
  var RAD = Math.PI / 180;

  /* ---------------------------------------------------------------- formats */
  function fr(x, d) {
    d = d || 0;
    return Number(x).toLocaleString('fr-FR', {minimumFractionDigits: d, maximumFractionDigits: d});
  }
  function duree(min) {                     // 94 -> « 1 h 34 », 42 -> « 42 min »
    min = Math.max(0, Math.round(min));
    return min < 60 ? min + ' min' : Math.floor(min / 60) + ' h ' + String(min % 60).padStart(2, '0');
  }
  function heure(t) {
    return new Date(t).toLocaleTimeString('fr-FR', {hour: '2-digit', minute: '2-digit'});
  }

  /* ------------------------------------------------- géométrie locale (Mars) */
  function metres(a, b) {
    var dx = R_MARS * (b[0] - a[0]) * RAD * Math.cos((a[1] + b[1]) / 2 * RAD);
    var dy = R_MARS * (b[1] - a[1]) * RAD;
    return Math.hypot(dx, dy);
  }
  function cap(a, b) {
    var dx = R_MARS * (b[0] - a[0]) * RAD * Math.cos((a[1] + b[1]) / 2 * RAD);
    var dy = R_MARS * (b[1] - a[1]) * RAD;
    return (Math.atan2(dx, dy) / RAD + 360) % 360;
  }
  var ROSE = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
              'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];
  function rose(c) { return ROSE[Math.round(c / 22.5) % 16]; }

  /* ------------------------------------------------------------- chargement */
  // mission.js (window.MISSION) permet l'ouverture en file:// ; sinon fetch.
  function charger(chemin) {
    if (racine.MISSION) return Promise.resolve(racine.MISSION);
    return fetch(chemin || 'assets/data/mission.json')
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
  }

  /* ---------------------------------------------------------------- session */
  var CLE_SESSION = 'mm.session';
  var DUREE_SESSION = 2 * 3600 * 1000;

  var POSTES = {
    rover:  {nom: 'Rover de surface', court: 'Rover',  lieu: 'Mont Sharp — rover pressurisé',
             droits: ['plan', 'marche', 'comms'], delai: 0},
    orbite: {nom: 'Relais en orbite', court: 'Orbite', lieu: 'Orbite basse de Mars',
             droits: ['plan', 'comms'], delai: 0},
    terre:  {nom: 'Centre de contrôle', court: 'Terre', lieu: 'Libreville — centre de contrôle',
             droits: ['plan'], delai: 12}
  };

  var session = {
    ouvrir: function (role, ident) {
      var s = {role: role, ident: ident, ouvert: Date.now(), expire: Date.now() + DUREE_SESSION};
      try { sessionStorage.setItem(CLE_SESSION, JSON.stringify(s)); } catch (e) {}
      return s;
    },
    lire: function () {
      try {
        var s = JSON.parse(sessionStorage.getItem(CLE_SESSION) || 'null');
        if (!s || s.expire < Date.now()) return null;
        return s;
      } catch (e) { return null; }
    },
    fermer: function () {
      try { sessionStorage.removeItem(CLE_SESSION); } catch (e) {}
    },
    exiger: function (ou) {
      var s = session.lire();
      if (!s) { location.replace(ou || 'index.html'); return null; }
      return s;
    }
  };

  /* ------------------------------------------------- empreinte du code (SHA-256) */
  function empreinte(texte) {
    var enc = new TextEncoder().encode(texte);
    return crypto.subtle.digest('SHA-256', enc).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf),
        function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    });
  }

  /* ========================================================================
     RETOURS SENSORIELS
     Sons de synthèse : rien à télécharger, latence nulle, et surtout un
     vocabulaire sonore cohérent — montant = confirmation, battement grave =
     danger. Coupable à tout moment (une interface qui bipe sans arrêt
     pendant un pitch est une interface ratée).
     ======================================================================== */
  var CLE_SON = 'mm.son';
  var ctx = null;

  function contexte() {
    if (!ctx) {
      var C = racine.AudioContext || racine.webkitAudioContext;
      if (!C) return null;
      ctx = new C();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function note(freq, debut, duree_s, vol, forme) {
    var c = contexte(); if (!c) return;
    var o = c.createOscillator(), g = c.createGain();
    o.type = forme || 'sine';
    o.frequency.setValueAtTime(freq, c.currentTime + debut);
    g.gain.setValueAtTime(0, c.currentTime + debut);
    g.gain.linearRampToValueAtTime(vol, c.currentTime + debut + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + debut + duree_s);
    o.connect(g); g.connect(c.destination);
    o.start(c.currentTime + debut); o.stop(c.currentTime + debut + duree_s + 0.02);
  }

  var TIMBRES = {
    clic:      function () { note(1180, 0, .045, .035, 'triangle'); },
    bascule:   function () { note(760, 0, .06, .045, 'triangle'); note(1140, .045, .07, .035, 'triangle'); },
    valide:    function () { note(660, 0, .09, .05); note(990, .075, .14, .045); },
    refus:     function () { note(300, 0, .1, .055, 'sawtooth'); note(225, .09, .16, .05, 'sawtooth'); },
    prudence:  function () { note(640, 0, .13, .05, 'triangle'); note(640, .19, .13, .05, 'triangle'); },
    danger:    function () { note(420, 0, .16, .07, 'square'); note(300, .2, .16, .07, 'square');
                             note(420, .4, .22, .07, 'square'); },
    arrivee:   function () { note(523, 0, .12, .05); note(659, .1, .12, .05); note(784, .2, .26, .055); },
    message:   function () { note(880, 0, .07, .04, 'triangle'); note(1175, .07, .13, .035, 'triangle'); },
    demarrage: function () { note(196, 0, .5, .04, 'sine'); note(294, .1, .5, .035, 'sine');
                             note(440, .22, .55, .03, 'sine'); }
  };

  var son = {
    actif: (function () { try { return localStorage.getItem(CLE_SON) !== '0'; } catch (e) { return true; } })(),
    basculer: function (v) {
      son.actif = (v === undefined) ? !son.actif : !!v;
      try { localStorage.setItem(CLE_SON, son.actif ? '1' : '0'); } catch (e) {}
      if (son.actif) TIMBRES.bascule();
      return son.actif;
    },
    jouer: function (nom) { if (son.actif && TIMBRES[nom]) { try { TIMBRES[nom](); } catch (e) {} } }
  };

  var VIBRATIONS = {
    clic: [8], bascule: [12], valide: [16, 40, 16], refus: [70, 50, 70],
    prudence: [45, 70, 45], danger: [100, 60, 100, 60, 180],
    arrivee: [30, 45, 30, 45, 140], message: [22, 45, 22]
  };
  function vibrer(nom) {
    if (!navigator.vibrate) return false;
    try { return navigator.vibrate(VIBRATIONS[nom] || nom || [10]); } catch (e) { return false; }
  }

  // Retour unique : son + vibration + (optionnel) impulsion visuelle.
  function retour(nom, element) {
    son.jouer(nom);
    vibrer(nom);
    if (element) {
      element.classList.remove('impulsion');
      void element.offsetWidth;
      element.classList.add('impulsion');
    }
  }

  /* ========================================================================
     LIAISON SURFACE ↔ ORBITE ↔ TERRE
     Deux onglets (ou deux postes du même réseau local) partagent le même fil.
     Pas de serveur : BroadcastChannel, journal conservé en localStorage.
     ======================================================================== */
  var CLE_FIL = 'mm.fil';
  var canal = null;
  var ecouteurs = [];

  function filLire() {
    try { return JSON.parse(localStorage.getItem(CLE_FIL) || '[]'); } catch (e) { return []; }
  }
  function filEcrire(l) {
    try { localStorage.setItem(CLE_FIL, JSON.stringify(l.slice(-80))); } catch (e) {}
  }

  function canalOuvrir() {
    if (canal || !racine.BroadcastChannel) return canal;
    canal = new BroadcastChannel('martian-map');
    canal.onmessage = function (ev) { distribuer(ev.data, false); };
    return canal;
  }
  function distribuer(m, local) {
    ecouteurs.forEach(function (f) { try { f(m, local); } catch (e) {} });
  }

  var comms = {
    TYPES: [
      {id: 'radiations', nom: 'Hausse des radiations', prio: 'danger',
       texte: 'Hausse du flux détectée par RAD. Réduire le temps en surface.'},
      {id: 'equipement', nom: 'Anomalie équipement', prio: 'prudence',
       texte: 'Anomalie signalée sur un équipement de l\'équipe de surface.'},
      {id: 'meteo', nom: 'Poussière en hausse', prio: 'prudence',
       texte: 'Opacité en hausse sur la zone. Visibilité réduite à prévoir.'},
      {id: 'cible', nom: 'Cible atteinte', prio: 'info', texte: 'Cible atteinte, relevé en cours.'},
      {id: 'retour', nom: 'Demande de retour', prio: 'danger',
       texte: 'Retour immédiat à l\'habitat demandé par le relais.'},
      {id: 'ok', nom: 'Accusé de réception', prio: 'info', texte: 'Bien reçu.'}
    ],
    ouvrir: function () { canalOuvrir(); return comms; },
    sur: function (f) { ecouteurs.push(f); canalOuvrir(); return comms; },
    journal: filLire,
    vider: function () { filEcrire([]); distribuer({type: 'purge'}, true); },
    envoyer: function (m) {
      var msg = {
        id: 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        de: m.de || 'inconnu', role: m.role || 'rover', sujet: m.sujet || '',
        texte: m.texte || '', prio: m.prio || 'info', t: Date.now(),
        delai_min: m.delai_min || 0
      };
      var l = filLire(); l.push(msg); filEcrire(l);
      canalOuvrir();
      if (canal) canal.postMessage(msg);
      distribuer(msg, true);
      return msg;
    }
  };

  // Un autre onglet a écrit dans le journal : on relaie (secours si BroadcastChannel absent).
  racine.addEventListener('storage', function (e) {
    if (e.key !== CLE_FIL || racine.BroadcastChannel) return;
    var l = filLire();
    if (l.length) distribuer(l[l.length - 1], false);
  });

  /* ---------------------------------------------------------------- export */
  racine.MM = {
    R_MARS: R_MARS, RAD: RAD, POSTES: POSTES,
    fr: fr, duree: duree, heure: heure,
    metres: metres, cap: cap, rose: rose,
    charger: charger, session: session, empreinte: empreinte,
    son: son, vibrer: vibrer, retour: retour, comms: comms,
    $: function (s, p) { return (p || document).querySelector(s); },
    $$: function (s, p) { return Array.prototype.slice.call((p || document).querySelectorAll(s)); }
  };
})(window);
