/* ===========================================================================
   MARTIAN MAP — écran d'entrée
   Pas d'authentification (non autorisée par le règlement du concours).
   On choisit seulement un POSTE, qui règle ce que l'interface propose :
   surface = conduit la marche, orbite = émet alertes et zones, Terre = écoute.
   =========================================================================== */
(function () {
  'use strict';
  var role = 'rover';
  var s = MM.session.lire();
  if (s && MM.POSTES[s.role]) role = s.role;

  function choisir(r, son) {
    role = r;
    MM.$$('.poste-c').forEach(function (b) { b.setAttribute('aria-checked', b.dataset.role === r ? 'true' : 'false'); });
    if (son) MM.retour('bascule');
  }
  MM.$$('.poste-c').forEach(function (b) {
    b.addEventListener('click', function () { choisir(b.dataset.role, true); });
    b.addEventListener('dblclick', entrer);
  });

  function entrer() {
    MM.session.ouvrir(role);
    MM.retour('valide');
    document.dispatchEvent(new CustomEvent('mm:acces'));      // le casque 3D réagit
    document.body.style.transition = 'opacity .5s ease';
    setTimeout(function () { document.body.style.opacity = '0'; }, 380);
    setTimeout(function () { location.href = 'app.html'; }, 900);
  }
  MM.$('#entrer').addEventListener('click', entrer);
  choisir(role, false);
})();
