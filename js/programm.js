/*
 * Programmbaum: die interne Darstellung, die der Ausführer (interp.js) bekommt.
 * Ein Struktogramm wird in diesen Baum übersetzt (struktogramm.js). Frames:
 *   call{expr} var{vtype,name,value} assign{dest,src} if{cond,then,elseifs,else} while{cond,body}
 *   foreach{vtype,var,coll,body} return{value} break comment blank; method{name,rtype,params,body}
 */
'use strict';
window.Programm = {}; // nur als Eigenschaft von window, kein const – sonst bricht eine Seite ab, die selbst schon „Programm“ kennt (26.10.2026)
(function () {
  let uid = 1;
  Programm.newId = () => 'f' + (uid++);
  const F = {
    call: (expr) => ({ type: 'call', expr: expr || '', enable: true, id: Programm.newId() }),
    var: (vtype, name, value, mods) => Object.assign({ type: 'var', vtype: vtype || '', name: name || '', value: value === undefined ? null : value, access: null, isStatic: false, isFinal: false, enable: true, id: Programm.newId() }, mods || {}),
    assign: (dest, src) => ({ type: 'assign', dest: dest || '', src: src || '', enable: true, id: Programm.newId() }),
    if: (cond) => ({ type: 'if', cond: cond || '', then: [], elseifs: [], else: null, enable: true, id: Programm.newId() }),
    while: (cond) => ({ type: 'while', cond: cond || '', body: [], enable: true, id: Programm.newId() }),
    foreach: (vtype, v, coll) => ({ type: 'foreach', vtype: vtype || '', var: v || '', coll: coll || '', body: [], enable: true, id: Programm.newId() }),
    return: (value) => ({ type: 'return', value: value === undefined ? null : value, enable: true, id: Programm.newId() }),
    comment: (text) => ({ type: 'comment', text: text || '', id: Programm.newId() }),
    break: () => ({ type: 'break', enable: true, id: Programm.newId() }),
    blank: () => ({ type: 'blank', id: Programm.newId() }),
    method: (name, rtype, access) => ({ type: 'method', access: access || 'public', isStatic: false, isFinal: false, rtype: rtype == null ? 'void' : rtype, name: name || '', params: [], javadoc: '', body: [], enable: true, id: Programm.newId() }),
    ctor: () => ({ type: 'constructor', access: 'public', params: [], javadoc: '', body: [], enable: true, id: Programm.newId() })
  };
  Programm.F = F;
  Programm.newModel = () => ({ name: 'Peetie', extends: 'AI_Robot', isAbstract: false, javadoc: '', imports: [], fields: [], constructors: [], methods: [] });
})();
