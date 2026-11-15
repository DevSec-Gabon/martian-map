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
    return Number(x).toLocaleString('en-US', {minimumFractionDigits: d, maximumFractionDigits: d});
  }
  function duree(min) {                     // 94 -> « 1 h 34 », 42 -> « 42 min »
    min = Math.max(0, Math.round(min));
    return min < 60 ? min + ' min' : Math.floor(min / 60) + ' h ' + String(min % 60).padStart(2, '0');
  }
  function heure(t) {
    return new Date(t).toLocaleTimeString('en-GB', {hour: '2-digit', minute: '2-digit'});
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
              'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
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

  var POSTES = {
    rover:  {nom: 'Surface crew', court: 'Surface', lieu: 'Mount Sharp — pressurized rover',
             droits: ['plan', 'marche', 'comms'], delai: 0},
    orbite: {nom: 'Orbit relay', court: 'Orbit', lieu: 'Low Mars orbit',
             droits: ['plan', 'comms'], delai: 0},
    terre:  {nom: 'Mission control', court: 'Earth', lieu: 'Earth — mission control',
             droits: ['plan'], delai: 12}
  };


  // Pas d'authentification (non autorisée par le concours) : la « session »
  // retient seulement le poste choisi à l'entrée. Sans choix : surface.
  var session = {
    ouvrir: function (role) {
      var s = {role: POSTES[role] ? role : 'rover', ident: POSTES[role] ? role : 'rover', ouvert: Date.now()};
      try { sessionStorage.setItem(CLE_SESSION, JSON.stringify(s)); } catch (e) {}
      return s;
    },
    lire: function () {
      try { return JSON.parse(sessionStorage.getItem(CLE_SESSION) || 'null'); } catch (e) { return null; }
    },
    fermer: function () {
      try { sessionStorage.removeItem(CLE_SESSION); } catch (e) {}
    },
    poste: function () { return session.lire() || session.ouvrir('rover'); }
  };

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

  // bruit filtré : pas dans la combinaison (transmis par le corps, pas par
  // l'air — l'atmosphère martienne porte mal le son), souffle d'envoi
  var bruitBuf = null;
  function bruit(debut, duree_s, vol, freq, q, glisse) {
    var c = contexte(); if (!c) return;
    if (!bruitBuf) {
      bruitBuf = c.createBuffer(1, c.sampleRate * 0.6, c.sampleRate);
      var d = bruitBuf.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    var src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = bruitBuf;
    f.type = 'bandpass'; f.Q.value = q || 0.8;
    f.frequency.setValueAtTime(freq, c.currentTime + debut);
    if (glisse) f.frequency.exponentialRampToValueAtTime(glisse, c.currentTime + debut + duree_s);
    g.gain.setValueAtTime(0, c.currentTime + debut);
    g.gain.linearRampToValueAtTime(vol, c.currentTime + debut + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + debut + duree_s);
    src.connect(f); f.connect(g); g.connect(c.destination);
    src.start(c.currentTime + debut); src.stop(c.currentTime + debut + duree_s + 0.05);
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
    pas:       function () { bruit(0, .14, .05, 140, 1.1); note(62, 0, .09, .03, 'sine'); },
    envoi:     function () { bruit(0, .32, .05, 900, 1.4, 3800); note(1320, .2, .08, .025, 'triangle'); },
    radar:     function () { note(1560, 0, .05, .02, 'sine'); note(1560, .09, .18, .012, 'sine'); },
    zone:      function () { note(520, 0, .12, .05, 'triangle'); note(390, .14, .12, .05, 'triangle');
                             note(520, .28, .2, .05, 'triangle'); },
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
    arrivee: [30, 45, 30, 45, 140], message: [22, 45, 22], envoi: [14],
    zone: [60, 40, 60, 40, 60], radar: [6]
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

  // Onde au point de contact : chaque action laisse une trace visible.
  document.addEventListener('pointerdown', function (e) {
    var b = e.target.closest && e.target.closest('.btn,.segments button,.etape,.ligne-couche');
    if (!b || b.disabled) return;
    var r = b.getBoundingClientRect(), t = Math.max(r.width, r.height) * 2.2;
    var o = document.createElement('span');
    o.className = 'onde';
    o.style.cssText = 'width:' + t + 'px;height:' + t + 'px;left:' + (e.clientX - r.left - t / 2) +
      'px;top:' + (e.clientY - r.top - t / 2) + 'px';
    b.appendChild(o);
    setTimeout(function () { o.remove(); }, 600);
  }, true);

  /* ========================================================================
     LIAISON SURFACE ↔ ORBITE ↔ TERRE
     Deux onglets (ou deux postes du même réseau local) partagent le même fil.
     Pas de serveur : BroadcastChannel, journal conservé en localStorage.
     ======================================================================== */
  var CLE_FIL = 'mm.en.fil', CLE_ACC = 'mm.en.accuses', CLE_ZONES = 'mm.en.zones', CLE_TELE = 'mm.en.telemetrie';
  var canal = null;
  var ecouteurs = [];
  var moi = {role: null, ident: null};

  function lireJ(cle, def) {
    try { return JSON.parse(localStorage.getItem(cle) || def); } catch (e) { return JSON.parse(def); }
  }
  function ecrireJ(cle, v) { try { localStorage.setItem(cle, JSON.stringify(v)); } catch (e) {} }

  function filLire() { return lireJ(CLE_FIL, '[]'); }
  function filEcrire(l) { ecrireJ(CLE_FIL, l.slice(-120)); }

  function canalOuvrir() {
    if (canal || !racine.BroadcastChannel) return canal;
    canal = new BroadcastChannel('martian-map');
    canal.onmessage = function (ev) { recevoir(ev.data); };
    return canal;
  }
  function diffuser(m) { canalOuvrir(); if (canal) canal.postMessage(m); }
  function distribuer(m, local) {
    ecouteurs.forEach(function (f) { try { f(m, local); } catch (e) {} });
  }

  // Tout message reçu d'un autre poste est acquitté automatiquement : l'émetteur
  // sait que l'information est arrivée (et où), sans action de l'équipage.
  function noterAccuse(ref, role, t) {
    var acc = lireJ(CLE_ACC, '{}');
    (acc[ref] = acc[ref] || {})[role] = t;
    ecrireJ(CLE_ACC, acc);
  }
  function recevoir(m) {
    if (!m) return;
    if (m.type === 'accuse') noterAccuse(m.ref, m.role, m.t);
    else if (m.type === 'msg' && moi.role && m.role !== moi.role) {
      var a = {type: 'accuse', ref: m.id, role: moi.role, t: Date.now()};
      noterAccuse(a.ref, a.role, a.t);
      diffuser(a);
    }
    distribuer(m, false);
  }

  var comms = {
    TYPES: [
      {id: 'spe', nom: 'Solar storm incoming', prio: 'danger',
       texte: 'Solar particle event (SPE) expected within 40 min. Cut the EVA short and head back to the rover.'},
      {id: 'radiations', nom: 'Radiation rising', prio: 'danger',
       texte: 'RAD shows a rising flux. Reduce time on the surface.'},
      {id: 'zone', nom: 'No-go zone', prio: 'danger', zone: true,
       texte: 'Thermal / radiation hot spot reported from orbit. Go around the zone.'},
      {id: 'meteo', nom: 'Dust rising', prio: 'prudence',
       texte: 'Dust opacity rising over the site. Expect reduced visibility.'},
      {id: 'equipement', nom: 'Equipment issue', prio: 'prudence',
       texte: 'An equipment anomaly has been reported for the surface team.'},
      {id: 'retour', nom: 'Return now', prio: 'danger',
       texte: 'Immediate return to the habitat requested.'},
      {id: 'cible', nom: 'Target reached', prio: 'info', texte: 'Target reached, sampling in progress.'},
      {id: 'aide', nom: 'Need assistance', prio: 'prudence',
       texte: 'The surface team requests assistance.'},
      {id: 'retour-ok', nom: 'Heading back', prio: 'info', texte: 'Heading back to the habitat.'},
      {id: 'ok', nom: 'Copy', prio: 'info', texte: 'Copy that.'}
    ],
    type: function (id) { return comms.TYPES.filter(function (t) { return t.id === id; })[0]; },
    identifier: function (role, ident) { moi.role = role; moi.ident = ident; canalOuvrir(); return comms; },
    sur: function (f) { ecouteurs.push(f); canalOuvrir(); return comms; },
    journal: filLire,
    accuses: function (id) { return lireJ(CLE_ACC, '{}')[id] || {}; },
    envoyer: function (m) {
      var msg = {
        type: 'msg',
        id: 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        de: m.de || moi.ident || 'unknown', role: m.role || moi.role || 'rover',
        sujet: m.sujet || '', texte: String(m.texte || '').slice(0, 280), prio: m.prio || 'info',
        t: Date.now(), delai_min: m.delai_min || 0, zone: m.zone || null
      };
      var l = filLire(); l.push(msg); filEcrire(l);
      if (msg.zone) {
        var z = comms.zones();
        z.push({id: msg.id, t: msg.t, lon: msg.zone.lon, lat: msg.zone.lat, r: msg.zone.r, nom: msg.sujet});
        ecrireJ(CLE_ZONES, z);
      }
      diffuser(msg);
      distribuer(msg, true);
      return msg;
    },
    zones: function () { return lireJ(CLE_ZONES, '[]'); },
    lever: function (id) {                 // une zone n'est plus d'actualité
      ecrireJ(CLE_ZONES, comms.zones().filter(function (z) { return z.id !== id; }));
      var m = {type: 'zones', t: Date.now()};
      diffuser(m); distribuer(m, true);
    },
    // télémétrie : position, progression et dose du marcheur, diffusées en
    // continu. Pas de journal : seul le dernier état compte.
    telemetrie: function (e) {
      var m = {type: 'telemetrie', role: moi.role, t: Date.now(), e: e};
      ecrireJ(CLE_TELE, m);
      diffuser(m);
    },
    derniereTelemetrie: function () { return lireJ(CLE_TELE, 'null'); },
    vider: function () {
      filEcrire([]); ecrireJ(CLE_ACC, {}); ecrireJ(CLE_ZONES, []);
      var m = {type: 'purge', t: Date.now()};
      diffuser(m); distribuer(m, true);
    }
  };

  // secours si BroadcastChannel est absent : l'événement storage
  racine.addEventListener('storage', function (e) {
    if (racine.BroadcastChannel) return;
    if (e.key === CLE_FIL) { var l = filLire(); if (l.length) recevoir(l[l.length - 1]); }
    if (e.key === CLE_TELE) recevoir(comms.derniereTelemetrie());
  });

  /* ========================================================================
     BATTEMENT — horloge qui continue en arrière-plan
     requestAnimationFrame s'arrête quand la fenêtre est masquée, et les
     minuteurs de la page sont ralentis à 1/s. Pendant une démo, on passe
     d'une fenêtre à l'autre : la marche ne doit pas s'arrêter. Un worker
     n'est pas ralenti ; il envoie un battement régulier à la page.
     ======================================================================== */
  function battement(fn, ms) {
    try {
      var code = 'setInterval(function(){postMessage(0)},' + (ms | 0) + ')';
      var w = new Worker(URL.createObjectURL(new Blob([code], {type: 'text/javascript'})));
      w.onmessage = function () { fn(performance.now()); };
      return w;
    } catch (e) {
      return setInterval(function () { fn(performance.now()); }, ms);
    }
  }

  /* ---------------------------------------------------------------- export */
  racine.MM = {
    R_MARS: R_MARS, RAD: RAD, POSTES: POSTES,
    fr: fr, duree: duree, heure: heure,
    metres: metres, cap: cap, rose: rose,
    charger: charger, session: session,
    son: son, vibrer: vibrer, retour: retour, comms: comms, battement: battement,
    $: function (s, p) { return (p || document).querySelector(s); },
    $$: function (s, p) { return Array.prototype.slice.call((p || document).querySelectorAll(s)); }
  };
})(window);
