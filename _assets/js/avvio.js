/* Il recupero delle librerie nei contenitori strani (Electron e simili).

   Stava scritto in chiaro dentro la testa di ogni pagina, subito dopo
   tone.js, perche' doveva girare **dopo** che le due librerie si erano
   registrate. Da qui fa la stessa cosa e in piu' regge il `defer`: gli
   script differiti girano nell'ordine in cui stanno scritti, quindi
   vexflow, tone, questo, e poi codice.js e tac-core.js.

   Perche' il defer. Le due librerie erano chieste senza, e uno script
   senza defer blocca la costruzione della pagina: finche' non sono
   arrivate tutt'e due il browser non disegna niente. Con tutte le slide
   nascoste nel foglio di stile, quel «niente» e' una pagina bianca con
   la rotellina che gira -- il guasto del 21 settembre. Col defer la
   pagina si costruisce subito e le librerie arrivano quando arrivano. */
(function () {
  try {
    if (window.__mod) module = window.__mod;
    if (window.__exp) exports = window.__exp;
  } catch (e) {}

  /* In Electron «module» e' una variabile locale a ogni script, non una
     proprieta' globale: oscurarla dalla pagina non tocca lo scope di
     tone.js, che quindi si registra su un module suo e resta invisibile.
     L'unica via e' chiedere la libreria direttamente a require, che in
     quel contenitore esiste. */
  var basi = ['../../_assets/lib/', './_assets/lib/', '../_assets/lib/'];
  function recupera(nome, globale) {
    if (window[globale]) return;
    if (typeof require !== 'function') return;
    for (var i = 0; i < basi.length; i++) {
      try {
        var m = require(basi[i] + nome);
        if (m) { window[globale] = m[globale] || m.default || m; return; }
      } catch (e) {}
    }
  }
  recupera('tone.js', 'Tone');
  recupera('vexflow.js', 'VexFlow');
})();
