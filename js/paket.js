/*
 * Struktogramm-Editor – Paketangaben. Diese Datei wird als erste des Pakets geladen.
 * Der Editor (Dateien in diesem Ordner) kennt weder Peetie noch Escape from Mars; eine Anwendung meldet ihre Befehle
 * über die Schnittstellen in interp.js (Interp.Host, Interp.def), struktogramm.js (Struktogramm.TEXTE, befehlSichtbar …)
 * und sg-editor.js (Editor.prototype.buildSide) an – für Escape from Mars steht das in js/peetie-befehle.js.
 */
'use strict';
window.SgPaket = {
  name: 'Mars-Strukto',
  version: '1.0',
  datum: '2026-10-26',
  /* Adresse des Paketordners (endet mit /), aus der Adresse dieser Datei – für Schriften beim Bild-Export */
  basis: (function () { try { return new URL('../', document.currentScript.src).href; } catch (e) { return ''; } })()
};
