/*
 * Arbeitsplatz: Struktogramm-Editor mit Leiste (Neu, Öffnen, Speichern, Bild), Ausführen/Schritt/Stopp, Konsole und Variablen.
 * Das ist der Editor zum Einbauen in eine Seite und die Standalone-Fassung (index.html in diesem Ordner).
 *
 *   SgArbeitsplatz.erstellen(document.getElementById('platz'), { speichern: 'mein-schluessel' });
 *
 * opts.speichern: Schlüssel, unter dem der Browser das Struktogramm merkt (Standard 'mars-strukto'; false = nicht merken)
 * opts.name:      Programmname für ein neues Struktogramm (Standard 'Mein Struktogramm')
 * opts.struktogramm: Struktogramm zum Start (Text einer .struktogramm.json-Datei) – sonst das gemerkte oder ein leeres
 */
'use strict';
window.SgArbeitsplatz = {}; // nur als Eigenschaft von window, kein const – sonst bricht eine Seite ab, die selbst schon „SgArbeitsplatz“ kennt (26.10.2026)
(function () {
  const $ = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const knopf = (txt, titel, cls) => { const b = $('button', 'fxbtn small' + (cls ? ' ' + cls : ''), txt); b.type = 'button'; if (titel) b.title = titel; return b; };
  const warte = (ms) => new Promise(r => setTimeout(r, ms));
  const lesen = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const schreiben = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { } };

  /* Werte für Konsole und Variablen wie in der Operatorenliste: Zeichenketten in Anführungszeichen, wahr/falsch, Dezimalzahlen mit Punkt */
  function wert(v, t) {
    if (v === undefined) return '?';
    if (v === null) return 'null';
    if (Array.isArray(v)) { const et = Struktogramm.elemType(t); return '[' + v.map(x => wert(x, et)).join(', ') + ']'; }
    if (v && typeof v === 'object' && v.valueOf) v = v.valueOf();
    if (t === 'String') return '"' + String(v) + '"';
    if (t === 'boolean') return v ? 'wahr' : 'falsch';
    if (t === 'double' || t === 'float') return Interp.javaDouble ? Interp.javaDouble(v) : String(v);
    return String(v);
  }
  /* Laufzeitfehler in Schülerdeutsch */
  function laufzeitText(t) {
    const m = (t && t.message) || String(t);
    if (/ArithmeticException|by zero/.test(m)) return 'Division durch null';
    if (/NumberFormatException/.test(m)) return 'Die Eingabe ist keine Zahl (' + m.replace(/.*For input string: /, '') + ')';
    if (/StackOverflow/.test(m)) return 'Endlose Verschachtelung von Aufrufen (ruft sich das Unterprogramm selbst auf?)';
    if (/NullPointer/.test(m)) return 'Ein Wert fehlt (null)';
    return m.replace(/^java\.lang\.\w+:\s*/, '').split('\n')[0];
  }

  /* Interp.beforeStep ist für die ganze Seite eins: Der Verteiler gibt jeden Schritt an das Programm weiter, zu dem er gehört
     (fr.self.__sgaSchritt); alles andere an das, was vorher angemeldet war. */
  function verteilerAnmelden() {
    if (Interp.beforeStep && Interp.beforeStep.sgaVerteiler) return;
    const vorher = Interp.beforeStep;
    const v = function (id, fr) { const o = fr && fr.self; if (o && o.__sgaSchritt) return o.__sgaSchritt(id, fr); if (vorher) return vorher(id, fr); };
    v.sgaVerteiler = true; Interp.beforeStep = v;
  }

  SgArbeitsplatz.erstellen = function (host, opts) {
    opts = opts || {};
    const SCHLUESSEL = opts.speichern === false ? null : (opts.speichern || 'mars-strukto');
    const NEUER_NAME = opts.name || 'Mein Struktogramm';
    Struktogramm.arraysErlaubt = true;

    /* ---------------- Aufbau */
    host.classList.add('sga');
    host.innerHTML = '';
    const leiste = $('div', 'sga-leiste');
    const nameFeld = $('input', 'sga-name'); nameFeld.type = 'text'; nameFeld.spellcheck = false; nameFeld.autocomplete = 'off'; nameFeld.maxLength = 60;
    nameFeld.placeholder = 'Programmname'; nameFeld.title = 'Name des Programms – steht über dem Struktogramm, auf dem Bild und im Dateinamen';
    const bNeu = knopf('Neu', 'Leeres Struktogramm anfangen');
    const bOeffnen = knopf('Öffnen …', 'Struktogramm-Datei (.json) öffnen');
    const bSpeichern = knopf('Speichern', 'Struktogramm als Datei speichern (.struktogramm.json)');
    const bBild = knopf('Bild ▾', 'Struktogramm als Bild speichern (PNG oder SVG)');
    const bUndo = knopf('↶', 'Rückgängig (Strg+Z)'), bRedo = knopf('↷', 'Wiederholen (Strg+Y)');
    const gruppe1 = $('div', 'sga-gruppe'); [bNeu, bOeffnen, bSpeichern, bBild, bUndo, bRedo].forEach(b => gruppe1.appendChild(b));
    const bStart = knopf('▶ Ausführen', 'Programm ausführen', 'primary');
    const bSchritt = knopf('Schritt', 'Ein Kästchen weiter – das gelbe Kästchen ist der nächste Schritt');
    const bStopp = knopf('■ Stopp', 'Programm anhalten'); bStopp.disabled = true;
    const tempoBox = $('label', 'sga-tempo'); tempoBox.title = 'Wartezeit nach jedem Kästchen – so kann man beim Ausführen zusehen';
    const tempo = $('input'); tempo.type = 'range'; tempo.min = '0'; tempo.max = '1000'; tempo.step = '50';
    tempo.value = String(Math.min(1000, Math.max(0, +(lesen('mars-strukto.tempo') || 0))));
    const tempoText = $('span', 'sga-tempo-wert');
    tempoBox.appendChild($('span', null, 'Tempo')); tempoBox.appendChild(tempo); tempoBox.appendChild(tempoText);
    const gruppe2 = $('div', 'sga-gruppe'); [bStart, bSchritt, bStopp, tempoBox].forEach(b => gruppe2.appendChild(b));
    leiste.appendChild(nameFeld); leiste.appendChild(gruppe1); leiste.appendChild(gruppe2);
    const rumpf = $('div', 'sga-rumpf');
    const edHost = $('div', 'sga-editor');
    const rechts = $('div', 'sga-rechts');
    const kKopf = $('div', 'sga-kopf'); kKopf.appendChild($('b', null, 'Konsole')); const bLeeren = knopf('Leeren', 'Konsole leeren', 'sga-klein'); kKopf.appendChild(bLeeren);
    const aus = $('pre', 'sga-aus'); aus.setAttribute('aria-live', 'polite');
    const ein = $('div', 'sga-ein hidden'); const einLab = $('label'); const einFeld = $('input'); einFeld.id = 'sga-ein-' + Math.random().toString(36).slice(2, 8); einLab.htmlFor = einFeld.id;
    einFeld.autocomplete = 'off'; einFeld.spellcheck = false; const einOk = knopf('OK', 'Eingabe übernehmen (Enter)', 'primary'); const einTipp = $('div', 'sga-tipp');
    [einLab, einFeld, einOk, einTipp].forEach(x => ein.appendChild(x));
    const vKopf = $('div', 'sga-kopf'); vKopf.appendChild($('b', null, 'Variablen'));
    const vars = $('div', 'sga-vars'); const vTab = $('table'); vars.appendChild(vTab); const vLeer = $('div', 'sga-leer', 'Werte erscheinen beim Ausführen.'); vars.appendChild(vLeer);
    [kKopf, aus, ein, vKopf, vars].forEach(x => rechts.appendChild(x));
    rumpf.appendChild(edHost); rumpf.appendChild(rechts);
    host.appendChild(leiste); host.appendChild(rumpf);
    const datei = $('input'); datei.type = 'file'; datei.accept = '.json,application/json'; datei.className = 'hidden'; host.appendChild(datei);

    /* ---------------- Dokument */
    let doc = null;
    const start = opts.struktogramm || (SCHLUESSEL && lesen(SCHLUESSEL));
    if (start) { try { doc = Struktogramm.parse(start); } catch (e) { doc = null; } }
    if (!doc) doc = Struktogramm.newDoc(NEUER_NAME);
    nameFeld.value = doc.name || '';
    let fehler = [];
    const editor = new SgEditor.Editor(edHost, doc, { onChange: (d) => { doc = d; geaendert(); }, sideHost: $('div') }); // keine Befehlsübersicht
    const merken = () => { if (SCHLUESSEL) schreiben(SCHLUESSEL, Struktogramm.stringify(doc)); };
    const sichtbareFehler = () => { const ed = editor.editing; return ed ? fehler.filter(e => e.boxId !== ed.box.id) : fehler; };
    function pruefen() {
      const r = Struktogramm.pruefen(doc, {});
      fehler = r.errors;
      editor.setErrors(sichtbareFehler());
      nameFeld.classList.toggle('err', fehler.some(e => e.boxId === 'name'));
      return r;
    }
    let pruefTimer = null;
    function geaendert() {
      merken();
      if (laeuft) { stopp(); zeile('\n■ Abgebrochen – das Struktogramm wurde geändert.\n', 'sga-info'); }
      clearTimeout(pruefTimer); pruefTimer = setTimeout(pruefen, 400);
    }
    function neuesDoc(d) { doc = d; nameFeld.value = doc.name || ''; editor.setDoc(doc); merken(); pruefen(); }

    /* ---------------- Leiste */
    nameFeld.addEventListener('input', () => { doc.name = nameFeld.value; geaendert(); });
    nameFeld.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') nameFeld.blur(); });
    bNeu.onclick = async () => {
      if (!await editor.confirmDialog('Neues, leeres Struktogramm anfangen?\nDas jetzige geht dabei verloren – vorher „Speichern“, wenn du es behalten willst.', 'Neu anfangen', 'Abbrechen')) return;
      stopp(); neuesDoc(Struktogramm.newDoc(NEUER_NAME));
    };
    const dateiName = () => (String(doc.name || '').trim() || 'Struktogramm').replace(/[\\/:*?"<>|]+/g, '-');
    function herunterladen(name, daten, typ) {
      const url = URL.createObjectURL(daten instanceof Blob ? daten : new Blob([daten], { type: typ }));
      const a = $('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }
    bSpeichern.onclick = () => herunterladen(dateiName() + '.struktogramm.json', Struktogramm.stringify(doc), 'application/json');
    bOeffnen.onclick = () => { datei.value = ''; datei.click(); };
    datei.onchange = () => {
      const f = datei.files && datei.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => { try { stopp(); neuesDoc(Struktogramm.parse(String(r.result))); } catch (e) { editor.confirmDialog('Die Datei lässt sich nicht öffnen: ' + e.message, 'OK', 'Schließen'); } };
      r.readAsText(f);
    };
    bBild.onclick = () => {
      const rect = bBild.getBoundingClientRect();
      editor.einfachesMenue(rect.left, rect.bottom + 2, [
        ['Als PNG-Bild speichern', async () => herunterladen(dateiName() + '.png', await Struktogramm.exportPng(doc, { title: doc.name }, 2), 'image/png')],
        ['Als SVG-Grafik speichern', async () => herunterladen(dateiName() + '.svg', await Struktogramm.exportSvg(doc, { title: doc.name }), 'image/svg+xml')]
      ]);
    };
    bUndo.onclick = () => editor.undo(); bRedo.onclick = () => editor.redo();
    const tempoZeigen = () => { tempoText.textContent = +tempo.value ? (+tempo.value / 1000).toFixed(2).replace('.', ',') + ' s' : 'schnell'; };
    tempo.oninput = () => { tempoZeigen(); schreiben('mars-strukto.tempo', tempo.value); };
    tempoZeigen();
    bLeeren.onclick = () => { aus.textContent = ''; };

    /* ---------------- Konsole */
    function zeile(t, cls) { const sp = $('span', cls || null, t); aus.appendChild(sp); aus.scrollTop = aus.scrollHeight; }
    let eingabeAbbruch = null;
    function eingabe(typ, name) {
      return new Promise((res, rej) => {
        if (!laeuft) { rej(Interp.ABORT); return; }
        markieren();
        einLab.textContent = (name || 'Eingabe') + ' (' + typ + '):';
        einFeld.value = ''; einTipp.textContent = ''; ein.classList.remove('hidden'); einFeld.focus();
        const fertig = () => {
          const v = einFeld.value.trim();
          if (typ === 'Ganzzahl' && !/^[+-]?\d+$/.test(v)) { einTipp.textContent = '„' + v + '“ ist keine ganze Zahl. Bitte eine ganze Zahl eingeben, z. B. 42.'; return; }
          if (typ === 'Dezimalzahl' && !/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(v)) { einTipp.textContent = /,/.test(v) ? 'Dezimalzahlen werden mit Punkt geschrieben, nicht mit Komma – also ' + v.replace(',', '.') + '.' : 'Bitte eine Zahl eingeben, z. B. 3.5.'; return; }
          ein.classList.add('hidden'); eingabeAbbruch = null; einFeld.onkeydown = null;
          zeile(v + '\n', 'sga-eingabe'); editor.highlight(null);
          res(v);
        };
        einOk.onclick = fertig;
        einFeld.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); fertig(); } };
        eingabeAbbruch = () => { ein.classList.add('hidden'); rej(Interp.ABORT); };
      });
    }

    /* ---------------- Variablen */
    function zeigeVars(fr) {
      const liste = Interp.frameVars(fr); if (!liste.length) return;
      vLeer.classList.add('hidden');
      const zeilen = new Map([...vTab.querySelectorAll('tr')].map(r => [r.dataset.k, r]));
      const da = new Set();
      for (const v of liste) {
        const k = v.name; da.add(k);
        let r = zeilen.get(k);
        if (!r) { r = $('tr'); r.dataset.k = k; r.appendChild($('td', 'n', v.name)); r.appendChild($('td', 't', Struktogramm.TYPES_DE[v.type] || (Struktogramm.isArrayType(v.type) ? 'Array' : v.type))); r.appendChild($('td', 'v')); vTab.appendChild(r); }
        const s = wert(v.value, v.type), c = r.children[2];
        if (c.textContent !== s) { c.textContent = s; c.classList.remove('neu'); void c.offsetWidth; c.classList.add('neu'); }
      }
      for (const [k, r] of zeilen) if (!da.has(k)) r.remove();
    }
    function varsLeeren() { vTab.innerHTML = ''; vLeer.classList.remove('hidden'); }

    /* ---------------- Ausführen */
    let laeuft = false, schrittBetrieb = false, schrittWeiter = null, letzte = null, laufNr = 0;
    const markieren = () => { if (letzte) editor.highlight(letzte, schrittBetrieb); };
    function knoepfe() {
      bStopp.disabled = !laeuft;
      bStart.textContent = laeuft && schrittBetrieb ? '▶ Weiter' : '▶ Ausführen';
      bStart.title = laeuft && schrittBetrieb ? 'Ohne anzuhalten weiterlaufen lassen' : 'Programm ausführen';
    }
    function weiter() { if (schrittWeiter) { const f = schrittWeiter; schrittWeiter = null; f(); } }
    function stopp() {
      laufNr++;
      laeuft = false; // das laufende Programm bricht beim nächsten Kästchen ab (laufNr) – andere Editoren auf der Seite laufen weiter
      if (eingabeAbbruch) { const f = eingabeAbbruch; eingabeAbbruch = null; f(); }
      weiter(); editor.highlight(null); knoepfe();
    }
    async function ausfuehren(schritt) {
      if (laeuft) { schrittBetrieb = !!schritt; weiter(); knoepfe(); return; }
      if (editor.editing) await editor.commitEdit();
      const r = pruefen();
      if (!r.ok) {
        editor.gotoNextError();
        aus.textContent = ''; zeile('⚠ Das Struktogramm hat noch ' + (r.errors.length === 1 ? 'einen Fehler' : r.errors.length + ' Fehler') + ' (rot markiert). Erst wenn alles stimmt, lässt es sich ausführen.\n', 'sga-fehler');
        return;
      }
      const nr = ++laufNr; laeuft = true; schrittBetrieb = !!schritt; letzte = null;
      aus.textContent = ''; varsLeeren(); knoepfe();
      verteilerAnmelden();
      const schrittFn = async (id, fr) => {
        if (nr !== laufNr) throw Interp.ABORT;
        const b = r.map.get(id); if (b) letzte = b;
        editor.highlight(letzte, schrittBetrieb); zeigeVars(fr);
        if (schrittBetrieb) { await new Promise(res => { schrittWeiter = res; }); if (nr !== laufNr) throw Interp.ABORT; }
        else if (+tempo.value > 0) { await warte(+tempo.value); if (nr !== laufNr) throw Interp.ABORT; }
        else await Interp.breathe();
      };
      let ergebnis = null;
      const kontext = { editor: api, laeuft: () => nr === laufNr && laeuft };
      // Schnittstelle (MarsStrukto.beimStart): z. B. die Welt einer einbindenden App zurücksetzen
      for (const f of MS._start) { try { await f(api); } catch (e) { console.error('MarsStrukto.beimStart:', e); } }
      try {
        // Ausgabe, Einlesen und Schritte gehören zu diesem Programm (mehrere Editoren auf einer Seite stören sich nicht, 26.10.2026)
        const obj = new r.cls(); obj.__sgaSchritt = schrittFn; obj.__msKontext = kontext;
        obj.textAusgeben = async (t) => { if (nr === laufNr) zeile(String(t)); };
        obj.einlesenZeichenkette = async (n) => Interp.eingabeText(await eingabe('Zeichenkette', n));
        obj.einlesenGanzzahl = async (n) => Interp.javaParseInt(String(await eingabe('Ganzzahl', n)).trim());
        obj.einlesenDezimalzahl = async (n) => Interp.javaParseDouble(String(await eingabe('Dezimalzahl', n)).trim());
        await obj.__init(); await obj._run();
      } catch (e) { ergebnis = e; }
      const gestoppt = nr !== laufNr || ergebnis === Interp.ABORT || (ergebnis && ergebnis.abort);
      const ende = async () => { for (const f of MS._ende) { try { await f(api, gestoppt ? 'gestoppt' : ergebnis ? laufzeitText(ergebnis) : null); } catch (e) { console.error('MarsStrukto.beimEnde:', e); } } };
      if (nr !== laufNr) { await ende(); return; }
      laeuft = false; knoepfe();
      if (gestoppt) { editor.highlight(null); await ende(); return; }
      const nl = aus.textContent && !aus.textContent.endsWith('\n') ? '\n' : '';
      if (ergebnis) { zeile(nl + '⚠ Fehler beim Ausführen: ' + laufzeitText(ergebnis) + '\n', 'sga-fehler'); editor.highlight(letzte); }
      else { zeile(nl + '— Programm beendet —\n', 'sga-info'); editor.highlight(null); }
      await ende();
    }
    bStart.onclick = () => ausfuehren(false);
    bSchritt.onclick = () => ausfuehren(true);
    bStopp.onclick = () => { if (laeuft) { stopp(); zeile('\n■ Gestoppt.\n', 'sga-info'); } };

    pruefen();
    const api = {
      editor,
      get doc() { return doc; },
      get laeuft() { return laeuft; },
      laden: (text) => { stopp(); neuesDoc(Struktogramm.parse(text)); },
      text: () => Struktogramm.stringify(doc),
      ausfuehren: () => ausfuehren(false),
      stopp,
      ausgabe: (t) => zeile(String(t)),
      _neuPruefen: () => { editor.render(); pruefen(); }
    };
    MS.editoren.push(api);
    return api;
  };

  /* ================================================================ Schnittstelle MarsStrukto (API, Version 1) – 26.10.2026
     Beschreibung für Menschen und KI: API.md im Paketordner. Kurz:
       MarsStrukto.befehle([{ name, parameter: [[name, Datentyp], …], rueckgabe: Datentyp|null, text, gruppe, ausfuehren(…) }])
       MarsStrukto.beimStart(f(editor)), MarsStrukto.beimEnde(f(editor, fehler)), MarsStrukto.bereit(f(editoren)), MarsStrukto.editoren
     struktogramm-editor.js (der Lader) legt ein vorläufiges MarsStrukto an, das Aufrufe sammelt; hier werden sie nachgeholt. */
  const vorher = window.MarsStrukto;
  const MS = window.MarsStrukto = { version: '1', editoren: (vorher && vorher.editoren) || [], _start: [], _ende: [], _bereit: [], _angemeldet: [] };
  const TYP = { Ganzzahl: 'int', Dezimalzahl: 'double', Zeichenkette: 'String', Wahrheitswert: 'boolean' };
  const BEISPIEL = { Ganzzahl: '1', Dezimalzahl: '1.5', Zeichenkette: '"Text"', Wahrheitswert: 'wahr' };
  const RESERVIERT = new Set(['textAusgeben', 'einlesenZeichenkette', 'einlesenDezimalzahl', 'einlesenGanzzahl', '_run', 'toString', 'equals', 'hashCode', 'wahr', 'falsch', 'true', 'false', 'null', 'new', 'this']);
  const fehler = (t) => { throw new Error('MarsStrukto.befehle: ' + t); };
  function jsWert(v) { if (v instanceof String) return String(v); if (v && typeof v === 'object' && typeof v.valueOf === 'function' && (v.__double !== undefined || v.__char !== undefined)) return v.valueOf(); return v; }
  function anmelden(b) {
    if (!b || typeof b !== 'object') fehler('jeder Befehl ist ein Objekt { name, ausfuehren, … }');
    const name = String(b.name || '');
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) fehler(`„${name}“ ist kein gültiger Name (Buchstaben ohne Umlaute, Ziffern, _; am Anfang ein Buchstabe)`);
    if (RESERVIERT.has(name)) fehler(`„${name}“ ist reserviert`);
    if (typeof b.ausfuehren !== 'function') fehler(`${name}: „ausfuehren“ muss eine Funktion sein`);
    const params = (b.parameter || []).map((p, i) => {
      const [pn, pt] = Array.isArray(p) ? p : [p && p.name, p && p.typ];
      if (!TYP[pt]) fehler(`${name}: Parameter ${i + 1} hat keinen gültigen Datentyp (Ganzzahl, Dezimalzahl, Zeichenkette, Wahrheitswert)`);
      return { name: String(pn || 'wert' + (i + 1)), typ: pt };
    });
    const rueck = b.rueckgabe == null ? null : b.rueckgabe;
    if (rueck !== null && !TYP[rueck]) fehler(`${name}: „rueckgabe“ muss null oder ein Datentyp sein (Ganzzahl, Dezimalzahl, Zeichenkette, Wahrheitswert)`);
    // 1. Signatur für Übersetzer und Typprüfung
    const api = Interp.API.AI_Robot;
    if (api && api.m[name]) delete api.m[name];
    Interp.def('AI_Robot', [name + '(' + params.map(p => TYP[p.typ]).join(',') + ')' + (rueck ? ':' + TYP[rueck] : '')]);
    // 2. Ausführung: Methode der Klasse, von der jedes Programm erbt
    const basis = Interp.Host.basis();
    basis.prototype[name] = async function (...args) {
      const k = this.__msKontext || { editor: null, laeuft: () => true };
      let r = await b.ausfuehren.apply(k, args.map(jsWert));
      if (rueck === 'Wahrheitswert') r = !!r;
      else if (rueck === 'Ganzzahl') { r = Number(r); if (!Number.isFinite(r)) throw new Error(name + '() hat keine Ganzzahl geliefert'); r = Math.trunc(r); }
      else if (rueck === 'Dezimalzahl') { r = Number(r); if (Number.isNaN(r)) throw new Error(name + '() hat keine Zahl geliefert'); }
      else if (rueck === 'Zeichenkette') r = r == null ? '' : String(r);
      else r = undefined;
      return r;
    };
    // 3. Vorschläge, Lückentext und Beschreibung im Editor
    Struktogramm.BEFEHL_TEXT[name] = String(b.text || '');
    const titel = String(b.gruppe || 'Befehle');
    let g = SgEditor.GROUPS.find(x => x.title === titel); if (!g) { g = { title: titel, items: [] }; SgEditor.GROUPS.push(g); }
    for (const x of SgEditor.GROUPS) x.items = x.items.filter(it => it.replace(/\(.*$/, '') !== name);
    const aufruf = name + '(' + params.map(p => BEISPIEL[p.typ]).join(', ') + ')';
    g.items.push(aufruf);
    if (!Struktogramm.TEXTE.befehlBeispiel && !rueck) Struktogramm.TEXTE.befehlBeispiel = aufruf;
    Struktogramm.TEXTE.anweisungMenue = 'Befehl, Ausgabe, Rückgabe';
    MS._angemeldet = MS._angemeldet.filter(x => x.name !== name).concat([{ name, parameter: params, rueckgabe: rueck, text: String(b.text || ''), gruppe: titel }]);
  }
  MS.befehle = function (liste) {
    for (const b of (Array.isArray(liste) ? liste : [liste])) anmelden(b);
    for (const e of MS.editoren) e._neuPruefen();
    return MS._angemeldet.slice();
  };
  MS.angemeldet = () => MS._angemeldet.map(x => Object.assign({}, x, { parameter: x.parameter.map(p => [p.name, p.typ]) }));
  MS.beimStart = (f) => { if (typeof f === 'function') MS._start.push(f); };
  MS.beimEnde = (f) => { if (typeof f === 'function') MS._ende.push(f); };
  MS.bereit = (f) => { if (typeof f !== 'function') return; if (MS._istBereit) f(MS.editoren); else MS._bereit.push(f); };
  MS._fertig = () => { MS._istBereit = true; const l = MS._bereit; MS._bereit = []; for (const f of l) { try { f(MS.editoren); } catch (e) { console.error('MarsStrukto.bereit:', e); } } };
  // gesammelte Aufrufe aus dem Lader nachholen
  if (vorher && vorher._warte) for (const [was, arg] of vorher._warte) { try { MS[was](arg); } catch (e) { console.error(e); } }
})();
