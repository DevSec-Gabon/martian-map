/* ===========================================================================
   MARTIAN MAP — carte 2D, profil en long et panneau de mission
   Leaflet en projection géographique (L.CRS.EPSG4326) : les couches produites
   par le pipeline sont calées sur la même emprise que le modèle de terrain.
   =========================================================================== */
window.MMCarte = (function () {
  'use strict';
  var $ = MM.$, fr = MM.fr;

  var M, IT, carte, couches = {}, marqueur, etapeActive = -1, surEtape = null, curseurProfil = null;
  var COUL = {ok: '#56CC8A', prudence: '#FFB020', limite: '#FF4D4F'};

  function niveau(p) {
    if (p >= M.seuils.interdit_deg - 3) return 'limite';
    if (p >= M.seuils.prudence_deg) return 'prudence';
    return 'ok';
  }

  /* ----------------------------------------------------------------- carte */
  function construire() {
    var b = M.bounds;
    carte = L.map('carte', {
      crs: L.CRS.EPSG4326, zoomControl: false, attributionControl: true,
      maxZoom: 24, zoomSnap: .25, wheelPxPerZoomLevel: 110, fadeAnimation: true
    });
    cadrerPlein();
    L.control.zoom({position: 'bottomright'}).addTo(carte);
    carte.attributionControl.setPrefix('');
    carte.attributionControl.addAttribution('NASA/JPL-Caltech · USGS Astrogeology · MSL');

    var fonds = $('#fonds'), surc = $('#surcouches');
    function ligne(hote, type, id, nom, actif, pastille) {
      var l = document.createElement('label');
      l.className = 'ligne-couche';
      l.innerHTML =
        '<input type="' + (type === 'base' ? 'radio" name="fond' : 'checkbox') + '"' +
        (actif ? ' checked' : '') + '>' +
        '<span class="boite"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" ' +
        'stroke="#03171C" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="m4 12.5 5.2 5.2L20 7"/></svg></span>' +
        (pastille ? '<span class="pastille" style="background:' + pastille + '"></span>' : '') +
        '<span>' + nom + '</span>';
      hote.appendChild(l);
      return l.querySelector('input');
    }

    M.couches.forEach(function (c, k) {
      var actif = c.type === 'base' ? k === 0 : !!c.defaut;
      var o = L.imageOverlay('assets/data/' + c.fichier, b, {opacity: c.opacite, interactive: false});
      couches[c.id] = {obj: o, conf: c};
      if (actif) o.addTo(carte);
      ligne(c.type === 'base' ? fonds : surc, c.type, c.id, c.nom, actif)
        .addEventListener('change', function (e) {
          basculer(c.id, e.target.checked, c.type); MM.retour('bascule');
        });
    });

    var route = IT.coordinates.map(function (p) { return [p[1], p[0]]; });
    couches.itineraire = {obj: L.layerGroup([
      L.polyline(route, {color: '#02080A', weight: 9, opacity: .6, interactive: false}),
      L.polyline(route, {color: '#AFF2FA', weight: 3.5, opacity: .95, interactive: false}),
      L.polyline(route, {color: '#2FD0E6', weight: 3.5, dashArray: '2 11', interactive: false})
    ]), conf: {}};
    couches.curiosity = {obj: L.polyline(
      M.waypoints_curiosity.coordinates.map(function (p) { return [p[1], p[0]]; }),
      {color: '#7FB3D5', weight: 1.8, opacity: .85, dashArray: '5 4', interactive: false}), conf: {}};
    couches.itineraire.obj.addTo(carte);

    ligne(surc, 'over', 'itineraire', 'Itinéraire retenu', true, '#AFF2FA')
      .addEventListener('change', function (e) { basculer('itineraire', e.target.checked); MM.retour('bascule'); });
    ligne(surc, 'over', 'curiosity', 'Traces de Curiosity · ' + M.waypoints_curiosity.n + ' pts', false, '#7FB3D5')
      .addEventListener('change', function (e) { basculer('curiosity', e.target.checked); MM.retour('bascule'); });

    // points de mission
    function pin(p, nom, coul, etiq) {
      L.circleMarker([p.lat, p.lon], {radius: 8, color: coul, weight: 3,
        fillColor: '#070A0C', fillOpacity: .95, interactive: false}).addTo(carte);
      L.marker([p.lat, p.lon], {interactive: false, icon: L.divIcon({
        className: '', html: '<span class="etiq-carte">' + etiq + '</span>',
        iconSize: null, iconAnchor: [-12, 9]})}).addTo(carte);
      return nom;
    }
    pin(M.habitat, 'habitat', '#FFFFFF', 'Habitat');
    M.cibles.forEach(function (c) {
      pin(c, c.nom, c.nature === 'creux' ? '#6FA8FF' : '#2FD0E6', c.nom);
    });

    marqueur = L.circleMarker([M.habitat.lat, M.habitat.lon], {
      radius: 7, color: '#03171C', weight: 2.5, fillColor: '#2FD0E6', fillOpacity: 1,
      className: 'marqueur-marche', interactive: false});

    $('#opacite').addEventListener('input', function (e) {
      var v = +e.target.value / 100;
      $('#opacite-v').textContent = Math.round(v * 100) + '%';
      M.couches.forEach(function (c) {
        if (c.type !== 'base' && carte.hasLayer(couches[c.id].obj)) couches[c.id].obj.setOpacity(c.opacite * v);
      });
    });
  }

  // « cover » plutôt que « contain » : l'emprise remplit la fenêtre, la carte
  // occupe tout l'écran au lieu d'être une vignette carrée au milieu.
  function cadrerPlein() {
    var b = L.latLngBounds(M.bounds);
    carte.setView(b.getCenter(), carte.getBoundsZoom(b, true), {animate: false});
  }

  function basculer(id, actif, type) {
    var c = couches[id];
    if (type === 'base') {
      M.couches.filter(function (x) { return x.type === 'base'; })
        .forEach(function (x) { carte.removeLayer(couches[x.id].obj); });
      c.obj.addTo(carte); c.obj.bringToBack();
    } else if (actif) {
      c.obj.addTo(carte);
      if (c.conf.opacite) c.obj.setOpacity(c.conf.opacite * (+$('#opacite').value / 100));
    } else { carte.removeLayer(c.obj); }
    if (carte.hasLayer(couches.itineraire.obj)) {
      couches.itineraire.obj.eachLayer(function (l) { l.bringToFront(); });
    }
  }

  /* ------------------------------------------------------- panneau mission */
  function panneau() {
    var s = M.stats;
    $('#m-nom').textContent = M.nom.replace(/\s*–.*/, '');
    $('#m-site').textContent = M.site.nom;

    var cases = [
      [fr(s.longueur_km, 2) + '<span class="unite"> km</span>', 'Distance (boucle)'],
      [MM.duree(s.temps_prudent_min), 'Marche · ' + fr(s.temps_ref_min) + ' min sans combinaison'],
      ['+' + fr(s.denivele_m) + '<span class="unite"> m</span>', 'Dénivelé positif'],
      [fr(s.pente_max, 1) + '<span class="unite">°</span>', 'Pente maximale · ' + fr(s.prudence_pct) + ' % en prudence'],
      [fr(s.dose_msv, 3) + '<span class="unite"> mSv</span>', 'Dose reçue sur la sortie'],
      [fr(M.cibles.length), 'Cibles · une crête, un creux']
    ];
    $('#bilan').innerHTML = cases.map(function (c) {
      return '<div><div class="v data">' + c[0] + '</div><div class="l">' + c[1] + '</div></div>';
    }).join('');

    $('#hypotheses').innerHTML =
      'Hypothèses : vitesse en combinaison × ' + fr(s.facteur_prudent, 1) + ' de la règle de Tobler · ' +
      'seuils de pente ' + fr(M.seuils.prudence_deg) + '° / ' + fr(M.seuils.interdit_deg) + '° · ' +
      'dose RAD ' + fr(s.dose_jour, 2) + ' mSv/jour · lissage du relief ' +
      fr(M.seuils.lissage_pente_m) + ' m (calé sur 73 relevés de Curiosity).';

    var cible = function (n) { return M.cibles.filter(function (c) { return c.nom === n; })[0]; };
    var rangs = [{nature: 'habitat', nom: M.habitat.nom, num: '◆',
      det: 'Départ · ' + fr(M.habitat.alt_m, 0) + ' m · relevé Curiosity sol ' + M.habitat.sol_curiosity,
      sci: ''}];
    M.etapes.forEach(function (e, k) {
      var c = cible(e.arrivee);
      rangs.push({
        nature: c ? c.nature : 'habitat', nom: e.arrivee, num: k + 1,
        det: fr(e.distance_m) + ' m · ' + MM.duree(e.temps_prudent_min) + ' · D+ ' +
             fr(e.denivele_pos_m) + ' m · pente max ' + fr(e.pente_max, 1) + '°',
        sci: c ? c.science + ' · relevé ' + fr(c.duree_arret_min) + ' min'
               : 'Fin de sortie — remontée dans le rover pressurisé'
      });
    });
    $('#etapes').innerHTML = rangs.map(function (r, k) {
      return '<button class="etape" data-nature="' + r.nature + '" data-k="' + k + '">' +
        '<span class="num">' + r.num + '</span><span><span class="nom">' + r.nom + '</span>' +
        '<span class="det">' + r.det + '</span>' +
        (r.sci ? '<span class="sci">' + r.sci + '</span>' : '') + '</span></button>';
    }).join('');
    MM.$$('#etapes .etape').forEach(function (b) {
      b.addEventListener('click', function () {
        viserEtape(+b.dataset.k); MM.retour('clic');
        if (surEtape) surEtape(+b.dataset.k);
      });
    });

    $('#cond-maj').textContent = 'MSL · RAD / REMS';
    $('#mesures').innerHTML = M.conditions.mesures.map(function (m) {
      return '<div class="mesure etat" data-n="' + (m.etat === 'info' ? 'info' : 'ok') + '">' +
        '<div class="n">' + m.nom + '</div><div class="v">' + m.valeur + '</div>' +
        '<div class="d">' + m.detail + '</div></div>';
    }).join('');
  }

  function viserEtape(k) {
    etapeActive = k;
    MM.$$('#etapes .etape').forEach(function (b) {
      b.setAttribute('aria-current', +b.dataset.k === k ? 'true' : 'false');
    });
    if (!carte) return;
    if (k === 0) {
      carte.flyTo([M.habitat.lat, M.habitat.lon], Math.max(carte.getZoom(), 17), {duration: .7});
    } else {
      var e = M.etapes[k - 1];
      var seg = IT.coordinates.slice(e.i_debut, e.i_fin + 1).map(function (p) { return [p[1], p[0]]; });
      carte.flyToBounds(L.latLngBounds(seg).pad(.3), {duration: .7});
    }
    profil(curseurProfil);
  }

  /* ----------------------------------------------------- profil en long */
  function profil(curseur) {
    curseurProfil = (curseur === undefined) ? curseurProfil : curseur;
    var svg = $('#profil'), W = 352, H = 92, hb = 7;
    var D = IT.distance_cum_m, A = IT.altitude_m, P = IT.pente_deg;
    var dmax = D[D.length - 1], amin = Math.min.apply(null, A), amax = Math.max.apply(null, A);
    var x = function (d) { return d / dmax * W; };
    var y = function (a) { return 12 + (1 - (a - amin) / (amax - amin || 1)) * (H - hb - 20); };

    var trait = '', ruban = '', reperes = '';
    D.forEach(function (d, i) { trait += (i ? 'L' : 'M') + x(d).toFixed(1) + ' ' + y(A[i]).toFixed(1); });
    for (var i = 0; i < D.length - 1; i++) {
      ruban += '<rect x="' + x(D[i]).toFixed(1) + '" y="' + (H - hb) + '" width="' +
        Math.max(x(D[i + 1]) - x(D[i]), .8).toFixed(1) + '" height="' + hb + '" fill="' +
        COUL[niveau(P[i])] + '" opacity=".9"/>';
    }
    M.etapes.forEach(function (e, k) {
      if (etapeActive === k + 1) {
        reperes += '<rect x="' + x(D[e.i_debut]).toFixed(1) + '" y="0" width="' +
          (x(D[e.i_fin]) - x(D[e.i_debut])).toFixed(1) + '" height="' + H +
          '" fill="rgba(47,208,230,.13)"/>';
      }
      reperes += '<line x1="' + x(D[e.i_fin]).toFixed(1) + '" y1="4" x2="' + x(D[e.i_fin]).toFixed(1) +
        '" y2="' + (H - hb) + '" stroke="rgba(255,255,255,.22)" stroke-width="1" stroke-dasharray="3 3"/>';
    });
    var cur = '';
    if (curseurProfil !== null && curseurProfil !== undefined) {
      var cx = x(curseurProfil);
      cur = '<line x1="' + cx.toFixed(1) + '" y1="2" x2="' + cx.toFixed(1) + '" y2="' + (H - hb) +
        '" stroke="#2FD0E6" stroke-width="1.6"/><circle cx="' + cx.toFixed(1) + '" cy="' +
        y(A[Math.min(A.length - 1, Math.round(curseurProfil / dmax * (A.length - 1)))]).toFixed(1) +
        '" r="3.4" fill="#AFF2FA"/>';
    }
    svg.innerHTML =
      '<defs><linearGradient id="gp" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="rgba(47,208,230,.32)"/><stop offset="1" stop-color="rgba(47,208,230,0)"/>' +
      '</linearGradient></defs>' + reperes +
      '<path d="' + trait + 'L' + W + ' ' + (H - hb) + 'L0 ' + (H - hb) + 'Z" fill="url(#gp)"/>' +
      '<path d="' + trait + '" fill="none" stroke="#6FE2F2" stroke-width="1.7" stroke-linejoin="round"/>' +
      ruban + cur +
      '<text x="2" y="9" fill="#79828B" font-size="9" font-family="JetBrains Mono,monospace">' + fr(amax, 0) + ' m</text>' +
      '<text x="2" y="' + (H - hb - 3) + '" fill="#79828B" font-size="9" font-family="JetBrains Mono,monospace">' + fr(amin, 0) + ' m</text>' +
      '<text x="' + (W - 2) + '" y="' + (H - hb - 3) + '" fill="#79828B" font-size="9" text-anchor="end" font-family="JetBrains Mono,monospace">' + fr(dmax, 0) + ' m</text>';
  }

  /* --------------------------------------------------------------- public */
  return {
    init: function (mission, opts) {
      M = mission; IT = M.itineraire;
      surEtape = (opts || {}).surEtape;
      construire(); panneau(); profil(null);
      return carte;
    },
    position: function (lon, lat) {
      if (!marqueur) return;
      marqueur.setLatLng([lat, lon]);
      if (!carte.hasLayer(marqueur)) marqueur.addTo(carte);
    },
    suivre: function (lon, lat) { if (carte) carte.panTo([lat, lon], {animate: true, duration: .4}); },
    viserEtape: viserEtape,
    profil: profil,
    niveau: niveau,
    recadrer: function () { if (carte) { carte.invalidateSize(); cadrerPlein(); } },
    taille: function () { if (carte) carte.invalidateSize(); },
    get carte() { return carte; }
  };
})();
