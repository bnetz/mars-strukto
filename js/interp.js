/*
 * Übersetzer + Ausführer für den Programmbaum (programm.js). Die Klasse heißt aus historischen Gründen Peetie und erbt von AI_Robot (Interp.Host.basis()).
 * - Lexer/Parser für die Java-artigen Ausdrücke, die der Struktogramm-Übersetzer erzeugt
 * - statische Typprüfung mit javac-ähnlichen (deutschen) Fehlermeldungen; app.js übersetzt sie in Schülerdeutsch
 * - Übersetzung in asynchrone Closures (Peeties Befehle warten auf die Weltuhr)
 */
'use strict';
window.Interp = {}; // nur als Eigenschaft von window, kein const – sonst bricht eine Seite ab, die selbst schon „Interp“ kennt (26.10.2026)

(function () {
  /* ================================================================ Lexer */
  const KEYWORDS = new Set(['true', 'false', 'null', 'new', 'this', 'super', 'instanceof', 'int', 'double', 'boolean', 'char', 'long', 'float', 'short', 'byte', 'void', 'class']);
  const OPS = ['>>>=', '<<=', '>>=', '>>>', '...', '..', '<:', '->', '++', '--', '&&', '||', '==', '!=', '<=', '>=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<', '>>', '(', ')', '[', ']', '{', '}', ',', '.', '?', ':', '!', '~', '+', '-', '*', '/', '%', '<', '>', '=', '&', '|', '^', ';', '@'];
  class CompileError extends Error { constructor(msg, pos, end) { super(msg); this.pos = pos; this.end = end; } }
  Interp.CompileError = CompileError;

  function lex(src) {
    const toks = []; let i = 0; const n = src.length;
    while (i < n) {
      const c = src[i];
      if (/\s/.test(c)) { i++; continue; }
      const st = i;
      if (/[A-Za-z_$À-ɏ]/.test(c)) {
        while (i < n && /[A-Za-z0-9_$À-ɏ]/.test(src[i])) i++;
        const w = src.slice(st, i);
        toks.push({ k: KEYWORDS.has(w) ? 'kw' : 'id', v: w, s: st, e: i });
        continue;
      }
      if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || '') && src[i - 1] !== '.')) {
        if (c === '0' && /[xX]/.test(src[i + 1] || '')) { i += 2; while (i < n && /[0-9a-fA-F_]/.test(src[i])) i++; let t = 'int'; if (/[lL]/.test(src[i] || '')) { i++; t = 'long'; } toks.push({ k: 'num', t, v: parseInt(src.slice(st + 2, i).replace(/[lL_]/g, ''), 16), raw: src.slice(st, i), s: st, e: i }); continue; }
        while (i < n && /[0-9_]/.test(src[i])) i++;
        let isD = false;
        if (src[i] === '.' && src[i + 1] !== '.' && !/[A-Za-z_]/.test(src[i + 1] || '')) { isD = true; i++; while (i < n && /[0-9_]/.test(src[i])) i++; }
        if (/[eE]/.test(src[i] || '') && /[0-9+-]/.test(src[i + 1] || '')) { isD = true; i++; if (/[+-]/.test(src[i])) i++; while (i < n && /[0-9]/.test(src[i])) i++; }
        let t = isD ? 'double' : 'int';
        if (/[lL]/.test(src[i] || '')) { t = 'long'; i++; } else if (/[fF]/.test(src[i] || '')) { t = 'float'; i++; } else if (/[dD]/.test(src[i] || '')) { t = 'double'; i++; }
        const raw = src.slice(st, i);
        const num = parseFloat(raw.replace(/[_lLfFdD]/g, ''));
        if (t === 'int' && num > 2147483648) throw new CompileError('Ganzzahl zu groß', st, i);
        toks.push({ k: 'num', t, v: num, raw, s: st, e: i });
        continue;
      }
      if (c === '"') {
        i++; let v = '';
        while (i < n && src[i] !== '"') {
          if (src[i] === '\\') { i++; v += unesc(src[i]); i++; } else v += src[i++];
        }
        if (i >= n) throw new CompileError('Nicht geschlossenes Zeichenfolgenliteral', st, n);
        i++; toks.push({ k: 'str', v, s: st, e: i }); continue;
      }
      if (c === "'") {
        i++; let v;
        if (src[i] === '\\') { i++; v = unesc(src[i]); i++; } else v = src[i++];
        if (src[i] !== "'") throw new CompileError('Nicht geschlossenes Zeichenliteral', st, i);
        i++; toks.push({ k: 'chr', v: v.charCodeAt(0), s: st, e: i }); continue;
      }
      const op = OPS.find(o => src.startsWith(o, i));
      if (!op) throw new CompileError('Unzulässiges Zeichen: "' + c + '"', i, i + 1);
      i += op.length; toks.push({ k: 'op', v: op, s: st, e: i });
    }
    toks.push({ k: 'eof', v: '', s: n, e: n });
    return toks;
  }
  function unesc(c) { return ({ n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', '0': '\0', '\\': '\\', '"': '"', "'": "'" })[c] ?? c; }

  /* ================================================================ Parser */
  const PRIM = new Set(['int', 'double', 'boolean', 'char', 'long', 'float', 'short', 'byte', 'void']);
  const BIN = {
    '||': 3, '&&': 4, '|': 5, '^': 6, '&': 7, '==': 8, '!=': 8, '<': 9, '>': 9, '<=': 9, '>=': 9, 'instanceof': 9, '<:': 9,
    '<<': 10, '>>': 10, '>>>': 10, '+': 11, '-': 11, '*': 12, '/': 12, '%': 12
  };
  class Parser {
    constructor(src, allowRange) { this.src = src; this.t = lex(src); this.p = 0; this.allowRange = allowRange; }
    peek(o = 0) { return this.t[this.p + o]; }
    next() { return this.t[this.p++]; }
    is(v, o = 0) { const t = this.peek(o); return (t.k === 'op' || t.k === 'kw') && t.v === v; }
    expect(v) { const t = this.next(); if ((t.k !== 'op' && t.k !== 'kw') || t.v !== v) throw new CompileError("'" + v + "' erwartet", t.s, t.e); return t; }
    fail(t, msg) { throw new CompileError(msg || 'Ungültiger Ausdruck', t.s, Math.max(t.e, t.s + 1)); }
    parseFull() {
      if (this.peek().k === 'eof') throw new CompileError('Ausdruck fehlt', 0, 0);
      const e = this.expr();
      const t = this.peek();
      if (t.k !== 'eof') this.fail(t, t.v === ';' ? "Ein Semikolon ist hier nicht nötig" : 'Ungültiger Ausdruck');
      return e;
    }
    expr() {
      const e = this.ternary();
      if (this.is('..')) {
        const op = this.next(); const r = this.ternary();
        if (!this.allowRange) this.fail(op, "Bereich '..' ist nur in for-each erlaubt");
        return { n: 'range', a: e, b: r, s: e.s, e: r.e };
      }
      return e;
    }
    ternary() {
      const c = this.binary(0);
      if (this.is('?')) { this.next(); const a = this.ternary(); this.expect(':'); const b = this.ternary(); return { n: 'cond', c, a, b, s: c.s, e: b.e }; }
      if (this.peek().k === 'op' && /^([+\-*/%&|^]|<<|>>>?)?=$/.test(this.peek().v) && this.peek().v !== '==') {
        const t = this.peek(); this.fail(t, t.v === '=' ? "Eine Zuweisung gehört in ein eigenes Kästchen (Zuweisung: …)" : "Operator '" + t.v + "' ist hier nicht erlaubt");
      }
      return c;
    }
    binary(minP) {
      let l = this.unary();
      for (; ;) {
        const t = this.peek();
        const op = (t.k === 'op' || (t.k === 'kw' && t.v === 'instanceof')) ? t.v : null;
        const p = op != null ? BIN[op] : undefined;
        if (p === undefined || p <= minP) break;
        this.next();
        if (op === 'instanceof' || op === '<:') { const ty = this.type(); l = { n: 'instanceof', a: l, ty, s: l.s, e: ty.e }; continue; }
        const r = this.binary(p);
        l = { n: 'bin', op, a: l, b: r, s: l.s, e: r.e, opPos: t.s };
      }
      return l;
    }
    unary() {
      const t = this.peek();
      if (t.k === 'op' && ['!', '-', '+', '~'].includes(t.v)) { this.next(); const a = this.unary(); return { n: 'un', op: t.v, a, s: t.s, e: a.e }; }
      if (t.k === 'op' && (t.v === '++' || t.v === '--')) { this.next(); const a = this.unary(); return { n: 'incdec', op: t.v, pre: true, a, s: t.s, e: a.e }; }
      if (t.k === 'op' && t.v === '(' && this.looksLikeCast()) {
        this.next(); const ty = this.type(); this.expect(')'); const a = this.unary();
        return { n: 'cast', ty, a, s: t.s, e: a.e };
      }
      return this.postfix(this.primary());
    }
    looksLikeCast() {
      const a = this.peek(1), b = this.peek(2);
      if (a.k === 'kw' && PRIM.has(a.v)) { return b.k === 'op' && b.v === ')'; }
      if (a.k === 'id' && b.k === 'op' && b.v === ')' && /^[A-Z]/.test(a.v)) {
        const c = this.peek(3);
        return c.k === 'id' || c.k === 'num' || c.k === 'str' || c.k === 'chr' || (c.k === 'kw' && ['this', 'new', 'true', 'false', 'null', 'super'].includes(c.v)) || (c.k === 'op' && (c.v === '(' || c.v === '!' || c.v === '~'));
      }
      return false;
    }
    type() {
      const t = this.next();
      if (t.k === 'kw' && PRIM.has(t.v)) { let name = t.v; let e = t.e; while (this.is('[') && this.is(']', 1)) { this.next(); e = this.next().e; name += '[]'; } return { name, s: t.s, e }; }
      if (t.k !== 'id') this.fail(t, 'Typ erwartet');
      let name = t.v, e = t.e;
      while (this.is('.') && this.peek(1).k === 'id') { this.next(); const u = this.next(); name += '.' + u.v; e = u.e; }
      if (this.is('<')) { let depth = 0; do { const x = this.next(); if (x.v === '<') depth++; else if (x.v === '>') depth--; else if (x.v === '>>') depth -= 2; name += x.v; e = x.e; if (x.k === 'eof') this.fail(x); } while (depth > 0); }
      while (this.is('[') && this.is(']', 1)) { this.next(); e = this.next().e; name += '[]'; }
      return { name, s: t.s, e };
    }
    args() {
      this.expect('('); const a = [];
      if (this.is(')')) { const c = this.next(); a.close = c.e; return a; }
      for (; ;) { a.push(this.ternary()); if (this.is(',')) { this.next(); continue; } const c = this.expect(')'); a.close = c.e; return a; }
    }
    primary() {
      const t = this.next();
      switch (t.k) {
        case 'num': return { n: 'lit', t: t.t, v: t.v, s: t.s, e: t.e };
        case 'str': return { n: 'lit', t: 'String', v: t.v, s: t.s, e: t.e };
        case 'chr': return { n: 'lit', t: 'char', v: t.v, s: t.s, e: t.e };
        case 'kw':
          if (t.v === 'true' || t.v === 'false') return { n: 'lit', t: 'boolean', v: t.v === 'true', s: t.s, e: t.e };
          if (t.v === 'null') return { n: 'lit', t: 'null', v: null, s: t.s, e: t.e };
          if (t.v === 'this') { if (this.is('(')) this.fail(t, 'this(...) ist hier nicht erlaubt'); return { n: 'this', s: t.s, e: t.e }; }
          if (t.v === 'super') { this.expect('.'); const id = this.next(); if (id.k !== 'id') this.fail(id, 'Name erwartet'); const a = this.args(); return { n: 'call', obj: { n: 'super', s: t.s, e: t.e }, name: id.v, args: a, s: t.s, e: a.close, ns: id.s, ne: id.e }; }
          if (t.v === 'new') {
            const ty = this.type();
            if (this.is('[')) this.fail(this.peek(), 'Arrays werden hier nicht unterstützt');
            const a = this.args(); return { n: 'new', ty, args: a, s: t.s, e: a.close };
          }
          if (PRIM.has(t.v) && this.is('.') && this.is('class', 1)) { this.next(); const c = this.next(); return { n: 'classlit', name: t.v, s: t.s, e: c.e }; }
          this.fail(t, 'Unzulässiger Ausdrucksbeginn');
          break;
        case 'id':
          if (this.is('(')) { const a = this.args(); return { n: 'call', obj: null, name: t.v, args: a, s: t.s, e: a.close, ns: t.s, ne: t.e }; }
          return { n: 'name', name: t.v, s: t.s, e: t.e };
        case 'op':
          if (t.v === '(') { const e = this.ternary(); const c = this.expect(')'); return { n: 'paren', a: e, s: t.s, e: c.e }; }
          if (t.v === '[') {
            // Array-Literal [a, b, c] (Struktogramm-Arrays, Operatorenliste 2.2); intern eine wachsende Liste
            const items = [];
            if (this.is(']')) { const c = this.next(); return { n: 'list', items, s: t.s, e: c.e }; }
            for (; ;) { items.push(this.ternary()); if (this.is(',')) { this.next(); continue; } const c = this.expect(']'); return { n: 'list', items, s: t.s, e: c.e }; }
          }
          this.fail(t, t.v === ')' ? 'Ausdruck fehlt' : 'Unzulässiger Ausdrucksbeginn');
          break;
        case 'eof': throw new CompileError('Ausdruck unvollständig', t.s, t.s);
      }
      this.fail(t);
    }
    postfix(e) {
      for (; ;) {
        if (this.is('.')) {
          this.next(); const id = this.next();
          if (id.k === 'kw' && id.v === 'class') { e = { n: 'classlit', name: e.n === 'name' ? e.name : '?', of: e, s: e.s, e: id.e }; continue; }
          if (id.k !== 'id') this.fail(id, 'Name erwartet');
          if (this.is('(')) { const a = this.args(); e = { n: 'call', obj: e, name: id.v, args: a, s: e.s, e: a.close, ns: id.s, ne: id.e }; }
          else e = { n: 'field', obj: e, name: id.v, s: e.s, e: id.e, ns: id.s };
        } else if (this.is('[')) {
          // Elementzugriff a[i]
          const o = this.next();
          if (this.is(']')) this.fail(this.peek(), 'Der Index fehlt (z. B. zahlen[0])');
          const i = this.ternary(); const c = this.expect(']');
          e = { n: 'index', a: e, i, s: e.s, e: c.e, bs: o.s };
        } else if (this.is('++') || this.is('--')) {
          const t = this.next(); e = { n: 'incdec', op: t.v, pre: false, a: e, s: e.s, e: t.e };
        } else return e;
      }
    }
  }
  Interp.parseExpr = (src, allowRange) => new Parser(String(src), allowRange).parseFull();
  Interp.parseType = (src) => {
    const p = new Parser(String(src), false);
    if (p.peek().k === 'eof') throw new CompileError('Typ fehlt', 0, 0);
    const t = p.type(); if (p.peek().k !== 'eof') p.fail(p.peek(), 'Ungültiger Typ');
    return t.name;
  };

  /* ================================================================ Typsystem */
  const NUM_RANK = { byte: 1, short: 2, char: 2, int: 3, long: 4, float: 5, double: 6 };
  const isNum = (t) => NUM_RANK[t] !== undefined;
  const isIntegral = (t) => ['byte', 'short', 'char', 'int', 'long'].includes(t);
  const isPrim = (t) => PRIM.has(t) || t === 'null';
  const BOX = { int: 'Integer', double: 'Double', boolean: 'Boolean', char: 'Character', long: 'Long', float: 'Float', short: 'Short', byte: 'Byte' };
  const UNBOX = Object.fromEntries(Object.entries(BOX).map(([a, b]) => [b, a]));
  const baseType = (t) => String(t).replace(/<.*>$/, '');
  const typeArg = (t) => { const m = /<(.*)>$/.exec(t); return m ? m[1] : 'Object'; };

  // Klassenhierarchie (Szenario + Welt-Laufzeit + java.lang)
  const SUPER = {
    Object: null, String: 'Object', Integer: 'Number', Double: 'Number', Number: 'Object', Boolean: 'Object', Character: 'Object', Long: 'Number', Float: 'Number', Short: 'Number', Byte: 'Number',
    List: 'Object', Class: 'Object', Math: 'Object', System: 'Object', PrintStream: 'Object',
    /* AI_Robot: Klasse mit den Befehlen, von der das Programm (Klasse Peetie) erbt. Eine Anwendung ergänzt Klassen über
       Interp.SUPER und Interp.def (Escape from Mars: js/peetie-befehle.js) */
    AI_Robot: 'Object', Peetie: 'AI_Robot'
  };
  Interp.SUPER = SUPER;
  function isSubclass(a, b) { a = baseType(a); b = baseType(b); while (a) { if (a === b) return true; a = SUPER[a]; } return false; }
  function knownClass(n) { return Object.prototype.hasOwnProperty.call(SUPER, baseType(n)); }

  // Zuweisungskompatibilität (Zuweisungskontext)
  function assignable(to, from, constVal) {
    if (to === from) return true;
    if (from === 'null') return !isPrim(to);
    if (isNum(to) && isNum(from)) {
      if (NUM_RANK[from] <= NUM_RANK[to] && !(to === 'char' && from !== 'char') && !(from === 'char' && to === 'short') && !(from === 'char' && to === 'byte')) return true;
      // Konstanten-Einengung (int-Literal in byte/short/char)
      if (constVal !== undefined && from === 'int' && ['byte', 'short', 'char'].includes(to)) return true;
      return false;
    }
    if (isPrim(to) && !isPrim(from)) { const u = UNBOX[baseType(from)]; return u ? assignable(to, u) : false; }
    if (!isPrim(to) && isPrim(from)) { if (from === 'void') return false; const b = BOX[from]; return b ? (b === baseType(to) || isSubclass(b, to)) : false; }
    if (baseType(to) === 'Object') return true;
    if (baseType(to) === baseType(from)) return true;
    return isSubclass(from, to);
  }
  const lossyMsg = (from, to) => `Inkompatible Typen: Möglicher Verlust bei Konvertierung von ${from} in ${to}`;
  const QN = { String: 'java.lang.String', Integer: 'java.lang.Integer', Double: 'java.lang.Double', Boolean: 'java.lang.Boolean', Character: 'java.lang.Character', Object: 'java.lang.Object', List: 'java.util.List', Class: 'java.lang.Class', Bild: 'greenfoot.Bild', Color: 'greenfoot.Color', Font: 'greenfoot.Font', World: 'greenfoot.World', Actor: 'greenfoot.Actor', MouseInfo: 'greenfoot.MouseInfo', Klang: 'greenfoot.Klang' };
  const qn = (t) => { if (t === 'null') return '<null>'; const b = baseType(t); const a = String(t).slice(b.length); return (QN[b] || b) + a.replace(/<([\w]+)>/, (m, x) => '<' + (QN[x] || x) + '>'); };
  Interp.qn = qn;
  /* Deutscher Typname für Meldungen an die Schüler (Arrays: List<elementtyp>) */
  const TYP_DE = { int: 'eine Ganzzahl', long: 'eine Ganzzahl', double: 'eine Dezimalzahl', float: 'eine Dezimalzahl', String: 'eine Zeichenkette', boolean: 'ein Wahrheitswert', char: 'ein Zeichen', void: 'nichts', null: 'null', Integer: 'eine Ganzzahl', Double: 'eine Dezimalzahl', Boolean: 'ein Wahrheitswert' };
  const TYP_PL = { int: 'Ganzzahlen', long: 'Ganzzahlen', double: 'Dezimalzahlen', float: 'Dezimalzahlen', String: 'Zeichenketten', boolean: 'Wahrheitswerten', char: 'Zeichen' };
  Interp.typName = (t) => {
    if (t == null) return 'unbekannt';
    const b = baseType(t);
    if (b === 'List') { const e = typeArg(t); return e === '?' ? 'ein leeres Array' : 'ein Array von ' + (TYP_PL[e] || e); }
    return TYP_DE[t] || String(t);
  };
  Interp.elemTyp = (t) => (baseType(t) === 'List' ? typeArg(t) : null);
  /* Laufzeitmeldung bei falschem Index; schreiben: Anhängen an Index = Anzahl erlaubt */
  Interp.indexMsg = (k, n, schreiben) => {
    const hat = n === 0 ? 'das Array ist leer' : n === 1 ? 'das Array hat nur ein Element (Index 0)' : `das Array hat ${n} Elemente (Index 0 bis ${n - 1})`;
    if (k < 0) return `Index ${k} gibt es nicht – der Index beginnt bei 0`;
    if (schreiben) return `Index ${k} gibt es nicht – ${hat}. Anhängen geht nur mit dem nächsten freien Index ${n}`;
    return `Index ${k} gibt es nicht – ${hat}`;
  };
  function incompatible(to, from) {
    if (isNum(to) && isNum(from)) return lossyMsg(from, to);
    return `Inkompatible Typen: ${qn(from)} kann nicht in ${qn(to)} konvertiert werden`;
  }
  const notFound = (kind, what, loc) => `Symbol nicht gefunden\n  Symbol: ${kind} ${what}\n  Ort: ${loc}`;

  /* ---------------------------------------------------------------- API-Tabellen */
  // Signaturen: "name(p1,p2):ret" ; Präfix: '+' öffentlich (Standard), '#' geschützt, '-' privat, '~' statisch
  const API = {};
  function def(cls, list) { API[cls] = API[cls] || { m: Object.create(null), f: Object.create(null) }; for (const s of list) addSig(cls, s); }
  Interp.def = def; // Anwendung: weitere Klassen und Befehle (Escape from Mars: js/peetie-befehle.js)
  function addSig(cls, s) {
    let acc = 'public', stat = false;
    // Präfixe: '#' geschützt, '-' privat, '~' statisch (bis 29.09.2026 's', was size(), stop(), substring() … zu statischen „ize()“ machte)
    while (/^[#\-~+]/.test(s)) { const c = s[0]; s = s.slice(1); if (c === '#') acc = 'protected'; else if (c === '-') acc = 'private'; else if (c === '~') stat = true; }
    const mm = /^([\w$]+)\((.*)\)(?::(.+))?$/.exec(s);
    if (mm) {
      const params = mm[2] ? mm[2].split(',').map(x => x.trim()) : [];
      (API[cls].m[mm[1]] = API[cls].m[mm[1]] || []).push({ name: mm[1], params, ret: mm[3] || 'void', access: acc, isStatic: stat, owner: cls });
    } else {
      const fm = /^([\w$]+):(.+)$/.exec(s);
      API[cls].f[fm[1]] = { name: fm[1], type: fm[2], access: acc, isStatic: stat, owner: cls };
    }
  }
  def('Object', ['toString():String', 'equals(Object):boolean', 'hashCode():int']);
  /* Allgemeine Befehle jedes Programms (Ausgabe, Einlesen); eine Anwendung kann AI_Robot neu festlegen (Escape from Mars: Peetie-Befehle) */
  def('AI_Robot', ['textAusgeben(String)', 'einlesenZeichenkette():String', 'einlesenDezimalzahl():double', 'einlesenGanzzahl():int', 'einlesenZeichenkette(String):String', 'einlesenDezimalzahl(String):double', 'einlesenGanzzahl(String):int', '_run()']);
  def('Math', ['~abs(int):int', '~abs(long):long', '~abs(double):double', '~max(int,int):int', '~max(long,long):long', '~max(double,double):double', '~min(int,int):int', '~min(long,long):long', '~min(double,double):double', '~pow(double,double):double', '~sqrt(double):double', '~cbrt(double):double',
    '~random():double', '~round(double):long', '~floor(double):double', '~ceil(double):double', '~sin(double):double', '~cos(double):double', '~tan(double):double', '~atan2(double,double):double', '~toRadians(double):double', '~toDegrees(double):double',
    '~log(double):double', '~log10(double):double', '~exp(double):double', '~hypot(double,double):double', '~signum(double):double', '~PI:double', '~E:double']);
  def('Integer', ['~parseInt(String):int', '~valueOf(int):Integer', '~toString(int):String', '~MAX_VALUE:int', '~MIN_VALUE:int', 'intValue():int', 'doubleValue():double']);
  def('Double', ['~parseDouble(String):double', '~valueOf(double):Double', '~toString(double):String', '~MAX_VALUE:double', '~MIN_VALUE:double', 'intValue():int', 'doubleValue():double']);
  def('Boolean', ['~parseBoolean(String):boolean', 'booleanValue():boolean']);
  def('Character', ['~isDigit(char):boolean', '~isLetter(char):boolean', '~toUpperCase(char):char', '~toLowerCase(char):char']);
  def('String', ['length():int', 'charAt(int):char', 'equals(Object):boolean', 'equalsIgnoreCase(String):boolean', 'isEmpty():boolean', 'substring(int):String', 'substring(int,int):String', 'indexOf(String):int', 'lastIndexOf(String):int',
    'contains(String):boolean', 'toUpperCase():String', 'toLowerCase():String', 'trim():String', 'startsWith(String):boolean', 'endsWith(String):boolean', 'replace(String,String):String', 'compareTo(String):int', 'toString():String', 'concat(String):String', 'isBlank():boolean', 'repeat(int):String',
    '~valueOf(Object):String']);
  def('List', ['size():int', 'get(int):E', 'isEmpty():boolean', 'contains(Object):boolean', 'remove(Object):boolean', 'add(E):boolean', 'clear()']);
  def('System', ['~currentTimeMillis():long', '~nanoTime():long', '~out:PrintStream']);
  def('PrintStream', ['println(Object)', 'println()', 'print(Object)']);
  const CTORS = { Object: [[]], String: [[], ['String']] };
  Interp.CTORS = CTORS; // Anwendung: Konstruktoren weiterer Klassen
  Interp.API = API;

  function findMethods(cls, name) {
    const r = []; let c = baseType(cls);
    const seen = new Set();
    while (c) {
      const a = API[c];
      if (a && a.m[name]) for (const m of a.m[name]) { const k = m.params.join(','); if (!seen.has(k)) { seen.add(k); r.push(m); } }
      c = SUPER[c];
    }
    if (!knownClass(cls) || isPrim(cls)) { const a = API.Object; if (a.m[name]) r.push(...a.m[name]); }
    return r;
  }
  function findField(cls, name) { let c = baseType(cls); while (c) { const a = API[c]; if (a && a.f[name]) return a.f[name]; c = SUPER[c]; } return null; }

  /* ================================================================ Laufzeit-Hilfen */
  /* Java-Ausnahme (Laufzeitfehler mit Java-Klassenname, z. B. java.lang.ArithmeticException) */
  Interp.JavaException = class JavaException extends Error {
    constructor(javaClass, msg) { super(msg == null ? javaClass : javaClass + ': ' + msg); this.javaClass = javaClass; this.javaMessage = msg; }
  };
  function jex(cls, msg) { return new Interp.JavaException(cls, msg); }
  Interp.jex = jex;
  function i32(v) { return v | 0; }
  function javaDouble(d) {
    if (Number.isNaN(d)) return 'NaN';
    if (d === Infinity) return 'Infinity'; if (d === -Infinity) return '-Infinity';
    if (d === 0) return (1 / d < 0) ? '-0.0' : '0.0';
    const a = Math.abs(d);
    if (a >= 1e-3 && a < 1e7) { let s = String(d); if (!/[.e]/.test(s)) s += '.0'; return s; }
    let s = d.toExponential(); let [m, e] = s.split('e'); if (!m.includes('.')) m += '.0'; return m + 'E' + (e[0] === '+' ? e.slice(1) : e);
  }
  function javaFloat(d) { const f = Math.fround(d); if (Number.isInteger(f) && Math.abs(f) < 1e7) return f + '.0'; const s = String(parseFloat(f.toPrecision(8))); return /[.eE]/.test(s) ? s.replace('e', 'E').replace('E+', 'E') : s + '.0'; }
  function toJavaString(v, t) {
    if (v === null || v === undefined) return 'null';
    switch (t) {
      case 'double': return javaDouble(v);
      case 'float': return javaFloat(v);
      case 'char': return String.fromCharCode(v);
      case 'boolean': return v ? 'true' : 'false';
      case 'int': case 'long': case 'short': case 'byte': return String(v);
    }
    if (typeof v === 'string' || v instanceof String) return String(v);
    if (typeof v === 'number') return Number.isInteger(v) && t !== 'Double' ? String(v) : javaDouble(v);
    if (typeof v === 'boolean') return String(v);
    if (Array.isArray(v)) {
      // Array wie in der Deklaration: Zeichenketten in Anführungszeichen (Guana, 30.09.2026), Zahlen und Wahrheitswerte nackt
      const et = Interp.elemTyp(t);
      return '[' + v.map(x => (et === 'String' || ((et == null || et === '?') && (typeof x === 'string' || x instanceof String))) ? '"' + String(x) + '"' : toJavaString(x, et === '?' ? null : et)).join(', ') + ']';
    }
    if (v && typeof v.toString === 'function') return String(v.toString());
    return String(v);
  }
  Interp.toJavaString = toJavaString;
  Interp.javaDouble = javaDouble;
  const jstr = (s) => new String(s); // zur Laufzeit erzeugte Strings sind eigene Objekte (Java-Identität bei ==)
  function convert(v, from, to) {
    if (from === to || v === null) return v;
    if (to === 'int' || to === 'short' || to === 'byte' || to === 'char' || to === 'long') {
      if (from === 'double' || from === 'float') {
        if (Number.isNaN(v)) return 0;
        if (to === 'long') return Math.trunc(v);
        let r = Math.trunc(v); if (r > 2147483647) r = 2147483647; if (r < -2147483648) r = -2147483648;
        if (to === 'int') return r; if (to === 'short') return (r << 16) >> 16; if (to === 'byte') return (r << 24) >> 24; return r & 0xFFFF;
      }
      if (to === 'int') return from === 'long' ? Number(BigInt.asIntN(32, BigInt(Math.trunc(v)))) : v;
      if (to === 'short') return (v << 16) >> 16; if (to === 'byte') return (v << 24) >> 24; if (to === 'char') return v & 0xFFFF;
      return v;
    }
    if (to === 'float') return Math.fround(v);
    if (UNBOX[baseType(to)] && isPrim(from)) return v; // Boxing
    if (isPrim(to) && !isPrim(from)) { if (v === null) throw jex('java.lang.NullPointerException', null); return Number(v.valueOf ? v.valueOf() : v); }
    return v;
  }

  /* ================================================================ Übersetzer */
  class Scope {
    constructor(parent) { this.parent = parent; this.vars = new Map(); }
    lookup(n) { let s = this; while (s) { if (s.vars.has(n)) return s.vars.get(n); s = s.parent; } return null; }
  }
  const SIG = { brk: { brk: true } };
  const ASYNC = (f) => f; // Markierung

  class Compiler {
    constructor(model) {
      this.model = model; this.errors = []; this.className = model.name; this.superName = model.extends || 'Object';
      this.fields = new Map(); this.methods = []; this.javaMap = null;
    }
    err(frameId, slot, msg, pos, end) { this.errors.push({ frameId, slot, msg, pos: pos == null ? null : pos, end: end == null ? null : end }); }

    /* ---------- Klasse übersetzen */
    compile() {
      const m = this.model;
      if (m.name !== 'Peetie' && !/^[A-Za-z_]\w*$/.test(m.name)) this.err('class', 'name', 'Ungültiger Klassenname');
      // Felder deklarieren
      for (const f of m.fields) {
        if (f.type !== 'var' || f.enable === false) continue;
        let t;
        try { t = this.resolveType(Interp.parseType(f.vtype), f.id, 'vtype'); } catch (e) { this.slotErr(f.id, 'vtype', e); continue; }
        if (!/^[A-Za-z_$][\w$]*$/.test(f.name)) { this.err(f.id, 'name', f.name ? 'Ungültiger Name' : 'Name fehlt'); continue; }
        if (this.fields.has(f.name)) { this.err(f.id, 'name', `Variable ${f.name} ist bereits in Klasse ${this.className} definiert`); continue; }
        this.fields.set(f.name, { name: f.name, type: t, isStatic: !!f.isStatic, frame: f });
      }
      // Methoden-Signaturen
      for (const mm of m.methods) {
        if (mm.enable === false) continue;
        const sig = { name: mm.name, params: [], ret: 'void', frame: mm, isStatic: !!mm.isStatic, access: mm.access, user: true };
        try { sig.ret = mm.rtype === 'void' ? 'void' : this.resolveType(Interp.parseType(mm.rtype), mm.id, 'rtype'); } catch (e) { this.slotErr(mm.id, 'rtype', e); }
        if (!/^[A-Za-z_$][\w$]*$/.test(mm.name)) this.err(mm.id, 'name', mm.name ? 'Ungültiger Methodenname' : 'Methodenname fehlt');
        for (const p of mm.params) {
          let pt = 'int';
          try { pt = this.resolveType(Interp.parseType(p.type), mm.id, 'ptype:' + p.id); } catch (e) { this.slotErr(mm.id, 'ptype:' + p.id, e); }
          sig.params.push(pt);
        }
        const dup = this.methods.find(o => o.name === sig.name && o.params.join() === sig.params.join());
        if (dup) this.err(mm.id, 'name', `Methode ${sig.name}(${sig.params.join(',')}) ist bereits in Klasse ${this.className} definiert`);
        else {
          // Überschreiben geerbter Methoden prüfen
          const inh = findMethods(this.superName, sig.name).find(o => o.params.join() === sig.params.join());
          if (inh) {
            if (inh.access === 'private') { /* unabhängige Methode */ }
            else if (inh.ret !== sig.ret) this.err(mm.id, 'rtype', `${sig.name}(${sig.params.join(',')}) in ${this.className} kann nicht ${sig.name}(${sig.params.join(',')}) in ${inh.owner} außer Kraft setzen\n  Rückgabetyp ${qn(sig.ret)} ist nicht mit ${qn(inh.ret)} kompatibel`);
            else if (accessRank(sig.access) < accessRank(inh.access)) this.err(mm.id, 'access', `${sig.name}(${sig.params.join(',')}) in ${this.className} kann nicht ${sig.name}(${sig.params.join(',')}) in ${inh.owner} außer Kraft setzen\n  Versuch, niedrigere Zugriffsberechtigungen zuzuweisen. War ${inh.access}`);
            else sig.overrides = inh;
          }
          this.methods.push(sig);
        }
      }
      const ctors = m.constructors.filter(c => c.enable !== false);
      if (ctors.length > 1) this.err(ctors[1].id, 'header', 'Nur ein Konstruktor wird unterstützt');
      if (ctors.length && ctors[0].params.length) this.err(ctors[0].id, 'header', 'Konstruktoren mit Parametern werden in diesem Szenario nicht aufgerufen (Mars erzeugt Peetie mit new Peetie())');
      // Feld-Initialisierer
      this.fieldInits = [];
      for (const [name, fd] of this.fields) {
        const f = fd.frame;
        if (f.value == null || f.value === '') continue;
        const ctx = { scope: new Scope(null), isStatic: fd.isStatic, ret: null, loop: 0, nslots: { n: 0 }, where: 'Klasse ' + this.className };
        const ex = this.expr(f.value, f.id, 'value', ctx);
        if (ex) {
          this.checkAssign(fd.type, ex, f.id, 'value');
          this.fieldInits.push({ name, fd, ex, nslots: ctx.nslots });
        }
      }
      // Methodenrümpfe
      for (const sig of this.methods) this.compileMethod(sig);
      this.ctor = ctors.length ? this.compileBody(ctors[0], [], 'void', false, 'Konstruktor ' + this.className) : null;
      return this.errors.length === 0;
    }
    slotErr(frameId, slot, e) { if (e instanceof CompileError) this.err(frameId, slot, e.message, e.pos, e.end); else throw e; }
    resolveType(t, frameId, slot) {
      const b = baseType(t);
      if (PRIM.has(t)) return t;
      if (t.endsWith('[]')) throw new CompileError('Arrays werden hier nicht unterstützt', 0, t.length);
      if (b === 'var') throw new CompileError("'var' ist kein Datentyp", 0, 3);
      if (!knownClass(b) && b !== this.className) throw new CompileError(notFound('Klasse', b, 'Klasse ' + this.className), 0, t.length);
      if (b === 'List' || b === 'ArrayList') return 'List<' + (typeArg(t) === 'Object' && !t.includes('<') ? 'Object' : typeArg(t)) + '>';
      return t;
    }
    compileMethod(sig) {
      const mm = sig.frame;
      sig.code = this.compileBody(mm, sig.params, sig.ret, sig.isStatic, 'Methode ' + mm.name + '(' + sig.params.join(',') + ')');
    }
    compileBody(mm, ptypes, ret, isStatic, where) {
      const scope = new Scope(null); const nslots = { n: 0 };
      const varInfo = [];
      const ctx = { scope, isStatic, ret, loop: 0, nslots, where, methodName: mm.name || this.className, varInfo };
      const pslots = [];
      mm.params.forEach((p, i) => {
        if (!/^[A-Za-z_$][\w$]*$/.test(p.name)) { this.err(mm.id, 'pname:' + p.id, p.name ? 'Ungültiger Name' : 'Parametername fehlt'); return; }
        if (scope.vars.has(p.name)) { this.err(mm.id, 'pname:' + p.id, `Variable ${p.name} ist bereits in ${where} definiert`); return; }
        const slot = nslots.n++; scope.vars.set(p.name, { type: ptypes[i] || 'int', slot, isFinal: true, kind: 'param' }); pslots.push(slot); varInfo.push({ name: p.name, type: ptypes[i] || 'int', slot });
      });
      const body = this.block(mm.body, ctx);
      if (ret !== 'void' && ret != null && this.canCompleteNormally(mm.body)) this.err(mm.id, 'end', 'Rückgabeanweisung fehlt');
      return { run: body, nslots, pslots, frame: mm, vars: varInfo };
    }
    canCompleteNormally(list) {
      for (const f of list) if (f.enable !== false && !this.stmtCompletes(f)) return false;
      return true;
    }
    stmtCompletes(f) {
      if (f.enable === false) return true;
      if (f.type === 'return') return false;
      if (f.type === 'if') { if (!f.else) return true; return this.canCompleteNormally(f.then) || f.elseifs.some(e => this.canCompleteNormally(e.body)) || this.canCompleteNormally(f.else); }
      if (f.type === 'while') { const c = String(f.cond).trim(); if (c === 'true') return this.hasBreak(f.body); return true; }
      return true;
    }
    hasBreak(list) { for (const f of list) { if (f.enable === false) continue; if (f.type === 'break') return true; if (f.type === 'if' && (this.hasBreak(f.then) || f.elseifs.some(e => this.hasBreak(e.body)) || (f.else && this.hasBreak(f.else)))) return true; } return false; }

    /* ---------- Anweisungen */
    block(list, ctx) {
      const inner = { ...ctx, scope: new Scope(ctx.scope) };
      const code = []; let dead = false;
      for (const f of list) {
        if (f.enable === false || f.type === 'comment' || f.type === 'blank') continue;
        if (dead) { this.err(f.id, 'frame', 'Nicht erreichbare Anweisung'); dead = false; }
        const c = this.stmt(f, inner);
        if (c) code.push(c);
        if (f.type === 'return' || f.type === 'break' || (f.type === 'while' && String(f.cond).trim() === 'true' && !this.hasBreak(f.body))) dead = true;
      }
      const n = code.length;
      return async (fr) => {
        for (let i = 0; i < n; i++) { const r = await code[i](fr); if (r !== undefined) return r; }
        return undefined;
      };
    }
    stmt(f, ctx) {
      const I = Interp;
      const wrap = (fn) => { const id = f.id; return async (fr) => { fr.cur = id; if (I.beforeStep) await I.beforeStep(id, fr); if (I.abortFlag || (fr.self && fr.self.__gen !== undefined && fr.self.__gen < I.gen)) throw I.ABORT; if (I.deadline && performance.now() > I.deadline) { I.deadline = 0; throw jex('Zeitlimit', I.deadlineMsg); } return fn(fr); }; };
      switch (f.type) {
        case 'call': {
          const e = this.expr(f.expr, f.id, 'expr', ctx);
          if (!e) return null;
          if (!e.isCall) { this.err(f.id, 'expr', 'Kein Methodenaufruf: Ein Methodenaufruf-Frame muss eine Methode aufrufen'); return null; }
          const ev = e.ev;
          return wrap(async (fr) => { await ev(fr); });
        }
        case 'var': {
          let t;
          try { t = this.resolveType(Interp.parseType(f.vtype), f.id, 'vtype'); } catch (e) { this.slotErr(f.id, 'vtype', e); return null; }
          if (t === 'void') { this.err(f.id, 'vtype', '"void"-Typ hier nicht zulässig'); return null; }
          if (!/^[A-Za-z_$][\w$]*$/.test(f.name)) { this.err(f.id, 'name', f.name ? 'Ungültiger Name' : 'Name fehlt'); return null; }
          if (ctx.scope.lookup(f.name)) { this.err(f.id, 'name', `Variable ${f.name} ist bereits in ${ctx.where} definiert`); return null; }
          let init = null;
          if (f.value != null && f.value !== '') { init = this.expr(f.value, f.id, 'value', ctx); if (init) init = this.checkAssign(t, init, f.id, 'value'); }
          const slot = ctx.nslots.n++;
          ctx.scope.vars.set(f.name, { type: t, slot, assigned: init != null, isFinal: f.isFinal });
          if (ctx.varInfo) ctx.varInfo.push({ name: f.name, type: t, slot });
          const dflt = defaultValue(t);
          if (!init) return wrap(async (fr) => { fr.v[slot] = dflt; });
          const ev = init.ev;
          return wrap(async (fr) => { fr.v[slot] = await ev(fr); });
        }
        case 'assign': {
          const d = this.lvalue(f.dest, f.id, 'dest', ctx);
          const s = this.expr(f.src, f.id, 'src', ctx);
          if (!d || !s) return null;
          const sc = this.checkAssign(d.type, s, f.id, 'src');
          if (!sc) return null;
          const set = d.set, ev = sc.ev;
          return wrap(async (fr) => { await set(fr, await ev(fr)); });
        }
        case 'if': {
          const branches = [];
          const c0 = this.cond(f.cond, f.id, 'cond', ctx);
          branches.push({ c: c0, b: this.block(f.then, ctx) });
          for (const e of f.elseifs) branches.push({ c: this.cond(e.cond, e.id, 'cond', ctx), b: this.block(e.body, ctx), id: e.id });
          const els = f.else ? this.block(f.else, ctx) : null;
          if (branches.some(b => !b.c)) return null;
          const bs = branches.map(b => ({ c: b.c.ev, b: b.b }));
          return wrap(async (fr) => {
            for (const br of bs) if (await br.c(fr)) return br.b(fr);
            if (els) return els(fr);
          });
        }
        case 'while': {
          const c = this.cond(f.cond, f.id, 'cond', ctx);
          const b = this.block(f.body, { ...ctx, loop: ctx.loop + 1 });
          if (!c) return null;
          const cev = c.ev;
          return wrap(async (fr) => {
            let n = 0;
            while (await cev(fr)) {
              const r = await b(fr);
              if (r === SIG.brk) break;
              if (r !== undefined) return r;
              if (++n % 500 === 0) await I.breathe();
            }
          });
        }
        case 'foreach': {
          let t;
          try { t = this.resolveType(Interp.parseType(f.vtype), f.id, 'vtype'); } catch (e) { this.slotErr(f.id, 'vtype', e); return null; }
          if (!/^[A-Za-z_$][\w$]*$/.test(f.var)) { this.err(f.id, 'var', f.var ? 'Ungültiger Name' : 'Name fehlt'); return null; }
          if (ctx.scope.lookup(f.var)) { this.err(f.id, 'var', `Variable ${f.var} ist bereits in ${ctx.where} definiert`); return null; }
          let ast;
          try { ast = Interp.parseExpr(f.coll, true); } catch (e) { this.slotErr(f.id, 'coll', e); return null; }
          const inner = { ...ctx, scope: new Scope(ctx.scope), loop: ctx.loop + 1 };
          const slot = ctx.nslots.n++;
          inner.scope.vars.set(f.var, { type: t, slot, isFinal: ast.n !== 'range', kind: 'param' });
          if (ctx.varInfo) ctx.varInfo.push({ name: f.var, type: t, slot });
          let lo, hi, coll;
          if (ast.n === 'range') {
            try { lo = this.ex(ast.a, inner); hi = this.ex(ast.b, inner); } catch (e) { this.slotErr(f.id, 'coll', e); return null; }
            for (const x of [lo, hi]) if (!isIntegral(x.type) || x.type === 'long') { this.err(f.id, 'coll', incompatible('int', x.type)); return null; }
            if (!assignable(t, 'int')) { this.err(f.id, 'vtype', incompatible(t, 'int')); return null; }
          } else {
            try { coll = this.ex(ast, inner); } catch (e) { this.slotErr(f.id, 'coll', e); return null; }
            if (baseType(coll.type) !== 'List') { this.err(f.id, 'coll', 'for-each nicht auf Ausdruckstyp anwendbar\n  Erforderlich: Array oder java.lang.Iterable\n  Ermittelt:    ' + qn(coll.type)); return null; }
            const et = typeArg(coll.type);
            if (!assignable(t, et)) { this.err(f.id, 'vtype', incompatible(t, et)); return null; }
          }
          const b = this.block(f.body, inner);
          if (lo) {
            const la = lo.ev, ha = hi.ev;
            return wrap(async (fr) => {
              const a = await la(fr), z = await ha(fr);
              for (let i = a; i <= z; i++) {
                fr.v[slot] = i;
                const r = await b(fr);
                if (r === SIG.brk) break; if (r !== undefined) return r;
                if ((i - a + 1) % 500 === 0) await I.breathe();
              }
            });
          }
          const cv = coll.ev;
          return wrap(async (fr) => {
            const list = await cv(fr);
            if (list == null) throw jex('java.lang.NullPointerException', null);
            let n = 0;
            for (const x of Array.from(list)) {
              fr.v[slot] = x;
              const r = await b(fr);
              if (r === SIG.brk) break; if (r !== undefined) return r;
              if (++n % 500 === 0) await I.breathe();
            }
          });
        }
        case 'return': {
          if (ctx.ret === 'void' || ctx.ret == null) {
            if (f.value != null && f.value !== '') { this.err(f.id, 'value', 'Inkompatible Typen: Unerwarteter Rückgabewert'); return null; }
            return wrap(async () => ({ ret: undefined }));
          }
          if (f.value == null || f.value === '') { this.err(f.id, 'value', 'Inkompatible Typen: Rückgabewert fehlt'); return null; }
          const e = this.expr(f.value, f.id, 'value', ctx);
          if (!e) return null;
          const c = this.checkAssign(ctx.ret, e, f.id, 'value'); if (!c) return null;
          const ev = c.ev;
          return wrap(async (fr) => ({ ret: await ev(fr) }));
        }
        case 'break':
          if (!ctx.loop) { this.err(f.id, 'frame', 'Unterbrechung außerhalb Switch oder Schleife'); return null; }
          return wrap(async () => SIG.brk);
      }
      return null;
    }
    cond(src, id, slot, ctx) {
      const e = this.expr(src, id, slot, ctx); if (!e) return null;
      if (e.type !== 'boolean' && e.type !== 'Boolean') { this.err(id, slot, incompatible('boolean', e.type)); return null; }
      return e;
    }
    checkAssign(to, e, id, slot) {
      if (e.type === 'void') { this.err(id, slot, '"void"-Typ hier nicht zulässig'); return null; }
      if (!assignable(to, e.type, e.constVal)) { this.err(id, slot, incompatible(to, e.type)); return null; }
      if (to === e.type) return e;
      const from = e.type, ev = e.ev;
      return { type: to, ev: async (fr) => convert(await ev(fr), from, to) };
    }
    expr(src, id, slot, ctx) {
      if (src == null || String(src).trim() === '') { this.err(id, slot, 'Ausdruck fehlt'); return null; }
      let ast;
      try { ast = Interp.parseExpr(src, false); } catch (e) { this.slotErr(id, slot, e); return null; }
      try { return this.ex(ast, ctx); } catch (e) { this.slotErr(id, slot, e); return null; }
    }
    lvalue(src, id, slot, ctx) {
      if (src == null || String(src).trim() === '') { this.err(id, slot, 'Variable fehlt'); return null; }
      let ast;
      try { ast = Interp.parseExpr(src, false); } catch (e) { this.slotErr(id, slot, e); return null; }
      try { return this.lv(ast, ctx); } catch (e) { this.slotErr(id, slot, e); return null; }
    }
    lv(a, ctx) {
      if (a.n === 'paren') return this.lv(a.a, ctx);
      if (a.n === 'name') {
        const v = ctx.scope.lookup(a.name);
        if (v) {
          if (v.isFinal) throw new CompileError(v.kind === 'param' ? `Der final-Variablen ${a.name} kann kein Wert zugewiesen werden` : `Der final-Variablen ${a.name} kann kein Wert zugewiesen werden`, a.s, a.e);
          const slot = v.slot; return { type: v.type, set: async (fr, x) => { fr.v[slot] = x; } };
        }
        const f = this.fields.get(a.name);
        if (f) {
          if (ctx.isStatic && !f.isStatic) throw new CompileError(`Variable ${a.name} ist nicht statisch und kann nicht aus einem statischen Kontext referenziert werden`, a.s, a.e);
          if (f.frame.isFinal) throw new CompileError(`Der final-Variablen ${a.name} kann kein Wert zugewiesen werden`, a.s, a.e);
          const key = '__f_' + a.name; return { type: f.type, set: async (fr, x) => { fr.self[key] = x; } };
        }
        const inh = findField(this.superName, a.name);
        if (inh) {
          if (inh.access === 'private') throw new CompileError(`${a.name} hat private-Zugriff in ${inh.owner}`, a.s, a.e);
          const n = a.name; return { type: inh.type, set: async (fr, x) => { fr.self[n] = x; } };
        }
        throw new CompileError(notFound('Variable', a.name, 'Klasse ' + this.className), a.s, a.e);
      }
      if (a.n === 'field') {
        if (a.obj.n === 'this') return this.lv({ n: 'name', name: a.name, s: a.ns, e: a.e }, ctx);
        const o = this.ex(a.obj, ctx);
        const fd = this.memberField(o.type, a.name, a);
        const ev = o.ev, n = a.name;
        return { type: fd.type, set: async (fr, x) => { const obj = await ev(fr); if (obj == null) throw jex('java.lang.NullPointerException', null); obj[n] = x; } };
      }
      if (a.n === 'index') {
        // a[i] = wert: vorhandenes Element ändern; Index = Anzahl hängt an (Operatorenliste 2.2 „Anhängen an ein Array“); Lücken sind ein Fehler
        const { o, i, et } = this.indexParts(a, ctx);
        const oe = o.ev, ie = i.ev;
        return {
          type: et, set: async (fr, x) => {
            const l = await oe(fr); const k = await ie(fr);
            if (l == null) throw jex('java.lang.NullPointerException', null);
            if (k >= 0 && k < l.length) l[k] = x;
            else if (k === l.length) l.push(x);
            else throw jex('java.lang.IndexOutOfBoundsException', Interp.indexMsg(k, l.length, true));
            if (Interp.onIndex) Interp.onIndex(l, k, 'schreiben');
          }
        };
      }
      throw new CompileError('Unerwarteter Typ\n  erforderlich: Variable\n  gefunden: Wert', a.s, a.e);
    }
    memberField(type, name, a) {
      const fd = findField(type, name);
      if (!fd) throw new CompileError(notFound('Variable', name, 'Klasse ' + qn(baseType(type))), a.ns ?? a.s, a.e);
      if (fd.access === 'private' || (fd.access === 'protected' && !isSubclass(this.className, fd.owner) && fd.owner !== 'AI_Robot')) throw new CompileError(`${name} hat ${fd.access === 'private' ? 'private' : 'protected'}-Zugriff in ${fd.owner}`, a.ns ?? a.s, a.e);
      return fd;
    }

    /* ---------- Ausdrücke: liefert {type, ev(fr)->Promise|Wert, isCall, constVal} */
    ex(a, ctx) {
      switch (a.n) {
        case 'paren': { const e = this.ex(a.a, ctx); return { type: e.type, ev: e.ev, constVal: e.constVal }; }
        case 'lit': {
          const v = a.v, t = a.t;
          if (t === 'int' && v === 2147483648) throw new CompileError('Ganzzahl zu groß', a.s, a.e);
          return { type: t, ev: () => v, constVal: v };
        }
        case 'this':
          if (ctx.isStatic) throw new CompileError('Variable this ist nicht statisch und kann nicht aus einem statischen Kontext referenziert werden', a.s, a.e);
          return { type: this.className, ev: (fr) => fr.self };
        case 'name': return this.name(a, ctx);
        case 'field': return this.fieldAccess(a, ctx);
        case 'call': return this.call(a, ctx);
        case 'new': return this.newObj(a, ctx);
        case 'classlit': {
          const n = a.name;
          if (!knownClass(n) && n !== this.className) throw new CompileError(notFound('Klasse', n, 'Klasse ' + this.className), a.s, a.e);
          return { type: 'Class<' + n + '>', ev: () => Interp.jsClass(n) };
        }
        case 'cast': {
          const t = this.resolveType(a.ty.name);
          const e = this.ex(a.a, ctx);
          if (isPrim(t) && isPrim(e.type)) {
            if (t === 'boolean' || e.type === 'boolean') { if (t !== e.type) throw new CompileError(incompatible(t, e.type), a.s, a.e); }
            const from = e.type, ev = e.ev; return { type: t, ev: async (fr) => convert(await ev(fr), from, t) };
          }
          if (isPrim(t) !== isPrim(e.type) && e.type !== 'null') {
            if (isPrim(t) && UNBOX[baseType(e.type)]) { const ev = e.ev; return { type: t, ev: async (fr) => convert(await ev(fr), e.type, t) }; }
            throw new CompileError(incompatible(t, e.type), a.s, a.e);
          }
          if (!isSubclass(t, e.type) && !isSubclass(e.type, t) && e.type !== 'null') throw new CompileError(incompatible(t, e.type), a.s, a.e);
          const ev = e.ev, tn = baseType(t);
          return { type: t, ev: async (fr) => { const v = await ev(fr); if (v != null && !Interp.instanceOf(v, tn)) throw jex('java.lang.ClassCastException', 'class ' + Interp.classNameOf(v) + ' cannot be cast to class ' + tn); return v; } };
        }
        case 'instanceof': {
          const e = this.ex(a.a, ctx); const t = this.resolveType(a.ty.name);
          if (isPrim(e.type)) throw new CompileError('Unerwarteter Typ\n  erforderlich: Referenz\n  gefunden: ' + e.type, a.s, a.e);
          const ev = e.ev, tn = baseType(t);
          return { type: 'boolean', ev: async (fr) => { const v = await ev(fr); return v != null && Interp.instanceOf(v, tn); } };
        }
        case 'un': return this.unary(a, ctx);
        case 'incdec': {
          const l = this.lv(a.a, ctx); const g = this.ex(a.a, ctx);
          if (!isNum(g.type)) throw new CompileError(`Ungültiger Operandentyp ${qn(g.type)} für unären Operator "${a.op}"`, a.s, a.e);
          const d = a.op === '++' ? 1 : -1, t = g.type, get = g.ev, set = l.set;
          return { type: t, isCall: true, ev: async (fr) => { const o = await get(fr); const nv = t === 'int' ? i32(o + d) : o + d; await set(fr, nv); return a.pre ? nv : o; } };
        }
        case 'bin': return this.binary(a, ctx);
        case 'cond': {
          const c = this.ex(a.c, ctx); if (c.type !== 'boolean' && c.type !== 'Boolean') throw new CompileError(incompatible('boolean', c.type), a.c.s, a.c.e);
          const x = this.ex(a.a, ctx), y = this.ex(a.b, ctx);
          let t;
          if (x.type === y.type) t = x.type;
          else if (isNum(x.type) && isNum(y.type)) t = NUM_RANK[x.type] > NUM_RANK[y.type] ? x.type : y.type;
          else if (x.type === 'null') t = y.type; else if (y.type === 'null') t = x.type;
          else if (assignable(x.type, y.type)) t = x.type; else if (assignable(y.type, x.type)) t = y.type; else t = 'Object';
          const ce = c.ev, xe = x.ev, ye = y.ev, xt = x.type, yt = y.type;
          return { type: t, ev: async (fr) => (await ce(fr)) ? convert(await xe(fr), xt, t) : convert(await ye(fr), yt, t) };
        }
        case 'range': throw new CompileError("Bereich '..' ist nur in for-each erlaubt", a.s, a.e);
        case 'list': {
          // Array-Literal: Elementtyp aus den Elementen (Ganzzahl+Dezimalzahl → Dezimalzahl); intern ein JS-Array, Typ List<elementtyp>
          const items = a.items.map(x => this.ex(x, ctx));
          let et = null;
          for (const x of items) {
            if (x.type === 'void') throw new CompileError('"void"-Typ hier nicht zulässig', a.s, a.e);
            const t = UNBOX[baseType(x.type)] || x.type;
            if (t === 'null') continue;
            if (et === null || et === t) { et = t; continue; }
            if (isNum(et) && isNum(t)) { et = NUM_RANK[t] > NUM_RANK[et] ? t : et; continue; }
            throw new CompileError(`Alle Elemente eines Arrays müssen denselben Datentyp haben – hier stehen ${Interp.typName(et)} und ${Interp.typName(t)} gemischt`, a.s, a.e);
          }
          if (et && isNum(et) && NUM_RANK[et] < 3) et = 'int';
          const evs = items.map(x => { const from = x.type, ev = x.ev; return (et && from !== et && isNum(et)) ? async (fr) => convert(await ev(fr), from, et) : ev; });
          return { type: 'List<' + (et || '?') + '>', ev: async (fr) => { const out = []; for (const e of evs) out.push(await e(fr)); return out; } };
        }
        case 'index': {
          const { o, i, et } = this.indexParts(a, ctx);
          const oe = o.ev, ie = i.ev;
          return { type: et, ev: async (fr) => { const l = await oe(fr); const k = await ie(fr); if (l == null) throw jex('java.lang.NullPointerException', null); if (k < 0 || k >= l.length) throw jex('java.lang.IndexOutOfBoundsException', Interp.indexMsg(k, l.length, false)); if (Interp.onIndex) Interp.onIndex(l, k, 'lesen'); return l[k]; } };
        }
      }
      throw new CompileError('Ungültiger Ausdruck', a.s, a.e);
    }
    /* Array und Index eines Elementzugriffs a[i] prüfen; liefert Array-Ausdruck, Index-Ausdruck und Elementtyp */
    indexParts(a, ctx) {
      const o = this.ex(a.a, ctx);
      if (baseType(o.type) !== 'List') throw new CompileError(`Vor den eckigen Klammern muss ein Array stehen – ${a.a.n === 'name' ? '„' + a.a.name + '“ ist ' + Interp.typName(o.type) : 'das ist ' + Interp.typName(o.type)}`, a.a.s, a.a.e);
      const i = this.ex(a.i, ctx);
      const it = UNBOX[baseType(i.type)] || i.type;
      if (!isIntegral(it) || it === 'long') throw new CompileError(`Der Index in den eckigen Klammern muss eine Ganzzahl sein – hier ist er ${Interp.typName(i.type)}`, a.i.s, a.i.e);
      let et = typeArg(o.type); if (et === '?') et = 'Object';
      return { o, i, et };
    }
    name(a, ctx) {
      const v = ctx.scope.lookup(a.name);
      if (v) { const slot = v.slot; return { type: v.type, ev: (fr) => fr.v[slot] }; }
      const f = this.fields.get(a.name);
      if (f) {
        if (ctx.isStatic && !f.isStatic) throw new CompileError(`Variable ${a.name} ist nicht statisch und kann nicht aus einem statischen Kontext referenziert werden`, a.s, a.e);
        const key = '__f_' + a.name; return { type: f.type, ev: (fr) => fr.self[key] };
      }
      const inh = findField(this.superName, a.name);
      if (inh) {
        if (inh.access === 'private') throw new CompileError(`${a.name} hat private-Zugriff in ${inh.owner}`, a.s, a.e);
        const n = a.name, t = inh.type;
        return { type: t, ev: (fr) => { const x = fr.self[n]; return x === undefined ? defaultValue(t) : x; } };
      }
      if (knownClass(a.name) || a.name === this.className) return { type: 'static:' + a.name, ev: () => null, isType: true };
      throw new CompileError(notFound('Variable', a.name, 'Klasse ' + this.className), a.s, a.e);
    }
    fieldAccess(a, ctx) {
      if (a.obj.n === 'this') {
        if (ctx.isStatic) throw new CompileError('Variable this ist nicht statisch und kann nicht aus einem statischen Kontext referenziert werden', a.obj.s, a.obj.e);
        const f = this.fields.get(a.name);
        if (f) { const key = '__f_' + a.name; return { type: f.type, ev: (fr) => fr.self[key] }; }
        const inh = findField(this.superName, a.name);
        if (inh && inh.access !== 'private') { const n = a.name; return { type: inh.type, ev: (fr) => fr.self[n] }; }
        if (inh) throw new CompileError(`${a.name} hat private-Zugriff in ${inh.owner}`, a.ns, a.e);
        throw new CompileError(notFound('Variable', a.name, 'Klasse ' + this.className), a.ns, a.e);
      }
      const o = this.ex(a.obj, ctx);
      if (o.type.startsWith('static:')) {
        const cls = o.type.slice(7);
        const fd = findField(cls, a.name);
        if (!fd || !fd.isStatic) throw new CompileError(notFound('Variable', a.name, 'Klasse ' + this.className), a.ns, a.e);
        const v = Interp.staticField(cls, a.name);
        return { type: fd.type, ev: () => v, constVal: typeof v === 'number' ? v : undefined };
      }
      if (isPrim(o.type)) throw new CompileError(`${o.type} kann nicht dereferenziert werden`, a.ns, a.e);
      const fd = this.memberField(o.type, a.name, a);
      const ev = o.ev, n = a.name;
      return { type: fd.type, ev: async (fr) => { const obj = await ev(fr); if (obj == null) throw jex('java.lang.NullPointerException', `Cannot read field "${n}" because value is null`); return obj[n]; } };
    }
    args(list, ctx) { return list.map(x => this.ex(x, ctx)); }
    pick(cands, args, a, what) {
      const types = args.map(x => x.type);
      const applicable = cands.filter(m => m.params.length === types.length && m.params.every((p, i) => p === 'Class' ? baseType(types[i]) === 'Class' || types[i] === 'null' : p === 'E' ? true : assignable(p === 'List' ? 'List<Object>' : p, types[i], args[i].constVal)));
      if (!applicable.length) {
        const shown = types.length ? types.map(t => t === 'null' ? '<null>' : t.replace(/^Class<.*>$/, 'Class')).join(',') : 'keine Argumente';
        const shownQ = types.length ? types.map(t => qn(t.replace(/^Class<.*>$/, 'Class'))).join(',') : 'keine Argumente';
        if (cands.length === 1) {
          const c0 = cands[0]; const req = c0.params.length ? c0.params.map(qn).join(',') : 'keine Argumente';
          const grund = c0.params.length !== types.length ? 'Liste der tatsächlichen Argumente hat eine andere Länge als die der formalen Argumente' : 'Keine übereinstimmenden Argumente, Argumente passen nicht';
          throw new CompileError(`${what} ${c0.name} in Klasse ${c0.user ? this.className : qn(c0.owner)} kann nicht auf die angegebenen Typen angewendet werden.\n  Erforderlich: ${req}\n  Ermittelt:    ${shownQ}\n  Grund: ${grund}`, a.s, a.e);
        }
        throw new CompileError(`Keine geeignete ${what === 'Methode' ? 'Methode' : 'Konstruktor'} gefunden für ${a.name || ''}(${shownQ})`, a.s, a.e);
      }
      // spezifischste wählen
      applicable.sort((x, y) => specificity(x.params, types) - specificity(y.params, types));
      return applicable[0];
    }
    call(a, ctx) {
      const args = this.args(a.args, ctx);
      for (const x of args) if (x.type === 'void') throw new CompileError('"void"-Typ hier nicht zulässig', a.s, a.e);
      if (a.obj == null || a.obj.n === 'this' || a.obj.n === 'super') {
        if (a.obj && ctx.isStatic) throw new CompileError('Variable this ist nicht statisch und kann nicht aus einem statischen Kontext referenziert werden', a.s, a.e);
        const own = a.obj && a.obj.n === 'super' ? [] : this.methods.filter(m => m.name === a.name);
        const inh = findMethods(this.superName, a.name).filter(m => !own.some(o => o.params.join() === m.params.join()));
        const cands = own.concat(inh);
        if (!cands.length) throw new CompileError(notFound('Methode', `${a.name}(${args.map(x => qn(x.type)).join(',')})`, 'Klasse ' + this.className), a.ns, a.ne);
        const m = this.pick(cands, args, { s: a.ns, e: a.ne, name: a.name }, 'Methode');
        if (m.access === 'private' && !m.user) throw new CompileError(`${m.name}(${m.params.join(',')}) hat private-Zugriff in ${m.owner}`, a.ns, a.ne);
        if (ctx.isStatic && !m.isStatic) throw new CompileError(`Methode ${m.name}(${m.params.join(',')}) ist nicht statisch und kann nicht aus einem statischen Kontext referenziert werden`, a.ns, a.ne);
        const conv = this.convArgs(m.params, args);
        const ret = this.retType(m, null, args);
        if (m.user) {
          const sig = m; const isSuper = false;
          return { type: ret, isCall: true, ev: async (fr) => { const vals = []; for (const c of conv) vals.push(await c(fr)); return Interp.invokeUser(sig, fr.self, vals, fr); } };
        }
        const name = a.name, isSuper = a.obj && a.obj.n === 'super';
        const needsWrap = ret === 'String';
        return {
          type: ret, isCall: true, ev: async (fr) => {
            const vals = []; for (const c of conv) vals.push(await c(fr));
            const self = fr.self;
            const fn = isSuper ? Interp.superMethod(name) : self[name];
            if (typeof fn !== 'function') throw jex('java.lang.NoSuchMethodError', name);
            Interp.pushJava(fr, name);
            try { const r = await fn.apply(self, vals.map(v => (v instanceof String ? String(v) : v))); return needsWrap && typeof r === 'string' ? jstr(r) : r; }
            catch (e) { Interp.captureStack(e); throw e; }
            finally { Interp.popJava(); }
          }
        };
      }
      const o = this.ex(a.obj, ctx);
      if (o.type.startsWith('static:')) {
        const cls = o.type.slice(7);
        const cands = findMethods(cls, a.name).filter(m => m.isStatic);
        if (!cands.length) {
          if (findMethods(cls, a.name).length) throw new CompileError(`Methode ${a.name}() ist nicht statisch und kann nicht aus einem statischen Kontext referenziert werden`, a.ns, a.ne);
          throw new CompileError(notFound('Methode', `${a.name}(${args.map(x => qn(x.type)).join(',')})`, 'Klasse ' + qn(cls)), a.ns, a.ne);
        }
        const m = this.pick(cands, args, { s: a.ns, e: a.ne, name: a.name }, 'Methode');
        const conv = this.convArgs(m.params, args);
        const fn = Interp.staticMethod(cls, a.name, m.params);
        const ret = this.retType(m, null, args);
        return { type: ret, isCall: true, ev: async (fr) => { const vals = []; for (const c of conv) vals.push(await c(fr)); Interp.pushJava(fr, cls + '.' + a.name); try { return await fn(...vals); } catch (e) { Interp.captureStack(e); throw e; } finally { Interp.popJava(); } } };
      }
      if (isPrim(o.type)) throw new CompileError(`${o.type} kann nicht dereferenziert werden`, a.ns, a.ne);
      if (o.type === 'null') throw new CompileError('<null> kann nicht dereferenziert werden', a.ns, a.ne);
      const cands = findMethods(o.type, a.name);
      if (!cands.length) throw new CompileError(notFound('Methode', `${a.name}(${args.map(x => qn(x.type)).join(',')})`, (baseType(o.type) === 'List' ? 'Schnittstelle ' : 'Klasse ') + qn(o.type)), a.ns, a.ne);
      const m = this.pick(cands, args, { s: a.ns, e: a.ne, name: a.name }, 'Methode');
      if (m.access === 'private' && baseType(o.type) !== this.className) throw new CompileError(`${m.name}(${m.params.join(',')}) hat private-Zugriff in ${m.owner}`, a.ns, a.ne);
      if (m.access === 'protected' && !isSubclass(this.className, m.owner)) throw new CompileError(`${m.name}(${m.params.join(',')}) hat protected-Zugriff in ${m.owner}`, a.ns, a.ne);
      const conv = this.convArgs(m.params, args);
      const ret = this.retType(m, o.type, args);
      const ev = o.ev, name = a.name, otype = baseType(o.type);
      const userSigs = (otype === this.className) ? this.methods.filter(x => x.name === name && x.params.join() === m.params.join()) : [];
      return {
        type: ret, isCall: true, ev: async (fr) => {
          const obj = await ev(fr);
          const vals = []; for (const c of conv) vals.push(await c(fr));
          if (obj == null) throw jex('java.lang.NullPointerException', `Cannot invoke "${otype}.${name}()" because value is null`);
          if (userSigs.length && obj.__userClass) return Interp.invokeUser(userSigs[0], obj, vals, fr);
          return Interp.callMethod(obj, otype, name, vals, ret, fr);
        }
      };
    }
    retType(m, recvType, args) {
      if (m.ret === 'E') return recvType ? typeArg(recvType) : 'Object';
      if (m.ret === 'List' && args && args.length && baseType(args[args.length - 1].type) === 'Class') return 'List<' + typeArg(args[args.length - 1].type) + '>';
      if (m.ret === 'List<Actor>' && args && args.length && baseType(args[args.length - 1].type) === 'Class') return 'List<' + typeArg(args[args.length - 1].type) + '>';
      if (m.ret === 'List') return 'List<Object>';
      return m.ret;
    }
    convArgs(params, args) {
      return args.map((x, i) => {
        const p = params[i], from = x.type, ev = x.ev;
        if (p === from || p === 'Class' || p === 'Object' || p === 'E' || !isPrim(p)) {
          if (p === 'Object' && isPrim(from)) return async (fr) => Interp.box(await ev(fr), from);
          return ev;
        }
        return async (fr) => convert(await ev(fr), from, p);
      });
    }
    newObj(a, ctx) {
      const cls = baseType(this.resolveType(a.ty.name));
      const args = this.args(a.args, ctx);
      if (cls === this.className) throw new CompileError('Neue Peetie-Objekte können in diesem Szenario nicht erzeugt werden', a.s, a.e);
      const list = CTORS[cls];
      if (!list) throw new CompileError(`${cls} ist abstrakt oder kann hier nicht erzeugt werden`, a.s, a.e);
      const m = this.pick(list.map(p => ({ name: cls, params: p, owner: cls })), args, { s: a.s, e: a.e, name: cls }, 'Konstruktor');
      const conv = this.convArgs(m.params, args);
      return { type: cls, isCall: true, ev: async (fr) => { const vals = []; for (const c of conv) vals.push(await c(fr)); return Interp.construct(cls, vals); } };
    }
    unary(a, ctx) {
      const e = this.ex(a.a, ctx); const t = e.type, ev = e.ev;
      if (a.op === '!') {
        if (t !== 'boolean' && t !== 'Boolean') throw new CompileError(`Ungültiger Operandentyp ${qn(t)} für unären Operator "!"`, a.s, a.e);
        return { type: 'boolean', ev: async (fr) => !(await ev(fr)) };
      }
      const ut = UNBOX[baseType(t)] || t;
      if (!isNum(ut)) throw new CompileError(`Ungültiger Operandentyp ${qn(t)} für unären Operator "${a.op}"`, a.s, a.e);
      const rt = NUM_RANK[ut] < 3 ? 'int' : ut;
      if (a.op === '+') return { type: rt, ev };
      if (a.op === '-') {
        if (e.constVal !== undefined) { const v = -e.constVal; return { type: rt, ev: () => (rt === 'int' ? i32(v) : v), constVal: v }; }
        return { type: rt, ev: async (fr) => { const v = -(await ev(fr)); return rt === 'int' ? i32(v) : v; } };
      }
      if (a.op === '~') { if (!isIntegral(ut)) throw new CompileError(`Ungültiger Operandentyp ${qn(t)} für unären Operator "~"`, a.s, a.e); return { type: rt, ev: async (fr) => ~(await ev(fr)) }; }
    }
    binary(a, ctx) {
      const l = this.ex(a.a, ctx), r = this.ex(a.b, ctx);
      const op = a.op; const lt = l.type, rt = r.type, le = l.ev, re = r.ev;
      const bad = () => { throw new CompileError(`Ungültige Operandentypen für unären Operator "${op}"\n  Erster Typ: ${qn(lt)}\n  Zweiter Typ: ${qn(rt)}`, a.opPos ?? a.s, (a.opPos ?? a.s) + op.length); };
      if (lt === 'void' || rt === 'void') throw new CompileError('"void"-Typ hier nicht zulässig', a.s, a.e);
      if (op === '&&' || op === '||') {
        if ((lt !== 'boolean' && lt !== 'Boolean') || (rt !== 'boolean' && rt !== 'Boolean')) bad();
        if (op === '&&') return { type: 'boolean', ev: async (fr) => (await le(fr)) ? !!(await re(fr)) : false };
        return { type: 'boolean', ev: async (fr) => (await le(fr)) ? true : !!(await re(fr)) };
      }
      if (op === '+' && (baseType(lt) === 'String' || baseType(rt) === 'String')) {
        return { type: 'String', ev: async (fr) => { const x = await le(fr); const y = await re(fr); return jstr(toJavaString(x, lt) + toJavaString(y, rt)); } };
      }
      const ul = UNBOX[baseType(lt)] || lt, ur = UNBOX[baseType(rt)] || rt;
      if (op === '==' || op === '!=') {
        const neg = op === '!=';
        if (isNum(ul) && isNum(ur)) return { type: 'boolean', ev: async (fr) => ((+(await le(fr))) === (+(await re(fr)))) !== neg };
        if (ul === 'boolean' && ur === 'boolean') return { type: 'boolean', ev: async (fr) => (!!(await le(fr)) === !!(await re(fr))) !== neg };
        if (isPrim(lt) && lt !== 'null' && !isPrim(rt)) bad(); if (isPrim(rt) && rt !== 'null' && !isPrim(lt)) bad();
        if (!isPrim(lt) && !isPrim(rt) && !assignable(lt, rt) && !assignable(rt, lt)) throw new CompileError(`Nicht vergleichbare Typen: ${qn(lt)} und ${qn(rt)}`, a.s, a.e);
        return { type: 'boolean', ev: async (fr) => ((await le(fr)) === (await re(fr))) !== neg };
      }
      if (['<', '>', '<=', '>='].includes(op)) {
        if (!isNum(ul) || !isNum(ur)) bad();
        const f = { '<': (x, y) => x < y, '>': (x, y) => x > y, '<=': (x, y) => x <= y, '>=': (x, y) => x >= y }[op];
        return { type: 'boolean', ev: async (fr) => f(+(await le(fr)), +(await re(fr))) };
      }
      if (['&', '|', '^'].includes(op) && ul === 'boolean' && ur === 'boolean') {
        const f = { '&': (x, y) => x && y, '|': (x, y) => x || y, '^': (x, y) => x !== y }[op];
        return { type: 'boolean', ev: async (fr) => { const x = !!(await le(fr)); const y = !!(await re(fr)); return f(x, y); } };
      }
      if (!isNum(ul) || !isNum(ur)) bad();
      let t = NUM_RANK[ul] > NUM_RANK[ur] ? ul : ur; if (NUM_RANK[t] < 3) t = 'int';
      if (['<<', '>>', '>>>', '&', '|', '^'].includes(op)) {
        if (!isIntegral(ul) || !isIntegral(ur)) bad();
        const f = { '<<': (x, y) => x << y, '>>': (x, y) => x >> y, '>>>': (x, y) => x >>> y, '&': (x, y) => x & y, '|': (x, y) => x | y, '^': (x, y) => x ^ y }[op];
        return { type: t, ev: async (fr) => f(await le(fr), await re(fr)) };
      }
      const isI = t === 'int', isL = t === 'long', isF = t === 'float';
      let f;
      switch (op) {
        case '+': f = isI ? (x, y) => (x + y) | 0 : (x, y) => x + y; break;
        case '-': f = isI ? (x, y) => (x - y) | 0 : (x, y) => x - y; break;
        case '*': f = isI ? (x, y) => Math.imul(x, y) : (x, y) => x * y; break;
        case '/': f = (isI || isL) ? (x, y) => { if (y === 0) throw jex('java.lang.ArithmeticException', '/ by zero'); return isI ? (x / y) | 0 : Math.trunc(x / y); } : (x, y) => x / y; break;
        case '%': f = (isI || isL) ? (x, y) => { if (y === 0) throw jex('java.lang.ArithmeticException', '/ by zero'); return x % y; } : (x, y) => x % y; break;
        default: bad();
      }
      if (isF) { const g = f; f = (x, y) => Math.fround(g(x, y)); }
      const lc = l.constVal, rc = r.constVal;
      if (lc !== undefined && rc !== undefined && !(op === '/' && rc === 0) && !(op === '%' && rc === 0)) { const v = f(+lc, +rc); return { type: t, ev: () => v, constVal: v }; }
      return { type: t, ev: async (fr) => f(+(await le(fr)), +(await re(fr))) };
    }
  }
  function accessRank(a) { return { private: 0, package: 1, protected: 2, public: 3 }[a || 'package'] ?? 1; }
  function specificity(params, types) { let s = 0; params.forEach((p, i) => { if (p !== types[i]) s += 1 + (isNum(p) ? NUM_RANK[p] : 5); }); return s; }
  function defaultValue(t) { if (isNum(t)) return 0; if (t === 'boolean') return false; return null; }
  Interp.defaultValue = defaultValue;

  /* ================================================================ Laufzeit */
  Interp.abortFlag = false;
  /* Zeitlimit (nur beim Prüfen, app.js): performance.now()-Wert, nach dem der nächste Schritt mit der Meldung deadlineMsg abbricht (Endlosschleifen, 30.09.2026) */
  Interp.deadline = 0; Interp.deadlineMsg = '';
  /* Elementzugriff melden (Inventarleiste im Trainingscamp, app.js): onIndex(array, index, 'lesen'|'schreiben') */
  Interp.onIndex = null;
  Interp.gen = 1; // Generation des aktuellen Programms; Interp.newGeneration() bricht alle älteren Programme beim nächsten Schritt ab
  Interp.newGeneration = () => { Interp.gen++; };
  Interp.checkAbort = () => { if (Interp.abortFlag) throw Interp.ABORT; };
  Interp.ABORT = { abort: true, toString: () => 'Abbruch' };
  let breatheCount = 0, lastBreath = performance.now();
  Interp.breathe = async () => {
    Interp.checkAbort();
    const now = performance.now();
    // alle 30 ms abgeben; jedes achte Mal über einen echten Timer, damit setTimeout-Warteschleifen (Prüfen) nicht verhungern (30.09.2026)
    if (now - lastBreath > 30) { lastBreath = now; if (++breatheCount % 8 === 0) await new Promise(r => setTimeout(r, 0)); else await Interp.Host.yieldNow(); Interp.checkAbort(); }
  };
  // Java-ähnlicher Aufrufstapel für Stacktraces
  Interp.stack = [];
  Interp.pushJava = (fr, name) => { Interp.stack.push({ fr, name }); };
  Interp.popJava = () => { Interp.stack.pop(); };
  let depth = 0;
  Interp.invokeUser = async function (sig, self, vals, callerFr) {
    if (++depth > 3000) { depth = 0; throw jex('java.lang.StackOverflowError', null); }
    const code = sig.code;
    const fr = { self, v: new Array(code.nslots.n), cur: code.frame.id, method: sig.name, caller: callerFr, code };
    code.pslots.forEach((s, i) => { fr.v[s] = vals[i]; });
    Interp.stack.push({ fr, name: sig.name, user: true });
    try {
      const r = await code.run(fr);
      return r && r.ret !== undefined ? r.ret : undefined;
    } catch (e) { Interp.captureStack(e); throw e; }
    finally { Interp.stack.pop(); depth--; }
  };
  Interp.box = (v, t) => { if (t === 'char') return { __char: v, toString: () => String.fromCharCode(v), valueOf: () => v }; if (t === 'double' || t === 'float') return { __double: v, toString: () => javaDouble(v), valueOf: () => v }; return v; };
  Interp.jsClass = (n) => {
    if (n === 'Object') return Object;
    if (n === 'String') return String;
    return Interp.Host.klasse(n) || null;
  };
  Interp.classNameOf = (v) => { if (typeof v === 'string' || v instanceof String) return 'java.lang.String'; if (v && v.constructor && v.constructor.javaName) return v.constructor.javaName; return 'java.lang.Object'; };
  Interp.instanceOf = (v, tn) => {
    if (tn === 'Object') return true;
    if (tn === 'String') return typeof v === 'string' || v instanceof String;
    const c = Interp.jsClass(tn);
    if (c) return v instanceof c;
    const cn = Interp.Host.grafikKlasse(tn);
    return cn ? v instanceof cn : false;
  };
  Interp.construct = (cls, vals) => {
    if (cls === 'Object') return {};
    if (cls === 'String') return jstr(vals.length ? String(vals[0]) : '');
    const C = Interp.Host.erzeugbar(cls);
    if (!C) throw jex('java.lang.InstantiationError', cls);
    return new C(...vals.map(v => (v instanceof String ? String(v) : v)));
  };
  const STATIC_FIELDS = {
    Math: { PI: Math.PI, E: Math.E }, Integer: { MAX_VALUE: 2147483647, MIN_VALUE: -2147483648 }, Double: { MAX_VALUE: Number.MAX_VALUE, MIN_VALUE: Number.MIN_VALUE }
  };
  Interp.staticField = (cls, n) => {
    if (cls === 'System' && n === 'out') return { __printStream: true };
    const h = Interp.Host.statischesFeld(cls, n); if (h !== undefined) return h;
    return (STATIC_FIELDS[cls] || {})[n];
  };
  const S = (x) => (x == null ? x : String(x));
  Interp.staticMethod = (cls, name, params) => {
    const h = Interp.Host.statischeMethode(cls, name, params); if (h) return h;
    switch (cls) {
      case 'Math': {
        switch (name) {
          case 'abs': return (x) => { if (params[0] === 'int') return x === -2147483648 ? x : Math.abs(x); return Math.abs(x); };
          case 'round': return (x) => Math.floor(x + 0.5);
          case 'random': return () => Math.random();
          case 'toRadians': return (x) => x / 180 * Math.PI;
          case 'toDegrees': return (x) => x * 180 / Math.PI;
          default: return Math[name];
        }
      }
      case 'Integer':
        if (name === 'parseInt') return (s) => Interp.javaParseInt(s == null ? null : String(s));
        if (name === 'toString') return (x) => jstr(String(x));
        return (x) => x;
      case 'Double':
        if (name === 'parseDouble') return (s) => Interp.javaParseDouble(s == null ? null : String(s));
        if (name === 'toString') return (x) => jstr(javaDouble(x));
        return (x) => x;
      case 'Boolean': return (s) => s != null && String(s).toLowerCase() === 'true';
      case 'Character':
        return { isDigit: (c) => /[0-9]/.test(String.fromCharCode(c)), isLetter: (c) => /\p{L}/u.test(String.fromCharCode(c)), toUpperCase: (c) => String.fromCharCode(c).toUpperCase().charCodeAt(0), toLowerCase: (c) => String.fromCharCode(c).toLowerCase().charCodeAt(0) }[name];
      case 'String': return (x) => jstr(toJavaString(x, null));
      case 'System':
        if (name === 'currentTimeMillis') return () => Date.now();
        if (name === 'nanoTime') return () => Math.floor(performance.now() * 1e6);
        break;
    }
    return () => { throw jex('java.lang.UnsupportedOperationException', cls + '.' + name); };
  };
  // Methodenaufruf auf beliebigem Objekt
  Interp.callMethod = async (obj, otype, name, vals, ret, fr) => {
    if (typeof obj === 'string' || obj instanceof String) return Interp.stringMethod(String(obj), name, vals);
    if (obj && obj.__printStream) {
      if (name === 'println') Interp.println(vals.length ? toJavaString(vals[0], null) : '');
      else if (name === 'print') Interp.print(toJavaString(vals[0], null));
      return;
    }
    if (obj && (obj.__char !== undefined || obj.__double !== undefined)) { if (name === 'toString') return jstr(obj.toString()); if (name === 'equals') return vals[0] != null && +vals[0] === +obj; }
    if (typeof obj === 'number') { if (name === 'intValue') return obj | 0; if (name === 'doubleValue') return obj; if (name === 'toString') return jstr(Number.isInteger(obj) ? String(obj) : javaDouble(obj)); if (name === 'equals') return vals[0] === obj; }
    if (typeof obj === 'boolean') { if (name === 'booleanValue') return obj; if (name === 'toString') return jstr(String(obj)); if (name === 'equals') return vals[0] === obj; }
    if (Array.isArray(obj)) {
      switch (name) {
        case 'size': return obj.length;
        case 'get': { const i = vals[0]; if (i < 0 || i >= obj.length) throw jex('java.lang.IndexOutOfBoundsException', `Index ${i} out of bounds for length ${obj.length}`); return obj[i]; }
        case 'isEmpty': return obj.length === 0;
        case 'contains': return obj.includes(vals[0]);
        case 'add': obj.push(vals[0]); return true;
        case 'remove': { const i = obj.indexOf(vals[0]); if (i >= 0) { obj.splice(i, 1); return true; } return false; }
        case 'clear': obj.length = 0; return;
        case 'toString': return jstr(toJavaString(obj, null));
        case 'equals': return obj === vals[0];
        case 'hashCode': return 0;
      }
    }
    if (name === 'equals' && typeof obj.equals !== 'function') return obj === vals[0];
    if (name === 'hashCode' && typeof obj.hashCode !== 'function') return 0;
    if (name === 'toString' && obj.toString) return jstr(String(obj.toString()));
    if (name === 'name' && obj._n) return obj._n;
    const f = obj[name];
    if (typeof f !== 'function') throw jex('java.lang.NoSuchMethodError', otype + '.' + name);
    Interp.pushJava(fr, otype + '.' + name);
    try {
      const r = await f.apply(obj, vals.map(v => (v instanceof String ? String(v) : v)));
      return ret === 'String' && typeof r === 'string' ? jstr(r) : r;
    } catch (e) { Interp.captureStack(e); throw e; }
    finally { Interp.popJava(); }
  };
  Interp.stringMethod = (s, name, v) => {
    const a = v.map(x => (x instanceof String ? String(x) : x));
    const idx = (i, len) => { if (i < 0 || i > len) throw jex('java.lang.StringIndexOutOfBoundsException', `begin ${i}, end ${len}, length ${s.length}`); };
    switch (name) {
      case 'length': return s.length;
      case 'charAt': if (a[0] < 0 || a[0] >= s.length) throw jex('java.lang.StringIndexOutOfBoundsException', `Index ${a[0]} out of bounds for length ${s.length}`); return s.charCodeAt(a[0]);
      case 'equals': return a[0] != null && (typeof a[0] === 'string') && a[0] === s;
      case 'equalsIgnoreCase': return a[0] != null && a[0].toLowerCase() === s.toLowerCase();
      case 'isEmpty': return s.length === 0;
      case 'isBlank': return s.trim().length === 0;
      case 'substring': { const b = a[0], e = a.length > 1 ? a[1] : s.length; if (b < 0 || e > s.length || b > e) throw jex('java.lang.StringIndexOutOfBoundsException', `begin ${b}, end ${e}, length ${s.length}`); return jstr(s.substring(b, e)); }
      case 'indexOf': return s.indexOf(a[0]);
      case 'lastIndexOf': return s.lastIndexOf(a[0]);
      case 'contains': if (a[0] == null) throw jex('java.lang.NullPointerException', null); return s.includes(a[0]);
      case 'toUpperCase': return jstr(s.toUpperCase());
      case 'toLowerCase': return jstr(s.toLowerCase());
      case 'trim': return jstr(s.trim());
      case 'startsWith': return s.startsWith(a[0]);
      case 'endsWith': return s.endsWith(a[0]);
      case 'replace': return jstr(s.split(a[0]).join(a[1]));
      case 'compareTo': { const o = a[0]; const n = Math.min(s.length, o.length); for (let i = 0; i < n; i++) if (s.charCodeAt(i) !== o.charCodeAt(i)) return s.charCodeAt(i) - o.charCodeAt(i); return s.length - o.length; }
      case 'toString': return s;
      case 'concat': return jstr(s + a[0]);
      case 'repeat': return jstr(s.repeat(a[0]));
      case 'hashCode': { let h = 0; for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0; return h; }
    }
    throw jex('java.lang.NoSuchMethodError', 'String.' + name);
  };
  Interp.println = (s) => Interp.Host.println(s);
  Interp.print = (s) => Interp.Host.print(s);

  /* Zahlen und Text aus einer Eingabe – wie in Java (Integer.parseInt, Double.parseDouble) */
  Interp.javaParseInt = (s) => {
    if (s == null) throw new Interp.JavaException('java.lang.NumberFormatException', 'Cannot parse null string: null');
    const t = String(s);
    if (!/^[+-]?\d+$/.test(t)) throw new Interp.JavaException('java.lang.NumberFormatException', 'For input string: "' + t + '"');
    const v = parseInt(t, 10);
    if (v > 2147483647 || v < -2147483648) throw new Interp.JavaException('java.lang.NumberFormatException', 'For input string: "' + t + '"');
    return v;
  };
  Interp.javaParseDouble = (s) => {
    if (s == null) throw new Interp.JavaException('java.lang.NullPointerException', null);
    const t = String(s).trim();
    if (!/^[+-]?(NaN|Infinity|((\d+\.?\d*|\.\d+)([eE][+-]?\d+)?)[fFdD]?)$/.test(t)) throw new Interp.JavaException('java.lang.NumberFormatException', t === '' ? 'empty String' : 'For input string: "' + t + '"');
    return parseFloat(t.replace(/[fFdD]$/, ''));
  };
  /* Eingabe einer Zeichenkette: Anführungszeichen außen herum sind unnötig und werden entfernt */
  Interp.eingabeText = (s) => { const t = String(s == null ? '' : s); const m = /^\s*["„“”](.*)["“”]\s*$/.exec(t); return m ? m[1] : t; };

  /* ================================================================ Schnittstelle zur Anwendung
     Ohne Anwendung (Editor allein) gilt die Standardfassung: Ausgabe und Einlesen über Host.print / Host.eingabe.
     Escape from Mars ersetzt das in js/peetie-befehle.js (Peetie, Welt, Handy). */
  class StandardBasis {
    async textAusgeben(t) { Interp.Host.print(String(t)); }
    async einlesenZeichenkette(name) { return Interp.eingabeText(await Interp.Host.eingabe('Zeichenkette', name || '')); }
    async einlesenDezimalzahl(name) { return Interp.javaParseDouble(String(await Interp.Host.eingabe('Dezimalzahl', name || '')).trim()); }
    async einlesenGanzzahl(name) { return Interp.javaParseInt(String(await Interp.Host.eingabe('Ganzzahl', name || '')).trim()); }
    async _run() { }
  }
  Interp.StandardBasis = StandardBasis;
  const kanal = new MessageChannel(), warteschlange = [];
  kanal.port1.onmessage = () => { const f = warteschlange.shift(); if (f) f(); };
  Interp.Host = {
    basis: () => StandardBasis,                 // Klasse, von der das Programm erbt
    klasse: (name) => null,                     // JS-Klasse zu einem Klassennamen (instanceof, Klasse.class)
    grafikKlasse: (name) => null,               // weitere Klassen nur für instanceof
    erzeugbar: (name) => null,                  // Klasse für new Name(…)
    statischesFeld: (cls, name) => undefined,   // Name.FELD
    statischeMethode: (cls, name, params) => null, // Name.methode(…)
    println: (s) => { Interp.Host.print(String(s) + '\n'); },
    print: (s) => { console.log(String(s)); },
    eingabe: async (typ, name) => { const v = window.prompt((name ? name + ' ' : '') + '(' + typ + '):', ''); if (v === null) throw Interp.ABORT; return v; },
    yieldNow: () => new Promise(r => { warteschlange.push(r); kanal.port2.postMessage(0); }) // schnell an die Ereignisschleife abgeben
  };

  /* ================================================================ Klasse erzeugen */
  // Liefert {ok, errors, cls}
  Interp.compileClass = function (model) {
    const c = new Compiler(model);
    let ok;
    try { ok = c.compile(); } catch (e) { console.error(e); c.err('class', 'name', 'Interner Fehler beim Übersetzen: ' + e.message); ok = false; }
    if (!ok) return { ok: false, errors: c.errors };
    const Base = Interp.Host.basis();
    const methods = c.methods, fieldInits = c.fieldInits, fields = c.fields, ctor = c.ctor;
    class Peetie extends Base {
      constructor() {
        super();
        this.__userClass = true;
        this.__gen = Interp.gen; // Programme älterer Generationen (vor einem Neustart) werden abgebrochen
        for (const [n, fd] of fields) this['__f_' + n] = defaultValue(fd.type);
      }
      async __init() {
        for (const fi of fieldInits) {
          const fr = { self: this, v: new Array(fi.nslots.n), cur: fi.fd.frame.id, method: '<init>' };
          Interp.stack.push({ fr, name: '<init>', user: true });
          try { this['__f_' + fi.name] = await fi.ex.ev(fr); } finally { Interp.stack.pop(); }
        }
        if (ctor) {
          const fr = { self: this, v: new Array(ctor.nslots.n), cur: ctor.frame.id, method: '<init>' };
          Interp.stack.push({ fr, name: '<init>', user: true });
          try { await ctor.run(fr); } finally { Interp.stack.pop(); }
        }
      }
    }
    Peetie.javaName = 'Peetie';
    // Überschreibungen installieren (virtueller Aufruf aus AI_Robot heraus)
    for (const sig of methods) {
      if (sig.overrides || (sig.name === '_run' && sig.params.length === 0)) {
        const s = sig;
        Peetie.prototype[sig.name] = function (...vals) { return Interp.invokeUser(s, this, vals, null); };
      }
      if (sig.name === 'toString' && sig.params.length === 0) { const s = sig; Peetie.prototype.toString = function () { return '[Peetie]'; }; Peetie.prototype.__toStringSig = s; }
    }
    Peetie.__methods = methods; Peetie.__fields = fields;
    return { ok: true, errors: [], cls: Peetie, compiler: c };
  };
  Interp.superMethod = (name) => Interp.Host.basis().prototype[name];

  // Stacktrace im Java-Format
  Interp.formatException = function (t, javaMap) {
    let head;
    if (t instanceof Interp.JavaException) head = t.message;
    else if (t && t.javaClass) head = t.message;
    else head = 'java.lang.Error: ' + (t && t.message ? t.message : String(t));
    const lines = [head];
    const lineOf = (id) => { if (!javaMap || !id) return '?'; const i = javaMap.indexOf(id); return i >= 0 ? i + 1 : '?'; };
    const st = (t && t.__stack) || [];
    for (let i = st.length - 1; i >= 0; i--) {
      const s = st[i];
      if (s.user) lines.push(`\tat Peetie.${s.name}(Peetie.java:${lineOf(s.cur)})`);
      else lines.push(`\tat ${s.name.includes('.') ? s.name : 'AI_Robot.' + s.name}(${s.name.includes('.') ? s.name.split('.')[0] : 'AI_Robot'}.java)`);
    }
    return lines.join('\n');
  };
  /* Variablenwerte eines laufenden Frames (für die Anzeige): Attribute und lokale Variablen */
  Interp.frameVars = function (fr) {
    const out = [];
    if (fr && fr.self && fr.self.constructor && fr.self.constructor.__fields) for (const [n, fd] of fr.self.constructor.__fields) out.push({ name: n, type: fd.type, value: fr.self['__f_' + n], kind: 'field' });
    if (fr && fr.code && fr.code.vars) for (const v of fr.code.vars) if (fr.v[v.slot] !== undefined) out.push({ name: v.name, type: v.type, value: fr.v[v.slot], kind: 'local' });
    return out;
  };
  Interp.captureStack = function (t) {
    if (t && typeof t === 'object' && !t.__stack) {
      try { t.__stack = Interp.stack.map(s => ({ name: s.name, user: s.user, cur: s.fr ? s.fr.cur : null })); } catch (e) { }
    }
  };
})();
