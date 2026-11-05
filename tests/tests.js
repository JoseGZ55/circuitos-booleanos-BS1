#!/usr/bin/env node
/*
 * Tests del motor lógico de index.html.
 * Uso:  node tests/tests.js
 * No necesita dependencias: extrae el bloque <script id="motor"> de index.html
 * y lo ejecuta en un contexto aislado de Node.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const bloque = html.match(/<script id="motor">([\s\S]*?)<\/script>/);
if (!bloque) { console.error('No se encontró <script id="motor"> en index.html'); process.exit(1); }
const ctx = {};
vm.createContext(ctx);
vm.runInContext(bloque[1] + '\nthis.Motor = Motor;', ctx);
const M = ctx.Motor;

/* ---------- mini arnés ---------- */
let ok = 0, fallos = 0;
const avisos = [];
function seccion(t) { console.log('\n== ' + t + ' =='); }
function prueba(nombre, fn) {
  try { fn(); ok++; console.log('  ✓ ' + nombre); }
  catch (e) { fallos++; console.log('  ✗ ' + nombre + '\n      ' + e.message); }
}
function igual(a, b, msg) {
  const sa = JSON.stringify(a), sb = JSON.stringify(b);
  if (sa !== sb) throw new Error((msg ? msg + ': ' : '') + 'se obtuvo ' + sa + ', se esperaba ' + sb);
}
function lanzaError(texto, posicion, fragmento) {
  let e = null;
  try { M.parsear(texto); } catch (err) { e = err; }
  if (!e) throw new Error('"' + texto + '" debía dar error y se aceptó');
  if (e.name !== 'ErrorSintaxis') throw new Error('error inesperado: ' + e.message);
  if (posicion !== undefined) igual(e.posicion, posicion, 'posición del error');
  if (fragmento && !e.message.includes(fragmento))
    throw new Error('el mensaje "' + e.message + '" no contiene "' + fragmento + '"');
  return e.message;
}
const XYZ = ['X', 'Y', 'Z'];
const mins = (expr, vars = XYZ) => M.minterminos(M.parsear(expr), vars);

/* =================================================================
   CASOS OBLIGATORIOS DE LA GUÍA
   `minterminos` está verificado a mano término por término.
   `segunGuia` solo aparece cuando la tabla del enunciado difiere.
   ================================================================= */
const CASOS = [
  { n: 1,  expr: "X'Y'Z + X'YZ + XY'",          minterminos: [1, 3, 4, 5] },
  { n: 2,  expr: "XY + X'Z + YZ(X+X')",         minterminos: [1, 3, 6, 7], segunGuia: [3, 5, 6, 7] },
  { n: 3,  expr: "X'Y + XY + Y'Z'",             minterminos: [0, 2, 3, 4, 6, 7] },
  { n: 4,  expr: "XY' + X'YZ + X'Y'Z",          minterminos: [1, 3, 4, 5] },
  { n: 5,  expr: "XYZ' + X'Y + Z'Y",            minterminos: [2, 3, 6] },
  { n: 6,  expr: "X'Y'Z' + XY'Z + XYZ",         minterminos: [0, 5, 7] },
  { n: 7,  expr: "X'Y'Z + X'YZ + XY'Z' + XYZ",  minterminos: [1, 3, 4, 7] },
  { n: 8,  expr: "X'Y'Z + XY'Z' + XYZ",         minterminos: [1, 4, 7] },
  { n: 9,  expr: "X'YZ + XY'Z + XYZ' + XYZ",    minterminos: [3, 5, 6, 7] },
  { n: 10, expr: "XYZ'",                        minterminos: [6] },
  { n: 11, expr: "X + Y'Z",                     minterminos: [1, 4, 5, 6, 7] },
  { n: 12, expr: "X'Z + XY'",                   minterminos: [1, 3, 4, 5] },
  { n: 13, expr: "XY + X(Y+Z) + Y(Y+Z)",        minterminos: [2, 3, 5, 6, 7] },
  { n: 14, expr: "(X'.Y) + (Z'.Y)",             minterminos: [2, 3, 6] },
];

seccion('Parser: los 14 casos de la guía (minterminos en 1)');
for (const c of CASOS) {
  prueba('Caso ' + String(c.n).padStart(2) + ': ' + c.expr.padEnd(30) + ' → ' +
         c.minterminos.map(m => 'm' + m).join(', '), () => {
    igual(mins(c.expr), c.minterminos);
  });
  if (c.segunGuia) avisos.push('Caso ' + c.n + ' (' + c.expr + '): la tabla del enunciado dice ' +
    c.segunGuia.map(m => 'm' + m).join(', ') + ', pero la tabla de verdad da ' +
    mins(c.expr).map(m => 'm' + m).join(', ') + '.');
}

