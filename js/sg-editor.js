/*
 * Struktogramm-Editor.
 * Bedienung: Pluszeichen zwischen den Kästchen fügen ein, ein Klick auf eine Lücke (oder Enter) bearbeitet sie (Lückentext seit 12.10.2026),
 * Textbausteine und Peetie-Befehle rechts oder per Vorschlagsliste beim Tippen.
 */
'use strict';
window.SgEditor = {}; // nur als Eigenschaft von window, kein const – sonst bricht eine Seite ab, die selbst schon „SgEditor“ kennt (26.10.2026)

(function () {
  const $ = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform);

  /* Befehle für die Seitenleiste, nach Themen: [{ title, items: ['befehl()', …] }] – von der Anwendung (Escape from Mars: js/peetie-befehle.js) */
  SgEditor.GROUPS = [];
  // Deklaration nicht am Anfang des Programms: nur ein Hinweis, keine Rückfrage (Guana, 13.10.2026)
  const DECL_HINWEIS = 'Es ist weniger fehleranfällig, wenn die Variablen zu Anfang des Programms deklariert und initialisiert werden.';
  const PLACE = /\b(variable|wert|bedingung|unterprogramm|parameter|datentyp|startwert|endwert|schrittweite|zählvariable)\b/;
  /* Art eines Platzhalters für die farbige Hinterlegung: Name (blau), Zahl/Wert (gelb), Bedingung (grün), Datentyp (lila) */
  const PH_ART = { variable: 'name', 'zählvariable': 'name', unterprogramm: 'name', wert: 'wert', startwert: 'wert', endwert: 'wert', schrittweite: 'wert', parameter: 'wert', bedingung: 'bed', datentyp: 'typ' };
  const PH_TITEL = { name: 'Hier kommt ein Name hin (z. B. einer Variablen)', wert: 'Hier kommt eine Zahl, ein Wert oder eine Variable hin', bed: 'Hier kommt eine Bedingung hin', typ: 'Hier kommt ein Datentyp hin (Ganzzahl, Dezimalzahl, Zeichenkette, Wahrheitswert)' };
  const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  /* ---------------- Lückentext-Bausteine (Guana, 12.10.2026)
     Die Wörter der Operatorenliste stehen fest im Kästchen; bearbeiten lassen sich nur die Lücken (Name, Wert, Datentyp, Bedingung).
     Gespeichert wird weiter der ganze Text – Übersetzer, Prüfung und gespeicherte Struktogramme bleiben, wie sie sind.
     Teile: Zeichenkette = fest, { a: 'name' | 'wert' | 'typ' | 'bed' } = Lücke. Reihenfolge zählt (das Genauere zuerst). */
  const L = (a) => ({ a });
  const BAUSTEINE = {
    stmt: [
      ['Deklaration und Initialisierung: ', L('name'), ' als ', L('typ'), ' = ', L('wert')],
      ['Deklaration und Initialisierung: ', L('name'), ' = ', L('wert')], // Arrays ohne Datentyp (Operatorenliste), Abi-Drill
      ['Deklaration und Einlesen: ', L('name'), ' als ', L('typ')],
      ['Deklaration und Einlesen: ', L('name')],
      ['Deklaration: ', L('name'), ' als ', L('typ')],
      ['Initialisierung: ', L('name'), ' = ', L('wert')],
      ['Zuweisung: ', L('name'), ' = ', L('wert')],
      ['Einlesen: ', L('name'), ' als ', L('typ')], // Einlesen in ein leeres Array (26.10.2026)
      ['Einlesen: ', L('name')],
      ['Ausgabe: ', L('wert')],
      ['Rückgabe: ', L('wert')],
      ['Aufruf: ', L('name'), '(', L('wert'), ')'],
      // Schreibweisen aus Guanas Abi-Aufgaben (Vorlagen wie im PDF): werden angezeigt, aber nirgends zum Einfügen angeboten
      ['Deklaration und Zuweisung: ', L('name'), ' als ', L('typ'), ' = ', L('wert')],
      ['Deklaration und Zuweisung: ', L('name'), ' = ', L('wert')],
      ['Deklaration und Eingabe: ', L('name'), ' als ', L('typ')],
      ['Deklaration und Eingabe: ', L('name')],
      ['Aufruf und Zuweisung: ', L('name'), ' = ', L('wert')],
      ['//', L('wert')]
    ],
    head: [
      ['Wiederhole von ', L('name'), ' = ', L('wert'), ' solange ', L('bed'), ', Schrittweite ', L('wert')],
      ['Wiederhole solange ', L('bed')],
      ['Zähle ', L('name'), ' von ', L('wert'), ' bis ', L('wert'), ', Schrittweite ', L('wert')],
      ['Wiederhole fortlaufend']
    ]
  };
  const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const BS_RE = {};
  for (const k of Object.keys(BAUSTEINE)) BS_RE[k] = BAUSTEINE[k].map(teile => {
    let src = '^';
    teile.forEach((t, i) => { if (typeof t === 'string') src += reEsc(t); else src += t.a === 'typ' ? '(\\S*)' : (i === teile.length - 1 ? '([\\s\\S]*)' : '([\\s\\S]*?)'); });
    return { teile, re: new RegExp(src + '$') };
  });
  const TYPEN = ['Ganzzahl', 'Dezimalzahl', 'Zeichenkette', 'Wahrheitswert'];
  const typListe = () => TYPEN.concat(Struktogramm.arraysErlaubt || Struktogramm.abiErlaubt ? ['Array'] : []);
  /* Befehle, die als fester Baustein gelten (Peetie-Befehle, Befehle der Abi-Spielfelder): Name → Anzahl der Parameter */
  function befehlParameter(name) {
    const api = window.Interp && Interp.API && Interp.API.AI_Robot;
    const ms = api && api.m && api.m[name];
    if (ms && !name.startsWith('_')) return Math.max(...ms.map(m => (m.params || []).length));
    if (Struktogramm.aufgabenBefehle[name]) return 0;
    return -1;
  }
  /* Text eines Kästchens in feste Teile und Lücken zerlegen: [{ fix } | { a, s, e }] mit Stellen im Text – oder null (kein Baustein) */
  function zerlege(text, feld) {
    text = text || '';
    const liste = BS_RE[feld === 'head' ? 'head' : 'stmt'];
    for (const { teile, re } of liste) {
      const m = re.exec(text); if (!m) continue;
      const out = []; let pos = 0, g = 1;
      for (const t of teile) {
        if (typeof t === 'string') { out.push({ fix: t, s: pos, e: pos + t.length }); pos += t.length; }
        else { const v = m[g++]; out.push({ a: t.a, s: pos, e: pos + v.length }); pos += v.length; }
      }
      return out;
    }
    if (feld !== 'head') {
      // Befehle der Abi-Spielfelder ohne Klammern, wie in Guanas PDF (z. B. „geheGeradeaus“): ganz fest
      if (/^[A-Za-z_]\w*$/.test(text) && Struktogramm.aufgabenBefehle[text]) return [{ fix: text, s: 0, e: text.length }];
      // Peetie-Befehl: Name und Klammern fest, Parameter (falls es welche gibt) als Lücke
      const m = /^([A-Za-z_]\w*)\(([\s\S]*)\)$/.exec(text);
      if (m) {
        const n = befehlParameter(m[1]);
        if (n >= 0) {
          if (n === 0 && !m[2]) return [{ fix: text, s: 0, e: text.length }];
          const a = m[1].length + 1;
          return [{ fix: m[1] + '(', s: 0, e: a }, { a: 'wert', s: a, e: a + m[2].length }, { fix: ')', s: text.length - 1, e: text.length }];
        }
      }
    }
    return null;
  }
  SgEditor.zerlege = zerlege; // auch für den Test build/luecken1.js
  /* Leerzeichen um Rechen- und Vergleichszeichen und nach Kommas (Guana, 13.10.2026): „index+1“ → „index + 1“, „[1,2]“ → „[1, 2]“.
     Texte in Anführungszeichen bleiben, wie sie sind; ein Minus am Anfang oder nach einem Zeichen ist ein Vorzeichen („-1“). */
  function formatiere(t) {
    const teile = t.split(/("(?:[^"\\]|\\.)*"?)/);
    let vorher = ''; // letztes Zeichen vor dem Abschnitt (für das Vorzeichen)
    const out = teile.map((seg, i) => {
      if (i % 2 === 1) { vorher = '"'; return seg; }
      let r = '';
      for (let k = 0; k < seg.length; k++) {
        const two = seg.slice(k, k + 2);
        let op = null;
        if (['==', '!=', '<=', '>='].includes(two)) op = two;
        else if ('=<>+*/%'.includes(seg[k])) op = seg[k];
        else if (seg[k] === '-') { const z = (r.trimEnd() || (i > 0 ? vorher : '')).slice(-1); if (z && /[\wÄÖÜäöüß)\]"]/.test(z)) op = '-'; }
        if (op) { r = r.replace(/ +$/, '') + ' ' + op + ' '; k += op.length - 1; while (seg[k + 1] === ' ') k++; continue; }
        if (seg[k] === ',') { r = r.replace(/ +$/, '') + ', '; while (seg[k + 1] === ' ') k++; continue; }
        r += seg[k];
      }
      if (seg.trim()) vorher = seg.trim().slice(-1);
      return r;
    });
    return out.join('').replace(/^ +| +$/g, '').replace(/ {2,}/g, (m, off, all) => m);
  }
  SgEditor.formatiere = formatiere;

  class Editor {
    constructor(host, doc, opts) {
      this.host = host; this.doc = doc; this.opts = opts || {};
      this.selected = null; this.editing = null; this.errors = []; this.undoStack = []; this.redoStack = [];
      this.fontSize = 15; this.activeBox = null; this.insertTarget = null; this.rahmen = !!(opts && opts.rahmen);
      this.vorgaben = []; // vorgegebene Arrays der Übung (Trainingscamp): feste, nicht bearbeitbare Zeilen im Variablenbereich
      this.festeMethoden = []; // vorgegebene Unterprogramme der Übung (Trainingscamp): Kopf nicht bearbeitbar, nur der Rumpf (die „Lücke“)
      host.classList.add('sg-editor');
      // Befehlsübersicht: steht in einem eigenen Bereich der Seite (Reiter „Befehle“ unter der Welt)
      this.main = $('div', 'sg-main'); this.side = (opts && opts.sideHost) || $('div', 'sg-side');
      host.appendChild(this.main); if (!(opts && opts.sideHost)) host.appendChild(this.side);
      this.status = $('div', 'sg-status'); this.main.appendChild(this.status);
      this.moveBar = $('div', 'sg-movebar hidden'); this.main.appendChild(this.moveBar);
      this.docEl = $('div', 'sg-doc'); this.main.appendChild(this.docEl);
      this.buildSide();
      this.render();
      this.main.addEventListener('mousedown', (e) => { if (e.target === this.main || e.target === this.docEl) this.select(null); });
      host.addEventListener('keydown', (e) => this.onKey(e));
      // Im ganzen Editor nie das Menü des Browsers (12.10.2026) – Kästchen, Einfügestellen usw. zeigen ihr eigenes
      this.main.addEventListener('contextmenu', (e) => { if (!e.target.closest('input, select')) e.preventDefault(); });
      host.tabIndex = 0;
      this.docEl.addEventListener('scroll', () => { if (performance.now() - (this.menuOpenedAt || 0) > 300) this.hideMenus(); });
    }
    destroy() { this.host.innerHTML = ''; this.host.classList.remove('sg-editor'); }

    /* ---------------- Modell */
    snapshot() { this.undoStack.push(JSON.stringify(this.doc)); if (this.undoStack.length > 200) this.undoStack.shift(); this.redoStack.length = 0; }
    undo() { if (!this.undoStack.length) return; this.redoStack.push(JSON.stringify(this.doc)); this.doc = JSON.parse(this.undoStack.pop()); this.afterChange(); }
    redo() { if (!this.redoStack.length) return; this.undoStack.push(JSON.stringify(this.doc)); this.doc = JSON.parse(this.redoStack.pop()); this.afterChange(); }
    afterChange(keepSel) {
      if (!keepSel) this.selected = null;
      this.render();
      if (this.opts.onChange) this.opts.onChange(this.doc);
    }
    changed() { if (this.opts.onChange) this.opts.onChange(this.doc); }

    /* ---------------- Rendern */
    render() {
      if (this.editing) { this.needsRender = true; this.applyErrors(); return; }
      this.needsRender = false;
      const sTop = this.docEl.scrollTop;
      this.docEl.innerHTML = '';
      const d = this.doc;
      // Programmname und Mission stehen oben in der Kopfzeile
      // Einen eigenen Variablenbereich gibt es seit 13.10.2026 nicht mehr (Guana): Variablen stehen am Anfang des Hauptprogramms
      // bzw. Unterprogramms und gelten nur dort. Alte Stände schiebt Struktogramm.vereinen ins Hauptprogramm.
      Struktogramm.vereinen(d);
      // Unterprogramme
      for (const m of d.methods) {
        const box = $('div', 'sg-method'); box.dataset.mid = m.id;
        const err = this.errors.find(e => e.boxId === m.id);
        if (m.name === '_run') {
          // Hauptprogramm: kein Reiter, nur eine kleine Überschrift wie bei den Variablen
          const lab = $('div', 'sg-seclabel'); lab.textContent = 'Hauptprogramm'; lab.title = Struktogramm.TEXTE.hauptprogrammTitel; box.appendChild(lab);
          if (err) box.appendChild($('div', 'sg-errmsg', err.msg));
          // Vorgegebene Arrays der Übung (Trainingscamp): feste graue Kästchen ganz oben im Hauptprogramm
          for (const v of this.vorgaben) {
            const el = $('div', 'sg-cont'); const vb = $('div', 'sg-box sg-stmt sg-vorgabe'); vb.dataset.id = 'vorgabe:' + v.name;
            const t = $('div', 'sg-text', 'Deklaration und Initialisierung: ' + v.name + (v.wert ? ' = ' + v.wert : ' als Array = [ ]')); t.appendChild($('span', 'sg-vorgabe-hinweis', v.hinweis || 'gibt die Übung vor')); vb.appendChild(t);
            vb.title = v.titel || 'Dieses Array gibt die Übung vor – Peetie füllt es beim Einsammeln. Es lässt sich nicht bearbeiten.';
            vb.addEventListener('mousedown', (e) => { e.stopPropagation(); this.select(null); }); vb.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); });
            el.appendChild(vb); box.appendChild(el);
          }
        } else {
          const fest = this.festeMethoden.find(f => f.name === m.name);
          const h = $('div', 'sg-mhead' + (fest ? ' fest' : ' editable'));
          h.textContent = m.name + '(' + m.params.map(p => p.name).join(', ') + ')'; // nur Name und Parameter, ohne Datentypen und ohne Rückgabetyp (Guana, 13.10.2026); der Rückgabetyp steht im Dialog
          if (fest) { h.appendChild($('span', 'sg-vorgabe-hinweis', fest.hinweis || 'gibt die Übung vor')); h.title = fest.titel || 'Dieses Unterprogramm gibt die Übung vor – Peetie ruft es selbst auf. Du füllst nur den Inhalt aus.'; }
          else { h.title = 'Unterprogramm – klicken zum Bearbeiten (Name, Parameter, Rückgabe)'; h.onclick = () => this.editMethod(m); h.oncontextmenu = (e) => { e.preventDefault(); e.stopPropagation(); this.einfachesMenue(e.clientX, e.clientY, [['Unterprogramm bearbeiten', () => this.editMethod(m)]]); }; }
          if (err) { h.classList.add('err'); h.title = err.msg; }
          box.appendChild(h);
        }
        if (m.name === '_run' && this.rahmen) box.appendChild(this.renderRahmen(m));
        else box.appendChild(this.renderList(m.body, m.id, 'Anweisung'));
        this.docEl.appendChild(box);
      }
      const add = $('button', 'sg-addm', '+ Unterprogramm'); add.onclick = () => this.addMethod(); this.docEl.appendChild(add);
      this.docEl.scrollTop = sTop;
      this.renderMoveBar();
      this.renderErrorBar();
      // Einfügemenü offen: Markierung der Einfügestelle nach dem Neuaufbau (z. B. durch die Fehlerprüfung) wieder setzen
      if (this.menuAt && this.insMenu && this.insMenu.isConnected) { const z = this.zoneEl(this.menuAt.list, this.menuAt.index, this.istRahmenListe(this.menuAt.list) ? this.zoneVor : undefined); if (z) z.classList.add('menu-at'); }
    }
    /* Missionsrahmen der dynamischen Missionen: feste Schleife um das Hauptprogramm, nicht bearbeitbar */
    renderRahmen(m) {
      const cont = $('div', 'sg-cont');
      const el = $('div', 'sg-box sg-loop sg-rahmen'); el.dataset.id = Struktogramm.RAHMEN_ID;
      if (this.activeBox === Struktogramm.RAHMEN_ID) el.classList.add('active');
      const head = $('div', 'sg-text sg-loop-head', Struktogramm.RAHMEN_TEXT);
      head.title = 'Diesen Rahmen gibt die Mission vor: Alles darin wird in jedem Takt der Welt einmal durchlaufen, bis die Mission zu Ende ist.';
      el.appendChild(head);
      // Die Deklarationen am Anfang stehen vor dem Rahmen (sie laufen nur einmal); alles danach im Rahmen
      Struktogramm.vorOrdnen(m); // jedes Kästchen weiß jetzt, ob es vor dem Rahmen steht (24.10.2026)
      const k = Struktogramm.vorspann(m.body, m);
      // noch keine: sichtbarer Platzhalter, damit man sieht, wo Variablen hingehören; sonst nur die Einfügestelle unter der letzten
      cont.appendChild(this.renderList(m.body, m.id, k ? null : 'Variablen vor der Schleife', 0, k));
      const body = $('div', 'sg-loop-body'); body.appendChild(this.renderList(m.body, m.id, 'Anweisung', k, m.body.length)); el.appendChild(body);
      el.addEventListener('mousedown', (e) => { if (e.target === head) { e.stopPropagation(); this.select(null); } });
      el.addEventListener('contextmenu', (e) => { if (e.target === head) { e.preventDefault(); e.stopPropagation(); } });
      cont.appendChild(el);
      return cont;
    }
    /* Anderes Dokument anzeigen (z. B. beim Wechsel der Mission): Auswahl und Rückgängig-Liste gehören zum alten */
    setDoc(doc) {
      if (this.editing) this.cancelEdit();
      this.hideMenus();
      this.doc = doc; this.undoStack.length = 0; this.redoStack.length = 0; this.selected = null; this.moving = null; this.activeBox = null;
      this.render();
    }
    /* Rahmen ein-/ausblenden (je nach gewählter Mission) */
    setRahmen(on) { on = !!on; if (this.rahmen === on) return; this.rahmen = on; this.render(); }
    setVorgaben(list) { list = list || []; if (JSON.stringify(list) === JSON.stringify(this.vorgaben)) return; this.vorgaben = list; this.render(); }
    setFesteMethoden(list) { list = list || []; if (JSON.stringify(list) === JSON.stringify(this.festeMethoden)) return; this.festeMethoden = list; this.render(); }
    /* Kopfzeile: Programmname = Name der Mission (fest), daneben „Dein Name“ (gilt für alle Missionen, steht auf Bild und Dateiname) */
    renderNameHead() {
      const head = $('div', 'sg-class');
      const t = $('div', 'sg-title', this.doc.name || ''); t.title = 'Der Programmname ist der Name der Mission'; head.appendChild(t);
      const sch = this.opts.schueler;
      if (sch) {
        const box = $('div', 'sg-who');
        const lab = $('label', 'k', 'Dein Name'); lab.htmlFor = 'sgSchueler'; box.appendChild(lab);
        const inp = $('input', 'sg-name'); inp.id = 'sgSchueler'; inp.type = 'text'; inp.value = sch.get() || ''; inp.placeholder = 'Vorname Nachname'; inp.spellcheck = false; inp.autocomplete = 'off'; inp.maxLength = 50;
        inp.title = 'Dein Name steht auf dem exportierten Bild und im Dateinamen – einmal eintragen, gilt für alle Missionen';
        inp.addEventListener('focus', () => { this.editingName = true; this.select(null); });
        inp.addEventListener('blur', () => { this.editingName = false; sch.set(inp.value.trim()); if (this.needsRender) this.render(); });
        inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); inp.blur(); this.host.focus({ preventScroll: true }); } });
        inp.addEventListener('mousedown', (e) => e.stopPropagation());
        box.appendChild(inp); head.appendChild(box);
      }
      return head;
    }
    /* Liste von Kästchen mit Einfügestellen. von/bis: nur ein Teil (Missionsrahmen: Deklarationen davor, der Rest im Rahmen);
       what = null: leerer Teil ist nur eine Einfügestelle (vor dem Rahmen) */
    renderList(list, listId, what, von, bis) {
      const cont = $('div', 'sg-cont'); cont.dataset.list = listId;
      if (von === undefined) { von = 0; bis = list.length; }
      if (von === bis) {
        if (!what) { cont.appendChild(this.insZone(list, von)); return cont; }
        // Verschieben (07.10.2026, Guana): auch in leere Zweige, Schleifenrümpfe und leere Programme – dort ist die Lücke selbst das Ziel
        if (this.moving) { const z = this.insZone(list, von); z.classList.add('sg-ins-leer'); cont.appendChild(z); return cont; }
        const e = $('div', 'sg-empty'); e.textContent = what + ' einfügen'; e.dataset.index = von;
        e.onmousedown = (ev) => { if (ev.button !== 0) return; ev.preventDefault(); ev.stopPropagation(); this.showInsertMenu(e, list, von); };
        e.oncontextmenu = (ev) => { ev.preventDefault(); ev.stopPropagation(); this.showInsertMenu(e, list, von); };
        cont.appendChild(e); return cont;
      }
      for (let i = von; i < bis; i++) {
        cont.appendChild(this.insZone(list, i));
        cont.appendChild(this.renderBox(list[i], list, i));
      }
      cont.appendChild(this.insZone(list, bis));
      return cont;
    }
    insZone(list, index) {
      const z = $('div', 'sg-ins'); z.title = 'Hier einfügen'; z.dataset.index = index;
      const plus = $('span', 'plus', '+'); z.appendChild(plus);
      if (this.moving) {
        if (this.moveTargetOk(list, index)) { z.classList.add('target'); plus.textContent = '↓'; z.title = 'Hierhin verschieben'; z.onmousedown = (e) => { e.preventDefault(); e.stopPropagation(); this.zoneVor = this.istRahmenListe(list) && !z.closest('.sg-rahmen'); this.finishMove(list, index); }; }
        else { z.classList.add('blocked'); z.onmousedown = (e) => { e.preventDefault(); e.stopPropagation(); }; }
        return z;
      }
      z.onmousedown = (e) => { if (e.button !== 0) return; e.preventDefault(); e.stopPropagation(); this.showInsertMenu(z, list, index); };
      // rechte Maustaste auf der Einfügestelle: dasselbe Einfügemenü (12.10.2026; vorher kam dort das Menü des Browsers)
      z.oncontextmenu = (e) => { e.preventDefault(); e.stopPropagation(); this.showInsertMenu(z, list, index); };
      return z;
    }
    /* ---------------- Zwischenablage (intern + System) */
    copy() {
      const s = Struktogramm.find(this.doc, this.selected); if (!s || !s.box) return false;
      SgEditor.clipboard = JSON.parse(JSON.stringify(s.box));
      try { if (navigator.clipboard) navigator.clipboard.writeText(JSON.stringify({ format: 'efm-struktogramm-element', element: SgEditor.clipboard })).catch(() => { }); } catch (e) { }
      return true;
    }
    cut() { if (this.copy()) this.remove(); }
    async paste(list, index) {
      let box = SgEditor.clipboard;
      try { const t = navigator.clipboard && await navigator.clipboard.readText(); if (t) { const j = JSON.parse(t); if (j && j.format === 'efm-struktogramm-element' && j.element) box = j.element; } } catch (e) { }
      if (!box) return;
      if (!list) { const p = this.insertPoint(); list = p.list; index = p.index; }
      if (list === this.doc.attributes && box.kind !== 'stmt') return;
      this.snapshot(); const c = Struktogramm.clone(box); list.splice(index, 0, c); this.vorSetzen(list, c, this.zoneVor); this.selected = c.id; this.afterChange(true);
    }
    /* ---------------- Verschieben: Ziel anklicken */
    startMove() {
      const s = Struktogramm.find(this.doc, this.selected); if (!s || !s.list) return;
      this.moving = { box: s.box, list: s.list, index: s.index }; this.render();
    }
    cancelMove() { if (!this.moving) return; this.moving = null; this.render(); }
    moveTargetOk(list, index) {
      const m = this.moving; if (!m) return false;
      if (list === this.doc.attributes && m.box.kind !== 'stmt') return false;
      if (m.list === this.doc.attributes && list !== this.doc.attributes) return false;
      if (list === m.list && (index === m.index || index === m.index + 1)) return false;
      // nicht in sich selbst
      let inside = false; Struktogramm.walk({ attributes: [], methods: [{ body: [m.box] }] }, (b, l) => { if (l === list) inside = true; });
      return !inside;
    }
    finishMove(list, index) {
      const m = this.moving; if (!m) return;
      this.snapshot();
      const i = m.list.indexOf(m.box); m.list.splice(i, 1);
      if (list === m.list && index > i) index--;
      list.splice(index, 0, m.box); if (this.istRahmenListe(list)) this.vorSetzen(list, m.box, this.zoneVor); else delete m.box.vor;
      this.moving = null; this.selected = m.box.id; this.afterChange(true);
    }
    showContextMenu(x, y, box) {
      const mod = isMac ? '⌘' : 'Strg+';
      const s = Struktogramm.find(this.doc, box.id);
      const feld = box.kind === 'stmt' ? 'text' : box.kind === 'loop' ? 'head' : 'cond';
      const teile = feld !== 'cond' && zerlege(box[feld], feld);
      const ohneLuecke = teile && !box.frei && !teile.some(p => p.a);
      const items = [];
      if (!ohneLuecke) items.push(['Bearbeiten', () => this.editSelected(), 'Enter']);
      // Freitext (Guana, 12.10.2026): eigener Text statt eines Bausteins – braucht man selten
      if (this.lueckentext() && feld !== 'cond') {
        if (box.frei) { if (teile) items.push(['Wieder als Baustein', () => { this.snapshot(); delete box.frei; this.afterChange(true); }]); }
        else if (teile) items.push(['Freitext eingeben', () => { this.snapshot(); box.frei = true; this.afterChange(true); this.editSelected(); }]);
      }
      items.push(null,
        ['Ausschneiden', () => this.cut(), mod + 'X'],
        ['Kopieren', () => this.copy(), mod + 'C'],
        ['Duplizieren', () => this.duplicate(), mod + 'D'],
        ['Verschieben', () => this.startMove()]);
      if (SgEditor.clipboard && s && s.list && (s.list !== this.doc.attributes || SgEditor.clipboard.kind === 'stmt')) items.push(['Zwischenablage einfügen (darunter)', () => this.paste(s.list, s.index + 1), mod + 'V']);
      items.push(['Löschen', () => this.remove(), 'Entf']);
      // Ohne brauchbare Mausposition (z. B. Tastatur) am Kästchen anzeigen
      if (!(x > 0 && y > 0)) { const el = this.docEl.querySelector(`.sg-box[data-id="${box.id}"]`); const r = el ? el.getBoundingClientRect() : { left: 40, bottom: 40 }; x = r.left + 20; y = r.bottom - 4; }
      this.einfachesMenue(x, y, items);
    }
    /* Menü an der Mausposition: items = [[Text, Funktion, Tastenkürzel] | null (Trennstrich)], bleibt im Fenster */
    einfachesMenue(x, y, items) {
      this.hideMenus(); this.menuOpenedAt = performance.now();
      const m = $('div', 'sg-menu');
      items.forEach((it, i) => {
        if (!it) { if (i > 0 && i < items.length - 1) m.appendChild($('div', 'sg-sep')); return; }
        const [label, fn, acc] = it;
        const el = $('div', 'sg-mi'); el.appendChild($('span', null, label)); if (acc) el.appendChild($('span', 'acc', acc));
        el.onmousedown = (e) => { e.preventDefault(); e.stopPropagation(); m.remove(); fn(); };
        el.oncontextmenu = (e) => e.preventDefault();
        m.appendChild(el);
      });
      document.body.appendChild(m);
      const mw = m.offsetWidth || 260, mh = m.offsetHeight || 220;
      m.style.left = Math.max(4, Math.min(x, innerWidth - mw - 4)) + 'px'; m.style.top = Math.max(4, Math.min(y, innerHeight - mh - 4)) + 'px';
      setTimeout(() => document.addEventListener('mousedown', (e) => { if (!m.contains(e.target)) m.remove(); }, { once: true }), 0);
    }
    clear() { this.snapshot(); this.doc = Struktogramm.newDoc(); this.moving = null; this.afterChange(); }
    renderBox(b, list, index) {
      const el = $('div', 'sg-box sg-' + b.kind); el.dataset.id = b.id;
      const err = this.errors.find(e => e.boxId === b.id);
      if (err) el.classList.add('err');
      if (this.selected === b.id) el.classList.add('selected');
      if (this.activeBox === b.id) el.classList.add('active');
      const textEl = (cls, value, placeholder, field) => {
        const t = $('div', cls); t.textContent = value || ''; if (!value) { t.classList.add('empty'); t.textContent = placeholder; }
        const teile = field !== 'cond' && value && this.lueckentext() && !b.frei ? zerlege(value, field) : null;
        if (teile) {
          // Lückentext: feste Wörter (nur Auswahl des Kästchens) und Lücken (ein Klick bearbeitet genau diese Lücke)
          t.textContent = ''; t.classList.add('sg-lt');
          teile.forEach((p, i) => {
            if (p.fix != null) { t.appendChild($('span', 'lt-fix', p.fix)); return; }
            const sp = $('span', 'lt-slot lt-' + p.a + (p.e === p.s ? ' leer' : ''), value.slice(p.s, p.e)); sp.dataset.i = i;
            sp.title = PH_TITEL[PH_ART[{ name: 'variable', wert: 'wert', typ: 'datentyp', bed: 'bedingung' }[p.a]]] || '';
            sp.onclick = (e) => { e.stopPropagation(); this.edit(b, field, t, { teil: i }); };
            t.appendChild(sp);
          });
          // Doppelklick auf ein festes Wort: die erste Lücke bearbeiten
          t.ondblclick = (e) => { e.stopPropagation(); if (!e.target.closest('.lt-slot')) this.edit(b, field, t); };
        } else {
          // Freitext, Bedingung, ohne Hilfen: ein Klick bearbeitet den ganzen Text
          t.onclick = (e) => { e.stopPropagation(); if (e.detail > 1) return; this.edit(b, field, t); };
          if (value && field !== 'cond' && this.lueckentext()) { t.classList.add('sg-frei'); t.appendChild($('span', 'sg-frei-schild', 'Freitext')); }
        }
        return t;
      };
      if (b.kind === 'stmt') el.appendChild(textEl('sg-text', b.text, 'Anweisung eingeben', 'text'));
      else if (b.kind === 'if') {
        const head = $('div', 'sg-if-head');
        head.innerHTML = '<svg class="sg-diag" preserveAspectRatio="none" viewBox="0 0 100 100"><line x1="0" y1="0" x2="50" y2="100"/><line x1="100" y1="0" x2="50" y2="100"/></svg><span class="j">J</span><span class="n">N</span>';
        head.appendChild(textEl('sg-text sg-cond', b.cond, 'Bedingung eingeben', 'cond'));
        el.appendChild(head);
        const body = $('div', 'sg-if-body');
        const t = this.renderList(b.then, b.id + ':then', 'Anweisung'); t.classList.add('then');
        const f = this.renderList(b.else, b.id + ':else', 'Anweisung'); f.classList.add('else');
        body.appendChild(t); body.appendChild(f); el.appendChild(body);
      } else if (b.kind === 'loop') {
        el.appendChild(textEl('sg-text sg-loop-head', b.head, 'Schleifenkopf eingeben', 'head'));
        const body = $('div', 'sg-loop-body'); body.appendChild(this.renderList(b.body, b.id + ':body', 'Anweisung')); el.appendChild(body);
      }
      el.addEventListener('mousedown', (e) => { if (e.target.closest('.sg-box') !== el) return; if (e.target.closest('.sg-ins, .sg-empty, textarea')) return; e.stopPropagation(); this.select(b.id); });
      el.addEventListener('contextmenu', (e) => {
        if (e.target.closest('.sg-box') !== el || e.target.closest('.sg-ins, .sg-empty')) return;
        e.preventDefault(); e.stopPropagation();
        const x = e.clientX, y = e.clientY;
        if (e.target.closest('textarea')) {
          // Rechte Maustaste beim Bearbeiten (12.10.2026): immer unser Menü, nie das des Browsers. Noch leer (z. B. gerade
          // verklickt eingefügt): Bearbeitung beenden, Kästchen bleibt stehen; sonst die Bearbeitung übernehmen
          const ed = this.editing; if (!ed) return;
          if (ed.box === b && !ed.ta.value.trim()) { this.editing = null; this.hideMenus(); ed.box[ed.field] = ed.original; this.selected = b.id; this.render(); this.showContextMenu(x, y, b); return; }
          Promise.resolve(this.commitEdit()).then(() => { if (this.editing) return; this.select(b.id); this.showContextMenu(x, y, b); });
          return;
        }
        this.select(b.id); this.showContextMenu(x, y, b);
      });
      if (err) { const bub = $('div', 'sg-errmsg', err.msg); el.appendChild(bub); }
      return el;
    }
    /* Schwebender Hinweis während des Verschiebens (verschiebt das Dokument nicht) */
    renderMoveBar() {
      const mb = this.moveBar; mb.innerHTML = '';
      mb.classList.toggle('hidden', !this.moving);
      if (!this.moving) return;
      mb.appendChild($('span', null, 'Verschieben: Ziel (↓) anklicken'));
      const c = $('button', 'sg-tb', 'Abbrechen · Esc'); c.onmousedown = (e) => e.preventDefault(); c.onclick = () => this.cancelMove(); mb.appendChild(c);
    }
    /* Fehler, die gerade gezeigt werden: nicht die des Kästchens, das gerade bearbeitet wird */
    visibleErrors() { const ed = this.editing; return ed ? this.errors.filter(e => e.boxId !== ed.box.id) : this.errors; }
    /* Statuszeile (immer da, damit nichts springt) */
    renderErrorBar() {
      const bar = this.status; const errs = this.visibleErrors();
      bar.classList.toggle('has-errors', errs.length > 0);
      bar.textContent = errs.length ? (errs.length === 1 ? '1 Fehler – zum Fehler springen' : errs.length + ' Fehler – zum nächsten springen') : '✔ Keine Fehler';
      bar.onclick = errs.length ? () => this.gotoNextError() : null;
    }
    gotoNextError() {
      const errs = this.visibleErrors(); if (!errs.length) return;
      const ids = errs.map(e => e.boxId);
      let i = this.selected ? ids.indexOf(this.selected) + 1 : 0; if (i >= ids.length) i = 0;
      this.select(ids[i]);
      const el = this.docEl.querySelector(`[data-id="${ids[i]}"], [data-mid="${ids[i]}"]`); if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    setErrors(list) { this.errors = list || []; if (this.editing || this.editingName) this.applyErrors(); else this.render(); }
    /* Hilfen beim Tippen (Abi-Drill, 07.10.2026): aus = keine Vorschlagsliste, keine vorausgefüllten Kästchen, keine Rückfrage bei
       Deklarationen im Anweisungsteil – alles wird von Hand getippt wie in der Prüfung (die Fehler zeigt app.js dann erst beim Prüfen) */
    setHilfen(an) { const vorher = this.hilfen; this.hilfen = !!an; if (!this.hilfen) document.querySelectorAll('.sg-ac').forEach(x => x.remove()); if (vorher !== this.hilfen) this.render(); }
    /* Lückentext (12.10.2026): überall, außer im Abi-Drill mit „Hilfen beim Tippen“ aus – dort wird alles von Hand getippt */
    lueckentext() { return this.hilfen !== false; }
    /* Fehlermarkierungen ohne Neuaufbau aktualisieren (während der Textbearbeitung) */
    applyErrors() {
      const byId = new Map(this.visibleErrors().map(e => [e.boxId, e.msg]));
      for (const el of this.docEl.querySelectorAll('.sg-box')) {
        const msg = byId.get(el.dataset.id);
        el.classList.toggle('err', !!msg);
        let bub = [...el.children].find(c => c.classList.contains('sg-errmsg'));
        if (msg) { if (!bub) { bub = $('div', 'sg-errmsg'); el.appendChild(bub); } bub.textContent = msg; }
        else if (bub) bub.remove();
      }
      for (const h of this.docEl.querySelectorAll('.sg-mhead')) { const msg = byId.get(h.parentElement.dataset.mid); h.classList.toggle('err', !!msg); if (msg) h.title = msg; }
      this.renderErrorBar();
    }
    /* Gelb = das Kästchen, das als Nächstes ausgeführt wird. Im Schritt-Betrieb (schritt = true) bleibt zusätzlich das zuletzt
       ausgeführte Kästchen grün markiert („ausgeführt“) und das gelbe trägt das Abzeichen „nächster Schritt“ – damit man sieht,
       welchen Schritt die Welt gerade zeigt (Guana, 01.10.2026). Ohne boxId am Ende: das letzte bleibt grün, nichts ist gelb. */
    highlight(boxId, schritt) {
      const vorher = this.activeBox;
      if (vorher === boxId && !!schritt === this.schrittMarkiert) return;
      this.schrittMarkiert = !!schritt;
      for (const x of this.docEl.querySelectorAll('.sg-box.active, .sg-box.ausgefuehrt, .sg-box.naechster')) x.classList.remove('active', 'ausgefuehrt', 'naechster');
      this.activeBox = boxId;
      if (schritt && vorher && vorher !== boxId) { const el = this.docEl.querySelector(`.sg-box[data-id="${vorher}"]`); if (el) el.classList.add('ausgefuehrt'); }
      if (boxId) { const el = this.docEl.querySelector(`.sg-box[data-id="${boxId}"]`); if (el) { el.classList.add('active'); if (schritt) el.classList.add('naechster'); } }
    }
    setFontSize(px) { this.fontSize = px; this.host.style.fontSize = px + 'px'; }

    /* ---------------- Auswahl und Aktionen */
    select(id) {
      if (this.editing) this.commitEdit();
      this.selected = id;
      this.docEl.querySelectorAll('.sg-box.selected').forEach(x => x.classList.remove('selected'));
      if (id) { const el = this.docEl.querySelector(`.sg-box[data-id="${id}"]`); if (el) el.classList.add('selected'); }
      if (!this.editing && !this.editingName) this.host.focus({ preventScroll: true });
    }
    /* Liegt das Kästchen im Variablenbereich (intern: attributes)? */
    inAttributes(box) { const s = Struktogramm.find(this.doc, box.id); return !!(s && s.list === this.doc.attributes); }
    /* Ja/Nein-Rückfrage, die die laufende Textbearbeitung nicht beendet */
    confirmDialog(text, yes, no) {
      return new Promise((res) => {
        this.dialogOpen = true;
        const back = $('div', 'dlg-back'); const d = $('div', 'dlg sg-mdlg');
        const p = $('p'); p.style.whiteSpace = 'pre-wrap'; p.textContent = text; d.appendChild(p);
        const btns = $('div', 'btns'); d.appendChild(btns);
        const close = (v) => { back.remove(); this.dialogOpen = false; res(v); if (this.editing) this.editing.ta.focus(); };
        const mk = (t, v, cls) => { const b = $('button', 'fxbtn small' + (cls ? ' ' + cls : ''), t); b.onclick = () => close(v); btns.appendChild(b); return b; };
        mk(no || 'Nein', false); const y = mk(yes || 'Ja', true, 'primary');
        d.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(false); e.stopPropagation(); });
        back.appendChild(d); document.body.appendChild(back); y.focus();
      });
    }
    /* Früher Rückfrage bei einer Deklaration außerhalb des Variablenbereichs; jetzt nur noch Hinweis nach dem Übernehmen (deklHinweis) */
    async declWarning() { return true; }
    /* Steht das Kästchen am Anfang seines Programms (Hauptprogramm oder Unterprogramm), vor ihm nur Deklarationen? */
    amAnfang(box) {
      const s = Struktogramm.find(this.doc, box.id); if (!s || !s.list) return true;
      if (!this.doc.methods.some(m => m.body === s.list)) return false; // in einer Schleife oder Verzweigung
      return s.list.slice(0, s.index).every(Struktogramm.istDeklaration);
    }
    /* Hinweis an einer Deklaration, die nicht am Anfang steht (nicht ohne Hilfen – dort wie in der Prüfung) */
    deklHinweis(boxId) {
      if (this.hilfen === false) return;
      const s = Struktogramm.find(this.doc, boxId); if (!s || !s.box || !Struktogramm.istDeklaration(s.box) || this.amAnfang(s.box)) return;
      const el = this.docEl.querySelector(`.sg-box[data-id="${boxId}"]`); if (!el) return;
      document.querySelectorAll('.sg-dekl-hinweis').forEach(x => x.remove());
      const h = $('div', 'sg-lt-hinweis sg-dekl-hinweis', DECL_HINWEIS); el.style.position = 'relative'; el.appendChild(h);
      clearTimeout(this._deklZeit); this._deklZeit = setTimeout(() => h.remove(), 7000);
    }
    editSelected() {
      const s = this.selected && Struktogramm.find(this.doc, this.selected); if (!s || !s.box) return;
      const el = this.docEl.querySelector(`.sg-box[data-id="${s.box.id}"]`); if (!el) return;
      const field = s.box.kind === 'stmt' ? 'text' : s.box.kind === 'if' ? 'cond' : 'head';
      const t = el.querySelector(s.box.kind === 'stmt' ? '.sg-text' : s.box.kind === 'if' ? '.sg-cond' : '.sg-loop-head');
      this.edit(s.box, field, t);
    }
    move(d) {
      const s = Struktogramm.find(this.doc, this.selected); if (!s || !s.list) return;
      // Missionsrahmen: über die Grenze vor/in der Schleife wechselt nur das Merkmal vor (das Kästchen bleibt an seiner Stelle der Liste)
      if (this.istRahmenListe(s.list) && ((d < 0 && !s.box.vor && s.list[s.index - 1] && s.list[s.index - 1].vor) || (d > 0 && s.box.vor && !(s.list[s.index + 1] && s.list[s.index + 1].vor)))) {
        this.snapshot(); this.vorSetzen(s.list, s.box, d < 0); this.afterChange(true); return;
      }
      const j = s.index + d; if (j < 0 || j >= s.list.length) return;
      this.snapshot(); s.list.splice(s.index, 1); s.list.splice(j, 0, s.box); this.afterChange(true);
    }
    duplicate() {
      const s = Struktogramm.find(this.doc, this.selected); if (!s || !s.list) return;
      this.snapshot(); const c = Struktogramm.clone(s.box); s.list.splice(s.index + 1, 0, c); this.selected = c.id; this.afterChange(true);
    }
    remove() {
      const s = Struktogramm.find(this.doc, this.selected); if (!s || !s.list) return;
      this.snapshot(); s.list.splice(s.index, 1); this.afterChange();
    }
    /* Missionsrahmen (24.10.2026): Ist list das Hauptprogramm mit Rahmen? Neue Kästchen bekommen dort das Merkmal vor,
       wenn sie vor dem Rahmen eingefügt wurden – so bleibt eine Deklaration in der Schleife auch in der Schleife */
    istRahmenListe(list) { if (!this.rahmen) return false; const run = this.doc.methods.find(m => m.name === '_run'); return !!run && run.body === list; }
    vorSetzen(list, box, vor) { if (!this.istRahmenListe(list)) return; if (vor) box.vor = true; else delete box.vor; }
    insert(list, index, kind, text) {
      this.snapshot();
      const B = Struktogramm.B;
      const b = kind === 'if' ? B.if('') : kind === 'loop' ? B.loop('') : B.stmt(text || '');
      list.splice(index, 0, b); this.vorSetzen(list, b, this.zoneVor);
      this.selected = b.id; this.render(); this.changed();
      if (!text) { this.newBox = b.id; this.editSelected(); }
      return b;
    }
    /* Einfügeziel für Textbausteine aus der Seitenleiste: nach der Auswahl, sonst am Ende von _run */
    insertPoint() {
      const s = this.selected && Struktogramm.find(this.doc, this.selected);
      this.zoneVor = !!(s && s.box && s.box.vor); // hinter einem Kästchen vor dem Rahmen: ebenfalls davor
      if (s && s.list) return { list: s.list, index: s.index + 1 };
      if (s && s.method) return { list: s.method.body, index: s.method.body.length };
      const run = this.doc.methods.find(m => m.name === '_run') || this.doc.methods[0];
      return { list: run.body, index: run.body.length };
    }

    /* ---------------- Einfügemenü */
    hideMenus() {
      document.querySelectorAll('.sg-menu, .sg-ac').forEach(x => x.remove());
      this.docEl.querySelectorAll('.menu-at').forEach(x => x.classList.remove('menu-at'));
      this.insMenu = null; this.menuAt = null;
    }
    showInsertMenu(anchor, list, index, keyboard) {
      this.zoneVor = this.istRahmenListe(list) && !anchor.closest('.sg-rahmen'); // Einfügestelle vor dem Missionsrahmen?
      // Position vor dem Übernehmen einer laufenden Bearbeitung merken (das Rendern ersetzt den Anker)
      const r = anchor.getBoundingClientRect();
      this.hideMenus(); if (this.editing) this.commitEdit();
      this.menuOpenedAt = performance.now();
      const m = $('div', 'sg-menu sg-insmenu');
      // Reihenfolge nach Guana (13.10.2026); null = Trenner
      const items = [['Variablen', 'stmt', '', 'var', 'Deklaration, Zuweisung, Einlesen …'], null,
           ['Anweisung', 'stmt', '', 'stmt', Struktogramm.TEXTE.anweisungMenue], null,
           ['Verzweigung', 'if', '', null, 'Wenn … dann … sonst …'],
           ['Zählerschleife', 'loop', '', 'count', 'Zähle … / Wiederhole von …'],
           ['While-Schleife', 'loop', 'Wiederhole solange {bedingung}', null, 'Wiederhole solange …'], null,
           ['Aufruf Unterprogramm', 'stmt', '', 'call', 'eigenes Unterprogramm']];
      for (const item of items) {
        if (!item) { m.appendChild($('div', 'sg-sep')); continue; }
        const [label, kind, tpl, mode, hint] = item;
        const it = $('div', 'sg-mi'); it.appendChild($('span', null, label)); if (hint) it.appendChild($('span', 'acc', hint));
        it.onmousedown = (e) => { e.preventDefault(); e.stopPropagation(); it._act(); };
        it._act = () => {
          this.hideMenus();
          let t = tpl;
          // Aufruf ohne eigene Unterprogramme: Textbaustein mit Platzhaltern
          if (mode === 'call' && !this.doc.methods.some(x => x.name !== '_run')) t = 'Aufruf: {unterprogramm}({parameter})';
          this.newMode = t ? null : mode;
          this.insert(list, index, kind, '');
          this.newMode = null;
          if (t && this.editing) { this.editing.declWarned = /^Deklaration/.test(t); this.applyTemplate(t); }
        };
        m.appendChild(it);
      }
      if (SgEditor.clipboard) {
        m.appendChild($('div', 'sg-sep'));
        const it = $('div', 'sg-mi'); it.appendChild($('span', null, 'Zwischenablage einfügen')); it.appendChild($('span', 'acc', isMac ? '⌘V' : 'Strg+V'));
        it.onmousedown = (e) => { e.preventDefault(); e.stopPropagation(); it._act(); };
        it._act = () => { this.hideMenus(); this.paste(list, index); };
        m.appendChild(it);
      }
      // Mit der Tastatur geöffnet (Enter nach einem Kästchen): erster Eintrag markiert, ↑/↓ + Enter wählen, Esc schließt
      if (keyboard) {
        m.querySelector('.sg-mi').classList.add('sel');
        m.classList.add('kb');
        // Markierung folgt der Maus erst, wenn sie wirklich bewegt wird (nicht, wenn das Menü unter dem ruhenden Mauszeiger aufgeht)
        let last = null;
        m.querySelectorAll('.sg-mi').forEach(it => it.addEventListener('mousemove', (ev) => {
          const xy = ev.screenX + ',' + ev.screenY; if (last === null) { last = xy; return; } if (xy === last) return; last = xy;
          if (it.classList.contains('sel')) return; m.querySelectorAll('.sg-mi.sel').forEach(x => x.classList.remove('sel')); it.classList.add('sel');
        })); const hint = $('div', 'sg-mhint', '↑↓ wählen · Enter einfügen · Esc: nichts einfügen'); m.appendChild(hint); }
      document.body.appendChild(m);
      this.insMenu = m; this.menuAt = { list, index }; anchor.classList.add('menu-at');
      const mh = m.offsetHeight || 220;
      m.style.left = Math.max(4, Math.min(r.left, innerWidth - 320)) + 'px'; m.style.top = Math.min(r.bottom + 2, innerHeight - mh - 4) + 'px';
      setTimeout(() => document.addEventListener('mousedown', (e) => { if (!m.contains(e.target)) { m.remove(); if (this.insMenu === m) this.hideMenus(); } }, { once: true }), 0);
    }
    /* Tasten im Einfügemenü */
    insMenuKey(e) {
      const m = this.insMenu; if (!m || !m.isConnected) { this.insMenu = null; return false; }
      const items = [...m.querySelectorAll('.sg-mi')]; let i = items.findIndex(x => x.classList.contains('sel'));
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault(); if (i >= 0) items[i].classList.remove('sel');
        i = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
        items[i].classList.add('sel'); return true;
      }
      if (e.key === 'Enter') { e.preventDefault(); (items[i] || items[0])._act(); return true; }
      if (e.key === 'Escape') { e.preventDefault(); this.hideMenus(); return true; }
      return false;
    }
    /* DOM-Element der Einfügestelle (list, index) nach dem Rendern */
    listId(list) {
      if (list === this.doc.attributes) return 'attributes';
      for (const m of this.doc.methods) if (m.body === list) return m.id;
      let id = null;
      Struktogramm.walk(this.doc, (b) => { if (id) return; if (b.then === list) id = b.id + ':then'; else if (b.else === list) id = b.id + ':else'; else if (b.body === list) id = b.id + ':body'; });
      return id;
    }
    zoneEl(list, index, vor) {
      const id = this.listId(list); if (!id) return null;
      // im Missionsrahmen gibt es dieselbe Stelle zweimal: direkt vor dem Rahmen und am Anfang im Rahmen – vor wählt (sonst die erste)
      const alle = [...this.docEl.querySelectorAll(`.sg-cont[data-list="${id}"] > .sg-ins[data-index="${index}"], .sg-cont[data-list="${id}"] > .sg-empty[data-index="${index}"]`)];
      if (vor !== undefined && alle.length > 1) { const z = alle.find(z => !z.closest('.sg-rahmen') === !!vor); if (z) return z; }
      return alle[0] || null;
    }
    /* Enter beim Bearbeiten: übernehmen und gleich die nächste Einfügestelle mit dem Einfügemenü anbieten.
       Nach einer Bedingung / einem Schleifenkopf geht es im (leeren) Ja-Zweig bzw. Schleifenkörper weiter.
       Enter in einem neuen, leeren Kästchen beendet die Eingabe. */
    async enterWeiter(hoch) {
      const ed = this.editing; if (!ed) return;
      if (ed.isNew && !ed.ta.value.trim()) { this.cancelEdit(); return; }
      const box = ed.box, field = ed.field;
      await this.commitEdit({ enter: true });
      if (this.editing) return; // Rückfrage abgelehnt oder kein Baustein – es wird weiter bearbeitet
      const s = Struktogramm.find(this.doc, box.id); if (!s || !s.list) return;
      // ↑: Einfügestelle über dem Kästchen; Enter und ↓: darunter (bzw. im leeren Zweig / Schleifenkörper)
      let list = s.list, index = hoch ? s.index : s.index + 1;
      if (hoch) { /* bleibt über dem Kästchen */ }
      else if (box.kind === 'if' && field === 'cond' && !box.then.length) { list = box.then; index = 0; }
      else if (box.kind === 'loop' && field === 'head' && !box.body.length) { list = box.body; index = 0; }
      const z = this.zoneEl(list, index, list === s.list ? !!box.vor : undefined); if (!z) return;
      z.scrollIntoView({ block: 'nearest' });
      this.showInsertMenu(z, list, index, true);
    }

    /* ---------------- Textbearbeitung */
    edit(box, field, textEl, opts) {
      if (this.editing) { if (this.editing.box === box && this.editing.field === field) { if (opts && opts.teil != null && this.editing.slots) this.slotWaehlen(this.editing, this.slotIndex(this.editing, opts.teil)); return; } this.commitEdit(); }
      this.hideMenus();
      const el = this.docEl.querySelector(`.sg-box[data-id="${box.id}"]`); if (!el) return;
      // Lückentext: Baustein ohne Lücke (z. B. geheRechts()) lässt sich nicht bearbeiten – nur Freitext (rechte Maustaste)
      const teile = field !== 'cond' && this.lueckentext() && !box.frei && box[field] ? zerlege(box[field], field) : null;
      if (teile && !teile.some(p => p.a)) { this.select(box.id); return; }
      const target = textEl || el.querySelector(field === 'text' ? '.sg-text' : field === 'cond' ? '.sg-cond' : '.sg-loop-head');
      const ta = $('textarea', 'sg-edit'); ta.value = box[field] || ''; ta.rows = 1; ta.spellcheck = false;
      ta.placeholder = field === 'cond' ? 'Bedingung, z. B. istFelsVoraus() oder treffer >= 5' : field === 'head' ? 'z. B. Wiederhole solange x < 10' : this.inAttributes(box) ? 'z. B. Deklaration und Initialisierung: x als Ganzzahl = 0' : this.lueckentext() && !box.frei ? 'Baustein wählen – oder tippen, z. B. Zuweisung' : 'z. B. geheRechts() oder Zuweisung: x = x + 1';
      // Unter dem Textfeld liegt eine Kopie des Textes, in der die Platzhalter farbig hinterlegt sind (Textfelder selbst können das nicht)
      const wrap = $('div', 'sg-editwrap'); const hl = $('div', 'sg-edit sg-hl'); hl.setAttribute('aria-hidden', 'true');
      wrap.appendChild(hl); wrap.appendChild(ta);
      target.replaceWith(wrap);
      this.editing = { box, field, ta, hl, wrap, phs: null, slots: null, last: ta.value, original: box[field] || '', isNew: this.newBox === box.id, mode: this.newBox === box.id ? this.newMode : null };
      const ed = this.editing;
      this.newBox = null;
      const autosize = () => { ta.style.height = 'auto'; ta.style.height = (ta.scrollHeight + 2) + 'px'; };
      ed.autosize = autosize;
      autosize();
      // Vor jeder Eingabe die Auswahl merken: so lässt sich genau sagen, welche Lücke sich ändert (oder ob ein festes Wort getroffen würde)
      ta.addEventListener('beforeinput', () => { ed.vorher = [ta.selectionStart, ta.selectionEnd]; });
      ta.addEventListener('input', () => { if (ed.slots && !this.slotEingabe(ed)) return; autosize(); this.phSync(ed); this.showCompletion(); });
      ta.addEventListener('scroll', () => { hl.scrollTop = ta.scrollTop; });
      ta.addEventListener('keydown', (e) => this.onEditKey(e));
      ta.addEventListener('keyup', (e) => { if (ed.slots && /^(Arrow|Home|End|Page)/.test(e.key) && !((e.key === 'ArrowDown' || e.key === 'ArrowUp') && document.querySelector('.sg-ac.typ'))) this.slotKlammern(ed, e.key === 'ArrowLeft' || e.key === 'End' || e.key === 'ArrowUp' || e.key === 'PageUp' ? -1 : 1); });
      ta.addEventListener('mouseup', () => { if (ed.slots) setTimeout(() => { if (this.editing === ed) this.slotKlammern(ed, 0); }, 0); });
      ta.addEventListener('blur', () => { setTimeout(() => { if (this.editing && this.editing.ta === ta && !this.acHover && !this.dialogOpen) this.commitEdit(); }, 120); });
      ta.addEventListener('mousedown', (e) => e.stopPropagation());
      ta.focus();
      // Markierung und Einfügemarke laufend nachzeichnen, solange dieses Feld bearbeitet wird (Stellung prüfen kostet fast nichts)
      wrap.classList.add('sg-ov');
      const nachzeichnen = () => { if (this.editing !== ed) return; this.ovRender(ed); requestAnimationFrame(nachzeichnen); };
      requestAnimationFrame(nachzeichnen);
      this.selected = box.id; this.renderErrorBar();
      if (teile) { this.slotsSetzen(ed, teile); this.slotWaehlen(ed, this.slotIndex(ed, opts && opts.teil)); return; }
      // ganzer Text (Freitext, Bedingung): Cursor ans Ende statt alles zu markieren (12.10.2026)
      ta.setSelectionRange(ta.value.length, ta.value.length);
      if (!ta.value) this.showCompletion();
    }
    /* ---------------- Lücken beim Bearbeiten: ed.slots = [{ s, e, a }] (Stellen im Text), dazwischen feste Wörter */
    slotsSetzen(ed, teile) {
      ed.slots = teile.filter(p => p.a).map(p => ({ s: p.s, e: p.e, a: p.a }));
      ed.teilNr = teile.map((p, i) => p.a ? i : -1).filter(i => i >= 0); // Teil-Nummer der Anzeige → Lücke
      ed.phs = null; ed.last = ed.ta.value; ed.wrap.classList.add('sg-lt-edit'); if (ed.autosize) ed.autosize(); // mehr Innenabstand oben/unten: Höhe neu
      this.phRender(ed);
    }
    slotIndex(ed, teil) { const i = teil != null ? ed.teilNr.indexOf(teil) : -1; return i >= 0 ? i : 0; }
    /* Lücke, in der die Auswahl gerade liegt (Ränder eingeschlossen), sonst -1 */
    slotBei(ed, a, b) { if (b == null) b = a; return ed.slots.findIndex(r => a >= r.s && b <= r.e); }
    slotWaehlen(ed, i) {
      const r = ed.slots[i]; if (!r) return;
      ed.ta.focus(); ed.ta.setSelectionRange(r.s, r.e);
      // Inhalt der Lücke bleibt markiert (Guana 24.10.2026: Tab ins Feld „Wert“ → gleich lostippen und überschreiben).
      // Manche Browser (Safari) setzen die Auswahl nach dem Tastendruck noch einmal zurück – dann im nächsten Bild erneut markieren.
      const v = ed.ta.value;
      requestAnimationFrame(() => { const ta = ed.ta; if (this.editing === ed && ta.value === v && ta.selectionStart === ta.selectionEnd && r.e > r.s && ta.selectionStart >= r.s && ta.selectionStart <= r.e) ta.setSelectionRange(r.s, r.e); });
      if (r.a === 'typ') this.typMenue(ed); else { this.hideMenus(); if (r.e === r.s) this.showCompletion(); }
    }
    /* Eingabe prüfen: nur innerhalb einer Lücke erlaubt (nicht im Datentyp, der wird ausgewählt). Sonst rückgängig, mit Hinweis. */
    slotEingabe(ed) {
      const ta = ed.ta, neu = ta.value, alt = ed.last; if (neu === alt) return true;
      const [a, b] = ed.vorher || [ta.selectionStart, ta.selectionStart];
      const i = this.slotBei(ed, a, b); const r = ed.slots[i]; const delta = neu.length - alt.length;
      const ok = r && r.a !== 'typ' && neu.slice(0, r.s) === alt.slice(0, r.s) && neu.slice(r.e + delta) === alt.slice(r.e) && r.e + delta >= r.s
        && !(r.a === 'name' && /\n/.test(neu.slice(r.s, r.e + delta)));
      ed.vorher = null;
      if (!ok) {
        ta.value = alt; ta.setSelectionRange(a, b);
        this.slotHinweis(ed, r && r.a === 'typ' ? 'Den Datentyp wählst du aus der Liste (oder Anfangsbuchstabe: g, d, z, w).' : 'Dieser Teil ist fest vorgegeben – schreiben kannst du nur in die farbigen Lücken.');
        return false;
      }
      r.e += delta; for (const x of ed.slots) if (x !== r && x.s >= r.e - delta) { x.s += delta; x.e += delta; }
      ed.last = neu;
      return true;
    }
    /* Text zwischen a und b ersetzen (Vorschlag übernehmen, Datentyp wählen) – nur innerhalb einer Lücke */
    slotErsetzen(ed, a, b, text) {
      const i = this.slotBei(ed, a, b); const r = ed.slots[i]; if (!r) return false;
      const ta = ed.ta; const v = ta.value; const delta = text.length - (b - a);
      ta.value = v.slice(0, a) + text + v.slice(b);
      for (const x of ed.slots) if (x !== r && x.s >= r.e) { x.s += delta; x.e += delta; }
      r.e += delta; ed.last = ta.value;
      ta.setSelectionRange(a + text.length, a + text.length);
      ed.autosize(); this.phRender(ed);
      return true;
    }
    /* Cursor auf einem festen Wort (Pfeiltasten, Klick): in die nächste Lücke in Laufrichtung, beim Klick in die nächstgelegene */
    slotKlammern(ed, dir) {
      const ta = ed.ta; const a = ta.selectionStart, b = ta.selectionEnd;
      const i = this.slotBei(ed, a, b);
      if (i >= 0) { const r = ed.slots[i]; if (r.a === 'typ') { if (a !== r.s || b !== r.e) ta.setSelectionRange(r.s, r.e); this.typMenue(ed); } else if (document.querySelector('.sg-ac.typ')) this.hideMenus(); return; }
      if (a !== b) return; // Markierung über feste Wörter (z. B. zum Kopieren) bleibt
      let j;
      if (dir > 0) { j = ed.slots.findIndex(r => r.s >= a); if (j < 0) j = ed.slots.length - 1; }
      else if (dir < 0) { j = -1; ed.slots.forEach((r, k) => { if (r.e <= a) j = k; }); if (j < 0) j = 0; }
      else { let best = 1e9; ed.slots.forEach((r, k) => { const d = Math.min(Math.abs(r.s - a), Math.abs(r.e - a)); if (d < best) { best = d; j = k; } }); }
      const r = ed.slots[j]; if (!r) return;
      if (r.a === 'typ') { ta.setSelectionRange(r.s, r.e); this.typMenue(ed); return; }
      const pos = dir > 0 ? r.s : dir < 0 ? r.e : (Math.abs(r.s - a) < Math.abs(r.e - a) ? r.s : r.e);
      ta.setSelectionRange(pos, pos); this.hideMenus();
    }
    slotHinweis(ed, text) {
      const alt = ed.wrap.querySelector('.sg-lt-hinweis'); if (alt) alt.remove();
      const h = $('div', 'sg-lt-hinweis', text); ed.wrap.appendChild(h);
      clearTimeout(this._hinweisZeit); this._hinweisZeit = setTimeout(() => h.remove(), 2600);
    }
    /* Auswahl des Datentyps (statt tippen) */
    typMenue(ed) {
      const ta = ed.ta; const i = this.slotBei(ed, ta.selectionStart, ta.selectionEnd); const r = ed.slots[i]; if (!r || r.a !== 'typ') return;
      document.querySelectorAll('.sg-ac').forEach(x => x.remove());
      const jetzt = ta.value.slice(r.s, r.e);
      const ac = $('div', 'sg-ac typ'); ac.dataset.prefix = '';
      for (const t of typListe()) {
        const it = $('div', 'sg-aci typ' + (t === jetzt ? ' sel' : '')); it.appendChild($('span', 'lbl', t)); it.dataset.typ = t;
        it.onmouseenter = () => { this.acHover = true; }; it.onmouseleave = () => { this.acHover = false; };
        it.onmousedown = (e) => { e.preventDefault(); e.stopPropagation(); this.typSetzen(ed, t, true); };
        ac.appendChild(it);
      }
      if (!ac.querySelector('.sel')) ac.firstChild.classList.add('sel');
      ac.appendChild($('div', 'sg-mhint', 'anklicken · ↑↓ und Enter · Anfangsbuchstabe'));
      const rr = ta.getBoundingClientRect();
      ac.style.left = Math.min(rr.left + 40, innerWidth - 260) + 'px'; ac.style.top = (rr.bottom + 2) + 'px'; ac.style.minWidth = '200px';
      if (rr.bottom + 200 > innerHeight) { ac.style.top = 'auto'; ac.style.bottom = (innerHeight - rr.top + 2) + 'px'; }
      document.body.appendChild(ac);
    }
    typSetzen(ed, t, weiter) {
      const ta = ed.ta; const i = ed.slots.findIndex(r => r.a === 'typ' && ta.selectionStart >= r.s && ta.selectionEnd <= r.e); const r = ed.slots[i]; if (!r) return;
      this.slotErsetzen(ed, r.s, r.e, t); this.acHover = false;
      if (weiter && ed.slots[i + 1]) this.slotWaehlen(ed, i + 1);
      else { ta.setSelectionRange(r.s, r.e); this.typMenue(ed); }
    }
    async commitEdit(opts) {
      const ed = this.editing; if (!ed || this.dialogOpen) return;
      let v = ed.ta.value.replace(/\s+$/, '');
      // Neue, leer gebliebene Anweisung (z. B. „Anweisung einfügen“ im Nein-Zweig angeklickt und weggeklickt): wieder weg –
      // ein leerer Zweig ist erlaubt, ein leeres Kästchen wäre ein Fehler (Guana, 13.10.2026)
      if (ed.isNew && ed.box.kind === 'stmt' && !v.trim()) { this.cancelEdit(); return; }
      // Neues Kästchen mit eigenem Text, der zu keinem Baustein passt: bei Enter Hinweis und weiter bearbeiten
      // (beim Wegklicken bleibt der Text als Freitext stehen, damit nichts verloren geht)
      if (opts && opts.enter && ed.isNew && !ed.slots && this.lueckentext() && !ed.box.frei && ed.field !== 'cond' && v.trim() && !zerlege(v, ed.field)) {
        this.hideMenus(); this.slotHinweis(ed, 'Das ist kein Baustein. Wähle einen aus der Liste (Anfang tippen, z. B. „zuw“) – eigenen Text gibt es über die rechte Maustaste: „Freitext eingeben“.'); return;
      }
      this.editing = null; this.hideMenus();
      if (this.lueckentext() && !ed.box.frei) v = this.formatiereEdit(ed, v);
      if (v !== ed.original) { ed.box[ed.field] = ed.original; this.snapshot(); ed.box[ed.field] = v; this.render(); this.changed(); }
      else this.render();
      if (this.needsRender) this.render();
      // neu zur Deklaration geworden, aber nicht am Anfang des Programms: Hinweis
      if (ed.field === 'text' && /^Deklaration/.test(v.trim()) && !/^Deklaration/.test(String(ed.original).trim())) this.deklHinweis(ed.box.id);
      this.host.focus({ preventScroll: true });
    }
    /* Werte- und Bedingungslücken (bzw. die ganze Bedingung) beim Übernehmen formatieren; Namen, Datentyp, feste Wörter bleiben */
    formatiereEdit(ed, v) {
      if (ed.field === 'cond') return formatiere(v);
      const teile = zerlege(v, ed.field); if (!teile) return v;
      return teile.map(p => { const x = v.slice(p.s, p.e); return p.a === 'wert' || p.a === 'bed' ? (p.a === 'wert' && /^\/\//.test(v) ? x : formatiere(x)) : x; }).join('');
    }
    cancelEdit() {
      const ed = this.editing; if (!ed) return;
      this.editing = null; this.hideMenus();
      if (ed.isNew && !ed.original) { const s = Struktogramm.find(this.doc, ed.box.id); if (s && s.list) { s.list.splice(s.index, 1); this.selected = null; this.render(); this.changed(); return; } }
      this.render(); this.host.focus({ preventScroll: true });
    }
    onEditKey(e) {
      e.stopPropagation();
      const led = this.editing;
      if (led && led.slots) {
        // Lückentext: Datentyp per Anfangsbuchstabe, Pfeiltasten springen über feste Wörter in die nächste Lücke
        const ta = led.ta, a = ta.selectionStart, b = ta.selectionEnd; const i = this.slotBei(led, a, b); const r = led.slots[i];
        const ohneMod = !e.ctrlKey && !e.metaKey && !e.altKey;
        if (r && r.a === 'typ' && ohneMod) {
          if (e.key.length === 1) { e.preventDefault(); const t = typListe().find(x => x[0].toLowerCase() === e.key.toLowerCase()); if (t) this.typSetzen(led, t, false); else this.slotHinweis(led, 'Datentypen: Ganzzahl, Dezimalzahl, Zeichenkette, Wahrheitswert'); return; }
          if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); return; }
          if (e.key === 'Enter' && !e.shiftKey && document.querySelector('.sg-ac.typ')) { e.preventDefault(); const sel = document.querySelector('.sg-ac.typ .sg-aci.sel'); this.typSetzen(led, sel ? sel.dataset.typ : ta.value.slice(r.s, r.e), true); return; }
          if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && !e.shiftKey) {
            e.preventDefault(); const j = e.key === 'ArrowRight' ? i + 1 : i - 1; const z = led.slots[j];
            if (z) { this.hideMenus(); if (z.a === 'typ') this.slotWaehlen(led, j); else { const pos = j > i ? z.s : z.e; ta.setSelectionRange(pos, pos); } }
            return;
          }
        }
        if (r && ohneMod && !e.shiftKey && a === b && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
          const j = e.key === 'ArrowRight' ? (a === r.e ? i + 1 : -1) : (a === r.s ? i - 1 : -1); const z = led.slots[j];
          if (z) { e.preventDefault(); this.hideMenus(); if (z.a === 'typ') this.slotWaehlen(led, j); else { const pos = j > i ? z.s : z.e; ta.setSelectionRange(pos, pos); } return; }
        }
        if (e.key === 'Tab') {
          e.preventDefault();
          const ac0 = document.querySelector('.sg-ac:not(.typ) .sg-aci.sel');
          // Vorschlag offen und keine weitere Lücke: Tab übernimmt ihn (wie bisher)
          if (ac0 && !e.shiftKey) { this.acceptCompletion(ac0).then(() => { if (this.editing !== led) return; const k = this.slotBei(led, led.ta.selectionStart, led.ta.selectionEnd); if (led.slots[k + 1]) this.slotWaehlen(led, k + 1); else if (this.branchOf(led)) this.branchTab(false); }); return; }
          const j = i < 0 ? 0 : e.shiftKey ? i - 1 : i + 1;
          if (led.slots[j]) { this.slotWaehlen(led, j); return; }
          if (this.branchOf(led)) { this.branchTab(e.shiftKey); return; }
          this.slotWaehlen(led, e.shiftKey ? led.slots.length - 1 : 0); return;
        }
      }
      const ac = document.querySelector('.sg-ac');
      if (ac) {
        const items = [...ac.querySelectorAll('.sg-aci')]; let i = items.findIndex(x => x.classList.contains('sel'));
        if (e.key === 'ArrowDown') { e.preventDefault(); items[i]?.classList.remove('sel'); items[(i + 1) % items.length].classList.add('sel'); items[(i + 1) % items.length].scrollIntoView({ block: 'nearest' }); return; }
        if (e.key === 'ArrowUp') { e.preventDefault(); items[i]?.classList.remove('sel'); items[(i - 1 + items.length) % items.length].classList.add('sel'); return; }
        if (e.key === 'Tab' && i >= 0 && !this.hasPlaceholderAfterCursor() && !e.shiftKey && !(this.branchOf(this.editing) && !this.editing.ta.value.trim())) { e.preventDefault(); this.acceptCompletion(items[i]); return; }
        if (e.key === 'Enter' && i >= 0) {
          e.preventDefault();
          // ein fertiger Befehl ohne Parameter (z. B. geheRechts()): übernehmen und gleich weiter zum nächsten Kästchen
          // In Bedingungen und Schleifenköpfen nicht: dort geht es oft mit AND/OR weiter (Guana, 06.10.2026) – ein zweites Enter übernimmt
          const it = items[i]; const fertig = !e.shiftKey && this.editing.field === 'text' && /\b(cmd|user)\b/.test(it.className) && /\(\)$/.test(it.dataset.insert);
          this.acceptCompletion(it).then(() => { if (fertig) this.enterWeiter(); });
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          // neues, noch leeres Kästchen: Esc bricht gleich ganz ab (nichts eingefügt)
          if (this.editing.isNew && !this.editing.ta.value.trim()) { this.cancelEdit(); return; }
          this.hideMenus(); return;
        }
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        if ((e.shiftKey || !this.hasPlaceholderAfterCursor()) && this.branchOf(this.editing)) { this.branchTab(e.shiftKey); return; }
        this.nextPlaceholder(); return;
      }
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.enterWeiter(); return; }
      // ↑/↓: übernehmen und das Einfügemenü über bzw. unter dem Kästchen öffnen.
      // In mehrzeiligem Text erst aus der ersten bzw. letzten Zeile heraus (sonst wechselt der Pfeil die Zeile).
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey) {
        const ta = this.editing.ta; const hoch = e.key === 'ArrowUp';
        const randzeile = hoch ? !ta.value.slice(0, ta.selectionStart).includes('\n') : !ta.value.slice(ta.selectionEnd).includes('\n');
        if (randzeile) { e.preventDefault(); this.enterWeiter(hoch); return; }
      }
      if (e.key === 'Escape') { e.preventDefault(); this.cancelEdit(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key === ' ') { e.preventDefault(); this.showCompletion(true); return; }
    }
    /* Verzweigung, in der gerade bearbeitet wird: Bedingung oder Anweisung direkt im Ja-/Nein-Zweig */
    branchOf(ed) {
      if (!ed) return null;
      if (ed.box.kind === 'if' && ed.field === 'cond') return { ifBox: ed.box, part: 'cond' };
      const s = Struktogramm.find(this.doc, ed.box.id);
      if (s && s.parent && s.parent.kind === 'if') { const part = s.list === s.parent.then ? 'then' : s.list === s.parent.else ? 'else' : null; if (part) return { ifBox: s.parent, part }; }
      return null;
    }
    /* Tab: Bedingung → Ja-Zweig → Nein-Zweig → Bedingung; Umschalt+Tab rückwärts */
    async branchTab(back) {
      const ed = this.editing; const br = this.branchOf(ed); if (!br) return;
      const order = ['cond', 'then', 'else'];
      const next = order[(order.indexOf(br.part) + (back ? 2 : 1)) % 3];
      if (ed.isNew && ed.box.kind === 'stmt' && !ed.ta.value.trim()) {
        // gerade eingefügte, leere Anweisung wieder entfernen
        this.editing = null; this.hideMenus();
        const s = Struktogramm.find(this.doc, ed.box.id); if (s && s.list) s.list.splice(s.index, 1);
        this.render(); this.changed();
      } else {
        await this.commitEdit();
        if (this.editing) return; // Rückfrage abgelehnt – weiter bearbeiten
      }
      const ifBox = br.ifBox;
      if (next === 'cond') { this.selected = ifBox.id; this.render(); this.editSelected(); return; }
      const list = ifBox[next];
      if (!list.length) { this.insert(list, 0, 'stmt', ''); return; }
      this.selected = list[0].id; this.render(); this.editSelected();
    }
    /* Platzhalter-Bereiche nach einer Änderung im Textfeld nachführen: überschriebene fallen weg, spätere verschieben sich */
    phSync(ed) {
      if (ed.slots) { this.phRender(ed); return; }
      const neu = ed.ta.value, alt = ed.last; ed.last = neu;
      if (ed.phs && alt !== neu) {
        let p = 0; const max = Math.min(alt.length, neu.length);
        while (p < max && alt[p] === neu[p]) p++;
        let q = 0; while (q < max - p && alt[alt.length - 1 - q] === neu[neu.length - 1 - q]) q++;
        const endAlt = alt.length - q, delta = neu.length - alt.length;
        ed.phs = ed.phs.filter(r => r.e <= p || r.s >= endAlt).map(r => r.s >= endAlt && !(r.e <= p) ? { s: r.s + delta, e: r.e + delta, art: r.art } : r);
      }
      this.phRender(ed);
    }
    phRender(ed) {
      // Anzeige unter dem (durchsichtigen) Textfeld als Liste von Stücken: { t: Text, k: Klasse, m: Lücken-Art, i: Lücken-Nr. }
      const v = ed.ta.value; const st = []; let i = 0;
      if (ed.slots) {
        // Lückentext: feste Wörter grau, Lücken farbig (Name blau, Wert gelb, Datentyp lila, Bedingung grün)
        ed.slots.forEach((r, n) => { st.push({ t: v.slice(i, r.s), k: 'lt-fx' }); st.push({ t: v.slice(r.s, r.e), m: r.a, i: n }); i = r.e; });
        st.push({ t: v.slice(i), k: 'lt-fx' });
        ed.stuecke = st; ed.ta.title = ''; this.ovRender(ed, true); return;
      }
      for (const r of (ed.phs || []).slice().sort((a, b) => a.s - b.s)) {
        if (r.s < i || r.e > v.length) continue;
        st.push({ t: v.slice(i, r.s) }); st.push({ t: v.slice(r.s, r.e), m: r.art, i: -1 }); i = r.e;
      }
      st.push({ t: v.slice(i) });
      ed.stuecke = st; this.ovRender(ed, true);
      ed.ta.title = ed.phs && ed.phs.length ? [...new Set(ed.phs.map(r => PH_TITEL[r.art]))].join(' · ') : '';
    }
    /* Markierung und Einfügemarke selbst zeichnen (24.10.2026, Guana: „Das muss immer ganz klar sein“):
       markierter Text dunkel hinterlegt mit weißer Schrift (wird beim Tippen ersetzt), Einfügemarke als kräftiger Strich,
       die Lücke, in der man gerade schreibt, als weißes Feld mit kräftigem Rahmen, die übrigen Lücken blass. */
    ovRender(ed, erzwingen) {
      const ta = ed.ta; const a = ta.selectionStart, b = ta.selectionEnd; const fokus = document.activeElement === ta;
      const schluessel = a + ':' + b + ':' + fokus + ':' + ta.value.length;
      if (!erzwingen && ed.ovSchluessel === schluessel) return;
      ed.ovSchluessel = schluessel;
      if (!ed.stuecke || ed.stuecke.reduce((n, x) => n + x.t.length, 0) !== ta.value.length) { this.phRender(ed); return; }
      const aktiv = ed.slots ? this.slotBei(ed, a, b) : -1;
      const ART = { name: 'name', wert: 'wert', typ: 'typ', bed: 'bed' };
      const marke = '<span class="sg-caret"></span>';
      // Stück, in dem die Einfügemarke steht: am Rand einer Lücke gehört sie in die Lücke
      let ziel = -1;
      if (fokus && a === b) {
        let p = 0;
        ed.stuecke.forEach((s, n) => { const von = p, bis = p + s.t.length; p = bis; if (a >= von && a <= bis && (ziel < 0 || (s.m != null && ed.stuecke[ziel].m == null))) ziel = n; });
      }
      let html = '', pos = 0;
      ed.stuecke.forEach((s, n) => {
        const von = pos, bis = pos + s.t.length; pos = bis;
        const teil = (x, y) => esc(s.t.slice(x - von, y - von));
        let innen;
        if (n === ziel) innen = teil(von, a) + marke + teil(a, bis);
        else if (fokus && a !== b) {
          const x = Math.max(von, Math.min(a, bis)), y = Math.max(von, Math.min(b, bis));
          innen = teil(von, x) + (y > x ? '<span class="sg-sel">' + teil(x, y) + '</span>' : '') + teil(y, bis);
        } else innen = teil(von, bis);
        if (s.m != null) {
          const kl = 'ph-' + (ART[s.m] || s.m) + (s.t.length === 0 ? ' leer' : '') + (ed.slots ? (s.i === aktiv && fokus ? ' aktiv' : ' still') : '');
          html += '<mark class="' + kl + '">' + (innen || '\u200b') + '</mark>';
        } else html += s.k ? '<span class="' + s.k + '">' + innen + '</span>' : innen;
      });
      ed.hl.innerHTML = html + '\n';
      ed.wrap.classList.toggle('sg-fokus', fokus);
    }
    hasPlaceholderAfterCursor() {
      const ed = this.editing, ta = ed.ta;
      if (ed.slots) return this.slotBei(ed, ta.selectionStart, ta.selectionEnd) < ed.slots.length - 1;
      if (ed.phs) return ed.phs.some(r => r.s >= ta.selectionEnd);
      const re = new RegExp(PLACE.source, 'g'); re.lastIndex = ta.selectionEnd; return !!re.exec(ta.value);
    }
    nextPlaceholder() {
      const ed = this.editing, ta = ed.ta; const v = ta.value; const from = ta.selectionEnd;
      if (ed.phs) {
        const rs = ed.phs.slice().sort((a, b) => a.s - b.s);
        const r = rs.find(x => x.s >= from) || rs[0];
        if (r) ta.setSelectionRange(r.s, r.e); else ta.setSelectionRange(v.length, v.length);
        return;
      }
      const re = new RegExp(PLACE.source, 'g'); re.lastIndex = from;
      let m = re.exec(v); if (!m) { re.lastIndex = 0; m = re.exec(v); }
      if (m) ta.setSelectionRange(m.index, m.index + m[0].length); else ta.setSelectionRange(v.length, v.length);
    }
    applyTemplate(tpl) {
      // {platzhalter} → platzhalter, ersten Platzhalter markieren
      const ed = this.editing; if (!ed) return;
      if (this.hilfen === false) { ed.ta.focus(); this.hideMenus(); return; } // ohne Hilfen: das Kästchen bleibt leer
      const clean = tpl.replace(/[{}]/g, '');
      const ta = ed.ta;
      const s = ta.selectionStart, e = ta.selectionEnd;
      const before = ta.value.slice(0, s), after = ta.value.slice(e);
      ta.value = before + clean + after;
      // Platzhalter des Bausteins merken (für Farbe und Tab)
      this.phSync(ed); if (!ed.phs) ed.phs = [];
      { const re = /\{([^}]+)\}/g; let mm, off = 0; while ((mm = re.exec(tpl))) { const st = before.length + mm.index - off; ed.phs.push({ s: st, e: st + mm[1].length, art: PH_ART[mm[1]] || 'wert' }); off += 2; } }
      this.phRender(ed);
      const m = /\{([^}]+)\}/.exec(tpl);
      if (m) { const idx = before.length + tpl.slice(0, m.index).replace(/[{}]/g, '').length; ta.setSelectionRange(idx, idx + m[1].length); }
      else ta.setSelectionRange(before.length + clean.length, before.length + clean.length);
      ta.dispatchEvent(new Event('input')); ta.focus(); this.hideMenus();
      // Baustein aus der Liste gewählt: ab jetzt Lückentext, die erste Lücke ist markiert
      if (!ed.slots && ed.field !== 'cond' && this.lueckentext() && !ed.box.frei) {
        const teile = zerlege(ta.value, ed.field);
        if (teile && teile.some(p => p.a)) { this.slotsSetzen(ed, teile); this.slotWaehlen(ed, 0); }
        else if (teile) { this.slotsSetzen(ed, teile); ta.setSelectionRange(ta.value.length, ta.value.length); }
      }
    }
    async insertText(text) {
      const tpl = text.replace(new RegExp(PLACE.source, 'g'), m => '{' + m + '}');
      if (this.editing) {
        if (!await this.declWarning(this.editing.box, text)) return;
        if (this.editing) { this.editing.declWarned = true; this.applyTemplate(tpl); }
        return;
      }
      const p = this.insertPoint();
      // Abfrage-Befehle (wahr/falsch) gehören in eine Bedingung: Klick legt gleich eine Verzweigung damit an (26.09.2026)
      const ms = Struktogramm.builtins().get(text.replace(/\(.*$/, ''));
      if (ms && ms[0].ret === 'boolean' && p.list !== this.doc.attributes) {
        this.snapshot(); const b = Struktogramm.B.if(text); p.list.splice(p.index, 0, b); this.vorSetzen(p.list, b, this.zoneVor);
        this.selected = b.id; this.render(); this.changed(); return;
      }
      const nb = this.insert(p.list, p.index, 'stmt', text);
      if (!/\{/.test(tpl) && nb) this.deklHinweis(nb.id);
      if (/\{/.test(tpl)) { this.editSelected(); const ed = this.editing; if (ed) { ed.declWarned = true; ed.ta.value = ''; this.applyTemplate(tpl); } }
    }
    /* Variablen, die beim Bearbeiten von box bekannt sind: Variablenbereich, Parameter und Deklarationen
       des Unterprogramms, in dem box steht (Zählvariablen müssen ohnehin deklariert sein) */
    variablenFuer(box) {
      const out = new Map();
      const re = /^Deklaration[^:]*:\s*([A-Za-zÄÖÜäöüß_][\wÄÖÜäöüß]*)\s+als\s+(Ganzzahl|Dezimalzahl|Zeichenkette|Wahrheitswert|Array)\b/;
      const reArr = /^Deklaration und Initialisierung:\s*([A-Za-zÄÖÜäöüß_][\wÄÖÜäöüß]*)\s*=\s*\[/; // Array ohne „als Array“
      const nimm = (b) => { if (b.kind !== 'stmt') return; const t = (b.text || '').trim(); const m = re.exec(t) || reArr.exec(t); if (m && !out.has(m[1])) out.set(m[1], m[2] || 'Array'); };
      for (const v of this.vorgaben) out.set(v.name, 'Array');
      this.doc.attributes.forEach(nimm);
      const meth = box && this.doc.methods.find(m => { let drin = false; Struktogramm.walk({ attributes: [], methods: [m] }, b => { if (b.id === box.id) drin = true; }); return drin; });
      if (meth) {
        for (const p of meth.params) if (p.name && !out.has(p.name)) out.set(p.name, p.type || 'Parameter');
        Struktogramm.walk({ attributes: [], methods: [meth] }, nimm);
      }
      return out;
    }
    /* Vorschläge: Textbausteine und Peetie-Befehle */
    candidates(prefix, field, afterAufruf, mode) {
      const p = prefix.trim().toLowerCase();
      const out = [];
      const T = { stmt: Struktogramm.templates('stmt'), loop: Struktogramm.templates('loop'), if: Struktogramm.templates('if') };
      if (mode && !p) {
        // Auswahl aus dem Einfügemenü: nur die passenden Vorschläge anbieten
        if (mode === 'var') {
          // Aufbau nach Guana (24.10.2026): oben „häufig benötigt“ (drei Bausteine), darunter „sonstige“ alphabetisch
          const vt = T.stmt.filter(t => /^(Deklaration|Initialisierung|Zuweisung|Einlesen)/.test(t.t));
          const haeufig = [
            ['Deklaration und Initialisierung: variable als Ganzzahl = wert', 'Deklaration und Initialisierung: variable als Datentyp = wert', null],
            ['Zuweisung: variable = wert', null, null],
            ['Einlesen: variable', null, 'Usereingabe einer bereits deklarierten Variablen zuweisen'],
          ];
          const out = [{ kopf: 'häufig benötigt' }];
          for (const [t, label, doc] of haeufig) { const x = vt.find(y => y.t === t); if (x) out.push({ label: label || x.t, insert: x.t, doc: doc || x.d, kind: 'op' }); }
          const rest = vt.filter(x => !haeufig.some(h => h[0] === x.t)).sort((a, b) => a.t.localeCompare(b.t, 'de'));
          if (rest.length) { out.push({ kopf: 'sonstige', abstand: true }); for (const x of rest) out.push({ label: x.t, insert: x.t, doc: x.d, kind: 'op' }); }
          return out;
        }
        if (mode === 'count') return T.loop.filter(t => !/^Wiederhole solange/.test(t.t) && !t.arr).reverse().concat(T.loop.filter(t => t.arr)).map(t => ({ label: t.t, insert: t.t, doc: t.d, kind: 'op' }));
        if (mode === 'call') return this.doc.methods.filter(m => m.name !== '_run').map(m => ({ label: 'Aufruf: ' + m.name + '(' + m.params.map(x => x.name).join(', ') + ')', insert: 'Aufruf: ' + m.name + '(' + m.params.map(x => '{' + x.name + '}').join(', ') + ')', doc: 'Eigenes Unterprogramm' + (m.rtype && m.rtype !== 'void' ? ' (liefert ' + m.rtype + ')' : ''), kind: 'user' }));
        if (mode === 'stmt') {
          const bl = Struktogramm.builtins();
          // Aufbau nach Guana (24.10.2026): „Peetie-Befehle“, dann „häufig benötigt“ in seiner Reihenfolge, Übriges unter „sonstige“
          const befehle = [];
          for (const g of SgEditor.GROUPS) for (const it of g.items) { const name = it.replace(/\(.*$/, ''); const ms = bl.get(name); if (ms && ms[0].ret === 'void' && this.sichtbar(name)) befehle.push({ label: it, insert: it, doc: Struktogramm.befehlText(name), kind: 'cmd', ret: ms[0].ret }); }
          if (befehle.length) out.push({ kopf: Struktogramm.TEXTE.befehle }, ...befehle);
          const ops = T.stmt.filter(t => /^(Ausgabe|Rückgabe)/.test(t.t));
          const haeufig = ['Ausgabe: variable', 'Ausgabe: "Text " + variable', 'Ausgabe: "Text " + variable + Zeilenumbruch', 'Ausgabe: array[index]']; // Guana 25.10.2026: Zeilenumbruch als Drittes, Rückgabe unter „sonstige“
          const h = haeufig.map(x => ops.find(t => t.t === x)).filter(Boolean);
          if (h.length) out.push({ kopf: 'häufig benötigt', abstand: out.length > 0 }, ...h.map(t => ({ label: t.t, insert: t.t, doc: t.d, kind: 'op' })));
          const rest = ops.filter(t => !haeufig.includes(t.t)).sort((a, b) => a.t.localeCompare(b.t, 'de'));
          if (rest.length) out.push({ kopf: 'sonstige', abstand: true }, ...rest.map(t => ({ label: t.t, insert: t.t, doc: t.d, kind: 'op' })));
          return out;
        }
      }
      const tpls = field === 'cond' ? [] : field === 'head' ? T.loop : T.stmt;
      // was mit dem Getippten anfängt, zuerst (26.10.2026: „Ausgabe: Zeilenumbruch“ vor „Ausgabe: "Text " + variable + Zeilenumbruch“)
      for (const t of tpls) if (!p || t.t.toLowerCase().startsWith(p)) out.push({ label: t.t, insert: t.t, doc: t.d, kind: 'op' });
      for (const t of tpls) if (p && !t.t.toLowerCase().startsWith(p) && t.t.toLowerCase().includes(p)) out.push({ label: t.t, insert: t.t, doc: t.d, kind: 'op' });
      if (field !== 'head' || true) {
        const bl = Struktogramm.builtins();
        const only = field === 'cond' ? (m) => m[0].ret === 'boolean' : null;
        for (const g of SgEditor.GROUPS) for (const it of g.items) {
          const name = it.replace(/\(.*$/, ''); const ms = bl.get(name); if (!ms) continue;
          if (only && !only(ms)) continue;
          if (!this.sichtbar(name)) continue;
          if (p && !name.toLowerCase().includes(p)) continue;
          out.push({ label: it, insert: it, doc: Struktogramm.befehlText(name), kind: 'cmd', ret: ms[0].ret });
        }
        for (const m of this.doc.methods) if (m.name !== '_run' && (!p || m.name.toLowerCase().includes(p))) {
          const call = m.name + '(' + m.params.map(x => '{' + x.name + '}').join(', ') + ')';
          const label = m.name + '(' + m.params.map(x => x.name).join(', ') + ')';
          out.push({ label: 'Aufruf: ' + label, insert: (field === 'text' && !afterAufruf) ? 'Aufruf: ' + call : call, doc: 'Eigenes Unterprogramm' + (m.rtype && m.rtype !== 'void' ? ' (liefert ' + m.rtype + ')' : ''), kind: 'user' });
        }
      }
      // AND, OR, NOT als Vorschlag in Bedingungen (06.10.2026)
      if ((field === 'cond' || field === 'head') && p && !/\s/.test(p)) for (const [w, d] of [['AND', 'und: beide Bedingungen müssen wahr sein'], ['OR', 'oder: mindestens eine Bedingung muss wahr sein'], ['NOT', 'nicht: kehrt die Bedingung um']])
        if (w.toLowerCase().startsWith(p) && (w === 'NOT' || this._davorText)) out.unshift({ label: w, insert: w + ' ', doc: d, kind: 'op' });
      return out.slice(0, 14);
    }
    showCompletion(force) {
      const ed = this.editing; if (!ed) return;
      if (this.hilfen === false) { document.querySelectorAll('.sg-ac').forEach(x => x.remove()); return; } // ohne Hilfen: keine Vorschläge
      if (ed.slots) { this.slotVorschlaege(ed, force); return; }
      const ta = ed.ta; const v = ta.value; const upto = v.slice(0, ta.selectionStart);
      // Wort vor dem Cursor (Operator-Präfixe einschließlich Leerzeichen zulassen)
      // In Bedingungen und Schleifenköpfen nur das letzte Wort (sonst findet „… AND leer“ nichts mehr; 06.10.2026)
      const word = (ed.field === 'text' ? /([A-Za-zÄÖÜäöüß_][\wÄÖÜäöüß ]*)$/ : /([A-Za-zÄÖÜäöüß_][\wÄÖÜäöüß]*)$/).exec(upto);
      const prefix = word ? word[1] : '';
      // innerhalb von Anführungszeichen (Text einer Ausgabe) nichts vorschlagen
      if (((upto.match(/"/g) || []).length % 2) === 1) { this.hideMenus(); return; }
      if (!force && !prefix && v.trim()) { this.hideMenus(); return; }
      const afterAufruf = /Aufruf:\s*$/.test(upto.slice(0, upto.length - prefix.length));
      this._davorText = !!upto.slice(0, upto.length - prefix.length).trim(); // AND/OR erst nach einer ersten Bedingung vorschlagen
      let cands = this.candidates(prefix, ed.field, afterAufruf, v.trim() ? null : ed.mode);
      // Im Variablenbereich gibt es nur Deklarationen – keine Peetie-Befehle, keine Ausgabe usw. (Guana, 13.10.2026)
      if (ed.field === 'text' && this.inAttributes(ed.box)) cands = Struktogramm.templates('stmt').filter(t => /^Deklaration/.test(t.t) && (!prefix.trim() || t.t.toLowerCase().includes(prefix.trim().toLowerCase()))).map(t => ({ label: t.t, insert: t.t, doc: t.d, kind: 'op' }));
      // „Anzahl der Elemente des Arrays …“ in Bedingungen und Schleifenköpfen
      if (ed.field !== 'text') { const az = this.anzahlVorschlaege(upto, ed.box); if (az) { this.vorschlagListe(ta, az.cands, az.prefix); return; } }
      // Variablen: passend zum letzten Wort vor dem Cursor, ganz oben. In einer Anweisung erst nach dem Operator
      // („Ausgabe:“, „Zuweisung:“ …) oder in Klammern – am Anfang eines Kästchens steht nie ein Variablenname.
      const lw = /([A-Za-zÄÖÜäöüß_][\wÄÖÜäöüß]*)$/.exec(upto); const wort = lw ? lw[1] : '';
      const vorWort = upto.slice(0, upto.length - wort.length);
      if (ed.field !== 'text' || /[:(]/.test(vorWort)) {
        const vars = [];
        for (const [n, t] of this.variablenFuer(ed.box)) if (wort ? n.toLowerCase().startsWith(wort.toLowerCase()) : force) vars.push({ label: n, insert: n, doc: t, kind: 'var', prefix: wort });
        // Name schon vollständig getippt: keine Liste (dann gehen ↑/↓ gleich zum Einfügemenü)
        if (!force && wort && vars.some(x => x.insert === wort)) { this.hideMenus(); return; }
        if (vars.length) {
          // hinter einem Operator wie „Ausgabe:“ passen keine Textbausteine mehr, nur noch Befehle (Prefix = letztes Wort)
          if (ed.field === 'text' && /:/.test(vorWort)) cands = cands.filter(c => c.kind !== 'op');
          cands = vars.concat(cands).slice(0, 14);
        }
      }
      // Ganze Zeile mit Operator getippt („Ausgabe: Zeilenumbru“, 26.10.2026): nur Bausteine, die mit der ganzen Zeile anfangen,
      // und die ersetzen beim Übernehmen die ganze Zeile (vorher wurde nur das letzte Wort ersetzt → „Ausgabe: Ausgabe: …“)
      if (ed.field === 'text') {
        const ganz = upto.replace(/^\s+/, '');
        if (/:/.test(ganz)) {
          const g = ganz.toLowerCase();
          cands = cands.filter(c => c.kind !== 'op' || c.insert.toLowerCase().startsWith(g)).map(c => (c.kind === 'op' ? Object.assign({}, c, { prefix: ganz }) : c));
        }
      }
      this.vorschlagListe(ta, cands, prefix);
    }
    /* „Anzahl der Elemente des Arrays x“ vervollständigen (Guana, 13.10.2026): sobald „Anz…“ getippt ist, für jedes bekannte Array */
    anzahlVorschlaege(upto, box) {
      const m = /(?:^|[^\wÄÖÜäöüß])(anz[a-zäöüß]*(?:\s+[A-Za-zÄÖÜäöüß_][\wÄÖÜäöüß]*)*\s?)$/i.exec(upto); if (!m) return null;
      const getippt = m[1]; const klein = getippt.toLowerCase();
      const arrays = [...this.variablenFuer(box)].filter(([, t]) => /^Array/.test(t) || (t === 'Parameter' && Struktogramm.arraysErlaubt)).map(([n]) => n);
      const cands = arrays.map(n => 'Anzahl der Elemente des Arrays ' + n).filter(t => t.toLowerCase().startsWith(klein) && t.length > getippt.length)
        .map(t => ({ label: t, insert: t, doc: 'Anzahl der Elemente', kind: 'var', prefix: getippt }));
      // Noch kein passendes Array bekannt (z. B. noch nicht oder fehlerhaft deklariert): wenigstens die festen Wörter anbieten, den Namen tippt man dazu (24.10.2026)
      const vorlage = 'Anzahl der Elemente des Arrays ';
      if (!cands.length && Struktogramm.arraysErlaubt && vorlage.toLowerCase().startsWith(klein) && vorlage.length > getippt.length)
        cands.push({ label: vorlage + '…', insert: vorlage, doc: 'Anzahl der Elemente', kind: 'var', prefix: getippt });
      return cands.length ? { cands, prefix: getippt } : null;
    }
    /* Vorschlagsliste unter dem Textfeld */
    vorschlagListe(ta, cands, prefix) {
      document.querySelectorAll('.sg-ac').forEach(x => x.remove());
      if (!cands.length) return;
      const ac = $('div', 'sg-ac'); ac.dataset.prefix = prefix;
      for (const c of cands) {
        if (c.sep) { if (ac.lastChild) ac.appendChild($('div', 'sg-sep')); continue; }
        if (c.kopf) { ac.appendChild($('div', 'sg-ackopf' + (c.abstand ? ' abstand' : ''), c.kopf)); continue; } // kleine Zwischenüberschrift (24.10.2026)
        const it = $('div', 'sg-aci ' + c.kind); const l = $('span', 'lbl', c.label); it.appendChild(l);
        if (c.doc) { const d = $('span', 'doc', c.doc.split('\n')[0]); it.appendChild(d); }
        it.dataset.insert = c.insert; if (c.prefix != null) it.dataset.prefix = c.prefix;
        it.onmouseenter = () => { this.acHover = true; }; it.onmouseleave = () => { this.acHover = false; };
        it.onmousedown = (e) => { e.preventDefault(); e.stopPropagation(); this.acceptCompletion(it); };
        ac.appendChild(it);
      }
      ac.querySelector('.sg-aci').classList.add('sel');
      const r = ta.getBoundingClientRect();
      ac.style.left = Math.max(4, r.left) + 'px'; ac.style.top = (r.bottom + 2) + 'px';
      if (r.bottom + 360 > innerHeight) { ac.style.top = 'auto'; ac.style.bottom = (innerHeight - r.top + 2) + 'px'; }
      document.body.appendChild(ac);
      // nach rechts nicht über den Rand: so weit nach links schieben wie nötig (Breite ergibt sich erst nach dem Einhängen)
      const br = ac.getBoundingClientRect(); if (br.right > innerWidth - 4) ac.style.left = Math.max(4, innerWidth - 4 - br.width) + 'px';
    }
    /* Vorschläge in einer Lücke: passende Variablen, Befehle mit Ergebnis, eigene Unterprogramme; keine Bausteine (die Wörter stehen ja schon) */
    slotVorschlaege(ed, force) {
      const ta = ed.ta; const i = this.slotBei(ed, ta.selectionStart, ta.selectionEnd); const r = ed.slots[i];
      if (!r) { this.hideMenus(); return; }
      if (r.a === 'typ') { this.typMenue(ed); return; }
      const v = ta.value; const upto = v.slice(r.s, ta.selectionStart);
      if (((upto.match(/"/g) || []).length % 2) === 1) { this.hideMenus(); return; }
      const davor = v.slice(0, r.s);
      if (r.a !== 'name') { const az = this.anzahlVorschlaege(upto, ed.box); if (az) { this.vorschlagListe(ta, az.cands, az.prefix); return; } }
      const w = /([A-Za-zÄÖÜäöüß_][\wÄÖÜäöüß]*)$/.exec(upto); const wort = w ? w[1] : '';
      if (!force && !wort) { this.hideMenus(); return; }
      // Name einer neuen Variablen (Deklaration): nichts vorschlagen, der Name ist neu
      if (r.a === 'name' && /^Deklaration/.test(davor)) { this.hideMenus(); return; }
      let cands = [];
      const vars = [];
      for (const [n, t] of this.variablenFuer(ed.box)) if (!wort || n.toLowerCase().startsWith(wort.toLowerCase())) vars.push({ label: n, insert: n, doc: t, kind: 'var', prefix: wort });
      if (!force && wort && vars.some(x => x.insert === wort) && vars.length === 1) { this.hideMenus(); return; }
      if (r.a === 'name') {
        if (/^Aufruf/.test(davor)) cands = this.doc.methods.filter(m => m.name !== '_run' && m.name.toLowerCase().startsWith(wort.toLowerCase())).map(m => ({ label: m.name, insert: m.name, doc: 'Eigenes Unterprogramm', kind: 'user', prefix: wort }));
        else cands = vars;
      } else {
        this._davorText = !!upto.slice(0, upto.length - wort.length).trim();
        const andere = this.candidates(wort, r.a === 'bed' ? 'cond' : 'text', true, null).filter(c => c.kind !== 'op' || /^(AND|OR|NOT) $/.test(c.insert)).filter(c => !(c.kind === 'cmd' && c.ret === 'void'));
        for (const c of andere) { c.prefix = wort; if (c.kind === 'user') c.insert = c.insert.replace(/^Aufruf:\s*/, ''); }
        // „Zeilenumbruch“ (Operatorenliste) am Ende einer Ausgabe anhängen: „… + Zeilenumbruch“ (Guana, 13.10.2026)
        const zu = r.a === 'wert' && wort && 'zeilenumbruch'.startsWith(wort.toLowerCase()) && wort.length < 13 ? [{ label: 'Zeilenumbruch', insert: 'Zeilenumbruch', doc: 'neue Zeile in der Ausgabe', kind: 'var', prefix: wort }] : [];
        cands = zu.concat(vars, andere).slice(0, 14);
      }
      this.vorschlagListe(ta, cands, wort);
    }
    async acceptCompletion(item) {
      const ed = this.editing; if (!ed) return;
      const ta = ed.ta; const prefix = item.dataset.prefix != null ? item.dataset.prefix : (document.querySelector('.sg-ac')?.dataset.prefix || '');
      if (item.dataset.typ) { this.typSetzen(ed, item.dataset.typ, true); return; }
      if (ed.slots) {
        // Lückentext: Vorschlag (Variable, Befehl) nur innerhalb der Lücke einsetzen
        const s0 = ta.selectionStart - prefix.length; let end = ta.selectionEnd;
        const ins = item.dataset.insert.replace(/[{}]/g, '');
        if (/\)$/.test(ins)) { const rest = /^\s*\([^()]*\)/.exec(ta.value.slice(end)); if (rest && this.slotBei(ed, s0, end + rest[0].length) >= 0) end += rest[0].length; }
        this.hideMenus(); this.acHover = false;
        if (!this.slotErsetzen(ed, Math.max(0, s0), end, ins)) return;
        // Befehl mit Parametern (z. B. wartenSekunden(1)): die Zahl gleich markieren
        const m = /\(([^()]+)\)$/.exec(ins); if (m) { const p = ta.selectionStart - 1 - m[1].length; ta.setSelectionRange(p, p + m[1].length); }
        return;
      }
      if (/^Deklaration/.test(item.dataset.insert) && ed.field === 'text' && !this.inAttributes(ed.box)) {
        this.hideMenus();
        if (!await this.declWarning(ed.box, item.dataset.insert)) return;
        if (this.editing !== ed) return;
        ed.declWarned = true;
      }
      const s = ta.selectionStart - prefix.length;
      let end = ta.selectionEnd;
      const ins = item.dataset.insert;
      if (/\)$/.test(ins)) { const rest = /^\s*\([^()]*\)/.exec(ta.value.slice(end)); if (rest) end += rest[0].length; }
      ta.setSelectionRange(Math.max(0, s), end);
      const tpl = ins.replace(new RegExp(PLACE.source, 'g'), (m) => '{' + m + '}');
      this.applyTemplate(tpl);
      this.acHover = false;
    }

    /* ---------------- Unterprogramme */
    addMethod() {
      this.methodDialog(null, (r) => { this.snapshot(); const m = Struktogramm.B.method(r.name, r.params, r.rtype); this.doc.methods.push(m); this.afterChange(); });
    }
    editMethod(m) {
      this.methodDialog(m, (r) => { if (r === 'delete') { this.snapshot(); this.doc.methods = this.doc.methods.filter(x => x !== m); this.afterChange(); return; } this.snapshot(); m.name = r.name; m.params = r.params; m.rtype = r.rtype; this.afterChange(); });
    }
    methodDialog(m, done) {
      this.hideMenus();
      const back = $('div', 'dlg-back'); const d = $('div', 'dlg sg-mdlg');
      d.innerHTML = `<h3>${m ? 'Unterprogramm bearbeiten' : 'Neues Unterprogramm'}</h3>
        <label>Name<br><input id="sgmName" placeholder="z. B. zentrifugieren"></label>
        <label>Parameter (nur die Namen, durch Komma getrennt, z. B. <i>anzahl, grenze</i>)<br><input id="sgmParams" placeholder="anzahl"></label>
        <label>Rückgabe<br><select id="sgmRet"><option value="void">keine (Prozedur)</option><option>Ganzzahl</option><option>Dezimalzahl</option><option>Zeichenkette</option><option>Wahrheitswert</option></select></label>
        <p class="sg-derr" style="color:#b00;min-height:1.2em"></p><div class="btns"></div>`;
      const name = d.querySelector('#sgmName'), params = d.querySelector('#sgmParams'), ret = d.querySelector('#sgmRet'), derr = d.querySelector('.sg-derr'), btns = d.querySelector('.btns');
      if (m) { name.value = m.name; params.value = m.params.map(p => p.name).join(', '); ret.value = m.rtype || 'void'; }
      const close = () => back.remove();
      const ok = () => {
        const n = name.value.trim();
        if (!/^[a-z][A-Za-z0-9_]*$/.test(n)) { derr.textContent = Struktogramm.nameFehler(n, 'Name für ein Unterprogramm') || 'Name: Kleinbuchstabe am Anfang, dann Buchstaben/Ziffern, keine Leerzeichen (z. B. zentrifugieren)'; return; }
        if (n === '_run' || this.doc.methods.some(x => x !== m && x.name === n)) { derr.textContent = 'Diesen Namen gibt es schon'; return; }
        if (Struktogramm.builtins().has(n) || typeof Interp.Host.basis().prototype[n] === 'function') { derr.textContent = 'So heißt schon ein ' + Struktogramm.TEXTE.befehl; return; }
        const ps = []; const raw = params.value.trim();
        if (raw) for (const part of raw.split(',')) {
          // nur der Name; der Datentyp ergibt sich aus dem Aufruf. Ein angehängtes „als …“ wird einfach weggelassen
          const pm = /^\s*([a-z][A-Za-z0-9_]*)(?:\s+als\b.*)?\s*$/.exec(part);
          if (!pm) { derr.textContent = Struktogramm.nameFehler(String(part).replace(/\s+als\s+.*$/, ''), 'Parametername') || 'Parameter: nur die Namen, durch Komma getrennt (z. B. anzahl, grenze) – Kleinbuchstabe am Anfang, keine Leerzeichen'; return; }
          if (ps.some(x => x.name === pm[1])) { derr.textContent = 'Parameter ' + pm[1] + ' doppelt'; return; }
          const alt = m && m.params.find(x => x.name === pm[1]);
          ps.push({ name: pm[1], type: alt ? alt.type : '' });
        }
        close(); done({ name: n, params: ps, rtype: ret.value });
      };
      const mk = (t, fn, cls) => { const b = $('button', 'fxbtn' + (cls ? ' ' + cls : ''), t); b.onclick = fn; btns.appendChild(b); };
      if (m) mk('Löschen', () => { if (m.body.length && !confirm('Unterprogramm „' + m.name + '“ mit Inhalt löschen?')) return; close(); done('delete'); }, 'danger');
      mk('Abbrechen', close); mk('OK', ok);
      d.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); ok(); } if (e.key === 'Escape') close(); e.stopPropagation(); });
      back.appendChild(d); document.body.appendChild(back); name.focus();
    }

    /* ---------------- Tastatur */
    onKey(e) {
      if (this.editing) return;
      if (this.insMenu && this.insMenuKey(e)) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); this.undo(); return; }
      if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); this.redo(); return; }
      if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); this.duplicate(); return; }
      if (mod && e.key === '.') { e.preventDefault(); this.gotoNextError(); return; }
      if (mod && e.key.toLowerCase() === 'v') { e.preventDefault(); this.paste(); return; }
      if (e.key === 'Escape' && this.moving) { this.cancelMove(); return; }
      if (!this.selected) return;
      if (mod && e.key.toLowerCase() === 'c') { e.preventDefault(); this.copy(); return; }
      if (mod && e.key.toLowerCase() === 'x') { e.preventDefault(); this.cut(); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); this.remove(); return; }
      if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); this.editSelected(); return; }
      if (e.key === 'Escape') { this.select(null); return; }
      if (e.altKey && e.key === 'ArrowUp') { e.preventDefault(); this.move(-1); return; }
      if (e.altKey && e.key === 'ArrowDown') { e.preventDefault(); this.move(1); return; }
    }

    /* ---------------- Seitenleiste */
    /* Welche Peetie-Befehle die Mission anbietet (Seitenleiste, Vorschläge); „alle Befehle zeigen“ blendet alle ein */
    setMission(key, art) { this.mission = key || null; this.art = art || null; this.side.innerHTML = ''; this.buildSide(); }
    sichtbar(name) { return !!this.opts.alleBefehle && this.opts.alleBefehle.get() || Struktogramm.befehlSichtbar(name, this.mission, this.art); }
    /* Befehlsübersicht neben dem Editor: macht die Anwendung (Escape from Mars: js/peetie-befehle.js) */
    buildSide() { }
  }
  SgEditor.Editor = Editor;
})();
