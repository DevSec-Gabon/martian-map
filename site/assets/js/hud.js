/* ===========================================================================
   MARTIAN MAP — visière (mode marche)
   Règle de composition : le centre de l'écran est le champ de vision de
   l'astronaute. Rien n'y est posé. Les informations occupent les bords, la
   bande de cap reste fine et haute, la minicarte est inclinée en bas à gauche.
   =========================================================================== */
window.MMHud = (function () {
  'use strict';
  var $ = MM.$, fr = MM.fr;

  var M, IT, ruban, rctx, mini, mctx;
  var PORTEE = 250;                 // rayon couvert par la minicarte, en mètres
  var VITESSE_DEMO = 60;            // 1 s réelle = 60 s de mission pendant un relevé
  var chrono = null, surFinArret = null;

  function niveau(p) {
    if (p >= M.seuils.interdit_deg - 3) return 'limite';
    if (p >= M.seuils.prudence_deg) return 'prudence';
    return 'ok';
  }

  /* =================================================== bande de cap (haut) */
  function dessinerRuban(cap, capCible) {
    var W = ruban.width, H = ruban.height, c = rctx;
    var pxDeg = W / 90;                                   // ±45° visibles
    c.clearRect(0, 0, W, H);

    c.textAlign = 'center';
    for (var d = Math.floor(cap - 48); d <= cap + 48; d++) {
      var a = (d + 360) % 360;
      if (a % 5) continue;
      var x = W / 2 + (d - cap) * pxDeg;
      var maj = a % 30 === 0;
      c.strokeStyle = maj ? 'rgba(255,255,255,.55)' : 'rgba(255,255,255,.22)';
      c.lineWidth = maj ? 2 : 1.4;
      c.beginPath(); c.moveTo(x, H - 1); c.lineTo(x, H - (maj ? 24 : 13)); c.stroke();
      if (maj) {
        var r = ['N', '', '', 'E', '', '', 'S', '', '', 'O', '', ''][a / 30];
        c.fillStyle = r ? '#AFF2FA' : 'rgba(255,255,255,.62)';
        c.font = (r ? '700 23px ' : '500 19px ') + '"JetBrains Mono",monospace';
        c.fillText(r || String(a).padStart(3, '0'), x, 24);
      }
    }
    // repère de la cible : où se trouve le prochain point par rapport au regard
    if (capCible !== null && capCible !== undefined) {
      var ec = ((capCible - cap + 540) % 360) - 180;
      var xc = W / 2 + Math.max(-46, Math.min(46, ec)) * pxDeg;
      c.fillStyle = Math.abs(ec) > 46 ? '#FFB020' : '#2FD0E6';
      c.beginPath();
      c.moveTo(xc, H - 30); c.lineTo(xc + 9, H - 42); c.lineTo(xc - 9, H - 42); c.closePath(); c.fill();
    }
  }

  /* ======================================= minicarte inclinée (type jeu 3D) */
  function dessinerMini(e, cap) {
    var W = mini.width, c = mctx, R = W / 2;
    var ech = R / PORTEE;                                  // pixels par mètre
    c.clearRect(0, 0, W, W);

    c.save();
    c.translate(R, R * 1.26);          // le marcheur est bas : la route devant occupe le plateau
    c.rotate(-cap * MM.RAD);           // le cap suivi pointe vers le haut

    var ori = [e.lon, e.lat];
    function p(lon, lat) {
      var dx = MM.R_MARS * (lon - ori[0]) * MM.RAD * Math.cos((lat + ori[1]) / 2 * MM.RAD);
      var dy = MM.R_MARS * (lat - ori[1]) * MM.RAD;
      return [dx * ech, -dy * ech];
    }

    // cercles de portée
    c.strokeStyle = 'rgba(255,255,255,.1)'; c.lineWidth = 2.5;
    [1 / 3, 2 / 3, 1].forEach(function (f) {
      c.beginPath(); c.arc(0, 0, R * f * 1.2, 0, 6.2832); c.stroke();
    });

    // traces de Curiosity, en fond
    c.strokeStyle = 'rgba(127,179,213,.5)'; c.lineWidth = 5;
    c.beginPath();
    M.waypoints_curiosity.coordinates.forEach(function (w, i) {
      var q = p(w[0], w[1]); c[i ? 'lineTo' : 'moveTo'](q[0], q[1]);
    });
    c.stroke();

    // itinéraire : halo sombre puis trait clair
    function trace(coul, ep) {
      c.strokeStyle = coul; c.lineWidth = ep; c.lineJoin = 'round'; c.lineCap = 'round';
      c.beginPath();
      IT.coordinates.forEach(function (q, i) {
        var u = p(q[0], q[1]); c[i ? 'lineTo' : 'moveTo'](u[0], u[1]);
      });
      c.stroke();
    }
    trace('rgba(2,8,10,.9)', 30);
    trace('#8FEEFF', 15);

    // partie déjà parcourue, en retrait
    c.strokeStyle = 'rgba(120,150,160,.55)'; c.lineWidth = 13; c.beginPath();
    for (var i = 0; i <= e.i; i++) {
      var u = p(IT.coordinates[i][0], IT.coordinates[i][1]);
      c[i ? 'lineTo' : 'moveTo'](u[0], u[1]);
    }
    c.stroke();

    // habitat et cibles
    var h = p(M.habitat.lon, M.habitat.lat);
    c.strokeStyle = 'rgba(2,8,10,.8)'; c.lineWidth = 13;
    c.strokeRect(h[0] - 15, h[1] - 15, 30, 30);
    c.strokeStyle = '#FFFFFF'; c.lineWidth = 7;
    c.strokeRect(h[0] - 15, h[1] - 15, 30, 30);
    M.cibles.forEach(function (ci) {
      var q = p(ci.lon, ci.lat);
      var coul = ci.nature === 'creux' ? '#6FA8FF' : '#2FD0E6';
      c.strokeStyle = 'rgba(2,8,10,.8)'; c.lineWidth = 16;
      c.beginPath(); c.arc(q[0], q[1], 21, 0, 6.2832); c.stroke();
      c.strokeStyle = coul; c.lineWidth = 8;
      c.beginPath(); c.arc(q[0], q[1], 21, 0, 6.2832); c.stroke();
      c.fillStyle = coul; c.beginPath(); c.arc(q[0], q[1], 9, 0, 6.2832); c.fill();
    });

    c.restore();
    $('#mini-nord').style.transform = 'rotate(' + (-cap) + 'deg)';
  }

  /* ======================================================= carte d'arrivée */
  function arrivee(cible, surFin) {
    surFinArret = surFin;
    var reste = cible.duree_arret_min * 60;                // secondes de mission
    $('#sc-nom').textContent = cible.nom;
    $('#sc-sci').textContent = cible.science;
    $('#sc-reste').textContent = 'temps mission · défilement accéléré ×' + VITESSE_DEMO;
    $('#sur-cible').classList.add('vu');
    MM.retour('arrivee', $('#sur-cible'));

    clearInterval(chrono);
    var t0 = Date.now();
    function tic() {
      var ecoule = (Date.now() - t0) / 1000 * VITESSE_DEMO;
      var r = Math.max(0, reste - ecoule);
      $('#sc-chrono').textContent =
        String(Math.floor(r / 60)).padStart(2, '0') + ':' + String(Math.floor(r % 60)).padStart(2, '0');
      if (r <= 0) finArret();
    }
    tic();
    chrono = setInterval(tic, 120);
  }

  function finArret() {
    clearInterval(chrono); chrono = null;
    $('#sur-cible').classList.remove('vu');
    if (surFinArret) { var f = surFinArret; surFinArret = null; f(); }
  }

  /* ============================================================ mise à jour */
  function maj(e) {
    var et = e.etape, cible = e.cible;

    $('#h-etape').textContent = (e.k + 1) + '/' + M.etapes.length;
    $('#h-nom').textContent = et.arrivee;
    $('#h-sci').textContent = cible ? cible.science : 'Fin de sortie — remontée dans le rover pressurisé';

    $('#h-dist').innerHTML = fr(e.dRest) + '<span class="unite"> m</span>';
    $('#h-temps').innerHTML = fr(Math.max(e.tRest, e.dRest > 0 ? 1 : 0)) + '<span class="unite"> min</span>';
    $('#h-retour').innerHTML = MM.duree(e.tHab).replace(/ (min|h)/, '<span class="unite"> $1</span>');
    $('#h-dose').innerHTML = fr(e.dose, 3) + '<span class="unite" style="font-size:11px"> mSv</span>';
    $('#h-cap').textContent = fr(e.cap) + '° ' + MM.rose(e.cap);

    var n = niveau(e.pente);
    var b = $('#b-pente');
    if (b.dataset.n !== n) {
      b.dataset.n = n;
      if (n !== 'ok') MM.retour(n === 'limite' ? 'danger' : 'prudence', b);
    }
    $('#h-pente-etat').textContent = n === 'ok' ? 'Terrain normal' : n === 'prudence' ? 'Prudence' : 'Pente forte';
    $('#h-pente').textContent = fr(e.pente, 1) + '°';
    $('#h-pente-txt').textContent =
      n === 'ok' ? 'sous le seuil de ' + fr(M.seuils.prudence_deg) + '°'
      : n === 'prudence' ? 'pas courts, appuis contrôlés'
      : 'limite de sécurité ' + fr(M.seuils.interdit_deg) + '° — chercher un appui';

    dessinerRuban(e.cap, e.capCible);
    dessinerMini(e, e.cap);
    $('#mini-etiq').textContent = 'Orientation · ' + PORTEE + ' m';

    var fin = IT.distance_cum_m[IT.distance_cum_m.length - 1];
    $('#prog-i').style.width = (e.s / fin * 100) + '%';
    $('#c-curseur').value = Math.round(e.s);
    $('#c-pos').textContent = fr(e.s) + ' / ' + fr(fin) + ' m';
    $('#c-alt').textContent = fr(e.alt, 0) + ' m';
  }

  /* ---------------------------------------------------------------- public */
  return {
    init: function (mission) {
      M = mission; IT = M.itineraire;
      ruban = $('#ruban-c'); rctx = ruban.getContext('2d');
      mini = $('#mini-c'); mctx = mini.getContext('2d');
      $('#c-curseur').max = Math.round(IT.distance_cum_m[IT.distance_cum_m.length - 1]);
      $('#sc-fin').addEventListener('click', function () { MM.retour('clic'); finArret(); });
    },
    maj: maj,
    arrivee: arrivee,
    finArret: finArret,
    enArret: function () { return chrono !== null; },
    portee: function (v) { if (v) PORTEE = v; return PORTEE; },
    niveau: niveau
  };
})();