seccion('Parser: notación del curso');
prueba("yuxtaposición = punto:  XY ≡ X.Y ≡ X . Y ≡ X·Y", () => {
  const ref = mins('XY');
  igual(mins('X.Y'), ref); igual(mins('X . Y'), ref); igual(mins('X·Y'), ref);
  igual(ref, [6, 7]);
});
prueba("espacios en cualquier lugar:  \" X ' Y \" ≡ X'Y", () => igual(mins(" X ' Y "), mins("X'Y")));
prueba("apóstrofe tipográfico (’) copiado de PDF ≡ '", () => igual(mins('X’Y’Z'), mins("X'Y'Z")));
prueba("precedencia: AND antes que OR  (X + YZ ≠ (X+Y)Z)", () => {
  igual(mins('X + YZ'), [3, 4, 5, 6, 7]);
  igual(mins('(X+Y)Z'), [3, 5, 7]);
});
prueba("negación solo afecta a la variable previa:  XY' ≠ (XY)'", () => {
  igual(mins("XY'"), [4, 5]);
  igual(mins("(XY)'"), [0, 1, 2, 3, 4, 5]);
});
prueba("doble negación X'' ≡ X", () => igual(mins("X''"), mins('X')));
prueba("paréntesis yuxtapuestos: X(X'+Y) ≡ XY", () => igual(mins("X(X'+Y)"), mins('XY')));
prueba("producto de sumas: (X+Y)(X+Z) ≡ X + YZ", () => igual(mins('(X+Y)(X+Z)'), mins('X + YZ')));
prueba("paréntesis anidados: ((X'+Y)Z)' ", () => igual(mins("((X'+Y)Z)'"), [0, 2, 4, 5, 6]));
prueba("cuatro variables con W (W = bit más significativo)", () => {
  igual(mins("WX'", ['W', 'X', 'Y', 'Z']), [8, 9, 10, 11]);
  igual(mins('Z', ['W', 'X', 'Y', 'Z']), [1, 3, 5, 7, 9, 11, 13, 15]);
});
prueba('variablesUsadas devuelve el orden canónico W, X, Y, Z', () => {
  igual(M.variablesUsadas(M.parsear("ZX + W'")), ['W', 'X', 'Z']);
});
prueba('aTexto normaliza la escritura', () => {
  igual(M.aTexto(M.parsear("(X'.Y) + (Z'.Y)")), "X'Y + Z'Y");
  igual(M.aTexto(M.parsear("YZ(X+X')")), "YZ(X + X')");
  igual(M.aTexto(M.parsear("(X+Y)'")), "(X + Y)'");
});

seccion('Parser: errores (mensaje en español con posición)');
const ejemplosError = [];
function casoError(texto, pos, frag) {
  prueba(JSON.stringify(texto).padEnd(14) + ' → error en posición ' + pos, () => {
    ejemplosError.push([texto, lanzaError(texto, pos, frag)]);
  });
}
casoError('',          1, 'vacía');
casoError('   ',       1, 'vacía');
casoError('X +',       4, 'incompleta');
casoError('X ++ Y',    4, "se encontró '+'");
casoError('+X',        1, "se encontró '+'");
casoError("'X",        1, 'apóstrofe');
casoError('X..Y',      3, "después de '.'");
casoError('(X+Y',      1, 'nunca se cierra');
casoError('X+Y)',      4, "no tiene un '('");
casoError('X()',       3, 'vacíos');
casoError('xY',        1, "use 'X'");
casoError('A+B',       1, "'A' no está permitida");
casoError('X & Y',     3, "'&' no es válido");
casoError('(X+)Y',     4, "después de '+'");

