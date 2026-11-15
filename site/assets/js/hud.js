/* ===========================================================================
   MARTIAN MAP — visière (mode marche)
   Règle de composition : le centre de l'écran est le champ de vision de
   l'astronaute. Rien n'y est posé. Les informations occupent les bords, la
   bande de cap reste fine et haute, le radar est incliné en bas à gauche.

   Radar à couches (v4) — touche R ou bouton sous le radar :
   - « Zones » : la carte des dangers du pipeline (prudence ambre, interdit
     rouge) projetée sous l'itinéraire, + les zones signalées depuis
     l'orbite (point chaud, radiations). Distance à la zone interdite la
     plus proche affichée en permanence.
   - « Trajet » : l'itinéraire seul, pour une lecture épurée.
   =========================================================================== */
window.MMHud = (function () {
  'use strict';
  var $ = MM.$, fr = MM.fr;

  var M, IT, ruban, rctx, mini, mctx;
  var PORTEE = 160;                 // rayon couvert par le radar, en mètres
  var VITESSE_DEMO = 60;            // 1 s réelle = 60 s de mission pendant un relevé
  var chrono = null, surFinArret = null;
  var coucheRadar = 'zones';        // 'zones' | 'trajet'
  var zonesImg = null, zonesPix = null, ZW = 0, ZH = 0;
  var zonesOrbite = [];
  var alerteZone = {};              // zones déjà annoncées (une fois chacune)
  var dernierEtat = null;

  function niveau(p) {
    if (p >= M.seuils.interdit_deg - 3) return 'limite';
    if (p >= M.seuils.prudence_deg) return 'prudence';
    return 'ok';
  }

  /* --------------------------------------------- couche des dangers (radar) */
  function chargerZones() {
    var i = new Image();
    i.onload = function () {
      zonesImg = i; ZW = i.width; ZH = i.height;
      var cv = document.createElement('canvas'); cv.width = ZW; cv.height = ZH;
      var cx = cv.getContext('2d', {willReadFrequently: true});
      cx.drawImage(i, 0, 0);
      zonesPix = cx.getImageData(0, 0, ZW, ZH).data;
      if (dernierEtat) maj(dernierEtat);
    };
    i.src = 'assets/data/radar-zones.png';
  }

  // Distance (m) et direction de la case interdite la plus proche, dans 60 m.
  function interditProche(lon, lat) {
    if (!zonesPix) return null;
    var b = M.bbox;
    var mx = (b[2] - b[0]) * MM.RAD * MM.R_MARS * Math.cos(lat * MM.RAD) / ZW;   // m par pixel
    var my = (b[3] - b[1]) * MM.RAD * MM.R_MARS / ZH;
    var u0 = (lon - b[0]) / (b[2] - b[0]) * ZW, v0 = (b[3] - lat) / (b[3] - b[1]) * ZH;
    var rp = Math.ceil(60 / Math.min(mx, my)), best = null;
    for (var dv = -rp; dv <= rp; dv++) {
      for (var du = -rp; du <= rp; du++) {
        var u = Math.round(u0 + du), v = Math.round(v0 + dv);
        if (u < 0 || v < 0 || u >= ZW || v >= ZH) continue;
        var k = (v * ZW + u) * 4;
        if (zonesPix[k + 3] < 128 || zonesPix[k + 1] > 120) continue;        // rouge seulement
        var d = Math.hypot(du * mx, dv * my);
        if (!best || d < best.d) best = {d: d, cap: (Math.atan2(du * mx, -dv * my) / MM.RAD + 360) % 360};
      }
    }
    return best;
  }

  function zoneOrbiteProche(lon, lat) {
    var best = null;
    zonesOrbite.forEach(function (z) {
      var d = MM.metres([lon, lat], [z.lon, z.lat]) - z.r;
      if (!best || d < best.d) best = {d: d, z: z, cap: MM.cap([lon, lat], [z.lon, z.lat])};
    });
    return best;
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
      c.strokeStyle = maj ? 'rgba(255,255,255,.6)' : 'rgba(255,255,255,.25)';
      c.lineWidth = maj ? 2 : 1.4;
      c.beginPath(); c.moveTo(x, H - 1); c.lineTo(x, H - (maj ? 24 : 13)); c.stroke();
      if (maj) {
        var r = ['N', '', '', 'E', '', '', 'S', '', '', 'O', '', ''][a / 30];
        c.fillStyle = r ? '#AFF2FA' : 'rgba(255,255,255,.7)';
        c.font = (r ? '700 25px ' : '500 21px ') + '"JetBrains Mono",monospace';
        c.fillText(r || String(a).padStart(3, '0'), x, 26);
      }
    }
    if (capCible !== null && capCible !== undefined) {
      var ec = ((capCible - cap + 540) % 360) - 180;
      var xc = W / 2 + Math.max(-46, Math.min(46, ec)) * pxDeg;
      c.fillStyle = Math.abs(ec) > 46 ? '#FFB020' : '#2FD0E6';
      c.beginPath();
      c.moveTo(xc, H - 30); c.lineTo(xc + 9, H - 42); c.lineTo(xc - 9, H - 42); c.closePath(); c.fill();
    }
  }

  /* ======================================= radar incliné (type jeu 3D) */
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

    // couche des dangers, projetée à l'échelle sous le marcheur
    if (coucheRadar === 'zones' && zonesImg) {
      var b = M.bbox, hg = p(b[0], b[3]), bd = p(b[2], b[1]);
      c.globalAlpha = .5;
      c.imageSmoothingEnabled = false;
      c.drawImage(zonesImg, hg[0], hg[1], bd[0] - hg[0], bd[1] - hg[1]);
      c.globalAlpha = 1;
    }

    // cercles de portée
    c.strokeStyle = 'rgba(255,255,255,.12)'; c.lineWidth = 2.5;
    [1 / 3, 2 / 3, 1].forEach(function (f) {
      c.beginPath(); c.arc(0, 0, R * f * 1.2, 0, 6.2832); c.stroke();
    });

    // zones signalées depuis l'orbite : hachurées, toujours visibles
    zonesOrbite.forEach(function (z) {
      var q = p(z.lon, z.lat), rz = z.r * ech;
      c.save();
      c.beginPath(); c.arc(q[0], q[1], rz, 0, 6.2832);
      c.fillStyle = 'rgba(255,77,79,.22)'; c.fill();
      c.clip();
      c.strokeStyle = 'rgba(255,77,79,.55)'; c.lineWidth = 4;
      for (var h = -rz * 2; h < rz * 2; h += 18) {
        c.beginPath(); c.moveTo(q[0] + h, q[1] - rz); c.lineTo(q[0] + h + rz * 2, q[1] + rz); c.stroke();
      }
      c.restore();
      c.strokeStyle = '#FF4D4F'; c.lineWidth = 5;
      c.beginPath(); c.arc(q[0], q[1], rz, 0, 6.2832); c.stroke();
    });

    // itinéraire : halo sombre puis trait clair
    function trace(coul, ep) {
      c.strokeStyle = coul; c.lineWidth = ep; c.lineJoin = 'round'; c.lineCap = 'round';
      c.beginPath();
      IT.coordinates.forEach(function (q, i) {
        var u = p(q[0], q[1]); c[i ? 'lineTo' : 'moveTo'](u[0], u[1]);
      });
      c.stroke();
    }
    trace('rgba(2,8,10,.9)', 26);
    trace('#8FEEFF', 12);

    // partie déjà parcourue, en retrait
    c.strokeStyle = 'rgba(120,150,160,.6)'; c.lineWidth = 11; c.beginPath();
    for (var i = 0; i <= e.i; i++) {
      var u = p(IT.coordinates[i][0], IT.coordinates[i][1]);
      c[i ? 'lineTo' : 'moveTo'](u[0], u[1]);
    }
    c.stroke();

    // habitat et cibles
    var h0 = p(M.habitat.lon, M.habitat.lat);
    c.strokeStyle = 'rgba(2,8,10,.8)'; c.lineWidth = 13;
    c.strokeRect(h0[0] - 15, h0[1] - 15, 30, 30);
    c.strokeStyle = '#FFFFFF'; c.lineWidth = 7;
    c.strokeRect(h0[0] - 15, h0[1] - 15, 30, 30);
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

  /* ---------------------------------------- étiquette et alerte de proximité */
  function majProximite(e) {
    var et = $('#mini-etiq'), boite = $('#boussole3d');
    var zi = interditProche(e.lon, e.lat), zo = zoneOrbiteProche(e.lon, e.lat);
    var txt = (coucheRadar === 'zones' ? 'Zones' : 'Route') + ' · ' + PORTEE + ' m';
    var etat = 'ok';
    if (zo && zo.d < 120) {
      txt = (zo.d <= 0 ? 'Inside reported zone' : 'Reported zone ' + fr(zo.d) + ' m ' + MM.rose(zo.cap));
      etat = zo.d < 40 ? 'danger' : 'prudence';
      if (zo.d < 60 && !alerteZone[zo.z.id]) {
        alerteZone[zo.z.id] = true;
        MM.retour('danger', boite);
      }
    } else if (coucheRadar === 'zones' && zi) {
      txt = 'No-go ' + fr(zi.d) + ' m ' + MM.rose(zi.cap);
      etat = zi.d < 6 ? 'prudence' : 'ok';
    }
    et.textContent = txt;
    boite.dataset.etat = etat;
  }

  /* ======================================================= carte d'arrivée */
  function arrivee(cible, surFin) {
    surFinArret = surFin;
    var reste = cible.duree_arret_min * 60;                // secondes de mission
    $('#sc-nom').textContent = cible.nom;
    $('#sc-sci').textContent = cible.science;
    $('#sc-reste').textContent = 'mission time · accelerated ×' + VITESSE_DEMO;
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
    dernierEtat = e;
    var et = e.etape, cible = e.cible;

    $('#h-etape').textContent = (e.k + 1) + '/' + M.etapes.length;
    $('#h-nom').textContent = et.arrivee;
    $('#h-sci').textContent = cible ? cible.science : 'End of EVA — back into the pressurized rover';

    $('#h-dist').innerHTML = fr(e.dRest) + '<span class="unite"> m</span>';
    $('#h-temps').innerHTML = fr(Math.max(e.tRest, e.dRest > 0 ? 1 : 0)) + '<span class="unite"> min</span>';
    $('#h-retour').innerHTML = MM.duree(e.tHab).replace(/ (min|h)/, '<span class="unite"> $1</span>');
    $('#h-dose').innerHTML = fr(e.dose, 3) + '<span class="unite" style="font-size:12px"> mSv</span>';
    $('#h-cap').textContent = fr(e.cap) + '° ' + MM.rose(e.cap);

    var n = niveau(e.pente);
    var b = $('#b-pente');
    if (b.dataset.n !== n) {
      b.dataset.n = n;
      if (n !== 'ok') MM.retour(n === 'limite' ? 'danger' : 'prudence', b);
    }
    $('#h-pente-etat').textContent = n === 'ok' ? 'Normal ground' : n === 'prudence' ? 'Caution' : 'Steep slope';
    $('#h-pente').textContent = fr(e.pente, 1) + '°';
    $('#h-pente-txt').textContent =
      n === 'ok' ? 'below the ' + fr(M.seuils.prudence_deg) + '° threshold'
      : n === 'prudence' ? 'short steps, controlled footing'
      : 'safety limit ' + fr(M.seuils.interdit_deg) + '° — find stable footing';

    dessinerRuban(e.cap, e.capCible);
    dessinerMini(e, e.cap);
    majProximite(e);

    var fin = IT.distance_cum_m[IT.distance_cum_m.length - 1];
    $('#prog-i').style.width = (e.s / fin * 100) + '%';
    $('#c-curseur').value = Math.round(e.s);
    $('#c-pos').textContent = fr(e.s) + ' / ' + fr(fin) + ' m';
    $('#c-alt').textContent = fr(e.alt, 0) + ' m';
  }

  function basculerCouche(v) {
    coucheRadar = v || (coucheRadar === 'zones' ? 'trajet' : 'zones');
    MM.$$('#radar-couches button').forEach(function (b) {
      b.setAttribute('aria-selected', b.dataset.c === coucheRadar ? 'true' : 'false');
    });
    MM.retour('radar');
    if (dernierEtat) maj(dernierEtat);
  }

  /* ---------------------------------------------------------------- public */
  return {
    init: function (mission) {
      M = mission; IT = M.itineraire;
      ruban = $('#ruban-c'); rctx = ruban.getContext('2d');
      mini = $('#mini-c'); mctx = mini.getContext('2d');
      $('#c-curseur').max = Math.round(IT.distance_cum_m[IT.distance_cum_m.length - 1]);
      $('#sc-fin').addEventListener('click', function () { MM.retour('clic'); finArret(); });
      MM.$$('#radar-couches button').forEach(function (b) {
        b.addEventListener('click', function () { basculerCouche(b.dataset.c); });
      });
      $('#radar-portee').addEventListener('click', function () {
        PORTEE = PORTEE === 160 ? 320 : 160;
        this.textContent = PORTEE + ' m';
        MM.retour('radar');
        if (dernierEtat) maj(dernierEtat);
      });
      chargerZones();
    },
    maj: maj,
    arrivee: arrivee,
    finArret: finArret,
    enArret: function () { return chrono !== null; },
    couche: basculerCouche,
    zones: function (l) { zonesOrbite = l || []; if (dernierEtat) maj(dernierEtat); },
    niveau: niveau
  };
})();
