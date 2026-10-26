/*
 * Struktogramm-Modell: Dokumentformat, Übersetzung Struktogramm → Programmbaum
 * (nach der Operatorenliste für Struktogramme des BW-Abiturs, Version 2.2) und zurück.
 *
 * Dokument: { format: 'efm-struktogramm', version: 1, name: 'Programmname', attributes: [Box], methods: [Method] }
 * Method:   { id, name, params: [{ name, type }], rtype, body: [Box] }   (Typen deutsch: Ganzzahl, Dezimalzahl, Zeichenkette, Wahrheitswert)
 * Box:      { id, kind: 'stmt', text } | { id, kind: 'if', cond, then: [Box], else: [Box] } | { id, kind: 'loop', head, body: [Box] }
 */
'use strict';
window.Struktogramm = {}; // nur als Eigenschaft von window, kein const – sonst bricht eine Seite ab, die selbst schon „Struktogramm“ kennt (26.10.2026)

(function () {
  let uid = 1;
  const newId = () => 's' + (uid++) + '_' + Math.random().toString(36).slice(2, 6);
  Struktogramm.newId = newId;

  const TYPES = { Ganzzahl: 'int', Dezimalzahl: 'double', Zeichenkette: 'String', Wahrheitswert: 'boolean' };
  const TYPES_DE = { int: 'Ganzzahl', double: 'Dezimalzahl', String: 'Zeichenkette', boolean: 'Wahrheitswert', long: 'Ganzzahl', float: 'Dezimalzahl',
    // Arrays (Operatorenliste 2.2): intern eine wachsende Liste List<elementtyp> („das sieht ja keiner“, Guana 29.09.2026)
    'List<int>': 'Array (Ganzzahlen)', 'List<double>': 'Array (Dezimalzahlen)', 'List<String>': 'Array (Zeichenketten)', 'List<boolean>': 'Array (Wahrheitswerte)', 'List<?>': 'Array' };
  Struktogramm.TYPES = TYPES; Struktogramm.TYPES_DE = TYPES_DE;
  const isArrayType = (t) => typeof t === 'string' && t.startsWith('List<');
  const elemType = (t) => (isArrayType(t) ? t.slice(5, -1) : null);
  const arrayOf = (e) => 'List<' + e + '>';
  Struktogramm.isArrayType = isArrayType; Struktogramm.elemType = elemType;
  const TYP_PL = { int: 'Ganzzahlen', double: 'Dezimalzahlen', String: 'Zeichenketten', boolean: 'Wahrheitswerte' };
  /* „eine Ganzzahl“, „ein Array von Zeichenketten“ … für Fehlermeldungen */
  function typName(t) {
    if (!t) return 'unbekannt';
    if (isArrayType(t)) { const e = elemType(t); return e === '?' ? 'ein leeres Array' : 'ein Array von ' + (TYP_PL[e] || e); }
    return { int: 'eine Ganzzahl', long: 'eine Ganzzahl', double: 'eine Dezimalzahl', float: 'eine Dezimalzahl', String: 'eine Zeichenkette', boolean: 'ein Wahrheitswert', void: 'nichts' }[t] || t;
  }
  const TYPE_LIST = Object.keys(TYPES);
  /* Parameter von Unterprogrammen: auch Arrays (Abi-Drill 9, 07.10.2026) – der Elementtyp muss im Kopf stehen */
  const PARAM_TYPES = Object.assign({}, TYPES, { 'Array von Ganzzahlen': 'List<int>', 'Array von Dezimalzahlen': 'List<double>', 'Array von Zeichenketten': 'List<String>', 'Array von Wahrheitswerten': 'List<boolean>' });
  Struktogramm.PARAM_TYPES = PARAM_TYPES;

  /* ------------------------------------------------ Konstruktoren */
  const B = {
    stmt: (text) => ({ id: newId(), kind: 'stmt', text: text || '' }),
    if: (cond, then, els) => ({ id: newId(), kind: 'if', cond: cond || '', then: then || [], else: els || [] }),
    loop: (head, body) => ({ id: newId(), kind: 'loop', head: head || '', body: body || [] }),
    method: (name, params, rtype, body) => ({ id: newId(), name: name || '', params: params || [], rtype: rtype || 'void', body: body || [] })
  };
  Struktogramm.B = B;
  Struktogramm.newDoc = (name) => ({ format: 'efm-struktogramm', version: 1, name: name || '', attributes: [], methods: [B.method('_run')] });
  Struktogramm.clone = (d) => {
    const c = JSON.parse(JSON.stringify(d));
    (function re(x) { if (Array.isArray(x)) x.forEach(re); else if (x && typeof x === 'object') { if (x.id) x.id = newId(); Object.values(x).forEach(re); } })(c);
    return c;
  };
  /* Seit 13.10.2026 (Guana) gibt es keinen eigenen Variablenbereich mehr: Variablen werden im Hauptprogramm (bzw. im Unterprogramm)
     deklariert und gelten nur dort. Alte Stände mit „attributes“ werden beim Laden vorn ins Hauptprogramm geschoben. */
  Struktogramm.vereinen = function (doc) {
    if (doc && doc.attributes && doc.attributes.length) {
      let run = doc.methods.find(m => m.name === '_run'); if (!run) { run = B.method('_run'); doc.methods.unshift(run); }
      run.body = doc.attributes.concat(run.body); doc.attributes = [];
    }
    return doc;
  };
  /* Anzahl der Deklarationen ganz am Anfang einer Liste (Missionsrahmen: sie stehen vor dem Rahmen und laufen nur einmal) */
  Struktogramm.istDeklaration = (b) => !!b && b.kind === 'stmt' && /^Deklaration/.test(String(b.text || '').trim());
  /* Seit 24.10.2026 (Guana: Variablen, die man in der Missionsschleife deklariert, hüpften nach oben): Kästchen vor dem Rahmen tragen
     das Merkmal vor: true, sobald der Editor das Hauptprogramm einmal geordnet hat (m.vorFest). Ohne vorFest (alte Speicherstände,
     Dateien, Musterlösungen) gilt die alte Regel: alle Deklarationen ganz am Anfang. */
  Struktogramm.vorspann = function (list, m) {
    let k = 0;
    if (m && m.vorFest) { while (k < list.length && list[k].vor) k++; return k; }
    while (k < list.length && Struktogramm.istDeklaration(list[k])) k++; return k;
  };
  /* Merkmal vor an allen Kästchen des Hauptprogramms festschreiben (nur mit Missionsrahmen) */
  Struktogramm.vorOrdnen = function (m) {
    const k = Struktogramm.vorspann(m.body, m);
    m.body.forEach((b, i) => { if (i < k) b.vor = true; else delete b.vor; });
    m.vorFest = true;
  };
  Struktogramm.walk = function (doc, fn) {
    const rec = (list, parent, key) => list.forEach((b, i) => { fn(b, list, i, parent); if (b.kind === 'if') { rec(b.then, b, 'then'); rec(b.else, b, 'else'); } else if (b.kind === 'loop') rec(b.body, b, 'body'); });
    rec(doc.attributes, doc, 'attributes');
    for (const m of doc.methods) rec(m.body, m, 'body');
  };
  Struktogramm.find = function (doc, id) {
    let r = null;
    Struktogramm.walk(doc, (b, list, i, parent) => { if (b.id === id) r = { box: b, list, index: i, parent }; });
    if (!r) for (const m of doc.methods) if (m.id === id) r = { method: m };
    return r;
  };

  /* ------------------------------------------------ Laden / Speichern */
  Struktogramm.parse = function (text) {
    const raw = JSON.parse(text);
    if (!raw || raw.format !== 'efm-struktogramm') throw new Error(Struktogramm.TEXTE.keineDatei);
    const box = (b) => {
      if (!b || typeof b !== 'object') throw new Error('Ungültiges Element');
      const c = b.kind === 'stmt' ? B.stmt(String(b.text || '')) : b.kind === 'if' ? B.if(String(b.cond || ''), (b.then || []).map(box), (b.else || []).map(box))
        : b.kind === 'loop' ? B.loop(String(b.head || ''), (b.body || []).map(box)) : null;
      if (!c) throw new Error('Unbekannter Elementtyp: ' + b.kind);
      if (b.vor === true) c.vor = true; // vor dem Missionsrahmen (24.10.2026)
      if (b.frei === true) c.frei = true;
      return c;
    };
    const doc = Struktogramm.newDoc(typeof raw.name === 'string' ? raw.name : '');
    doc.attributes = (raw.attributes || []).map(box);
    doc.methods = (raw.methods || []).map(m => { const meth = B.method(String(m.name || ''), (m.params || []).map(p => ({ name: String(p.name || ''), type: String(p.type || 'Ganzzahl') })), String(m.rtype || 'void'), (m.body || []).map(box)); if (m.vorFest === true) meth.vorFest = true; return meth; });
    if (!doc.methods.some(m => m.name === '_run')) doc.methods.unshift(B.method('_run'));
    return Struktogramm.vereinen(doc);
  };
  Struktogramm.stringify = function (doc) {
    const strip = (b) => { const o = b.kind === 'stmt' ? { kind: 'stmt', text: b.text } : b.kind === 'if' ? { kind: 'if', cond: b.cond, then: b.then.map(strip), else: b.else.map(strip) } : { kind: 'loop', head: b.head, body: b.body.map(strip) }; if (b.vor) o.vor = true; if (b.frei) o.frei = true; return o; };
    return JSON.stringify({ format: 'efm-struktogramm', version: 1, name: doc.name || '', attributes: doc.attributes.map(strip), methods: doc.methods.map(m => { const o = { name: m.name, params: m.params, rtype: m.rtype, body: m.body.map(strip) }; if (m.vorFest) o.vorFest = true; return o; }) }, null, 2);
  };

  /* ------------------------------------------------ Befehle (aus der API-Tabelle, Interp.API.AI_Robot) */
  /* Texte, die von der Anwendung abhängen (Escape from Mars: js/peetie-befehle.js) */
  Struktogramm.TEXTE = {
    keineDatei: 'Das ist keine Struktogramm-Datei.',
    befehl: 'Befehl', befehle: 'Befehle',
    befehlBeispiel: '',                     // z. B. geheRechts() – leer: keine Befehle außer den Operatoren
    anweisungMenue: 'Ausgabe, Rückgabe',    // Erklärung beim Eintrag „Anweisung“ im Einfügemenü
    hauptprogrammTitel: 'Das Hauptprogramm läuft beim Start'
  };
  // Befehle der API-Tabelle, die kein Befehl für die Schüler sind
  Struktogramm.GESPERRT = new Set();
  /* Kurzbeschreibung der Befehle für die Übersicht und die Vorschlagslisten */
  Struktogramm.BEFEHL_TEXT = {};
  Struktogramm.befehlText = (name) => Struktogramm.BEFEHL_TEXT[name] || '';
  /* Welche Befehle angeboten werden (Seitenleiste, Vorschläge); mission/art: von der Anwendung (Escape from Mars: Mission, Missionsart) */
  Struktogramm.befehlSichtbar = function (name, mission, art) { return true; };
  /* Befehle einer Aufgabe (Abi-Drill): gelten nur, wenn sie in Struktogramm.abiErlaubt stehen; Aliase: Bedingungen in Worten */
  Struktogramm.aufgabenBefehle = {};
  Struktogramm.aufgabenAliase = {};
  function builtins() {
    const out = new Map();
    const api = window.Interp && Interp.API && Interp.API.AI_Robot;
    if (!api) return out;
    // Abi-Drill (07.10.2026): dort gelten nur die Befehle der Aufgabe (Struktogramm.abiErlaubt, von app.js gesetzt), außerhalb keine Abi-Befehle
    const abi = Struktogramm.abiErlaubt, abiNamen = Struktogramm.aufgabenBefehle || {};
    for (const [name, list] of Object.entries(api.m)) {
      if (name.startsWith('_') || ['act', 'addedToWorld'].includes(name) || Struktogramm.GESPERRT.has(name)) continue;
      if (abi ? !(abi.includes(name) || /^(textAusgeben|einlesen)/.test(name)) : Object.prototype.hasOwnProperty.call(abiNamen, name)) continue;
      for (const m of list) if (m.access !== 'private') { if (!out.has(name)) out.set(name, []); out.get(name).push(m); }
    }
    return out;
  }
  Struktogramm.builtins = builtins;

  /* ------------------------------------------------ Ausdrücke: BW-Schreibweise → Java */
  class TransError extends Error { constructor(msg) { super(msg); this.name = 'TransError'; } }
  /* „ oder sind ein Peetie-Befehl (z. B. geheRechts())“ – nur, wenn die Anwendung Befehle hat */
  const oderBefehl = (verb) => Struktogramm.TEXTE.befehlBeispiel ? ` oder ${verb ? verb + ' ' : ''}ein ${Struktogramm.TEXTE.befehl} (z. B. ${Struktogramm.TEXTE.befehlBeispiel})` : '';

  // Zeichenketten sicher aussparen, Rest wortweise ersetzen
  function preJava(text) {
    let out = '', i = 0; const n = text.length;
    const q = /["„“”]/;
    while (i < n) {
      const c = text[i];
      if (q.test(c)) {
        let j = i + 1; while (j < n && !q.test(text[j])) { if (text[j] === '\\') j++; j++; }
        out += '"' + text.slice(i + 1, j) + '"'; i = j + 1; continue;
      }
      let j = i; while (j < n && !q.test(text[j])) j++;
      let seg = text.slice(i, j);
      seg = seg.replace(/\bAnzahl der Elemente (?:des|eines) Arrays\s+([A-Za-z_]\w*)/g, '$1.size()');
      seg = seg.replace(/\bAufruf:\s*/g, '');
      seg = seg.replace(/\bZeilenumbruch\b/g, '"\\n"');
      seg = seg.replace(/\bAND\b/g, '&&').replace(/\bOR\b/g, '||').replace(/\bNOT\b/g, '!');
      seg = seg.replace(/\bund\b/g, '&&').replace(/\boder\b/g, '||').replace(/\bnicht\b/g, '!');
      seg = seg.replace(/\bUND\b/g, '&&').replace(/\bODER\b/g, '||').replace(/\bNICHT\b/g, '!'); // Schreibweise der Prüfungsaufgaben (Abi-Drill, 07.10.2026)
      seg = seg.replace(/≠/g, '!=').replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/[·×]/g, '*').replace(/÷/g, '/');
      seg = abiAliase(seg);
      out += seg; i = j;
    }
    return notKlammern(out);
  }

  /* Abi-Drill: Bedingungen in Worten aus den Prüfungsaufgaben („Ball oben“) stehen für Befehle der Aufgabe (Struktogramm.aufgabenAliase) */
  function abiAliase(seg) {
    const erlaubt = Struktogramm.abiErlaubt, al = Struktogramm.aufgabenAliase;
    if (!Array.isArray(erlaubt) || !al) return seg;
    for (const [wort, befehl] of Object.entries(al)) if (erlaubt.includes(befehl)) seg = seg.replace(new RegExp('(^|[^\\wÄÖÜäöüß])' + wort.replace(/ /g, '\\s+') + '(?![\\wÄÖÜäöüß])', 'g'), '$1' + befehl + '()');
    return seg;
  }

  /* NOT/NICHT gilt für den ganzen Vergleich dahinter: „NICHT z == 22“ → !(z == 22) (07.10.2026; wie es in den Prüfungsaufgaben gemeint ist).
     Endet am nächsten && oder || bzw. an der schließenden Klammer. Für Wahrheitswerte ändert das nichts (!a == b ist dasselbe wie !(a == b)). */
  function notKlammern(s) {
    let out = '', i = 0;
    const n = s.length;
    while (i < n) {
      const c = s[i];
      if (c === '"') { let j = i + 1; while (j < n && s[j] !== '"') { if (s[j] === '\\') j++; j++; } out += s.slice(i, j + 1); i = j + 1; continue; }
      if (c === '!' && s[i + 1] !== '=') {
        let k = i + 1; while (k < n && s[k] === ' ') k++;
        let j = k, tiefe = 0;
        while (j < n) {
          const d = s[j];
          if (d === '"') { j++; while (j < n && s[j] !== '"') { if (s[j] === '\\') j++; j++; } j++; continue; }
          if (d === '(' || d === '[') tiefe++;
          else if (d === ')' || d === ']') { if (tiefe === 0) break; tiefe--; }
          else if (tiefe === 0 && (s.startsWith('&&', j) || s.startsWith('||', j) || d === ',')) break;
          j++;
        }
        const operand = s.slice(k, j).trim();
        // schon geklammert („NOT (z == 22)“) oder ein einzelner Name/Aufruf: unverändert
        const ganzGeklammert = /^\((.*)\)$/.test(operand) && klammerPasst(operand);
        out += (ganzGeklammert || /^[A-Za-z_][\w.]*(\(.*\))?$/.test(operand) && klammerPasst(operand.replace(/^[^(]*/, '') || '()')) ? '!' + notKlammern(operand) : '!(' + notKlammern(operand) + ')';
        if (j < n && s[j - 1] === ' ') out += ' ';
        i = j; continue;
      }
      out += c; i++;
    }
    return out;
  }
  function klammerPasst(t) { let d = 0; for (let i = 0; i < t.length; i++) { if (t[i] === '(') d++; else if (t[i] === ')') { d--; if (d === 0 && i < t.length - 1) return false; } } return d === 0; }

  /* Symboltabelle: Variablen (Name → Java-Typ), Unterprogramme des Nutzers */
  class Scope {
    constructor(parent) { this.parent = parent; this.vars = new Map(); }
    lookup(n) { return this.vars.has(n) ? this.vars.get(n) : this.parent ? this.parent.lookup(n) : undefined; }
    lookupEntry(n) { return this.vars.has(n) ? this.vars.get(n) : this.parent ? this.parent.lookupEntry(n) : undefined; }
    has(n) { return this.lookup(n) !== undefined; }
    declare(n, t) { this.vars.set(n, { type: t }); }
  }

  /* Arrays nur im Array Trainingscamp; sonst eine klare Meldung statt der Array-Schreibweise */
  /* Abi-Drill aktiv (app.js setzt Struktogramm.abiErlaubt auf die Befehle der Aufgabe, sonst null) */
  function abiModus() { return Array.isArray(Struktogramm.abiErlaubt); }
  /* Prüfungsaufgaben vergleichen in Bedingungen auch mit einem einzelnen = („i = 4 ODER i = 5“) */
  function abiVergleich(t) {
    if (!abiModus()) return t;
    return String(t).split(/("[^"]*"|„[^“”]*[“”])/).map((x, i) => i % 2 ? x : x.replace(/([^<>=!])=(?!=)/g, '$1==')).join('');
  }
  /* Namen von Variablen, Unterprogrammen und Parametern (24.10.2026, Guana: „In Variablennamen dürfen keine Umlaute und keine
     Sonderzeichen vorkommen“ – aber mit einer Meldung, die sagt, was los ist): null = in Ordnung, sonst die Meldung */
  function nameFehler(n, art) {
    n = String(n || '').trim(); if (!n || /^[A-Za-z_]\w*$/.test(n)) return null;
    art = art || 'Variablenname';
    const ersatz = n.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue').replace(/ß/g, 'ss')
      .replace(/\s+(\S)/g, (m, c) => c.toUpperCase()).replace(/[^A-Za-z0-9_]/g, '');
    const vorschlag = /^[A-Za-z_]\w*$/.test(ersatz) && ersatz !== n ? `. Schreib zum Beispiel „${ersatz}“` : '';
    // alle Gründe nennen (Guana 24.10.: „die schönen Treffer“ – Leerzeichen UND Umlaut)
    const enthaelt = [];
    if (/\s/.test(n)) enthaelt.push('Leerzeichen');
    const und = (l) => l.length > 1 ? l.slice(0, -1).join(', ') + ' und ' + l[l.length - 1] : l[0];
    const uml = (n.match(/[äöüÄÖÜ]/g) || []).length;
    if (uml) enthaelt.push(uml === 1 ? 'einen Umlaut' : 'Umlaute');
    if (/ß/.test(n)) enthaelt.push('ein ß');
    const andere = [...new Set(n.replace(/[\säöüÄÖÜß]/g, '').replace(/[A-Za-z0-9_]/g, ''))];
    if (andere.length) enthaelt.push((andere.length === 1 ? 'das Zeichen ' : 'die Zeichen ') + und(andere.map(c => '„' + c + '“')));
    const teile = [];
    if (enthaelt.length) teile.push('er enthält ' + und(enthaelt));
    if (/^\d/.test(n)) teile.push('er fängt mit einer Ziffer an');
    const grund = (teile.length ? teile.join(' und ') : 'dieser Name ist nicht erlaubt');
    return `„${n}“ geht nicht als ${art}, denn ${grund}${vorschlag}. Erlaubt sind Buchstaben ohne Umlaute, Ziffern und _ (am Anfang ein Buchstabe).`;
  }
  Struktogramm.nameFehler = nameFehler;
  /* Dezimalzahl mit Komma (24.10.2026, Guana): „1,5“ statt „1.5“ – eigene Meldung statt „Ungültiger Ausdruck“.
     Kommas in Arrays [1, 5] und zwischen Parametern f(1, 5) bleiben unberührt. */
  function dezimalKomma(text, what) {
    let t = String(text || '').replace(/"(?:[^"\\]|\\.)*"/g, '""');
    for (let alt = null; alt !== t;) { alt = t; t = t.replace(/[A-Za-zÄÖÜäöüß_][\wÄÖÜäöüß]*\s*\([^()]*\)/g, '0').replace(/\[[^\[\]]*\]/g, '0'); }
    const m = /(\d+)\s*,\s*(\d+)/.exec(t); if (!m) return;
    throw new TransError(`${what ? what + ': ' : ''}Dezimalzahlen schreibt man mit Punkt statt Komma – „${m[1]}.${m[2]}“ statt „${m[0]}“.`);
  }
  /* Namen im Kästchen vorab prüfen – sonst kämen nur allgemeine Meldungen wie „Erwartet: variable [als Datentyp]“ */
  function namenImKaestchen(text) {
    const muster = [
      /^Deklaration(?: und Initialisierung| und Einlesen)?:\s*(.+?)(?:\s+als\b.*|\s*=.*)?$/,
      /^Initialisierung:\s*([^=\[]+?)\s*(?:\[[^\]]*\]\s*)?=/,
      /^Zuweisung:\s*([^=\[]+?)\s*(?:\[[^\]]*\]\s*)?=/,
      /^Einlesen:\s*([^\[]+?)\s*(?:\[.*)?$/,
      /^Zähle\s+(.+?)\s+von\s/,
      /^Wiederhole von\s+([^=]+?)\s*=/,
    ];
    for (const re of muster) { const m = re.exec(String(text || '').trim()); if (m) { const f = nameFehler(m[1]); if (f) throw new TransError(f); return; } }
  }
  function nurImCamp() { if (!Struktogramm.arraysErlaubt) throw new TransError('Arrays gibt es nur im Array Trainingscamp und im Abi-Drill (Menü „Episoden“ ganz unten)'); }
  class Translator {
    constructor(doc, opts) {
      this.doc = doc; this.opts = opts || {}; this.errors = []; this.map = new Map(); // strideId -> boxId
      this.builtins = builtins();
      this.userMethods = new Map();
      for (const m of doc.methods) this.userMethods.set(m.name, m);
      this.F = Programm.F;
    }
    err(boxId, msg) { this.errors.push({ boxId, msg }); }
    link(frame, boxId) { this.map.set(frame.id, boxId); return frame; }

    /* Typ eines Ausdrucks (Java-Text), soweit syntaktisch bestimmbar; null = unbekannt */
    typeOf(ast, scope) {
      if (!ast) return null;
      switch (ast.n) {
        case 'lit': return ast.t === 'null' ? null : ast.t;
        case 'paren': return this.typeOf(ast.a, scope);
        case 'name': { const e = scope.lookupEntry(ast.name); return e ? e.type : null; }
        case 'call': {
          if (ast.obj) { if (['equals', 'equalsIgnoreCase', 'isEmpty', 'contains', 'startsWith', 'endsWith'].includes(ast.name)) return 'boolean'; if (['length', 'size', 'indexOf', 'compareTo'].includes(ast.name)) return 'int'; return ast.name === 'substring' || ast.name === 'trim' || ast.name === 'toUpperCase' || ast.name === 'toLowerCase' ? 'String' : null; }
          const um = this.userMethods.get(ast.name); if (um) return um.rtype === 'void' ? 'void' : TYPES[um.rtype] || null;
          const bl = this.builtins.get(ast.name); if (bl) return bl[0].ret;
          return null;
        }
        case 'un': return ast.op === '!' ? 'boolean' : this.typeOf(ast.a, scope);
        case 'bin': {
          if (['==', '!=', '<', '<=', '>', '>=', '&&', '||'].includes(ast.op)) return 'boolean';
          const a = this.typeOf(ast.a, scope), b = this.typeOf(ast.b, scope);
          if (ast.op === '+' && (a === 'String' || b === 'String')) return 'String';
          if (a === 'double' || b === 'double') return 'double';
          if (a === 'int' && b === 'int') return 'int';
          return a && b ? (a === b ? a : null) : null;
        }
        case 'cond': return this.typeOf(ast.a, scope) || this.typeOf(ast.b, scope);
        case 'field': return ast.name === 'length' ? 'int' : null;
        case 'index': { const t = this.typeOf(ast.a, scope); const e = elemType(t); return e && e !== '?' ? e : null; }
        case 'list': {
          // Elementtyp aus den Elementen: Ganzzahl + Dezimalzahl → Dezimalzahl, sonst müssen alle gleich sein
          let et = null;
          for (const it of ast.items) {
            let t = this.typeOf(it, scope); if (t === 'long') t = 'int'; if (t === 'float') t = 'double';
            if (!t) return null;
            if (et === null || et === t) { et = t; continue; }
            if ((et === 'int' && t === 'double') || (et === 'double' && t === 'int')) { et = 'double'; continue; }
            throw new TransError(`Alle Elemente eines Arrays müssen denselben Datentyp haben – hier stehen ${typName(et)} und ${typName(t)} gemischt`);
          }
          return arrayOf(et || '?');
        }
        default: return null;
      }
    }

    /* BW-Ausdruck → Java-Ausdruck (Text). Ergänzt () bei Peetie-Befehlen, macht aus == bei Zeichenketten equals(). */
    expr(text, scope, boxId, what) {
      let src = preJava(String(text).trim());
      if (!src) throw new TransError((what || 'Ausdruck') + ' fehlt');
      dezimalKomma(text, what);
      let ast;
      try { ast = Interp.parseExpr(src); }
      catch (e) {
        let msg = e.message || String(e);
        if (/Zuweisungen gehören/.test(msg)) msg = 'Ein einzelnes = ist eine Zuweisung. Für einen Vergleich == verwenden.';
        throw new TransError((what ? what + ': ' : '') + msg);
      }
      const edits = [];
      const self = this;
      function visit(a) {
        if (!a || typeof a !== 'object') return;
        // Aufruf eines eigenen Unterprogramms: Datentypen der übergebenen Werte merken (Parameter werden ohne Datentyp geschrieben, 13.10.2026)
        if (a.n === 'call' && !a.obj && self.userMethods.has(a.name)) self.beobachte(a.name, a.args || [], scope);
        if (a.n === 'list' || a.n === 'index') nurImCamp();
        if (a.n === 'name' && !scope.has(a.name)) {
          const bl = self.builtins.get(a.name);
          if (bl && bl.some(m => m.params.length === 0)) { edits.push([a.e, a.e, '()']); return; }
          if (self.userMethods.has(a.name) && self.userMethods.get(a.name).params.length === 0) { edits.push([a.e, a.e, '()']); return; }
          if (self.anderswoDeklariert(a.name)) throw new TransError(`„${a.name}“ ist hier nicht bekannt: Eine Variable gilt nur in dem Programm, in dem sie deklariert ist. Übergib den Wert als Parameter an das Unterprogramm.`);
          throw new TransError(`„${a.name}“ ist nicht bekannt – ` + (Struktogramm.TEXTE.befehlBeispiel ? `weder eine deklarierte Variable noch ein ${Struktogramm.TEXTE.befehl}` : 'keine deklarierte Variable'));
        }
        if (a.n === 'call' && !a.obj && Struktogramm.GESPERRT.has(a.name)) throw new TransError(`„${a.name}“ ist kein ${Struktogramm.TEXTE.befehl}`);
        if (a.n === 'call' && a.obj && a.name === 'size') {
          // „Anzahl der Elemente des Arrays x“: nur im Camp, und x muss ein Array sein
          nurImCamp();
          if (a.obj.n === 'name' && scope.has(a.obj.name) && !isArrayType(self.typeOf(a.obj, scope)) && self.typeOf(a.obj, scope)) throw new TransError(`„${a.obj.name}“ ist kein Array, sondern ${typName(self.typeOf(a.obj, scope))}`);
        }
        if (a.n === 'index') {
          const ta = self.typeOf(a.a, scope);
          if (a.a.n === 'name' && scope.has(a.a.name) && ta && !isArrayType(ta)) throw new TransError(`„${a.a.name}“ ist kein Array, sondern ${typName(ta)} – eckige Klammern gehen nur bei Arrays`);
          if (a.a.n !== 'name' && a.a.n !== 'index' && a.a.n !== 'paren') throw new TransError('Vor den eckigen Klammern muss der Name eines Arrays stehen');
          const ti = self.typeOf(a.i, scope);
          if (ti && ti !== 'int' && ti !== 'long') throw new TransError(`Der Index in den eckigen Klammern muss eine Ganzzahl sein – hier ist er ${typName(ti)}`);
        }
        if (a.n === 'bin' && (a.op === '==' || a.op === '!=')) {
          const ta = self.typeOf(a.a, scope), tb = self.typeOf(a.b, scope);
          if (ta === 'String' || tb === 'String') {
            // a == b  →  a.equals(b)   (Zeichenketten inhaltlich vergleichen)
            const left = src.slice(a.a.s, a.a.e), right = src.slice(a.b.s, a.b.e);
            const leftIsStr = ta === 'String' && a.a.n !== 'lit';
            const repl = (a.op === '!=' ? '!' : '') + (leftIsStr ? `${wrap(left, a.a)}.equals(${right})` : `${wrap(right, a.b)}.equals(${left})`);
            edits.push([a.s, a.e, repl]);
            visitChildren(a); return;
          }
        }
        visitChildren(a);
      }
      function wrap(s, node) { return node.n === 'name' || node.n === 'call' || node.n === 'paren' || node.n === 'lit' || node.n === 'index' ? s : '(' + s + ')'; }
      function visitChildren(a) {
        for (const k of ['a', 'b', 'c', 'obj', 'i']) if (a[k] && typeof a[k] === 'object') visit(a[k]);
        if (Array.isArray(a.args)) a.args.forEach(visit);
        if (Array.isArray(a.items)) a.items.forEach(visit);
      }
      visit(ast);
      // Edits von hinten nach vorn anwenden (verschachtelte Ersetzungen: äußere zuerst gesammelt → innere liegen innerhalb; deshalb nur nicht-überlappende anwenden)
      edits.sort((x, y) => y[0] - x[0]);
      let out = src, lastStart = Infinity;
      for (const [s, e, r] of edits) { if (e > lastStart) continue; out = out.slice(0, s) + r + out.slice(e); lastStart = s; }
      // Nachträglich eingefügte () in ersetzten Bereichen: Namen ohne Klammern noch einmal prüfen
      out = out.replace(/\b([A-Za-z_]\w*)\b(?!\s*[(\w])/g, (m, name, off) => {
        if (scope.has(name) || !/^[a-z]/.test(name)) return m;
        const before = out.slice(0, off); if (/\.\s*$/.test(before) || /"[^"]*$/.test(before.replace(/\\"/g, ''))) return m;
        const bl = self.builtins.get(name); if (bl && bl.some(x => x.params.length === 0)) return name + '()';
        if (self.userMethods.has(name) && self.userMethods.get(name).params.length === 0) return name + '()';
        return m;
      });
      const type = this.typeOf(ast, scope);
      return { java: out, type, ast };
    }

    /* Deklarationsteil "name [als Typ]" */
    parseDecl(s) {
      const m = /^([A-Za-z_]\w*)\s*(?:als\s+(\S+))?\s*$/.exec(s.trim());
      const typen = 'Ganzzahl, Dezimalzahl, Zeichenkette, Wahrheitswert' + (Struktogramm.arraysErlaubt ? ', Array' : '');
      if (!m) throw new TransError('Erwartet: variable [als Datentyp]  (Datentypen: ' + typen + ')');
      if (m[2] === 'Array') { nurImCamp(); return { name: m[1], type: null, array: true }; }
      if (m[2] && !TYPES[m[2]]) throw new TransError(`Unbekannter Datentyp „${m[2]}“. Erlaubt: ${typen}`);
      return { name: m[1], type: m[2] ? TYPES[m[2]] : null };
    }
    /* Array-Variable anlegen; Elementtyp „?“ (leeres Array) wird bei der ersten Zuweisung festgelegt */
    declareArray(scope, name, type, frame, isField) {
      this.declareVar(scope, name, type, null, isField);
      const entry = scope.vars.get(name); entry.frame = frame;
      if (elemType(type) === '?') entry.pendingElem = true;
      return entry;
    }
    /* Elementtyp eines Arrays nach der ersten Zuweisung festlegen bzw. prüfen; liefert den Elementtyp */
    fixElem(entry, name, valType, was) {
      let vt = valType === 'long' ? 'int' : valType === 'float' ? 'double' : valType;
      if (entry.pendingElem) {
        if (!vt || vt === 'void' || isArrayType(vt)) throw new TransError(`Der Datentyp des Werts ist nicht bestimmbar – zuerst einen Wert wie 5 oder "Text" zuweisen`);
        entry.type = arrayOf(vt); entry.pendingElem = false; if (entry.frame) entry.frame.vtype = entry.type;
        return vt;
      }
      const et = elemType(entry.type);
      if (vt && vt !== et && !(et === 'double' && vt === 'int')) throw new TransError(`Das Array ${name} enthält ${TYP_PL[et] || et} – ${was || 'hier'} ${vt === 'void' ? 'kommt aber kein Wert' : 'ist der Wert aber ' + typName(vt)}`);
      return et;
    }
    splitAssign(s) {
      // erstes "=" außerhalb von Zeichenketten, das kein ==, <=, >=, != ist
      let inStr = false, q = null;
      for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (inStr) { if (c === '\\') i++; else if (c === q || (/["„“”]/.test(q) && /["„“”]/.test(c))) inStr = false; continue; }
        if (/["„“”]/.test(c)) { inStr = true; q = c; continue; }
        if (c === '=' && s[i + 1] !== '=' && !/[<>!=]/.test(s[i - 1] || '')) return [s.slice(0, i).trim(), s.slice(i + 1).trim()];
      }
      throw new TransError('Ein „=“ fehlt (z. B. „Zuweisung: x = 1“)');
    }
    declareVar(scope, name, type, boxId, isField) {
      if (scope.vars.has(name) || (isField && scope.has(name))) throw new TransError(`Variable ${name} ist bereits deklariert`);
      if (!isField && scope.has(name)) throw new TransError(`Variable ${name} ist bereits deklariert`);
      scope.declare(name, type);
    }
    /* „Einlesen: x“ → einlesen…("x"): der Variablenname steht dann auf dem Handy über dem Eingabefeld */
    einlesenCall(type, name) {
      const n = '"' + String(name || '').replace(/[^\wÄÖÜäöüß]/g, '') + '"';
      if (type === 'int') return 'einlesenGanzzahl(' + n + ')';
      if (type === 'double') return 'einlesenDezimalzahl(' + n + ')';
      if (type === 'String') return 'einlesenZeichenkette(' + n + ')';
      throw new TransError('Einlesen geht nur für Ganzzahl, Dezimalzahl oder Zeichenkette');
    }

    /* Anweisungskästchen → Frames des Programmbaums (Liste, meist genau ein Frame) */
    stmt(box, scope, isField) {
      const F = this.F; let text = String(box.text || '').replace(/\s+/g, ' ').trim();
      const out = (f) => [this.link(f, box.id)];
      if (!text) throw new TransError('Das Kästchen ist leer');
      const abi = abiModus();
      if (abi) {
        // Schreibweisen der Prüfungsaufgaben (Abi-Drill, Guana 07.10.2026: Vorgaben genau wie in der Vorlage)
        if (/^\/\//.test(text)) return []; // Kommentarkästchen
        text = text.replace(/^Deklaration und Zuweisung:/, 'Deklaration und Initialisierung:').replace(/^Aufruf und Zuweisung:/, 'Zuweisung:').replace(/^Deklaration und Eingabe:/, 'Deklaration und Einlesen:');
      }
      namenImKaestchen(text);
      let m;
      if ((m = /^Deklaration und Initialisierung:\s*(.+)$/.exec(text))) {
        const [lhs, rhs] = this.splitAssign(m[1]);
        const d = this.parseDecl(lhs);
        const e = this.expr(rhs, scope, box.id, 'Wert');
        if (d.array && !isArrayType(e.type)) throw new TransError(`Nach „${d.name} als Array =“ muss ein Array in eckigen Klammern stehen, z. B. [ ] oder [3, 5, 7]`);
        if (isArrayType(e.type)) {
          // Array nach Operatorenliste 2.2: „personen = ["Sven", "Tina"]“ oder „zahlen als Array = [ ]“; Elementtyp aus den Elementen
          if (d.type) throw new TransError(`„${d.name} als ${TYPES_DE[d.type]}“ passt nicht zu einem Array – „${d.name} als Array = […]“ oder einfach „${d.name} = […]“`);
          const f = F.var(e.type, d.name, e.java, isField ? { access: 'private' } : {}); // leeres Array: List<?> – der Elementtyp kommt mit der ersten Zuweisung (declareArray)
          this.declareArray(scope, d.name, e.type, f, isField);
          return out(this.link(f, box.id));
        }
        let t = d.type || e.type;
        if (!t || t === 'void') throw new TransError(`Datentyp bitte angeben: „${d.name} als Ganzzahl = …“`);
        if (t === 'long') t = 'int';
        this.declareVar(scope, d.name, t, box.id, isField);
        const fv = F.var(t, d.name, e.java, isField ? { access: 'private' } : {});
        if (!d.type) { const en = scope.vars.get(d.name); en.frame = fv; en.geschaetzt = true; } // Typ aus dem Wert – wird später eine Dezimalzahl zugewiesen, wird daraus Dezimalzahl
        return out(fv);
      }
      if ((m = /^Deklaration und Einlesen:\s*(.+)$/.exec(text))) {
        const d = this.parseDecl(m[1]);
        if (!d.type && abi) d.type = 'int'; // Prüfungsaufgaben: „Deklaration und Einlesen: z“ – ohne Typ gilt Ganzzahl
        if (!d.type) throw new TransError(`Datentyp bitte angeben: „${d.name} als Ganzzahl“`);
        this.declareVar(scope, d.name, d.type, box.id, isField);
        return out(F.var(d.type, d.name, this.einlesenCall(d.type, d.name), isField ? { access: 'private' } : {}));
      }
      if ((m = /^Deklaration:\s*(.+)$/.exec(text))) {
        const d = this.parseDecl(m[1]);
        if (d.array) {
          // „Deklaration: zahlen als Array“ = leeres Array
          const f = F.var('List<int>', d.name, '[]', isField ? { access: 'private' } : {});
          this.declareArray(scope, d.name, 'List<?>', f, isField);
          return out(this.link(f, box.id));
        }
        if (!d.type) {
          // Typ wird bei der ersten Initialisierung/Zuweisung festgelegt
          this.declareVar(scope, d.name, null, box.id, isField);
          const f = F.var('', d.name, null, isField ? { access: 'private' } : {});
          scope.vars.get(d.name).frame = f; scope.vars.get(d.name).pending = true;
          return out(f);
        }
        this.declareVar(scope, d.name, d.type, box.id, isField);
        return out(F.var(d.type, d.name, isField ? null : (d.type === 'String' ? '""' : d.type === 'boolean' ? 'false' : '0'), isField ? { access: 'private' } : {}));
      }
      if ((m = /^(Initialisierung|Zuweisung):\s*(.+)$/.exec(text))) {
        const [lhs, rhs] = this.splitAssign(m[2]);
        const e = this.expr(rhs, scope, box.id, 'Wert');
        const target = lhs.trim();
        const nm = /^([A-Za-z_]\w*)$/.exec(target);
        if (nm) {
          const entry = scope.lookupEntry(nm[1]);
          if (!entry) throw new TransError(`Variable ${nm[1]} ist nicht deklariert (am Anfang des Programms „Deklaration und Initialisierung: ${nm[1]} als … = …“)`.replace(/\)$/, '') + (this.anderswoDeklariert(nm[1]) ? ' – eine Variable gilt nur in dem Programm, in dem sie deklariert ist; übergib den Wert als Parameter)' : ')'));
          if (isArrayType(entry.type)) {
            // ganzes Array zuweisen: Elementtypen müssen passen
            if (!isArrayType(e.type)) throw new TransError(`${nm[1]} ist ein Array – hier soll ${typName(e.type)} zugewiesen werden. Einzelne Elemente: „Zuweisung: ${nm[1]}[0] = …“`);
            const ee = elemType(e.type);
            if (ee !== '?') { if (entry.pendingElem) { entry.type = e.type; entry.pendingElem = false; if (entry.frame) entry.frame.vtype = e.type; } else if (ee !== elemType(entry.type)) throw new TransError(`Das Array ${nm[1]} enthält ${TYP_PL[elemType(entry.type)]} – hier wird ${typName(e.type)} zugewiesen`); }
            return out(F.assign(nm[1], e.java));
          }
          if (isArrayType(e.type)) throw new TransError(entry.pending ? `Arrays bitte gleich beim Deklarieren füllen: „Deklaration und Initialisierung: ${nm[1]} = ${rhs.trim()}“` : `${nm[1]} ist ${typName(entry.type)} – ein Array passt da nicht hinein`);
          if (abi && entry.geschaetzt && entry.type === 'int' && e.type === 'double') { entry.type = 'double'; entry.frame.vtype = 'double'; } // „zuschlag = 0“, später „zuschlag = 0.5“
          if (entry.pending) { if (!e.type || e.type === 'void') throw new TransError('Datentyp nicht bestimmbar – bitte in der Deklaration angeben („als Ganzzahl“)'); entry.type = e.type === 'long' ? 'int' : e.type; entry.pending = false; entry.frame.vtype = entry.type; if (entry.frame.access === 'private') entry.frame.value = null; else entry.frame.value = entry.type === 'String' ? '""' : entry.type === 'boolean' ? 'false' : '0'; }
          return out(F.assign(nm[1], e.java));
        }
        // array[idx] = wert (Element ändern; Index = Anzahl hängt an)
        const am = /^([A-Za-z_]\w*)\s*\[(.+)\]$/.exec(target);
        if (am) {
          nurImCamp();
          const entry = scope.lookupEntry(am[1]);
          if (!entry) throw new TransError(`Das Array ${am[1]} ist nicht deklariert (am Anfang des Programms „Deklaration und Initialisierung: ${am[1]} als Array = [ ]“)`);
          if (!isArrayType(entry.type)) throw new TransError(`„${am[1]}“ ist kein Array, sondern ${typName(entry.type)} – eckige Klammern gehen nur bei Arrays`);
          const idx = this.expr(am[2], scope, box.id, 'Index');
          if (idx.type && idx.type !== 'int' && idx.type !== 'long') throw new TransError(`Der Index in den eckigen Klammern muss eine Ganzzahl sein – hier ist er ${typName(idx.type)}`);
          if (!e.type || e.type === 'void') throw new TransError('Rechts vom = fehlt ein Wert');
          this.fixElem(entry, am[1], e.type, 'hier');
          return out(F.assign(`${am[1]}[${idx.java}]`, e.java));
        }
        throw new TransError('Links vom = muss ein Variablenname stehen');
      }
      if ((m = /^Einlesen:\s*(.+)$/.exec(text))) {
        // Einlesen in ein Array-Element (Abi-Drill 13b, 07.10.2026): „Einlesen: zeiten[i]“ – ändert bzw. hängt an wie eine Zuweisung
        // „Einlesen: namen[i] als Zeichenkette“ (Operatorenliste: „Einlesen: variable |als datentyp|“) – legt bei einem leeren Array fest, was hineinkommt (26.10.2026)
        const ae = /^([A-Za-z_]\w*)\s*\[(.+)\](?:\s+als\s+(\S+))?\s*$/.exec(m[1].trim());
        if (ae) {
          nurImCamp();
          const entry = scope.lookupEntry(ae[1]);
          if (!entry) throw new TransError(`Das Array ${ae[1]} ist nicht deklariert`);
          if (!isArrayType(entry.type)) throw new TransError(`„${ae[1]}“ ist kein Array, sondern ${typName(entry.type)} – eckige Klammern gehen nur bei Arrays`);
          if (ae[3] && !TYPES[ae[3]]) throw new TransError(`Unbekannter Datentyp „${ae[3]}“. Erlaubt: Ganzzahl, Dezimalzahl, Zeichenkette, Wahrheitswert`);
          if (ae[3]) this.fixElem(entry, ae[1], TYPES[ae[3]], 'hier');
          const et = elemType(entry.type);
          if (!et || et === '?') throw new TransError(`Das Array ${ae[1]} ist noch leer – was eingelesen wird, ist unbekannt. Schreib den Datentyp dazu, z. B. „Einlesen: ${ae[1]}[${ae[2].trim()}] als Zeichenkette“ (oder als Ganzzahl, Dezimalzahl …)`);
          if (ae[3] && TYPES[ae[3]] !== et) throw new TransError(`Das Array ${ae[1]} enthält ${TYP_PL[et] || et} – „als ${ae[3]}“ passt nicht dazu`);
          const idx = this.expr(ae[2], scope, box.id, 'Index');
          if (idx.type && idx.type !== 'int' && idx.type !== 'long') throw new TransError(`Der Index in den eckigen Klammern muss eine Ganzzahl sein – hier ist er ${typName(idx.type)}`);
          return out(F.assign(`${ae[1]}[${idx.java}]`, this.einlesenCall(et, ae[1])));
        }
        const d = this.parseDecl(m[1]);
        const entry = scope.lookupEntry(d.name);
        if (!entry) throw new TransError(`Variable ${d.name} ist nicht deklariert („Deklaration und Einlesen: ${d.name} als Ganzzahl“ verwenden)`);
        if (entry.pending) { if (!d.type) throw new TransError('Datentyp bitte angeben („Einlesen: x als Ganzzahl“)'); entry.type = d.type; entry.pending = false; entry.frame.vtype = d.type; entry.frame.value = entry.frame.access === 'private' ? null : (d.type === 'String' ? '""' : '0'); }
        if (d.type && d.type !== entry.type) throw new TransError(`${d.name} wurde als ${TYPES_DE[entry.type]} deklariert`);
        return out(F.assign(d.name, this.einlesenCall(entry.type, d.name)));
      }
      if ((m = /^(?:Zeilenweise )?Ausgabe:\s*(.+)$/.exec(text))) {
        const e = this.expr(m[1], scope, box.id, 'Ausgabe');
        const arg = e.type === 'String' ? e.java : (e.type === 'int' || e.type === 'double' || e.type === 'boolean') ? `"" + ${e.java}` : `"" + (${e.java})`;
        return out(F.call(`textAusgeben(${arg})`));
      }
      if ((m = /^Rückgabe:?\s*(.*)$/.exec(text))) {
        const v = m[1].trim();
        if (!v) return out(F.return(null));
        const e = this.expr(v, scope, box.id, 'Rückgabewert');
        return out(F.return(e.java));
      }
      if ((m = /^Aufruf:\s*(.+)$/.exec(text))) {
        const e = this.expr(m[1], scope, box.id, 'Aufruf');
        if (!/\)\s*$/.test(e.java)) throw new TransError('Aufruf erwartet: name() oder name(parameter)');
        return out(F.call(e.java));
      }
      // Peetie-Befehl ohne Operator: geheRechts(), tasteGedrueckt("a") … (ohne Klammern wird ebenfalls angenommen)
      if ((m = /^([A-Za-z_]\w*)\s*(\(.*\))?$/.exec(text))) {
        const name = m[1];
        if (this.builtins.has(name)) {
          const e = this.expr(m[2] ? text : name + '()', scope, box.id, 'Befehl');
          // Abfragen wie istFelsVoraus() allein im Kästchen bewirken nichts (26.09.2026)
          if (e.type === 'boolean') throw new TransError(`${name}() fragt nur etwas ab – die Antwort ist wahr oder falsch. Allein in einem Kästchen passiert damit nichts. Setze den Befehl als Bedingung in eine Verzweigung oder in eine Schleife.`);
          return out(F.call(e.java));
        }
        if (this.userMethods.has(name)) throw new TransError(`Eigene Unterprogramme mit „Aufruf: ${name}(…)“ aufrufen`);
        throw new TransError(`„${name}“ ist kein ${Struktogramm.TEXTE.befehl}. Anweisungen beginnen mit einem Operator (z. B. „Zuweisung: “, „Ausgabe: “)` + oderBefehl('sind'));
      }
      if (/^[A-Za-z_]\w*\s*=/.test(text)) throw new TransError('Vor eine Zuweisung gehört der Operator: „Zuweisung: ' + text + '“');
      throw new TransError('Unbekannte Anweisung. Erlaubt sind die Operatoren der Operatorenliste (z. B. „Zuweisung: x = 1“, „Ausgabe: "Hallo"“)' + oderBefehl(''));
    }

    loop(box, scope) {
      const F = this.F; const head = String(box.head || '').replace(/\s+/g, ' ').trim();
      if (!head) throw new TransError('Der Schleifenkopf ist leer (z. B. „Wiederhole solange x < 10“ oder „Zähle i von 1 bis 10, Schrittweite 1“)');
      namenImKaestchen(head);
      let m;
      if (abiModus() && /^Wiederhole fortlaufend$/i.test(head)) {
        // Hüpf-Spiel (Aufgabe 33): „Wiederhole fortlaufend“ läuft, solange das Spiel läuft
        if (!Struktogramm.abiErlaubt.includes('spielLaeuft')) throw new TransError('„Wiederhole fortlaufend“ hört nie auf – hier braucht die Schleife eine Bedingung („Wiederhole solange …“)');
        const w = this.link(F.while('spielLaeuft()'), box.id);
        w.body = this.block(box.body, new Scope(scope));
        return [w];
      }
      if ((m = /^Wiederhole solange\s+(.+)$/.exec(head))) {
        const c = this.expr(abiVergleich(m[1]), scope, box.id, 'Bedingung');
        if (c.type && c.type !== 'boolean') throw new TransError('Die Bedingung muss wahr oder falsch ergeben (z. B. x < 10)');
        // Bedingung ohne Variable und ohne Peetie-Befehl (z. B. „2 > 1“, „wahr“) ändert sich nie – die Schleife liefe endlos (Guana, 30.09.2026)
        if (istKonstant(c.ast)) throw new TransError(`Die Bedingung „${m[1].trim()}“ enthält keine Variable${Struktogramm.TEXTE.befehlBeispiel ? ' und keinen ' + Struktogramm.TEXTE.befehl : ''} – sie bleibt immer gleich, die Schleife würde nie enden (oder nie laufen). Nimm eine Bedingung, die sich im Lauf ändert.`);
        const w = this.link(F.while(c.java), box.id);
        w.body = this.block(box.body, new Scope(scope));
        return [w];
      }
      // Zählvariable: muss deklariert sein (am besten am Anfang des Programms), wird nicht stillschweigend angelegt
      let neu = null; // Abi-Drill: nicht deklarierte Zählvariable (wie in den Prüfungsaufgaben) wird hier als Ganzzahl angelegt
      const zaehlvariable = (v) => {
        if (abiModus() && !scope.has(v)) { this.declareVar(scope, v, 'int', box.id, false); neu = v; return; }
        const e = scope.lookup(v);
        if (!e) throw new TransError(`Die Zählvariable „${v}“ muss vorher deklariert werden – am besten am Anfang des Programms: „Deklaration und Initialisierung: ${v} als Ganzzahl = 1“`);
        if (e.type !== 'int' && e.type !== 'double') throw new TransError(`Die Zählvariable „${v}“ muss eine Ganzzahl sein (sie ist ${TYPES_DE[e.type] || e.type})`);
      };
      if ((m = /^Wiederhole von\s+([A-Za-z_]\w*)\s*=\s*(.+?)\s+solange\s+(.+?)(?:,\s*Schrittweite\s+(.+))?$/.exec(head))) {
        const [, v, start, cond, step] = m;
        zaehlvariable(v);
        const st = this.expr(start, scope, box.id, 'Startwert');
        const pre = [this.link(neu ? F.var('int', v, st.java) : F.assign(v, st.java), box.id)];
        const c = this.expr(abiVergleich(cond), scope, box.id, 'Bedingung');
        const w = this.link(F.while(c.java), box.id);
        const stepE = step ? this.expr(step, scope, box.id, 'Schrittweite') : { java: '1' };
        w.body = this.block(box.body, new Scope(scope));
        w.body.push(this.link(F.assign(v, `${v} + ${/^-/.test(stepE.java) ? '(' + stepE.java + ')' : stepE.java}`), box.id));
        return [...pre, w];
      }
      if ((m = /^Zähle\s+([A-Za-z_]\w*)\s+von\s+(.+?)\s+bis\s+(.+?)(?:,\s*Schrittweite\s+(.+))?$/.exec(head))) {
        const [, v, a, b, step] = m;
        zaehlvariable(v);
        const ea = this.expr(a, scope, box.id, 'Startwert'), eb = this.expr(b, scope, box.id, 'Endwert');
        const es = this.expr((step || '1').trim(), scope, box.id, 'Schrittweite');
        const neg = /^-/.test(es.java);
        const pre = [this.link(neu ? F.var('int', v, ea.java) : F.assign(v, ea.java), box.id)];
        const w = this.link(F.while(`${v} ${neg ? '>=' : '<='} ${eb.java}`), box.id);
        w.body = this.block(box.body, new Scope(scope));
        w.body.push(this.link(F.assign(v, `${v} + ${neg ? '(' + es.java + ')' : es.java}`), box.id));
        return [...pre, w];
      }
      throw new TransError('Schleifenkopf nach Operatorenliste: „Wiederhole solange bedingung“, „Wiederhole von i = 0 solange i < 5, Schrittweite 1“ oder „Zähle i von 1 bis 10, Schrittweite 1“');
    }

    branch(box, scope) {
      const F = this.F;
      const cond = String(box.cond || '').replace(/^Wenn\s+/i, '').replace(/\s*\?$/, '').replace(/,\s*dann\s*$/i, '').trim();
      if (!cond) throw new TransError('Die Bedingung fehlt (z. B. „istFelsVoraus()“ oder „x > 5“)');
      const c = this.expr(abiVergleich(cond), scope, box.id, 'Bedingung');
      if (c.type && c.type !== 'boolean') throw new TransError(`Die Bedingung muss wahr oder falsch ergeben – „${cond}“ ist ${TYPES_DE[c.type] || c.type}`);
      const f = this.link(F.if(c.java), box.id);
      f.then = this.block(box.then, new Scope(scope));
      f.else = box.else.length ? this.block(box.else, new Scope(scope)) : null;
      return [f];
    }

    /* Ist name in einem anderen Programmteil deklariert (bzw. dort Parameter)? Seit 13.10.2026 gelten Variablen nur dort */
    anderswoDeklariert(name) {
      const re = new RegExp('^Deklaration[^:]*:\\s*' + name + '\\b');
      return this.doc.methods.some(m => m !== this.aktMethode && (m.params.some(p => p.name === name) || (() => { let ja = false; Struktogramm.walk({ attributes: [], methods: [m] }, b => { if (b.kind === 'stmt' && re.test(String(b.text).trim())) ja = true; }); return ja; })()));
    }
    /* Parameter stehen ohne Datentyp im Kopf (Guana, 13.10.2026): der Typ kommt aus den Aufrufen */
    beobachte(name, args, scope) {
      if (!this.paramObs) this.paramObs = new Map();
      const obs = this.paramObs.get(name) || []; this.paramObs.set(name, obs);
      args.forEach((arg, i) => {
        let t = null; try { t = this.typeOf(arg, scope); } catch (e) { t = null; }
        if (t === 'long') t = 'int'; if (t === 'float') t = 'double';
        if (!t || t === 'void') return;
        if (!obs[i]) obs[i] = t;
        else if ((obs[i] === 'int' && t === 'double') || (obs[i] === 'double' && t === 'int')) obs[i] = 'double';
        else if (obs[i] === 'List<?>' && isArrayType(t)) obs[i] = t;
      });
    }
    /* Datentyp eines Parameters: aus den Aufrufen, sonst wie gespeichert (z. B. vorgegebene Unterprogramme im Camp), sonst Ganzzahl */
    paramTyp(m, i, p) {
      const o = this.paramObs && this.paramObs.get(m.name); const t = o && o[i];
      if (t) return t;
      return PARAM_TYPES[p.type] || 'int';
    }
    block(list, scope) {
      const out = [];
      for (const b of list) {
        try {
          if (b.kind === 'stmt') out.push(...this.stmt(b, scope, false));
          else if (b.kind === 'if') out.push(...this.branch(b, scope));
          else if (b.kind === 'loop') out.push(...this.loop(b, scope));
        } catch (e) { if (e instanceof TransError) this.err(b.id, e.message); else throw e; }
      }
      return out;
    }

    run() {
      const F = this.F;
      const model = Programm.newModel();
      model.javadoc = 'Peetie – erzeugt aus dem Struktogramm.';
      if (!this.doc.name || !this.doc.name.trim()) this.err('name', 'Programmname fehlt – oben eintragen');
      const fieldScope = new Scope(null);
      model.fields = [];
      // Vorgegebene Arrays der Übung (Trainingscamp, Autopilot): stehen fest im Variablenbereich, die Welt füllt sie beim Einsammeln
      for (const v of this.opts.vorgaben || []) {
        fieldScope.declare(v.name, v.typ || 'List<String>');
        model.fields.push(this.link(F.var(v.typ || 'List<String>', v.name, v.wert || '[]', { access: 'private' }), 'vorgabe:' + v.name)); // wert: schon gefülltes Array (z. B. preise in T9)
      }
      for (const b of this.doc.attributes) {
        if (b.kind !== 'stmt') { this.err(b.id, 'Oben bei den Variablen sind nur Deklarationen erlaubt'); continue; }
        try {
          const t = String(b.text).trim();
          if (!/^Deklaration/.test(t)) throw new TransError('Variablen werden hier deklariert: „Deklaration und Initialisierung: treffer als Ganzzahl = 0“');
          model.fields.push(...this.stmt(b, fieldScope, true));
        } catch (e) { if (e instanceof TransError) this.err(b.id, e.message); else throw e; }
      }
      // offene Deklarationen ohne Typ
      for (const [n, e] of fieldScope.vars) if (e.pending) { const bid = this.map.get(e.frame.id); this.err(bid, `Datentyp von ${n} bitte angeben („Deklaration und Initialisierung: ${n} als Ganzzahl = 0“)`); e.frame.vtype = 'int'; }
      model.methods = [];
      const seen = new Set();
      // Reihenfolge: erst das Hauptprogramm, dann die Unterprogramme in der Reihenfolge, in der sie aufgerufen werden –
      // so sind die Datentypen der Parameter (aus den Aufrufen) bekannt, bevor ein Unterprogramm übersetzt wird
      const ruft = (m) => { const t = []; Struktogramm.walk({ attributes: [], methods: [m] }, b => t.push(b.kind === 'stmt' ? b.text : b.kind === 'if' ? b.cond : b.head)); const s = t.join('\n'); return this.doc.methods.filter(x => x !== m && x.name && new RegExp('\\b' + x.name + '\\s*\\(').test(s)); };
      const folge = []; const start = this.doc.methods.filter(x => x.name === '_run');
      const warte = start.slice();
      while (warte.length) { const m = warte.shift(); if (folge.includes(m)) continue; folge.push(m); for (const x of ruft(m)) if (!folge.includes(x)) warte.push(x); }
      for (const m of this.doc.methods) if (!folge.includes(m)) folge.push(m);
      const fertig = new Map();
      for (const m of folge) {
        this.aktMethode = m;
        if (!/^[A-Za-z_]\w*$/.test(m.name)) { this.err(m.id, m.name ? nameFehler(m.name, 'Name für ein Unterprogramm') : 'Name des Unterprogramms fehlt'); continue; }
        if (seen.has(m.name)) { this.err(m.id, `Unterprogramm ${m.name} gibt es schon`); continue; }
        seen.add(m.name);
        const rtype = m.rtype === 'void' || !m.rtype ? 'void' : TYPES[m.rtype];
        if (!rtype) { this.err(m.id, `Unbekannter Rückgabetyp „${m.rtype}“`); continue; }
        const sm = F.method(m.name, rtype, 'public');
        this.map.set(sm.id, m.id);
        const scope = new Scope(fieldScope);
        m.params.forEach((p, i) => p._i = i);
        for (const p of m.params) {
          const pt = this.paramTyp(m, p._i, p); delete p._i;
          if (!/^[A-Za-z_]\w*$/.test(p.name)) { this.err(m.id, nameFehler(p.name, 'Parametername') || `Parameter „${p.name}“ ist ungültig`); continue; }
          if (isArrayType(pt) && !Struktogramm.arraysErlaubt) { this.err(m.id, 'Arrays gibt es nur im Array Trainingscamp und im Abi-Drill'); continue; }
          if (scope.vars.has(p.name)) { this.err(m.id, `Parameter ${p.name} doppelt`); continue; }
          scope.declare(p.name, pt);
          sm.params.push({ type: pt, name: p.name, id: Programm.newId() });
        }
        // Missionsrahmen: die Deklarationen am Anfang des Hauptprogramms stehen vor dem Rahmen und laufen nur einmal
        const vorK = m.name === '_run' && this.opts.rahmen ? Struktogramm.vorspann(m.body, m) : 0;
        const vor = vorK ? this.block(m.body.slice(0, vorK), scope) : [];
        sm.body = this.block(vorK ? m.body.slice(vorK) : m.body, scope);
        if (m.name === '_run' && this.opts.rahmen) {
          // Dynamische Missionen: das Hauptprogramm läuft in einem festen Rahmen „Wiederhole solange die Mission läuft“,
          // der in jedem Takt der Weltuhr einmal durchlaufen wird (Kästchen-Id RAHMEN_ID für die Hervorhebung)
          const w = this.link(F.while('_missionLaeuft()'), Struktogramm.RAHMEN_ID);
          w.body = sm.body.concat([this.link(F.call('_naechsterTakt()'), Struktogramm.RAHMEN_ID)]);
          sm.body = vor.concat([w]);
        }
        for (const [n, e] of scope.vars) if (e.pending) { this.err(this.map.get(e.frame.id), `Datentyp von ${n} bitte angeben („Deklaration und Initialisierung: ${n} als Ganzzahl = 0“)`); e.frame.vtype = 'int'; }
        // Rückgabe fehlt?
        if (rtype !== 'void' && !endsWithReturn(sm.body)) this.err(m.id, 'Am Ende des Unterprogramms fehlt „Rückgabe: …“');
        fertig.set(m, sm);
      }
      for (const m of this.doc.methods) if (fertig.has(m)) model.methods.push(fertig.get(m));
      if (!model.methods.some(x => x.name === '_run')) { const r = F.method('_run', 'void'); model.methods.unshift(r); }
      return { model, map: this.map, errors: this.errors };
    }
  }
  /* Ausdruck nur aus Literalen und Operatoren (keine Namen, keine Aufrufe)? */
  function istKonstant(a) {
    if (!a || typeof a !== 'object') return false;
    switch (a.n) {
      case 'lit': return true;
      case 'paren': return istKonstant(a.a);
      case 'un': return istKonstant(a.a);
      case 'bin': return istKonstant(a.a) && istKonstant(a.b);
      case 'cond': return istKonstant(a.c) && istKonstant(a.a) && istKonstant(a.b);
      default: return false;
    }
  }
  function endsWithReturn(list) {
    if (!list.length) return false;
    const l = list[list.length - 1];
    if (l.type === 'return') return true;
    if (l.type === 'if' && l.else) return endsWithReturn(l.then) && endsWithReturn(l.else);
    return false;
  }

  /* Übersetzen; opts.rahmen: Hauptprogramm in den Missionsrahmen setzen (dynamische Missionen) */
  Struktogramm.toProgramm = (doc, opts) => new Translator(doc, opts || {}).run();
  Struktogramm.RAHMEN_ID = 'rahmen';
  Struktogramm.RAHMEN_TEXT = 'Wiederhole solange die Mission läuft';

  /* ------------------------------------------------ Fehler je Kästchen (aus app.js, seit 25.10.2026 im Paket)
     t: Ergebnis von toProgramm ({ errors, map }), compileErrors: Fehler von Interp.compileClass → [{ boxId, msg }] in Schülerdeutsch */
  function kaestchenFehler(doc, t, compileErrors) {
    const out = (t.errors || []).slice();
    const seen = new Set(out.map(e => e.boxId));
    for (const e of compileErrors) {
      const bid = t.map && t.map.get(e.frameId);
      if (!bid || seen.has(bid)) continue;
      let msg = friendly(e.msg);
      // Variable aus einem anderen Programmteil (z. B. aus dem Hauptprogramm im Unterprogramm): gilt dort nicht (13.10.2026)
      const nb = /^„([\w$]+)“ ist nicht bekannt/.exec(msg);
      if (nb && anderswoDeklariert(doc, nb[1], bid)) msg = `„${nb[1]}“ ist hier nicht bekannt: Eine Variable gilt nur in dem Programm, in dem sie deklariert ist. Übergib den Wert als Parameter an das Unterprogramm.`;
      seen.add(bid); out.push({ boxId: bid, msg });
    }
    return out;
  }
  function anderswoDeklariert(doc, name, boxId) {
    const re = new RegExp('^Deklaration[^:]*:\\s*' + name + '\\b');
    const hier = doc.methods.find(m => { let drin = false; Struktogramm.walk({ attributes: [], methods: [m] }, b => { if (b.id === boxId) drin = true; }); return drin; });
    return doc.methods.some(m => m !== hier && (m.params.some(p => p.name === name) || (() => { let ja = false; Struktogramm.walk({ attributes: [], methods: [m] }, b => { if (b.kind === 'stmt' && re.test(String(b.text).trim())) ja = true; }); return ja; })()));
  }
  /* javac-Deutsch → Schülerdeutsch */
  function friendly(msg) {
    let m;
    if ((m = /^Inkompatible Typen: (\S+) kann nicht in (\S+) konvertiert werden/.exec(msg))) return `Hier wird ${de(m[2])} erwartet, der Ausdruck ergibt aber ${de(m[1])}`;
    if (/Symbol nicht gefunden|cannot find symbol/.test(msg)) { const v = /Symbol:\s+(?:Variable|Methode)\s+([\w$]+)/.exec(msg); return v ? `„${v[1]}“ ist nicht bekannt (Variable nicht deklariert oder Befehl falsch geschrieben?)` : 'Unbekannter Name'; }
    if (/Rückgabeanweisung fehlt/.test(msg)) return 'Am Ende des Unterprogramms fehlt „Rückgabe: …“';
    if (/Nicht erreichbare Anweisung/.test(msg)) return 'Dieses Kästchen wird nie erreicht (steht nach „Rückgabe“)';
    if ((m = /Variable (\w+) ist bereits/.exec(msg))) return `Die Variable ${m[1]} gibt es schon`;
    if (/Ungültiger Ausdruck/.test(msg)) return 'Der Ausdruck ist nicht verständlich – Klammern, Anführungszeichen und Operatoren prüfen';
    if ((m = /Methode (\w+) in Klasse \w+ kann nicht auf die angegebenen Typen angewendet werden/.exec(msg))) return `„${m[1]}“ wird mit falschen Parametern aufgerufen`;
    if (/Unerwarteter Rückgabewert/.test(msg)) return 'Dieses Unterprogramm hat keinen Rückgabetyp – „Rückgabe:“ ohne Wert oder Rückgabetyp im Kopf festlegen';
    if (/Rückgabewert fehlt/.test(msg)) return 'Nach „Rückgabe:“ fehlt der Wert';
    return msg.split('\n')[0];
  }
  function de(t) { return { int: 'eine Ganzzahl', double: 'eine Dezimalzahl', String: 'eine Zeichenkette', boolean: 'ein Wahrheitswert (wahr/falsch)', void: 'nichts' }[t] || t; }

  Struktogramm.kaestchenFehler = kaestchenFehler;
  Struktogramm.freundlich = friendly;
  /* Übersetzen und prüfen in einem Schritt: { ok, errors: [{ boxId, msg }], cls, map, model } */
  Struktogramm.pruefen = function (doc, opts) {
    const t = Struktogramm.toProgramm(doc, opts || {});
    const c = Interp.compileClass(t.model);
    const errors = kaestchenFehler(doc, t, c.errors || []);
    return { ok: !!c.ok && !errors.length, errors, cls: c.ok ? c.cls : null, map: t.map, model: t.model };
  };

  /* ------------------------------------------------ Programmbaum → Struktogramm (für die Musterlösungen) */
  function javaToBW(src, userMethods) {
    let s = String(src == null ? '' : src);
    // Zeichenketten aussparen
    const parts = []; let out = '', i = 0;
    while (i < s.length) {
      if (s[i] === '"') { let j = i + 1; while (j < s.length && s[j] !== '"') { if (s[j] === '\\') j++; j++; } out += s.slice(i, j + 1).replace(/"\\n"/g, 'Zeilenumbruch'); i = j + 1; continue; }
      let j = i; while (j < s.length && s[j] !== '"') j++;
      let seg = s.slice(i, j);
      seg = seg.replace(/&&/g, ' AND ').replace(/\|\|/g, ' OR ').replace(/!(?![=])/g, 'NOT ').replace(/\s+/g, ' ');
      out += seg; i = j;
    }
    // a.equals(b) → a == b ; NOT a.equals(b) → a != b
    out = out.replace(/NOT\s+([A-Za-z_]\w*(?:\(\)|\[[^\]]*\])?)\.equals\(([^()]*)\)/g, '$1 != $2').replace(/([A-Za-z_]\w*(?:\(\)|\[[^\]]*\])?)\.equals\(([^()]*)\)/g, '$1 == $2'); // auch inventar[i].equals("x")
    out = out.replace(/\(\)\s*\+\s*"\\n"/g, '() + Zeilenumbruch').replace(/\+ "\\n"/g, '+ Zeilenumbruch');
    out = out.replace(/\b([A-Za-z_]\w*)\.size\(\)/g, 'Anzahl der Elemente des Arrays $1');
    // Peetie-Befehle behalten ihre Klammern; Aufrufe eigener Unterprogramme mit „Aufruf:“
    out = out.replace(/\b([A-Za-z_]\w*)\(/g, (m, n, off) => userMethods.has(n) && !/Aufruf:\s*$/.test(out.slice(0, off)) ? 'Aufruf: ' + m : m);
    return out.trim();
  }
  Struktogramm.fromProgramm = function (model, name) {
    const doc = Struktogramm.newDoc(name || '');
    const um = new Map(model.methods.map(m => [m.name, m]));
    const zaehler = new Map(); // Zählvariable → Startwert der (ersten) Schleife
    const conv = (frames, isField) => {
      const out = [];
      for (const f of frames) {
        if (f.enable === false || f.type === 'comment' || f.type === 'blank') continue;
        switch (f.type) {
          case 'var': {
            const t = TYPES_DE[f.vtype] || f.vtype;
            let v = f.value == null ? null : String(f.value).trim();
            const em = v && /^einlesen(Ganzzahl|Dezimalzahl|Zeichenkette)\(("[^"]*")?\)$/.exec(v);
            if (isArrayType(f.vtype)) out.push(B.stmt(v == null || v === '' || /^\[\s*\]$/.test(v) ? `Deklaration und Initialisierung: ${f.name} als Array = [ ]` : `Deklaration und Initialisierung: ${f.name} = ${javaToBW(v, um)}`));
            else if (em) out.push(B.stmt(`Deklaration und Einlesen: ${f.name} als ${t}`));
            else if (v == null || v === '') out.push(B.stmt(`Deklaration und Initialisierung: ${f.name} als ${t} = ${({ Ganzzahl: '0', Dezimalzahl: '0.0', Zeichenkette: '""', Wahrheitswert: 'false' })[t] || '0'}`)); // Guana 06.10.2026: immer mit Startwert
            else out.push(B.stmt(`Deklaration und Initialisierung: ${f.name} als ${t} = ${javaToBW(v, um)}`));
            break;
          }
          case 'assign': {
            const v = String(f.src).trim();
            if (/^einlesen(Ganzzahl|Dezimalzahl|Zeichenkette)\(("[^"]*")?\)$/.test(v)) out.push(B.stmt(`Einlesen: ${f.dest}`));
            else out.push(B.stmt(`Zuweisung: ${javaToBW(f.dest, um)} = ${javaToBW(v, um)}`)); // auch links: a[a.size()] → a[Anzahl der Elemente des Arrays a]
            break;
          }
          case 'call': {
            const e = String(f.expr).trim();
            const ta = /^textAusgeben\((.*)\)$/.exec(e);
            if (ta) { let a = ta[1]; a = a.replace(/^"" \+ \(?(.*?)\)?$/, '$1'); out.push(B.stmt(`Ausgabe: ${javaToBW(a, um)}`)); break; }
            const cm = /^([A-Za-z_]\w*)\((.*)\)$/.exec(e);
            if (cm && um.has(cm[1])) out.push(B.stmt(`Aufruf: ${cm[1]}(${javaToBW(cm[2], um)})`));
            else if (cm && cm[2] === '') out.push(B.stmt(cm[1] + '()'));
            else out.push(B.stmt(javaToBW(e, um)));
            break;
          }
          case 'return': out.push(B.stmt('Rückgabe: ' + (f.value == null ? '' : javaToBW(f.value, um)))); break;
          case 'if': {
            let els = f.else ? conv(f.else) : [];
            for (let i = f.elseifs.length - 1; i >= 0; i--) els = [B.if(javaToBW(f.elseifs[i].cond, um), conv(f.elseifs[i].body), els)];
            out.push(B.if(javaToBW(f.cond, um), conv(f.then), els));
            break;
          }
          case 'while': out.push(B.loop('Wiederhole solange ' + javaToBW(f.cond, um), conv(f.body))); break;
          case 'foreach': {
            const r = /^(.+?)\.\.(.+)$/.exec(String(f.coll).trim());
            if (r) { if (!zaehler.has(f.var)) zaehler.set(f.var, javaToBW(r[1], um)); out.push(B.loop(`Zähle ${f.var} von ${javaToBW(r[1], um)} bis ${javaToBW(r[2], um)}, Schrittweite 1`, conv(f.body))); }
            else out.push(B.loop(`Wiederhole für ${f.var} in ${f.coll}`, conv(f.body)));
            break;
          }
          case 'break': out.push(B.stmt('Abbruch')); break;
        }
      }
      return out;
    };
    // Felder des Modells = Variablen am Anfang des Hauptprogramms (es gibt keinen eigenen Variablenbereich mehr, 13.10.2026)
    const felder = conv(model.fields, true);
    const zaehlerJe = new Map();
    doc.methods = model.methods.map(m => { zaehler.clear(); const body = conv(m.body); const meth = B.method(m.name, m.params.map(p => ({ name: p.name, type: Object.keys(PARAM_TYPES).find(k => PARAM_TYPES[k] === p.type && !TYPES[k] === isArrayType(p.type)) || TYPES_DE[p.type] || p.type })), m.rtype === 'void' ? 'void' : (TYPES_DE[m.rtype] || m.rtype), body); zaehlerJe.set(meth, new Map(zaehler)); return meth; });
    if (!doc.methods.some(m => m.name === '_run')) doc.methods.unshift(B.method('_run'));
    doc.methods.sort((a, b) => (a.name === '_run' ? 0 : 1) - (b.name === '_run' ? 0 : 1));
    const run = doc.methods.find(m => m.name === '_run'); run.body = felder.concat(run.body);
    // Zählvariablen müssen deklariert sein: am Anfang des Programms bzw. Unterprogramms, das die Schleife enthält
    for (const meth of doc.methods) {
      const deklariert = (n) => { let found = false; Struktogramm.walk({ attributes: [], methods: [meth] }, b => { if (b.kind === 'stmt' && new RegExp('^Deklaration[^:]*:\\s*' + n + '\\s+als\\b').test(b.text)) found = true; }); return found || meth.params.some(p => p.name === n); };
      const neu = [];
      for (const [n, start] of zaehlerJe.get(meth) || []) if (!deklariert(n)) neu.push(B.stmt(`Deklaration und Initialisierung: ${n} als Ganzzahl = ${/^-?\d+$/.test(start) ? start : 1}`));
      if (neu.length) { const k = Struktogramm.vorspann(meth.body); meth.body.splice(k, 0, ...neu); }
    }
    return doc;
  };

  /* ------------------------------------------------ Textbausteine (Operatorenliste BW 2.2) */
  Struktogramm.TEMPLATES = {
    stmt: [
      { t: 'Deklaration und Initialisierung: variable als Ganzzahl = wert', d: 'Variable anlegen und mit Startwert füllen' },
      { t: 'Deklaration: variable als Ganzzahl', d: 'Deklaration einer Variablen ohne Startwert (Ganzzahl, Dezimalzahl, Zeichenkette, Wahrheitswert)' },
      { t: 'Initialisierung: variable = wert', d: 'Startwert einer bereits deklarierten Variablen' },
      { t: 'Zuweisung: variable = wert', d: 'Wert (oder Rechenergebnis) einer Variablen zuweisen' },
      { t: 'Einlesen: variable', d: 'Eingabe in eine deklarierte Variable einlesen' },
      { t: 'Deklaration und Einlesen: variable als Ganzzahl', d: 'Variable anlegen und Eingabe einlesen' },
      { t: 'Ausgabe: variable', d: 'Wert einer Variablen ausgeben' },
      { t: 'Ausgabe: "Text " + variable', d: 'Text ausgeben' },
      { t: 'Ausgabe: "Text " + variable + Zeilenumbruch', d: 'Ausgabe mit Zeilenumbruch (Operatorenliste: „Zeilenweise Ausgabe“)' },
      { t: 'Ausgabe: Zeilenumbruch', d: 'Nur eine neue Zeile ausgeben (Operatorenliste: „Zeilenweise Ausgabe“)' },
      { t: 'Rückgabe: wert', d: 'Wert an das aufrufende Programm zurückgeben' },
      { t: 'Aufruf: unterprogramm(parameter)', d: 'Eigenes Unterprogramm aufrufen' },
      // Arrays (Operatorenliste 2.2, Seite 2); arr: nur im Array Trainingscamp (Struktogramm.arraysErlaubt)
      { t: 'Deklaration und Initialisierung: array = [wert1, wert2, wert3]', d: 'Array anlegen und mit Werten füllen (das erste Element hat den Index 0)', arr: true },
      { t: 'Deklaration und Initialisierung: array als Array = [ ]', d: 'Leeres Array anlegen', arr: true },
      { t: 'Zuweisung: array[index] = wert', d: 'Element eines Arrays ändern; Index = Anzahl der Elemente hängt einen Wert an', arr: true },
      { t: 'Ausgabe: array[index]', d: 'Ein Element ausgeben – „Ausgabe: array“ zeigt das ganze Array', arr: true },
      { t: 'Ausgabe: array', d: 'Das ganze Array ausgeben', arr: true },
      { t: 'Deklaration und Initialisierung: anzahl = Anzahl der Elemente des Arrays array', d: 'Anzahl der Elemente eines Arrays (geht auch in Bedingungen und Schleifenköpfen)', arr: true }
    ],
    if: [
      { t: 'bedingung', d: 'Vergleiche: ==, !=, <, <=, >, >=  Logik: AND, OR, NOT' }
    ],
    loop: [
      { t: 'Wiederhole solange bedingung', d: 'Schleife mit vorausgehender Prüfung (while)' },
      { t: 'Wiederhole von variable = startwert solange bedingung, Schrittweite schrittweite', d: 'Zählergesteuerte Schleife, Darstellung 1 (z. B. Wiederhole von i = 0 solange i < 5, Schrittweite 1)' },
      { t: 'Zähle zählvariable von startwert bis endwert, Schrittweite schrittweite', d: 'Zählergesteuerte Schleife, Darstellung 2 (z. B. Zähle i von 1 bis 10, Schrittweite 1)' },
      // „Zähle i von 0 bis Anzahl der Elemente des Arrays array - 1 …“ als eigener Baustein entfernt (Guana 25.10.2026: nur, was wörtlich in der Operatorenliste steht)
    ]
  };
  /* Arrays: bis 23.10.2026 nur im Array Trainingscamp und Abi-Drill, seit 24.10.2026 überall (Guana) – app.js setzt das Flag beim Missionswechsel */
  Struktogramm.arraysErlaubt = false;
  Struktogramm.templates = (kind) => (Struktogramm.TEMPLATES[kind] || []).filter(t => !t.arr || Struktogramm.arraysErlaubt);
})();