seccion('Tabla de verdad');
prueba('3 variables por defecto: 8 filas X Y Z, aunque la fórmula use menos', () => {
  const t = M.tablaVerdad(M.parsear("XY'"));
  igual(t.vars, ['X', 'Y', 'Z']); igual(t.filas.length, 8); igual(t.unos, [4, 5]);
});
prueba('con W: 16 filas W X Y Z', () => {
  const t = M.tablaVerdad(M.parsear("W + X'Y"));
  igual(t.vars, ['W', 'X', 'Y', 'Z']); igual(t.filas.length, 16);
  igual(t.unos, [2, 3, 8, 9, 10, 11, 12, 13, 14, 15]);
});
prueba('filas en orden binario con X como bit más significativo', () => {
  const t = M.tablaVerdad(M.parsear('X'));
  igual(t.filas.map(f => f.bits.join('')), ['000', '001', '010', '011', '100', '101', '110', '111']);
  igual(t.filas.map(f => f.salida), [0, 0, 0, 0, 1, 1, 1, 1]);
});
prueba('nombre de cada mintérmino en variables', () => {
  igual(M.textoMintermino(0, XYZ), "X'Y'Z'");
  igual(M.textoMintermino(6, XYZ), "XYZ'");
  igual(M.textoMintermino(9, ['W', 'X', 'Y', 'Z']), "WX'Y'Z");
});
prueba('caso 7 → Fo = m1 + m3 + m4 + m7 y su desarrollo', () => {
  const t = M.tablaVerdad(M.parsear(CASOS[6].expr));
  igual(M.textoSumaMinterminos(t.unos), 'm1 + m3 + m4 + m7');
  igual(M.textoDesarrollo(t.unos, t.vars), "X'Y'Z + X'YZ + XY'Z' + XYZ");
});
prueba('función nula (modo B sin unos) → Fo = 0', () => {
  const t = M.tablaDesdeSalidas(XYZ, [0, 0, 0, 0, 0, 0, 0, 0]);
  igual(M.textoSumaMinterminos(t.unos), '0'); igual(M.textoDesarrollo(t.unos, XYZ), '0');
});
prueba('modo B: tabla → desarrollo → parser devuelve la misma tabla (14 casos)', () => {
  for (const c of CASOS) {
    const salidas = M.tablaVerdad(M.parsear(c.expr)).filas.map(f => f.salida);
    const t = M.tablaDesdeSalidas(XYZ, salidas);
    igual(mins(M.textoDesarrollo(t.unos, XYZ)), c.minterminos, 'caso ' + c.n);
  }
});
prueba('modo B: ida y vuelta para las 65 536 funciones de 4 variables', () => {
  const V4 = ['W', 'X', 'Y', 'Z'];
  for (let f = 1; f < 65536; f++) {          // f = 0 es la función nula, cubierta arriba
    const salidas = [];
    for (let m = 0; m < 16; m++) salidas.push((f >> m) & 1);
    const t = M.tablaDesdeSalidas(V4, salidas);
    const de = M.minterminos(M.parsear(M.textoDesarrollo(t.unos, V4)), V4);
    if (JSON.stringify(de) !== JSON.stringify(t.unos)) throw new Error('falla en f = ' + f);
  }
});
prueba('LaTeX: encabezado, 8 filas, \\rowcolor en las filas con 1 y cierre', () => {
  const tex = M.tablaLatex(M.tablaVerdad(M.parsear("XYZ'")));
  const L = tex.split('\n');
  igual(L[0], '% Requiere en el preámbulo: \\usepackage[table]{xcolor}');
  igual(L[1], '\\begin{tabular}{|c|c|c|c|c|}');
  igual(L[3], '$X$ & $Y$ & $Z$ & $F_o$ & Mintérmino \\\\');
  igual(L[5], '0 & 0 & 0 & 0 & $m_{0}$ \\\\');
  igual(L[11], '\\rowcolor[HTML]{FFF3C4} 1 & 1 & 0 & 1 & $m_{6}$ \\\\');
  igual(L[L.length - 1], '\\end{tabular}');
  igual(L.length, 15);
  igual(L.filter(l => l.includes('rowcolor')).length, 1, 'solo la fila con Fo = 1');
});

seccion('Simplificación: los 14 casos de la guía (Quine-McCluskey)');
/* `minima`   : forma mínima calculada (se compara como conjunto de términos, sin importar el orden).
   `propuesta`: lo que indicaba la tabla del enunciado, solo cuando es distinto.
   `entradaMinima`: la expresión escrita ya es una de las formas mínimas.                          */
