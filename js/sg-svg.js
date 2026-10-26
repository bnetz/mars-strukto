/*
 * Struktogramm als SVG (und daraus PNG) – ohne Bearbeitungshilfen, gleiche Aufteilung wie im Editor.
 */
'use strict';
(function () {
  const FONT = 'Source Sans Pro, Mars Sans, Arial, sans-serif';
  const MONO = 'Source Code Pro, Mars Code, Menlo, monospace';
  let ctx = null;
  function measure(text, px, bold, mono) {
    if (!ctx) ctx = document.createElement('canvas').getContext('2d');
    ctx.font = (bold ? '600 ' : '') + px + 'px ' + (mono ? MONO : FONT);
    return ctx.measureText(text).width;
  }
  function wrap(text, width, px) {
    const out = [];
    for (const para of String(text || '').split('\n')) {
      const words = para.split(/(\s+)/).filter(w => w.length);
      let line = '';
      for (const w of words) {
        const t = line + w;
        if (line && measure(t, px) > width) { out.push(line.replace(/\s+$/, '')); line = w.trimStart(); }
        else line = t;
      }
      out.push(line.replace(/\s+$/, ''));
    }
    return out.length ? out : [''];
  }
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  /* Layout: liefert Höhe; zeichnet in parts[] */
  function render(doc, opts) {
    const px = opts.fontSize || 15, lh = px * 1.4, pad = 5, padX = 10;
    const W = opts.width || 760;
    const parts = [];
    const rect = (x, y, w, h, extra) => parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#fff" stroke="#1c1c1c" stroke-width="1"${extra || ''}/>`);
    const line = (x1, y1, x2, y2) => parts.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#1c1c1c" stroke-width="1"/>`);
    const text = (x, y, lines, anchor, bold, mono) => {
      lines.forEach((l, i) => {
        const yy = (y + (i + 1) * lh - lh * 0.32).toFixed(1);
        const attrs = ' font-family="' + (mono ? MONO : FONT) + '" font-size="' + px + '"' + (bold ? ' font-weight="600"' : '') + (anchor ? ' text-anchor="' + anchor + '"' : '');
        parts.push('<text x="' + x + '" y="' + yy + '"' + attrs + ' fill="#1c1c1c">' + esc(l) + '</text>');
      });
    };
    const EMPTY = lh + 2 * pad;

    function heightOf(b, w) {
      if (b.kind === 'stmt') return wrap(b.text, w - 2 * padX, px).length * lh + 2 * pad;
      if (b.kind === 'if') {
        const hl = wrap(b.cond, w - 70, px).length * lh + 2 * pad + lh * 0.9;
        const half = w / 2;
        return hl + Math.max(listHeight(b.then, half), listHeight(b.else, w - half), EMPTY);
      }
      if (b.kind === 'loop') return wrap(b.head, w - 2 * padX, px).length * lh + 2 * pad + Math.max(listHeight(b.body, w - 26), EMPTY);
      return EMPTY;
    }
    function listHeight(list, w) { if (!list.length) return EMPTY; return list.reduce((h, b) => h + heightOf(b, w), 0); }
    function drawList(list, x, y, w) {
      if (!list.length) { return EMPTY; }
      let yy = y;
      for (const b of list) { const h = drawBox(b, x, yy, w); yy += h; }
      return yy - y;
    }
    function drawBox(b, x, y, w) {
      const h = heightOf(b, w);
      rect(x, y, w, h);
      if (b.kind === 'stmt') text(x + padX, y + pad, wrap(b.text, w - 2 * padX, px));
      else if (b.kind === 'if') {
        const cl = wrap(b.cond, w - 70, px);
        const hl = cl.length * lh + 2 * pad + lh * 0.9;
        line(x, y, x + w / 2, y + hl); line(x + w, y, x + w / 2, y + hl);
        text(x + w / 2, y + pad, cl, 'middle');
        text(x + 6, y + hl - lh - 1, ['J']); text(x + w - 6, y + hl - lh - 1, ['N'], 'end');
        const half = w / 2;
        const bh = h - hl;
        line(x + half, y + hl, x + half, y + h);
        drawList(b.then, x, y + hl, half); drawList(b.else, x + half, y + hl, w - half);
      } else if (b.kind === 'loop') {
        const hl = wrap(b.head, w - 2 * padX, px);
        const hh = hl.length * lh + 2 * pad;
        text(x + padX, y + pad, hl);
        line(x + 26, y + hh, x + w, y + hh); line(x + 26, y + hh, x + 26, y + h);
        drawList(b.body, x + 26, y + hh, w - 26);
      }
      return h;
    }

    let y = 10; const x0 = 10;
    const title = opts.title || doc.name || 'Struktogramm';
    text(x0, y, [title], null, true); y += lh + 8;
    if (doc.attributes.length) {
      text(x0, y, ['Variablen'], null, false); y += lh + 2;
      const hh = listHeight(doc.attributes, W); rect(x0, y, W, hh); drawList(doc.attributes, x0, y, W); y += hh + 12;
    }
    for (const m of doc.methods) {
      if (m.name === '_run') { text(x0, y, ['Hauptprogramm'], null, false); y += lh + 2; }
      else {
        // ohneTypen: Kopf wie in den Prüfungsaufgaben nur „name(parameter)“ (Abi-Drill, 07.10.2026)
        // Kopf nur mit Name und Parametern – ohne Datentypen und ohne Rückgabetyp (Guana, 13.10.2026)
        const sig = m.name + '(' + m.params.map(p => p.name).join(', ') + ')';
        const tw = measure(sig, px, true, true) + 20;
        rect(x0, y, tw, lh + 6); text(x0 + 10, y + 3, [sig], null, true, true); y += lh + 6;
      }
      // Missionsrahmen: die Deklarationen am Anfang stehen davor (laufen nur einmal)
      const vk = (m.name === '_run' && opts.rahmen) ? Struktogramm.vorspann(m.body, m) : 0;
      const body = (m.name === '_run' && opts.rahmen) ? m.body.slice(0, vk).concat([{ kind: 'loop', id: Struktogramm.RAHMEN_ID, head: Struktogramm.RAHMEN_TEXT, body: m.body.slice(vk) }]) : m.body;
      const hh = listHeight(body, W); rect(x0, y, W, hh); drawList(body, x0, y, W); y += hh + 16;
    }
    const totalW = W + 20, totalH = y;
    return { parts, width: totalW, height: totalH };
  }

  let fontCss = null;
  async function fontFace() {
    if (fontCss !== null) return fontCss;
    // eingebettete Schrift aus schrift.js („Mars Sans“, geht auch auf fremden Seiten und per file://)
    const b64 = window.SgSchrift && SgSchrift.base64('Mars Sans', '400');
    fontCss = b64 ? `@font-face{font-family:'Mars Sans';src:url(data:font/woff2;base64,${b64}) format('woff2');}` : '';
    return fontCss;
  }
  Struktogramm.toSvg = function (doc, opts, embedFont) {
    const r = render(doc, opts || {});
    const style = embedFont ? `<style>${embedFont}</style>` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${r.width}" height="${r.height}" viewBox="0 0 ${r.width} ${r.height}">${style}<rect width="100%" height="100%" fill="#fff"/>${r.parts.join('')}</svg>`;
  };
  Struktogramm.exportSvg = async function (doc, opts) {
    const css = await fontFace();
    return Struktogramm.toSvg(doc, opts, css);
  };
  Struktogramm.exportPng = async function (doc, opts, scale) {
    await (document.fonts ? document.fonts.ready : Promise.resolve());
    const css = await fontFace();
    const svg = Struktogramm.toSvg(doc, opts, css);
    const r = render(doc, opts || {});
    const img = new Image();
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    const s = scale || 2;
    const c = document.createElement('canvas'); c.width = Math.ceil(r.width * s); c.height = Math.ceil(r.height * s);
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(url);
    return new Promise((res) => c.toBlob(res, 'image/png'));
  };
})();
