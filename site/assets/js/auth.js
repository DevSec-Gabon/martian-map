/* ===========================================================================
   MARTIAN MAP — écran d'accès
   Le code n'est jamais stocké en clair : on compare son empreinte SHA-256
   (sel + identifiant + code). Verrouillage temporaire après 5 échecs.

   À savoir : cette vérification reste côté navigateur. Elle démontre la
   mécanique et protège d'un accès opportuniste, pas d'un attaquant qui lit
   le code source. Une mise en production exige la même vérification sur le
   serveur (voir DEPLOIEMENT.md).
   =========================================================================== */
(function () {
  'use strict';
  var $ = MM.$;

  var SEL = 'martian-map-2026';
  var COMPTES = {
    'ged.rover':   {role: 'rover',  nom: 'G. Hagedeon',
                    h: '17092bc62b112e2840342921afcb874b7fcf68f4175f003aecb4d43e689f8e40'},
    'crew.orbite': {role: 'orbite', nom: 'Équipage en orbite',
                    h: 'b0d0f149b9b09f37e35a4cea6c0ebeff62d86f887121d87f27e29860e5bebdfe'},
    'sol.terre':   {role: 'terre',  nom: 'Contrôle Libreville',
                    h: '32a16bd648c24aa95bc880737d97b7e759c9c330480460369fdf1229df6ab174'}
  };
  // Build de démonstration : les champs sont pré-remplis pour la présentation.
  var DEMO = {rover: ['ged.rover', 'ARES-01'], orbite: ['crew.orbite', 'ARES-02'],
              terre: ['sol.terre', 'ARES-03']};

  var CLE_ECHECS = 'mm.echecs';
  var MAX = 5, BLOCAGE = 60000;

  var role = 'rover', minuteur = null;

  var ident = $('#ident'), code = $('#code'), msg = $('#msg'), msgTxt = $('#msg-txt');
  var bouton = $('#ouvrir'), boutonTxt = $('#ouvrir-txt');

  /* ------------------------------------------------------------- blocage */
  function echecs() {
    try { return JSON.parse(localStorage.getItem(CLE_ECHECS) || '{"n":0,"jusqu":0}'); }
    catch (e) { return {n: 0, jusqu: 0}; }
  }
  function noterEchec() {
    var e = echecs();
    e.n += 1;
    if (e.n >= MAX) { e.jusqu = Date.now() + BLOCAGE; e.n = 0; }
    try { localStorage.setItem(CLE_ECHECS, JSON.stringify(e)); } catch (x) {}
    return e;
  }
  function bloqueJusqu() { return echecs().jusqu; }

  function surveillerBlocage() {
    clearInterval(minuteur);
    var fin = bloqueJusqu();
    if (fin < Date.now()) { bouton.disabled = false; boutonTxt.textContent = 'Ouvrir la mission'; return; }
    bouton.disabled = true;
    minuteur = setInterval(function () {
      var reste = Math.ceil((bloqueJusqu() - Date.now()) / 1000);
      if (reste <= 0) { clearInterval(minuteur); bouton.disabled = false;
        boutonTxt.textContent = 'Ouvrir la mission'; cacher(); return; }
      boutonTxt.textContent = 'Accès bloqué — ' + reste + ' s';
    }, 250);
    afficher('Trop de tentatives. Accès suspendu pendant une minute.');
  }

  /* -------------------------------------------------------------- messages */
  function afficher(t) { msgTxt.textContent = t; msg.classList.add('vu'); }
  function cacher() { msg.classList.remove('vu'); }
  function erreurChamp(on) {
    $('#b-id').classList.toggle('err', on);
    $('#b-code').classList.toggle('err', on);
  }

  /* ----------------------------------------------------------------- poste */
  MM.$$('.role').forEach(function (b) {
    b.addEventListener('click', function () {
      MM.$$('.role').forEach(function (x) { x.setAttribute('aria-pressed', x === b); });
      role = b.dataset.role;
      var d = DEMO[role];
      if (d) { ident.value = d[0]; code.value = d[1]; }
      cacher(); erreurChamp(false);
      MM.retour('bascule');
    });
  });

  $('#voir').addEventListener('click', function () {
    var vu = code.type === 'password';
    code.type = vu ? 'text' : 'password';
    this.setAttribute('aria-label', vu ? 'Masquer le code' : 'Afficher le code');
    MM.son.jouer('clic');
  });

  /* ---------------------------------------------------------------- envoi */
  $('#form').addEventListener('submit', function (ev) {
    ev.preventDefault();
    if (bloqueJusqu() > Date.now()) return;

    var id = ident.value.trim().toLowerCase();
    var cp = code.value;
    if (!id || !cp) { erreurChamp(true); afficher('Identifiant et code requis.'); MM.retour('refus'); return; }

    var compte = COMPTES[id];
    bouton.disabled = true; boutonTxt.textContent = 'Vérification…';

    MM.empreinte(SEL + ':' + id + ':' + cp).then(function (h) {
      var ok = compte && h === compte.h;
      if (!ok) {
        bouton.disabled = false; boutonTxt.textContent = 'Ouvrir la mission';
        erreurChamp(true);
        var e = noterEchec();
        if (e.jusqu > Date.now()) { surveillerBlocage(); }
        else { afficher('Identifiant ou code non reconnu. ' + (MAX - e.n) + ' tentative(s) restante(s).'); }
        MM.retour('refus');
        return;
      }
      if (compte.role !== role) {
        bouton.disabled = false; boutonTxt.textContent = 'Ouvrir la mission';
        afficher('Ce compte est rattaché au poste « ' + MM.POSTES[compte.role].court + ' ».');
        MM.retour('refus');
        return;
      }
      try { localStorage.removeItem(CLE_ECHECS); } catch (x) {}
      MM.session.ouvrir(compte.role, id);
      MM.retour('valide');
      boutonTxt.textContent = 'Ouverture…';
      document.body.style.transition = 'opacity .32s ease';
      document.body.style.opacity = '0';
      setTimeout(function () { location.href = 'app.html'; }, 300);
    });
  });

  /* --------------------------------------------------------------- départ */
  ident.value = DEMO.rover[0];
  code.value = DEMO.rover[1];
  surveillerBlocage();
  if (MM.session.lire()) {
    afficher('Une session est déjà ouverte. Validez pour revenir à la mission.');
    msg.style.cssText = 'background:rgba(47,208,230,.08);border-color:rgba(47,208,230,.35);color:var(--cy-200)';
    msg.classList.add('vu');
  }
  [ident, code].forEach(function (c) {
    c.addEventListener('input', function () { cacher(); erreurChamp(false); });
  });
})();