const SIMPL = {
  1:  { minima: ["X'Z", "XY'"] },
  2:  { minima: ["X'Z", 'XY'] },
  3:  { minima: ['Y', "Z'"] },
  4:  { minima: ["X'Z", "XY'"] },
  5:  { minima: ["X'Y", "YZ'"] },
  6:  { minima: ["X'Y'Z'", 'XZ'], propuesta: 'sin simplificar (X\'Y\'Z\' + XY\'Z + XYZ)' },
  7:  { minima: ["X'Z", 'YZ', "XY'Z'"], propuesta: "X'Z + XY'Z' + XYZ" },
  8:  { minima: ["X'Y'Z", "XY'Z'", 'XYZ'], entradaMinima: true },
  9:  { minima: ['XY', 'XZ', 'YZ'] },
  10: { minima: ["XYZ'"], entradaMinima: true },
  11: { minima: ['X', "Y'Z"], entradaMinima: true },
  12: { minima: ["X'Z", "XY'"], entradaMinima: true },
  13: { minima: ['Y', 'XZ'] },
  14: { minima: ["X'Y", "YZ'"], entradaMinima: true, propuesta: "Y(X'+Z') (forma factorizada, no es suma de productos)" },
};
const conjunto = arr => arr.slice().sort().join(' + ');
for (const c of CASOS) {
  const e = SIMPL[c.n];
  prueba('Caso ' + String(c.n).padStart(2) + ': ' + c.expr.padEnd(30) + ' → ' + e.minima.join(' + '), () => {
    const ast = M.parsear(c.expr);
    const t = M.tablaVerdad(ast);
    const qm = M.quineMcCluskey(t.unos, 3);
    igual(qm.soluciones.length, 1, 'número de soluciones mínimas');
    const obtenida = qm.soluciones[0].patrones.map(p => M.textoPatron(p, XYZ));
    igual(conjunto(obtenida), conjunto(e.minima));
    // la forma mínima tiene exactamente la misma tabla de verdad (la tabla es la fuente de verdad)
    igual(mins(M.textoSOP(qm.soluciones[0].patrones, XYZ)), c.minterminos, 'tabla de la forma mínima');
    igual(M.entradaEsMinima(ast, XYZ, qm), !!e.entradaMinima, '¿la entrada ya es mínima?');
  });
  if (e.propuesta) avisos.push('Caso ' + c.n + ' (' + c.expr + '): el enunciado propone ' + e.propuesta +
    '; Quine-McCluskey da ' + e.minima.join(' + ') + '.');
}

seccion('Simplificación: pasos intermedios');
prueba('caso 7: columnas de agrupamiento, primos y esenciales', () => {
  const qm = M.quineMcCluskey([1, 3, 4, 7], 3);
  igual(qm.columnas.length, 2);
  igual(qm.columnas[0].map(g => [g.unos, g.terminos.map(t => t.patron)]), [[1, ['001', '100']], [2, ['011']], [3, ['111']]]);
  igual(qm.columnas[0].flatMap(g => g.terminos.map(t => t.combinado)), [true, false, true, true]);
  igual(qm.columnas[1].map(g => [g.unos, g.terminos.map(t => t.patron + ':' + t.mins.join(','))]), [[1, ['0-1:1,3']], [2, ['-11:3,7']]]);
  igual(qm.primos.map(p => p.etiqueta + '=' + M.textoPatron(p.patron, XYZ)), ["P1=XY'Z'", "P2=X'Z", 'P3=YZ']);
  igual(qm.esenciales.map(e => qm.primos[e.indice].etiqueta + ' por ' + e.por.join(',')), ['P1 por 4', 'P2 por 1', 'P3 por 7']);
  igual(qm.restantes, []);
  igual(qm.petrick, null);
});
prueba('función cíclica m(0,1,2,5,6,7): sin esenciales, Petrick da 2 soluciones mínimas', () => {
  const qm = M.quineMcCluskey([0, 1, 2, 5, 6, 7], 3);
  igual(qm.primos.length, 6);
  igual(qm.esenciales, []);
  igual(qm.restantes, [0, 1, 2, 5, 6, 7]);
  const sols = qm.soluciones.map(s => conjunto(s.patrones.map(p => M.textoPatron(p, XYZ)))).sort();
  igual(sols, [conjunto(["X'Y'", "YZ'", 'XZ']), conjunto(["X'Z'", "Y'Z", 'XY'])]);
});
prueba('ejemplo de 4 variables (Mano) m(0,1,2,5,8,9,10) → X\'Y\' + X\'Z\' + W\'Y\'Z', () => {
  const V4 = ['W', 'X', 'Y', 'Z'];
  const qm = M.quineMcCluskey([0, 1, 2, 5, 8, 9, 10], 4);
  igual(qm.soluciones.length, 1);
  igual(conjunto(qm.soluciones[0].patrones.map(p => M.textoPatron(p, V4))), conjunto(["X'Y'", "X'Z'", "W'Y'Z"]));
});
prueba('casos límite: Fo = 0 y Fo = 1', () => {
  igual(M.textoSOP(M.quineMcCluskey([], 3).soluciones[0].patrones, XYZ), '0');
  igual(M.textoSOP(M.quineMcCluskey([0, 1, 2, 3, 4, 5, 6, 7], 3).soluciones[0].patrones, XYZ), '1');
});
prueba('forma no SOP (YZ(X+X\')) no se considera "ya mínima"', () => {
  igual(M.terminosSOP(M.parsear("YZ(X+X')"), XYZ), null);
  igual(M.terminosSOP(M.parsear("X'Y + XX'"), XYZ), null);
});

