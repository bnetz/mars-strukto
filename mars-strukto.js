/*
 * Mars-Strukto – der Struktogramm-Editor aus Escape from Mars – zum Einbauen in eine eigene Seite. Zwei Zeilen genügen:
 *
 *   <script src="https://escape-from-mars.de/mars-strukto/1/mars-strukto.js"></script>
 *   <div class="mars-strukto"></div>
 *
 * Diese Datei lädt das Aussehen (css/struktogramm.css) und die Skripte des Editors aus ihrem eigenen Ordner und macht aus jedem
 * Element mit der Klasse „mars-strukto“ einen Editor mit Ausführen, Konsole und Variablen.
 * Angaben am Element (alle freiwillig):
 *   data-speichern="schluessel"  unter diesem Namen merkt sich der Browser das Struktogramm (Standard: „mars-strukto“, bei weiteren Editoren mit id bzw. Nummer);
 *                                data-speichern="nein" merkt nichts
 *   data-name="Programmname"     Name für ein neues Struktogramm
 *   style="height: 600px"        Höhe (Standard: 75 % der Fensterhöhe, mindestens 520 px)
 * Ist alles geladen, meldet die Seite das Ereignis „mars-strukto-bereit“ (event.detail = Liste der Editoren).
 * Eigene Befehle (z. B. für eine Roboter-Welt) meldet die Seite über die Schnittstelle MarsStrukto an – siehe API.md.
 */
(function () {
  'use strict';
  if (window.SgEinbau) return; // doppelt eingebunden
  var skript = document.currentScript;
  var basis = skript ? new URL('./', skript.src).href : '';
  window.SgEinbau = { basis: basis, editoren: [] };
  // Schnittstelle MarsStrukto (API.md): Bis die Skripte geladen sind, werden Aufrufe gesammelt und danach ausgeführt –
  // die einbindende Seite kann also gleich nach dieser Skriptzeile Befehle anmelden.
  if (!window.MarsStrukto) {
    var warte = [];
    window.MarsStrukto = { version: '1', editoren: [], _warte: warte,
      befehle: function (l) { warte.push(['befehle', l]); }, beimStart: function (f) { warte.push(['beimStart', f]); },
      beimEnde: function (f) { warte.push(['beimEnde', f]); }, bereit: function (f) { warte.push(['bereit', f]); },
      angemeldet: function () { return []; } };
  }
  // Aussehen (nur einmal)
  var css = basis + 'css/struktogramm.css';
  if (![].some.call(document.querySelectorAll('link[rel="stylesheet"]'), function (l) { return l.href === css; })) {
    var link = document.createElement('link'); link.rel = 'stylesheet'; link.href = css; document.head.appendChild(link);
  }
  // Skripte in fester Reihenfolge (async = false: der Browser führt sie in dieser Reihenfolge aus)
  var dateien = ['paket', 'schrift', 'programm', 'struktogramm', 'sg-svg', 'interp', 'sg-editor', 'arbeitsplatz'];
  var letztes = null;
  dateien.forEach(function (d) {
    var s = document.createElement('script'); s.src = basis + 'js/' + d + '.js'; s.async = false;
    document.head.appendChild(s); letztes = s;
  });
  function starten() {
    var liste = [];
    [].forEach.call(document.querySelectorAll('.mars-strukto'), function (el, i) {
      if (el.sgArbeitsplatz) return;
      var sp = el.getAttribute('data-speichern');
      var opts = { speichern: sp === 'nein' ? false : (sp || ('mars-strukto' + (el.id ? '-' + el.id : (i ? '-' + (i + 1) : ''))) ) };
      if (el.getAttribute('data-name')) opts.name = el.getAttribute('data-name');
      el.sgArbeitsplatz = window.SgArbeitsplatz.erstellen(el, opts);
      liste.push(el.sgArbeitsplatz); window.SgEinbau.editoren.push(el.sgArbeitsplatz);
    });
    if (window.MarsStrukto && window.MarsStrukto._fertig) window.MarsStrukto._fertig();
    try { document.dispatchEvent(new CustomEvent('mars-strukto-bereit', { detail: liste })); } catch (e) { }
  }
  letztes.addEventListener('load', function () {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', starten); else starten();
  });
})();