seccion('Simplificación: verificación exhaustiva');
// Búsqueda por fuerza bruta: todos los productos posibles (3^3 = 27) y todas sus combinaciones,
// en orden creciente de tamaño. Sirve para comprobar que Quine-McCluskey da el mínimo real.
function minimoFuerzaBruta(unos, n) {
  const pats = [];
  (function gen(p) { if (p.length === n) pats.push(p); else for (const c of '01-') gen(p + c); })('');
  const f = new Set(unos);
  const cubreP = p => { const r = []; for (let m = 0; m < (1 << n); m++) {
    let ok = true; for (let i = 0; i < n; i++) { const b = (m >> (n - 1 - i)) & 1; if (p[i] !== '-' && +p[i] !== b) ok = false; }
    if (ok) r.push(m); } return r; };
  const impl = pats.map(p => ({ p, c: cubreP(p) })).filter(x => x.c.every(m => f.has(m)));
  if (!unos.length) return [0, 0];
  for (let k = 1; k <= impl.length; k++) {
    let mejor = Infinity;
    (function comb(desde, elegidos) {
      if (elegidos.length === k) {
        const s = new Set(); elegidos.forEach(x => x.c.forEach(m => s.add(m)));
        if (s.size === f.size) mejor = Math.min(mejor, elegidos.reduce((a, x) => a + M.literales(x.p), 0));
        return;
      }
      for (let i = desde; i < impl.length; i++) comb(i + 1, [...elegidos, impl[i]]);
    })(0, []);
    if (mejor < Infinity) return [k, mejor];
  }
}
prueba('las 256 funciones de 3 variables: QM = mínimo por fuerza bruta (términos y literales)', () => {
  for (let f = 0; f < 256; f++) {
    const unos = []; for (let m = 0; m < 8; m++) if ((f >> m) & 1) unos.push(m);
    const qm = M.quineMcCluskey(unos, 3);
    const s = qm.soluciones[0];
    igual([s.terminos, s.literales], minimoFuerzaBruta(unos, 3), 'función ' + f);
  }
});
prueba('las 65 536 funciones de 4 variables: toda solución mínima reproduce la tabla de verdad', () => {
  const V4 = ['W', 'X', 'Y', 'Z'];
  for (let f = 0; f < 65536; f++) {
    const unos = []; for (let m = 0; m < 16; m++) if ((f >> m) & 1) unos.push(m);
    const qm = M.quineMcCluskey(unos, 4);
    for (const s of qm.soluciones) {
      const cubiertos = new Set();
      for (const p of s.patrones) for (let m = 0; m < 16; m++) {
        let ok = true; for (let i = 0; i < 4; i++) { const b = (m >> (3 - i)) & 1; if (p[i] !== '-' && +p[i] !== b) ok = false; }
        if (ok) cubiertos.add(m);
      }
      if ([...cubiertos].sort((a, b) => a - b).join() !== unos.join()) throw new Error('falla en f = ' + f);
    }
  }
});

/* =================================================================
   DIAGRAMA: se reconstruye el circuito SOLO a partir de la geometría
   dibujada (segmentos, puntos, pines) y se simula. Si el dibujo
   conecta algo mal, la simulación no coincide con la tabla de verdad.
   ================================================================= */
const EPS = 1e-6;
const mismoPunto = (a, b) => Math.abs(a[0] - b[0]) < EPS && Math.abs(a[1] - b[1]) < EPS;
function enInterior(p, s) {
  const [x1, y1, x2, y2] = s;
  if (x1 === x2) return Math.abs(p[0] - x1) < EPS && p[1] > Math.min(y1, y2) + EPS && p[1] < Math.max(y1, y2) - EPS;
  return Math.abs(p[1] - y1) < EPS && p[0] > Math.min(x1, x2) + EPS && p[0] < Math.max(x1, x2) - EPS;
}
function verificarCircuito(m, vars, unosEsperados) {
  const S = m.segmentos;
  const ext = s => [[s[0], s[1]], [s[2], s[3]]];
  const hayPunto = p => m.puntos.some(q => mismoPunto(p, q));
  S.forEach(s => { if (s[0] !== s[2] && s[1] !== s[3]) throw new Error('segmento diagonal ' + s); });
  // union-find de segmentos
  const padre = S.map((_, i) => i);
  const raiz = i => padre[i] === i ? i : (padre[i] = raiz(padre[i]));
  const unir = (a, b) => { padre[raiz(a)] = raiz(b); };
  const puntosT = [];
  for (let a = 0; a < S.length; a++) for (let b = a + 1; b < S.length; b++) {
    const A = S[a], B = S[b];
    const horA = A[1] === A[3], horB = B[1] === B[3];
    if (horA === horB) {               // paralelos: no deben solaparse
      const mismaLinea = horA ? A[1] === B[1] : A[0] === B[0];
      if (mismaLinea) {
        const [a1, a2] = horA ? [Math.min(A[0], A[2]), Math.max(A[0], A[2])] : [Math.min(A[1], A[3]), Math.max(A[1], A[3])];
        const [b1, b2] = horA ? [Math.min(B[0], B[2]), Math.max(B[0], B[2])] : [Math.min(B[1], B[3]), Math.max(B[1], B[3])];
        if (Math.min(a2, b2) - Math.max(a1, b1) > EPS) throw new Error('cables superpuestos ' + A + ' / ' + B);
      }
    }
    let unidos = false;
    for (const p of ext(A)) for (const q of ext(B)) if (mismoPunto(p, q)) unidos = true;
    for (const p of ext(A)) if (enInterior(p, B)) { unidos = true; puntosT.push(p); }
    for (const p of ext(B)) if (enInterior(p, A)) { unidos = true; puntosT.push(p); }
    if (unidos) unir(a, b);
    else if (horA !== horB) {           // cruce: debe ir SIN punto
      const [H, V] = horA ? [A, B] : [B, A];
      const c = [V[0], H[1]];
      if (enInterior(c, H) && enInterior(c, V) && hayPunto(c)) throw new Error('punto en un cruce sin conexión ' + c);
    }
  }
  // toda derivación en T lleva punto; todo punto está en una derivación (o unión de 3+ cables)
  for (const p of puntosT) if (!hayPunto(p)) throw new Error('derivación sin punto en ' + p);
  for (const q of m.puntos) {
    const grado = S.filter(s => ext(s).some(p => mismoPunto(p, q))).length;
    if (grado < 3 && !puntosT.some(p => mismoPunto(p, q))) throw new Error('punto sobrante en ' + q);
  }
  const red = p => {
    const i = S.findIndex(s => ext(s).some(e => mismoPunto(e, p)));
    if (i < 0) throw new Error('pin sin cable en ' + p);
    return raiz(i);
  };
  // fuentes de cada red
  const fuente = new Map();
  const ponerFuente = (r, f) => { if (fuente.has(r)) throw new Error('red con dos fuentes'); fuente.set(r, f); };
  m.entradas.forEach(e => ponerFuente(red([e.x, e.y]), { entrada: e.nombre }));
  m.compuertas.forEach((c, k) => ponerFuente(red(c.salida), { compuerta: k }));
  const gEnt = m.compuertas.map(c => c.entradas.map(red));
  const rSal = red([m.salida.x, m.salida.y]);
  const unos = [];
  for (let mt = 0; mt < (1 << vars.length); mt++) {
    const val = {};
    vars.forEach((v, i) => { val[v] = (mt >> (vars.length - 1 - i)) & 1; });
    val['0'] = 0; val['1'] = 1;
    const memo = new Map();
    const valor = (r, prof = 0) => {
      if (prof > 50) throw new Error('lazo en el circuito');
      if (memo.has(r)) return memo.get(r);
      const f = fuente.get(r);
      if (!f) throw new Error('red sin fuente');
      let v;
      if ('entrada' in f) v = val[f.entrada];
      else {
        const c = m.compuertas[f.compuerta], xs = gEnt[f.compuerta].map(q => valor(q, prof + 1));
        v = c.tipo === 'NOT' ? 1 - xs[0] : c.tipo === 'AND' ? +xs.every(Boolean) : +xs.some(Boolean);
      }
      memo.set(r, v);
      return v;
    };
    if (valor(rSal)) unos.push(mt);
  }
  igual(unos, unosEsperados, 'simulación del diagrama');
  return { red, rSal, gEnt };
}
const cuenta = (m, t) => m.compuertas.filter(c => c.tipo === t).length;
const canonicaDe = (unos, n) => unos.map(x => x.toString(2).padStart(n, '0'));

seccion('Diagrama: los 14 casos (se simula el circuito dibujado)');
for (const c of CASOS) {
  prueba('Caso ' + String(c.n).padStart(2) + ': simplificada y canónica reproducen ' + c.minterminos.map(x => 'm' + x).join(','), () => {
    const qm = M.quineMcCluskey(c.minterminos, 3);
    for (const [pats, op] of [[qm.soluciones[0].patrones, {}], [canonicaDe(c.minterminos, 3), { ordenFijo: true }]]) {
      const m = M.modeloDiagrama(pats, XYZ, op);
      verificarCircuito(m, XYZ, c.minterminos);
      M.svgDiagrama(m);   // también debe poder serializarse
    }
  });
}

seccion('Diagrama: reglas de construcción');
prueba('cada término de 2+ literales es una AND; las AND convergen en una OR', () => {
  const m = M.modeloDiagrama(M.quineMcCluskey([1, 3, 4, 7], 3).soluciones[0].patrones, XYZ);   // X'Z + YZ + XY'Z'
  igual([cuenta(m, 'AND'), cuenta(m, 'OR'), cuenta(m, 'NOT')], [3, 1, 3]);
  igual(m.compuertas.find(c => c.tipo === 'OR').entradas.length, 3);
});
prueba('un solo término producto: sin OR, la AND va directo a Fo (caso 10, XYZ\')', () => {
  const m = M.modeloDiagrama(['110'], XYZ);
  igual([cuenta(m, 'AND'), cuenta(m, 'OR'), cuenta(m, 'NOT')], [1, 0, 1]);
  const v = verificarCircuito(m, XYZ, [6]);
  const and = m.compuertas.findIndex(c => c.tipo === 'AND');
  igual(v.red(m.compuertas[and].salida), v.rSal, 'la salida de la AND es Fo');
});
prueba('un término de una sola variable entra directo a la OR, sin AND (caso 13, Y + XZ)', () => {
  const m = M.modeloDiagrama(['-1-', '1-1'], XYZ);
  igual([cuenta(m, 'AND'), cuenta(m, 'OR'), cuenta(m, 'NOT')], [1, 1, 0]);
  const v = verificarCircuito(m, XYZ, [2, 3, 5, 6, 7]);
  const y = m.entradas.find(e => e.nombre === 'Y');
  const or = m.compuertas.findIndex(c => c.tipo === 'OR');
  if (!v.gEnt[or].includes(v.red([y.x, y.y]))) throw new Error('Y no llega directo a la OR');
});
prueba('Fo = X\': un solo inversor, sin AND ni OR', () => {
  const m = M.modeloDiagrama(['0--'], XYZ);
  igual([cuenta(m, 'AND'), cuenta(m, 'OR'), cuenta(m, 'NOT')], [0, 0, 1]);
  verificarCircuito(m, XYZ, [0, 1, 2, 3]);
});
prueba('un inversor por variable negada, en una columna propia tras las entradas', () => {
  const m = M.modeloDiagrama(["0-1", '10-'], XYZ);   // X'Z + XY'
  const nots = m.compuertas.filter(c => c.tipo === 'NOT');
  igual(nots.length, 2);
  igual(new Set(nots.map(c => c.x)).size, 1, 'todos en la misma columna x');
  const xMinAND = Math.min(...m.compuertas.filter(c => c.tipo !== 'NOT').map(c => c.x));
  if (!(nots[0].x > Math.max(...m.entradas.map(e => e.x)) && nots[0].x < xMinAND)) throw new Error('columna de inversores mal ubicada');
});
prueba('entradas rotuladas a la izquierda y salida rotulada Fo', () => {
  const m = M.modeloDiagrama(["0-1", '10-'], XYZ);
  igual(m.entradas.map(e => e.nombre), ['X', 'Y', 'Z']);
  igual(m.salida.nombre, 'Fo');
  const svg = M.svgDiagrama(m);
  if (!/<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/.test(svg) || !svg.includes('>Fo</text>')) throw new Error('SVG incompleto');
});
prueba('la banda de entradas e inversores no tiene cruces', () => {
  for (let f = 1; f < 256; f++) {
    const unos = []; for (let x = 0; x < 8; x++) if ((f >> x) & 1) unos.push(x);
    const m = M.modeloDiagrama(canonicaDe(unos, 3), XYZ);
    const yBanda = Math.max(...m.compuertas.filter(c => c.tipo === 'NOT').map(c => c.y), ...m.entradas.map(e => e.y));
    for (const h of m.segmentos.filter(s => s[1] === s[3] && s[1] <= yBanda))
      for (const v of m.segmentos.filter(s => s[0] === s[2]))
        if (enInterior([v[0], h[1]], h) && enInterior([v[0], h[1]], v)) throw new Error('cruce en la banda, f = ' + f);
  }
});
prueba('funciones constantes Fo = 0 y Fo = 1: sin compuertas', () => {
  const m0 = M.modeloDiagrama([], XYZ), m1 = M.modeloDiagrama(['---'], XYZ);
  igual([m0.compuertas.length, m1.compuertas.length], [0, 0]);
  verificarCircuito(m0, XYZ, []);
  verificarCircuito(m1, XYZ, [0, 1, 2, 3, 4, 5, 6, 7]);
});
prueba('caso 13 (Y + XZ): se elige el orden de términos con menos cruces (1, el mínimo posible)', () => {
  const qm = M.quineMcCluskey([2, 3, 5, 6, 7], 3);       // Y + XZ
  const m = M.modeloDiagrama(qm.soluciones[0].patrones, XYZ);
  igual(m.cruces, 1);                                    // el mínimo posible con X, Y, Z en ese orden
});

prueba('forma canónica: las AND van en orden de minterminos (m0, m1, ...) de arriba hacia abajo', () => {
  const unos = [0, 1, 2, 5, 8, 9, 10], V4 = ['W', 'X', 'Y', 'Z'];
  const m = M.modeloDiagrama(canonicaDe(unos, 4), V4, { ordenFijo: true });
  igual(m.orden.map(p => parseInt(p, 2)), unos);
  const ys = m.compuertas.filter(c => c.tipo === 'AND').map(c => c.y);
  igual(ys, ys.slice().sort((a, b) => a - b));
  verificarCircuito(m, V4, unos);
});

seccion('Diagrama: verificación exhaustiva');
prueba('las 256 funciones de 3 variables, forma simplificada y canónica', () => {
  for (let f = 0; f < 256; f++) {
    const unos = []; for (let x = 0; x < 8; x++) if ((f >> x) & 1) unos.push(x);
    const qm = M.quineMcCluskey(unos, 3);
    verificarCircuito(M.modeloDiagrama(qm.soluciones[0].patrones, XYZ), XYZ, unos);
    verificarCircuito(M.modeloDiagrama(canonicaDe(unos, 3), XYZ, { ordenFijo: true }), XYZ, unos);
  }
});
prueba('400 funciones de 4 variables al azar (semilla fija), ambas formas', () => {
  const V4 = ['W', 'X', 'Y', 'Z'];
  let semilla = 12345;
  const azar = () => (semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let k = 0; k < 400; k++) {
    const f = Math.floor(azar() * 65536);
    const unos = []; for (let x = 0; x < 16; x++) if ((f >> x) & 1) unos.push(x);
    const qm = M.quineMcCluskey(unos, 4);
    verificarCircuito(M.modeloDiagrama(qm.soluciones[0].patrones, V4), V4, unos);
    if (k < 40) verificarCircuito(M.modeloDiagrama(canonicaDe(unos, 4), V4, { ordenFijo: true }), V4, unos);
  }
});

/* ---------- resumen ---------- */
console.log('\n== Ejemplos de mensajes de error ==');
for (const [t, m] of ejemplosError) console.log('  ' + JSON.stringify(t).padEnd(10) + ' ' + m);

if (avisos.length) {
  console.log('\n== Discrepancias con la tabla del enunciado ==');
  avisos.forEach(a => console.log('  ⚠ ' + a));
}
console.log('\nResultado: ' + ok + ' pruebas correctas, ' + fallos + ' fallidas.');
process.exit(fallos ? 1 : 0);
