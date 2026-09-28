/* Zagarollo — campo de partículas em 3D.
 *
 * Uma nuvem de pontos de luz conta, na capa, a história que o site inteiro defende:
 *
 *   a poeira vira folha, a folha dobra e vira caixa, alguma coisa entra, a caixa fecha,
 *   sobe no caminhão, pega a estrada, chega na mão de alguém — e, quando essa pessoa
 *   abre, o que sai de dentro é o que importava.
 *
 * Quem conduz é a rolagem. No manifesto, mais abaixo, cada linha ganha a sua forma.
 *
 * Este arquivo é carregado DEPOIS da página pronta, por `campo.js`, e só quando o
 * aparelho dá conta. Se qualquer coisa falhar aqui, a capa de sempre continua no ar.
 *
 * Nenhuma cor mora aqui: a luz sai das variáveis do `estilo.css`.
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { AfterimagePass } from 'three/addons/postprocessing/AfterimagePass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const FOV = 36;
const TAN = Math.tan((FOV * Math.PI) / 360);
const ESPERA = 0.2;

const limita = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const suave = (a, b, v) => {
  const t = limita((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const faixa = (a, b, v) => limita((v - a) / (b - a));
const vaiEVem = (t) => 0.5 - 0.5 * Math.cos(Math.PI * t);
const mistura = (a, b, t) => a + (b - a) * t;
const misturaCor = (a, b, t) => [mistura(a[0], b[0], t), mistura(a[1], b[1], t), mistura(a[2], b[2], t)];
function sorteio(semente) {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gauss = (rnd) => Math.sqrt(-2 * Math.log(1 - rnd() * 0.999999)) * Math.cos(6.2831853 * rnd());
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/* Uma cor do site vira luz: mesma matiz, levada ao pico e amaciada com branco. */
function luz(css, pico, branco) {
  const c = new THREE.Color(css);
  const m = Math.max(c.r, c.g, c.b, 1e-4);
  return misturaCor([(c.r / m) * pico, (c.g / m) * pico, (c.b / m) * pico], [pico, pico, pico], branco);
}

/* ---------- fontes de pontos ----------
   Cada fonte escreve um ponto em `pt`: posição, cor, intensidade, tamanho (nível inteiro,
   4 = normal) e fase (0 = parado; > 0 = posição ao longo de um caminho, para o pulso correr). */
const pt = { x: 0, y: 0, z: 0, r: 1, g: 1, b: 1, a: 1, size: 4, phase: 0 };
let BRANCO = [0.97, 0.97, 0.97], VERDE = [0.6, 0.9, 0.75], KRAFT = [0.97, 0.75, 0.5], AZUL = [0.6, 0.72, 0.97];

function pinta(o) {
  const c = o.color ?? BRANCO;
  pt.r = c[0]; pt.g = c[1]; pt.b = c[2];
  pt.a = o.a ?? 0.8;
  pt.size = o.size ?? 4;
  pt.phase = 0;
}
/* Vinco é aresta ou linha de dobra: branco e forte. Miolo é a face: verde e ralo.
   É a mesma regra do campo 2D — sem vinco a caixa vira mancha. */
const vinco = (o = {}) => ({ color: BRANCO, a: 0.95, size: 4, thick: 0.008, ...o });
const miolo = (o = {}) => ({ color: VERDE, a: 0.3, size: 3, ...o });
const quente = (o = {}) => ({ color: KRAFT, a: 0.95, size: 4, thick: 0.009, ...o });
const D_FACE = 1, D_ARESTA = 1.7;

function caminho(pontos, o = {}) {
  const pts = o.closed ? [...pontos, pontos[0]] : pontos;
  const acum = [0];
  for (let i = 1; i < pts.length; i++) acum.push(acum[i - 1] + dist(pts[i], pts[i - 1]));
  const total = acum[acum.length - 1];
  const thick = o.thick ?? 0.01;
  const span = o.span ?? 1, off = o.off ?? 0;
  const amostra = (rnd) => {
    const u = rnd();
    const d = u * total;
    let lo = 0, hi = acum.length - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (acum[m] <= d) lo = m;
      else hi = m;
    }
    const f = (d - acum[lo]) / Math.max(1e-6, acum[hi] - acum[lo]);
    pinta(o);
    pt.x = mistura(pts[lo][0], pts[hi][0], f) + gauss(rnd) * thick;
    pt.y = mistura(pts[lo][1], pts[hi][1], f) + gauss(rnd) * thick;
    pt.z = mistura(pts[lo][2], pts[hi][2], f) + gauss(rnd) * thick;
    if (o.dash && Math.floor(u * o.dash) % 2) pt.a *= 0.12;
    if (o.pulse) pt.phase = limita((u * span + off) % 1, 0.004, 0.996);
  };
  amostra.comprimento = total;
  return amostra;
}
const linha = (a, b, o) => caminho([a, b], o);
function curva(fn, o = {}, passos = 80) {
  const pts = [];
  for (let i = 0; i <= passos; i++) pts.push(fn(i / passos));
  return caminho(pts, o);
}
const bezier2 = (a, b, c) => (t) => {
  const m = 1 - t;
  return [0, 1, 2].map((k) => m * m * a[k] + 2 * m * t * b[k] + t * t * c[k]);
};
function face(p0, p1, p2, p3, o = {}) {
  return (rnd) => {
    const u = rnd(), v = rnd();
    pinta(o);
    pt.x = (1 - u) * (1 - v) * p0[0] + u * (1 - v) * p1[0] + u * v * p2[0] + (1 - u) * v * p3[0];
    pt.y = (1 - u) * (1 - v) * p0[1] + u * (1 - v) * p1[1] + u * v * p2[1] + (1 - u) * v * p3[1];
    pt.z = (1 - u) * (1 - v) * p0[2] + u * (1 - v) * p1[2] + u * v * p2[2] + (1 - u) * v * p3[2];
  };
}
const areaDe = (f) => dist(f[0], f[1]) * dist(f[1], f[2]);
/* Face e arestas pesam pela medida: a densidade de pontos fica igual na forma inteira. */
const faces = (lista, o, peso = 1) => lista.map((f) => [areaDe(f) * D_FACE * peso, face(f[0], f[1], f[2], f[3], o)]);
const arestas = (lista, o, peso = 1) => lista.map(([a, b]) => [dist(a, b) * D_ARESTA * peso, linha(a, b, o)]);

function esfera(c, r, o = {}) {
  const sy = o.sy ?? 1;
  return (rnd) => {
    const z = rnd() * 2 - 1, a = rnd() * 6.2831853, q = Math.sqrt(1 - z * z);
    pinta(o);
    pt.x = c[0] + q * Math.cos(a) * r;
    pt.y = c[1] + q * Math.sin(a) * r * sy;
    pt.z = c[2] + z * r;
    if (!o.flat) pt.a *= 0.45 + 0.55 * limita(0.5 + 0.5 * z + 0.25 * q * Math.sin(a));
  };
}
/* Aro deitado (no plano XZ), com onda opcional — é a calda que escorre do bolo. */
function aro(c, r, o = {}) {
  const thick = o.thick ?? 0.009;
  return (rnd) => {
    const u = rnd(), a = u * 6.2831853;
    pinta(o);
    pt.x = c[0] + Math.cos(a) * r + gauss(rnd) * thick;
    pt.y = c[1] + gauss(rnd) * thick - (o.onda ? Math.abs(Math.sin(a * o.onda)) * o.altura * rnd() : 0);
    pt.z = c[2] + Math.sin(a) * r + gauss(rnd) * thick;
    if (o.pulse) pt.phase = limita((u * (o.span ?? 1) + (o.off ?? 0)) % 1, 0.004, 0.996);
  };
}
function disco(c, r, o = {}) {
  return (rnd) => {
    const a = rnd() * 6.2831853, q = Math.sqrt(rnd()) * r;
    pinta(o);
    pt.x = c[0] + Math.cos(a) * q; pt.y = c[1]; pt.z = c[2] + Math.sin(a) * q;
  };
}
function cilindro(c, r, h, o = {}) {
  const lateral = (rnd) => {
    const a = rnd() * 6.2831853;
    pinta(miolo(o.miolo));
    pt.x = c[0] + Math.cos(a) * r; pt.y = c[1] + (rnd() - 0.5) * h; pt.z = c[2] + Math.sin(a) * r;
    pt.a *= 0.5 + 0.5 * limita(0.5 + 0.5 * Math.sin(a));
  };
  const topo = [c[0], c[1] + h / 2, c[2]], base = [c[0], c[1] - h / 2, c[2]];
  return [
    [6.2832 * r * h * D_FACE, lateral],
    [3.1416 * r * r * D_FACE * 0.7, disco(topo, r, miolo(o.miolo))],
    [6.2832 * r * D_ARESTA, aro(topo, r, vinco(o.vinco))],
    [6.2832 * r * D_ARESTA, aro(base, r, vinco(o.vinco))],
  ];
}
/* Anel de pé, de frente para a câmera. */
function toro(c, R, r, o = {}) {
  return (rnd) => {
    const a = rnd() * 6.2831853, b = rnd() * 6.2831853;
    pinta(o);
    pt.x = c[0] + (R + r * Math.cos(b)) * Math.cos(a);
    pt.y = c[1] + (R + r * Math.cos(b)) * Math.sin(a);
    pt.z = c[2] + r * Math.sin(b);
    pt.a *= 0.55 + 0.45 * limita(0.5 + 0.5 * Math.sin(b));
    if (o.pulse) pt.phase = limita((a / 6.2831853 + (o.off ?? 0)) % 1, 0.004, 0.996);
  };
}
/* Caixa de papel: faces ralas, arestas fortes. `aberta` tira a tampa. */
function caixa(c, [w, h, d], o = {}) {
  const x0 = c[0] - w / 2, x1 = c[0] + w / 2, y0 = c[1] - h / 2, y1 = c[1] + h / 2, z0 = c[2] - d / 2, z1 = c[2] + d / 2;
  const f = [
    [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]],
    [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]],
    [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]],
    [[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]],
    [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]],
  ];
  if (!o.aberta) f.push([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]]);
  const e = [];
  for (const y of [y0, y1]) {
    e.push([[x0, y, z0], [x1, y, z0]], [[x1, y, z0], [x1, y, z1]], [[x1, y, z1], [x0, y, z1]], [[x0, y, z1], [x0, y, z0]]);
  }
  for (const [x, z] of [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]) e.push([[x, y0, z], [x, y1, z]]);
  const peso = o.peso ?? 1;
  return [...faces(f, miolo(o.miolo), peso), ...arestas(e, vinco(o.vinco), peso)];
}
/* Aplica uma transformação aos pontos de um conjunto de fontes. */
const com = (fontes, fn) => fontes.map(([peso, s]) => [peso, (rnd) => { s(rnd); fn(pt); }]);
const giraX = (ang, cy, cz) => {
  const cs = Math.cos(ang), sn = Math.sin(ang);
  return (p) => {
    const y = p.y - cy, z = p.z - cz;
    p.y = cy + y * cs - z * sn;
    p.z = cz + y * sn + z * cs;
  };
};
const giraY = (ang) => {
  const cs = Math.cos(ang), sn = Math.sin(ang);
  return (p) => {
    const x = p.x, z = p.z;
    p.x = x * cs + z * sn;
    p.z = -x * sn + z * cs;
  };
};
const giraZ = (ang, cx = 0, cy = 0) => {
  const cs = Math.cos(ang), sn = Math.sin(ang);
  return (p) => {
    const x = p.x - cx, y = p.y - cy;
    p.x = cx + x * cs - y * sn;
    p.y = cy + x * sn + y * cs;
  };
};

/* A sacola de papel: corpo com fole lateral, a dobra da boca e as duas alças torcidas. */
function sacola(c, W, H, D, o = {}) {
  const x0 = c[0] - W / 2, x1 = c[0] + W / 2, y0 = c[1] - H / 2, y1 = c[1] + H / 2, z0 = c[2] - D / 2, z1 = c[2] + D / 2;
  const g = D * 0.2; // quanto o fole entra
  const zc = c[2];
  const f = [
    [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]],
    [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]],
    [[x0, y0, z1], [x0 + g, y0, zc], [x0 + g, y1, zc], [x0, y1, z1]],
    [[x0 + g, y0, zc], [x0, y0, z0], [x0, y1, z0], [x0 + g, y1, zc]],
    [[x1, y0, z1], [x1 - g, y0, zc], [x1 - g, y1, zc], [x1, y1, z1]],
    [[x1 - g, y0, zc], [x1, y0, z0], [x1, y1, z0], [x1 - g, y1, zc]],
    [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]],
  ];
  const e = [];
  for (const y of [y0, y1]) {
    e.push([[x0, y, z1], [x1, y, z1]], [[x0, y, z0], [x1, y, z0]]);
    e.push([[x0, y, z1], [x0 + g, y, zc]], [[x0 + g, y, zc], [x0, y, z0]], [[x1, y, z1], [x1 - g, y, zc]], [[x1 - g, y, zc], [x1, y, z0]]);
  }
  for (const [x, z] of [[x0, z0], [x1, z0], [x1, z1], [x0, z1], [x0 + g, zc], [x1 - g, zc]]) e.push([[x, y0, z], [x, y1, z]]);
  const out = [...faces(f, miolo(), 1), ...arestas(e, vinco(), 1)];
  // a dobra da boca
  const yd = y1 - H * 0.13;
  out.push(...arestas([[[x0, yd, z1], [x1, yd, z1]], [[x0, yd, z0], [x1, yd, z0]]], vinco({ a: 0.6, size: 3, thick: 0.006 }), 0.7));
  // as alças: dois fios torcidos um no outro
  const vao = W * 0.22, sobe = H * 0.34;
  for (const z of [z1, z0]) {
    const arco = bezier2([c[0] - vao, y1, z], [c[0], y1 + sobe * 2, z], [c[0] + vao, y1, z]);
    const comp = Math.PI * Math.hypot(vao, sobe);
    for (const fase of [0, Math.PI]) {
      out.push([comp * D_ARESTA * 0.9, curva((t) => {
        const p = arco(t), a = t * 34 + fase;
        return [p[0], p[1] + Math.cos(a) * 0.028, p[2] + Math.sin(a) * 0.028];
      }, o.alca ?? quente({ thick: 0.007 }), 140)]);
    }
  }
  return out;
}

/* O coração, com volume: para cada direção, acha onde a superfície está. */
function coracao(c, escala, o = {}) {
  const f = (x, y, z) => {
    const a = x * x + 2.25 * z * z + y * y - 1;
    return a * a * a - x * x * y * y * y - 0.1125 * z * z * y * y * y;
  };
  return (rnd) => {
    const zz = rnd() * 2 - 1, a = rnd() * 6.2831853, q = Math.sqrt(1 - zz * zz);
    const dx = q * Math.cos(a), dy = q * Math.sin(a), dz = zz;
    let lo = 0, hi = 2;
    for (let i = 0; i < 22; i++) {
      const m = (lo + hi) / 2;
      if (f(dx * m, dy * m, dz * m) < 0) lo = m;
      else hi = m;
    }
    pinta(o);
    pt.x = c[0] + dx * lo * escala;
    pt.y = c[1] + dy * lo * escala + 0.12 * escala;
    pt.z = c[2] + dz * lo * escala;
    const contorno = 1 - Math.abs(dz);
    pt.a *= 0.3 + 0.7 * contorno * contorno * contorno;
    if (contorno > 0.93) pt.size = 4;
  };
}

// ruído de valor: dá fios à nuvem do começo
function hash3(x, y, z) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const c = (i, j, k) => hash3(xi + i, yi + j, zi + k);
  return mistura(
    mistura(mistura(c(0, 0, 0), c(1, 0, 0), u), mistura(c(0, 1, 0), c(1, 1, 0), u), v),
    mistura(mistura(c(0, 0, 1), c(1, 0, 1), u), mistura(c(0, 1, 1), c(1, 1, 1), u), v),
    w,
  );
}
const fbm = (x, y, z) => 0.5 * vnoise(x, y, z) + 0.27 * vnoise(x * 2.1, y * 2.1, z * 2.1) + 0.15 * vnoise(x * 4.3, y * 4.3, z * 4.3) + 0.08 * vnoise(x * 8.7, y * 8.7, z * 8.7);

/* ---------- a história: elenco e quadros ----------
   Na história cada ponto pertence a UM objeto do começo ao fim — a caixa, o caminhão, a
   estrada, a casa, quem entrega, quem recebe, o coração. Um quadro diz onde cada objeto
   está; entre dois quadros o ponto anda em linha reta. Objeto que ainda não entrou em
   cena fica espalhado longe, apagado, e chega voando quando é a vez dele. */

const G = Math.PI / 180;
const CX = { m: 0.2, p: 0.26, lingua: 0.085 }; // a caixa: meia base, altura da parede, aba de fecho

/* Anel de pé (plano XY): pneu, calota, lua. */
function anel(c, r, o = {}) {
  const thick = o.thick ?? 0.008;
  return (rnd) => {
    const u = rnd(), a = (o.de ?? 0) + u * ((o.ate ?? 6.2831853) - (o.de ?? 0));
    pinta(o);
    pt.x = c[0] + Math.cos(a) * r + gauss(rnd) * thick;
    pt.y = c[1] + Math.sin(a) * r + gauss(rnd) * thick;
    pt.z = c[2] + gauss(rnd) * thick;
    if (o.pulse) pt.phase = limita((u * (o.span ?? 1) + (o.off ?? 0)) % 1, 0.004, 0.996);
  };
}
function nuvemDe(c, raio, o = {}) {
  return (rnd) => {
    pinta(o);
    pt.x = c[0] + gauss(rnd) * raio[0];
    pt.y = c[1] + gauss(rnd) * raio[1];
    pt.z = c[2] + gauss(rnd) * raio[2];
  };
}
/* Junta fontes pesadas numa lista fixa de pontos locais. Cada fonte pode trazer a própria
   animação: [tipo, p1, p2, p3] — 1 rola com a estrada (volta, velocidade, reforço de luz),
   2 gira como roda (centro x, centro y, raio), 3 bate como coração. O reforço existe porque
   o que está longe e espalhado recebe poucos pontos por palmo e sumiria ao lado do caminhão. */
function colhe(fontes, n, rnd) {
  const total = fontes.reduce((s, f) => s + f[0], 0);
  const local = new Float32Array(n * 9), anim = new Float32Array(n * 4);
  let k = 0;
  fontes.forEach(([peso, amostra, an], i) => {
    const q = i === fontes.length - 1 ? n - k : Math.min(n - k, Math.round((peso / total) * n));
    for (let j = 0; j < q; j++, k++) {
      amostra(rnd);
      local.set([pt.x, pt.y, pt.z, pt.size, pt.phase, pt.r, pt.g, pt.b, pt.a], k * 9);
      if (an) anim.set(an, k * 4);
    }
  });
  return { local, anim };
}
const comAnim = (fontes, an) => fontes.map(([peso, s]) => [peso, s, an]);

// ---- a caixa: planificação com tampa, que dobra e abre de verdade ----
function amostrasDaCaixa(n, rnd) {
  const { m, p, lingua } = CX;
  const tipos = [];
  const entra = (peso, gera) => tipos.push([peso, gera]);
  const ao = () => (rnd() * 2 - 1) * m;
  entra(4 * m * m, () => ({ f: 'base', x: ao(), y: ao() }));
  for (const f of ['D', 'E', 'C', 'B']) entra(2 * m * p, () => ({ f, u: ao(), d: rnd() * p }));
  entra(4 * m * m, () => ({ f: 'tampa', u: ao(), d: rnd() * 2 * m }));
  entra(2 * m * lingua, () => ({ f: 'lingua', u: ao(), d: rnd() * lingua }));
  const A = 2.4; // arestas pesam mais que faces
  for (const f of ['D', 'E', 'C', 'B']) {
    entra(2 * m * A * 0.09, () => ({ f, u: ao(), d: 0, forte: 1 }));
    if (f !== 'C') entra(2 * m * A * 0.07, () => ({ f, u: ao(), d: p, forte: 1 }));
    entra(2 * p * A * 0.07, () => ({ f, u: rnd() < 0.5 ? -m : m, d: rnd() * p, forte: 1 }));
  }
  entra(2 * m * A * 0.09, () => ({ f: 'tampa', u: ao(), d: 0, forte: 1 }));
  entra(2 * m * A * 0.07, () => ({ f: 'tampa', u: ao(), d: 2 * m, forte: 1 }));
  entra(4 * m * A * 0.07, () => ({ f: 'tampa', u: rnd() < 0.5 ? -m : m, d: rnd() * 2 * m, forte: 1 }));
  entra(2 * m * A * 0.05, () => ({ f: 'lingua', u: ao(), d: lingua, forte: 1 }));
  entra(2 * lingua * A * 0.05, () => ({ f: 'lingua', u: rnd() < 0.5 ? -m : m, d: rnd() * lingua, forte: 1 }));
  const total = tipos.reduce((s, t) => s + t[0], 0);
  const lista = [];
  for (const [peso, gera] of tipos) {
    const q = Math.round((peso / total) * n);
    for (let i = 0; i < q && lista.length < n; i++) lista.push(gera());
  }
  while (lista.length < n) lista.push(tipos[0][1]());
  return lista;
}
function posicaoNaCaixa(q, teta, fi, out) {
  const { m, p } = CX;
  const cs = Math.cos(teta), sn = Math.sin(teta);
  const alfa = teta + fi, ca = Math.cos(alfa), sa = Math.sin(alfa);
  const beta = alfa + limita(fi, 0, Math.PI / 2);
  let x = 0, y = 0, z = 0;
  if (q.f === 'base') { x = q.x; y = q.y; }
  else if (q.f === 'D') { x = m + q.d * cs; y = q.u; z = q.d * sn; }
  else if (q.f === 'E') { x = -m - q.d * cs; y = q.u; z = q.d * sn; }
  else if (q.f === 'C') { x = q.u; y = m + q.d * cs; z = q.d * sn; }
  else if (q.f === 'B') { x = q.u; y = -m - q.d * cs; z = q.d * sn; }
  else if (q.f === 'tampa') { x = q.u; y = m + p * cs + q.d * ca; z = p * sn + q.d * sa; }
  else { x = q.u; y = m + p * cs + 2 * m * ca + q.d * Math.cos(beta); z = p * sn + 2 * m * sa + q.d * Math.sin(beta); }
  // no mundo: a dobradiça da tampa fica para +x, o "para cima" da caixa é y
  out[0] = y; out[1] = z; out[2] = x;
}

// ---- gente ----
const CORPO = {
  quadril: [0, 0.92, 0], pescoco: [0, 1.43, 0],
  ombroE: [0, 1.38, 0.19], ombroD: [0, 1.38, -0.19],
  ancaE: [0, 0.9, 0.1], ancaD: [0, 0.9, -0.1],
  joelhoE: [0.03, 0.48, 0.1], joelhoD: [0.03, 0.48, -0.1],
  peE: [0, 0.05, 0.1], peD: [0, 0.05, -0.1],
  pontaE: [0.2, 0.035, 0.1], pontaD: [0.2, 0.035, -0.1],
};
const POSES = {
  parado: { maoE: [0.05, 0.84, 0.27], maoD: [0.05, 0.84, -0.27], cotE: [-0.02, 1.1, 0.26], cotD: [-0.02, 1.1, -0.26], cab: [0.02, 1.585, 0] },
  segura: { maoE: [0.42, 0.97, 0.24], maoD: [0.42, 0.97, -0.24], cotE: [0.1, 1.05, 0.29], cotD: [0.1, 1.05, -0.29], cab: [0.045, 1.575, 0] },
  estende: { maoE: [0.62, 0.99, 0.24], maoD: [0.62, 0.99, -0.24], cotE: [0.3, 1.1, 0.29], cotD: [0.3, 1.1, -0.29], cab: [0.04, 1.58, 0] },
  abre1: { maoE: [0.42, 0.97, 0.24], maoD: [0.27, 1.41, -0.08], cotE: [0.1, 1.05, 0.29], cotD: [0.13, 1.2, -0.3], cab: [0.05, 1.57, 0] },
  abre2: { maoE: [0.42, 0.97, 0.24], maoD: [0.45, 1.57, -0.08], cotE: [0.1, 1.05, 0.29], cotD: [0.2, 1.33, -0.3], cab: [0.04, 1.58, 0] },
  olha: { maoE: [0.4, 0.93, 0.24], maoD: [0.4, 0.93, -0.24], cotE: [0.09, 1.03, 0.29], cotD: [0.09, 1.03, -0.29], cab: [0.0, 1.6, 0] },
};
const OSSOS = [
  ['ombroE', 'cotE', 0.062], ['cotE', 'maoE', 0.052], ['ombroD', 'cotD', 0.062], ['cotD', 'maoD', 0.052],
  ['ancaE', 'joelhoE', 0.095], ['joelhoE', 'peE', 0.07], ['ancaD', 'joelhoD', 0.095], ['joelhoD', 'peD', 0.07],
  ['peE', 'pontaE', 0.055], ['peD', 'pontaD', 0.055],
];
function amostrasDaPessoa(n, rnd) {
  const tipos = [
    [0.27, () => ({ parte: 'tronco', t: rnd(), a: rnd() * 6.2831853 })],
    [0.13, () => ({ parte: 'cabeca', z: rnd() * 2 - 1, a: rnd() * 6.2831853 })],
    [0.035, () => ({ parte: 'mao', lado: rnd() < 0.5 ? 'E' : 'D', z: rnd() * 2 - 1, a: rnd() * 6.2831853 })],
  ];
  const pesos = [0.075, 0.065, 0.075, 0.065, 0.1, 0.085, 0.1, 0.085, 0.02, 0.02];
  OSSOS.forEach((o, i) => tipos.push([pesos[i], () => ({ parte: 'osso', i, t: rnd(), a: rnd() * 6.2831853 })]));
  const total = tipos.reduce((s, t) => s + t[0], 0);
  const lista = [];
  for (const [peso, gera] of tipos) {
    const q = Math.round((peso / total) * n);
    for (let i = 0; i < q && lista.length < n; i++) lista.push(gera());
  }
  while (lista.length < n) lista.push(tipos[0][1]());
  return lista;
}
/* Devolve em `out` a posição e, em out[3], o quanto o ponto está na silhueta (0 a 1): é
   a borda acesa que faz a figura ser lida como desenho, não como boneco. */
function posicaoNaPessoa(q, J, out) {
  if (q.parte === 'tronco') {
    const t = q.t, rx = 0.11 + 0.035 * t, rz = 0.16 + 0.075 * t * t;
    out[0] = Math.cos(q.a) * rx; out[1] = mistura(J.quadril[1], J.pescoco[1], t); out[2] = Math.sin(q.a) * rz;
    out[3] = 1 - Math.abs(Math.sin(q.a));
    return;
  }
  if (q.parte === 'cabeca' || q.parte === 'mao') {
    const c = q.parte === 'cabeca' ? J.cab : J['mao' + q.lado];
    const r = q.parte === 'cabeca' ? 0.128 : 0.06;
    const k = Math.sqrt(1 - q.z * q.z);
    out[0] = c[0] + k * Math.cos(q.a) * r; out[1] = c[1] + k * Math.sin(q.a) * r * (q.parte === 'cabeca' ? 1.14 : 1); out[2] = c[2] + q.z * r;
    out[3] = 1 - Math.abs(q.z);
    return;
  }
  const [de, para, raio] = OSSOS[q.i];
  const a = J[de], b = J[para];
  let dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const len = Math.hypot(dx, dy, dz) || 1;
  dx /= len; dy /= len; dz /= len;
  // base perpendicular ao osso: n1 = d × z, n2 = d × n1
  let n1x = dy, n1y = -dx, n1z = 0;
  const l1 = Math.hypot(n1x, n1y) || 1;
  n1x /= l1; n1y /= l1;
  const n2x = dy * n1z - dz * n1y, n2y = dz * n1x - dx * n1z, n2z = dx * n1y - dy * n1x;
  const cs = Math.cos(q.a), sn = Math.sin(q.a);
  const nx = cs * n1x + sn * n2x, ny = cs * n1y + sn * n2y, nz = cs * n1z + sn * n2z;
  out[0] = a[0] + dx * len * q.t + nx * raio;
  out[1] = a[1] + dy * len * q.t + ny * raio;
  out[2] = a[2] + dz * len * q.t + nz * raio;
  out[3] = 1 - Math.abs(nz);
}

// ---- o caminhão ----
const BAU = { x0: 0, x1: 4.0, y0: 0.9, y1: 3.1, z: 0.95 };
function fontesCaminhao() {
  const { x0, x1, y0, y1, z: Z } = BAU;
  const out = [];
  out.push(...faces([
    [[x0, y0, Z], [x1, y0, Z], [x1, y1, Z], [x0, y1, Z]],
    [[x0, y0, -Z], [x1, y0, -Z], [x1, y1, -Z], [x0, y1, -Z]],
    [[x0, y1, -Z], [x1, y1, -Z], [x1, y1, Z], [x0, y1, Z]],
    [[x0, y0, -Z], [x1, y0, -Z], [x1, y0, Z], [x0, y0, Z]],
    [[x1, y0, -Z], [x1, y0, Z], [x1, y1, Z], [x1, y1, -Z]],
  ], miolo({ a: 0.2 }), 0.42));
  const e = [];
  for (const z of [Z, -Z]) e.push([[x0, y0, z], [x1, y0, z]], [[x0, y1, z], [x1, y1, z]], [[x0, y0, z], [x0, y1, z]], [[x1, y0, z], [x1, y1, z]]);
  for (const [x, y] of [[x0, y0], [x0, y1], [x1, y0], [x1, y1]]) e.push([[x, y, -Z], [x, y, Z]]);
  out.push(...arestas(e, vinco({ size: 5, thick: 0.012 }), 1.5));
  // os frisos do baú
  const frisos = [];
  for (let x = 0.5; x < 3.9; x += 0.5) for (const z of [Z, -Z]) frisos.push([[x, y0, z], [x, y1, z]]);
  out.push(...arestas(frisos, vinco({ a: 0.32, size: 3, thick: 0.005 }), 0.45));
  // chassi, para-lamas e para-choque
  const baixo = [];
  for (const z of [0.7, -0.7]) baixo.push([[-0.1, 0.78, z], [5.7, 0.78, z]]);
  baixo.push([[-0.12, 0.62, -0.85], [-0.12, 0.62, 0.85]], [[5.84, 0.72, -0.92], [5.84, 0.72, 0.92]], [[5.84, 0.92, -0.92], [5.84, 0.92, 0.92]]);
  out.push(...arestas(baixo, vinco({ a: 0.7 }), 0.8));
  for (const x of [0.95, 1.95, 5.0]) for (const z of [0.93, -0.93]) out.push([1.1, anel([x, 0.5, z], 0.62, vinco({ a: 0.6, size: 3, de: 0.15, ate: 2.99 }))]);
  // a cabine
  const perfil = [[4.15, 0.78], [4.15, 2.78], [5.0, 2.78], [5.6, 1.92], [5.8, 1.8], [5.8, 0.78]];
  for (const z of [0.9, -0.9]) out.push([7.5 * D_ARESTA * 1.5, caminho(perfil.map(([x, y]) => [x, y, z]), vinco({ closed: true, size: 5, thick: 0.012 }))]);
  out.push(...arestas(perfil.map(([x, y]) => [[x, y, -0.9], [x, y, 0.9]]), vinco({ size: 5, thick: 0.012 }), 1.4));
  out.push(...faces([
    [[4.15, 0.78, 0.9], [5.8, 0.78, 0.9], [5.8, 1.8, 0.9], [4.15, 1.8, 0.9]],
    [[4.15, 0.78, -0.9], [5.8, 0.78, -0.9], [5.8, 1.8, -0.9], [4.15, 1.8, -0.9]],
    [[5.0, 2.78, -0.9], [5.6, 1.92, -0.9], [5.6, 1.92, 0.9], [5.0, 2.78, 0.9]],
  ], miolo({ a: 0.2 }), 0.5));
  // janela e porta da cabine
  for (const z of [0.905, -0.905]) {
    out.push([2.4 * D_ARESTA, caminho([[4.32, 1.92, z], [4.95, 1.92, z], [5.42, 1.92, z], [4.98, 2.6, z], [4.32, 2.6, z]], vinco({ closed: true, a: 0.75, size: 3, thick: 0.006 }))]);
    out.push([1.6 * D_ARESTA, caminho([[4.95, 1.92, z], [4.95, 0.95, z], [4.3, 0.95, z], [4.3, 1.92, z]], vinco({ a: 0.4, size: 3, thick: 0.005 }))]);
  }
  // faróis e lanternas
  for (const z of [0.62, -0.62]) {
    out.push([0.5, esfera([5.83, 1.08, z], 0.1, quente({ size: 5, flat: true, a: 1 }))]);
    out.push([0.2, esfera([-0.02, 1.0, z * 1.4], 0.06, quente({ size: 4, flat: true, a: 0.9 }))]);
  }
  return out;
}
function fontesFarol() {
  // o facho dos faróis, só na estrada
  return [-0.62, 0.62].map((z) => [1, (rnd) => {
    const t = Math.pow(rnd(), 0.7), a = rnd() * 6.2831853, r = (0.1 + t * 1.25) * Math.sqrt(rnd());
    pinta(quente({ a: 0.5 * (1 - t) + 0.05, size: 3 }));
    pt.x = 5.9 + t * 6.5; pt.y = 1.05 - t * 0.55 + Math.sin(a) * r * 0.6; pt.z = z + Math.cos(a) * r;
    pt.phase = limita((t * 1.5 + z) % 1, 0.004, 0.996);
  }]);
}
/* Folha da porta do baú, medida a partir da dobradiça (na origem), apontando para −z. */
function fontesPorta() {
  const { y0, y1, z: Z } = BAU;
  return [
    ...faces([[[0, y0, 0], [0, y0, -Z], [0, y1, -Z], [0, y1, 0]]], miolo({ a: 0.22 }), 0.6),
    ...arestas([[[0, y0, 0], [0, y0, -Z]], [[0, y0, -Z], [0, y1, -Z]], [[0, y1, -Z], [0, y1, 0]], [[0, y1, 0], [0, y0, 0]]], vinco(), 1),
    ...arestas([[[0, 1.9, -0.1], [0, 1.9, -Z + 0.1]], [[0, 2.0, -Z + 0.12], [0, 1.6, -Z + 0.12]]], vinco({ a: 0.6, size: 3, thick: 0.006 }), 0.8),
  ];
}
function fontesRodas() {
  const out = [];
  for (const x of [0.95, 1.95, 5.0]) for (const z of [0.92, -0.92]) {
    const c = [x, 0.5, z], dentro = [x, 0.5, z - Math.sign(z) * 0.24];
    const roda = [
      [3.2, anel(c, 0.5, vinco({ thick: 0.012 }))],
      [2.4, anel(dentro, 0.5, vinco({ a: 0.55, size: 3 }))],
      [1.3, anel(c, 0.3, vinco({ a: 0.7, size: 3, thick: 0.006 }))],
      [0.6, anel(c, 0.1, quente({ a: 0.9, thick: 0.006 }))],
    ];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * 6.2832;
      roda.push([0.22, linha([x + Math.cos(a) * 0.1, 0.5 + Math.sin(a) * 0.1, z], [x + Math.cos(a) * 0.3, 0.5 + Math.sin(a) * 0.3, z], vinco({ a: 0.8, size: 3, thick: 0.006 }))]);
      // a banda do pneu: é ela que mostra a roda girando
      const b = a + 0.26;
      roda.push([0.16, linha([x + Math.cos(b) * 0.5, 0.5 + Math.sin(b) * 0.5, z], [x + Math.cos(b) * 0.5, 0.5 + Math.sin(b) * 0.5, dentro[2]], vinco({ a: 0.6, size: 3, thick: 0.006 }))]);
    }
    out.push(...comAnim(roda, [2, x, 0.5, 0.5]));
  }
  return out;
}

// ---- a estrada e o que passa ----
const VOLTA = 48; // a paisagem se repete a cada 48 unidades
function fontesEstrada() {
  const out = [];
  const ROLA = [1, VOLTA, 1, 1.6];
  for (const z of [2.4, -4.8]) out.push([4.2, linha([-24, 0, z], [24, 0, z], vinco({ a: 0.55, size: 3, thick: 0.01 })), ROLA]);
  for (let x = -24; x < 24; x += 4) out.push([0.62, linha([x, 0, -1.2], [x + 1.7, 0, -1.2], vinco({ a: 0.9, thick: 0.014 })), ROLA]);
  out.push([9, (rnd) => {
    pinta({ color: AZUL, a: 0.16 + rnd() * 0.16, size: 3 });
    pt.x = (rnd() - 0.5) * VOLTA; pt.y = 0; pt.z = mistura(-4.8, 2.4, rnd());
  }, ROLA]);
  return out;
}
function fontesBeira() {
  const out = [];
  const ROLA = [1, VOLTA, 1, 7], PERTO = [1, VOLTA, 1, 1.2];
  const zp = -6.4, alto = 3.5;
  for (let i = 0; i < 6; i++) {
    const x = -24 + i * 8 + 1;
    out.push([1.1, linha([x, 0, zp], [x, alto, zp], vinco({ a: 0.8, thick: 0.014 })), ROLA]);
    out.push([0.35, linha([x, alto - 0.3, zp - 0.5], [x, alto - 0.3, zp + 0.5], vinco({ a: 0.8 })), ROLA]);
    // os fios, de um poste ao outro
    for (const dz of [-0.45, 0, 0.45]) {
      out.push([0.95, curva((t) => [x + t * 8, alto - 0.3 - 0.42 * (1 - (2 * t - 1) * (2 * t - 1)), zp + dz], vinco({ a: 0.42, size: 3, thick: 0.004 }), 40), ROLA]);
    }
  }
  // árvores do lado de lá
  for (const [x, esc] of [[-20, 1], [-11.5, 0.8], [-4, 1.15], [6.5, 0.9], [13, 1.1], [20.5, 0.85]]) {
    const z = -9.5 - esc;
    out.push([0.5, linha([x, 0, z], [x, 1.5 * esc, z], vinco({ a: 0.55, size: 3, thick: 0.02 })), ROLA]);
    out.push([2.6, esfera([x, 2.5 * esc, z], 1.15 * esc, miolo({ a: 0.6, size: 4, sy: 1.12 })), ROLA]);
    out.push([1.2, esfera([x + 0.7 * esc, 1.95 * esc, z + 0.3], 0.75 * esc, miolo({ a: 0.5, size: 4 })), ROLA]);
  }
  // defensas do lado de cá: passam depressa, na frente da câmera
  for (let x = -24; x < 24; x += 2) {
    out.push([0.13, linha([x, 0, 3.1], [x, 0.5, 3.1], vinco({ a: 0.6, size: 3 })), PERTO]);
    out.push([0.06, esfera([x, 0.42, 3.12], 0.04, quente({ a: 1, flat: true })), PERTO]);
  }
  // o vento: riscos curtos que correm mais que a estrada
  const rnd = sorteio(515);
  for (let i = 0; i < 46; i++) {
    const x = (rnd() - 0.5) * VOLTA, y = 0.3 + rnd() * 3.6, z = -3.6 + rnd() * 6, c = 0.7 + rnd() * 1.6;
    out.push([0.11 * c, linha([x, y, z], [x + c, y, z], { color: AZUL, a: 0.3, size: 3, thick: 0.004 }), [1, VOLTA, 1.9, 1.5]]);
  }
  return out;
}
function fontesRelevo() {
  const L = VOLTA * 2, z = -24;
  const serra = (x) => {
    const u = (x / L) * 6.2831853;
    return 6.4 + 1.5 * Math.sin(u * 2 + 1) + 0.9 * Math.sin(u * 5 + 0.4) + 0.45 * Math.sin(u * 11 + 2);
  };
  const ROLA = [1, L, 1, 6];
  return [
    [3, curva((t) => { const x = (t - 0.5) * L; return [x, serra(x), z]; }, vinco({ a: 0.7, size: 5, thick: 0.03 }), 260), ROLA],
    [4, (rnd) => {
      const x = (rnd() - 0.5) * L, k = Math.pow(rnd(), 1.8);
      pinta({ color: AZUL, a: 0.26 * (1 - k), size: 4 });
      pt.x = x; pt.y = serra(x) - k * 3.2; pt.z = z - rnd() * 2;
    }, ROLA],
  ];
}
function fontesLua() {
  const c = [11, 8.2, -34], r = 1.9;
  return [
    [3, anel(c, r, vinco({ a: 1, size: 8, thick: 0.02 }))],
    [3, (rnd) => {
      const a = rnd() * 6.2831853, q = Math.sqrt(rnd()) * r;
      pinta({ color: BRANCO, a: 0.5, size: 8 });
      pt.x = c[0] + Math.cos(a) * q; pt.y = c[1] + Math.sin(a) * q; pt.z = c[2];
    }],
    [0.5, anel([c[0] - 0.6, c[1] + 0.5, c[2]], 0.34, vinco({ a: 0.7, size: 7 }))],
    [0.4, anel([c[0] + 0.7, c[1] - 0.3, c[2]], 0.24, vinco({ a: 0.7, size: 7 }))],
    [0.3, anel([c[0] - 0.1, c[1] - 0.9, c[2]], 0.18, vinco({ a: 0.7, size: 7 }))],
  ];
}

// ---- a casa de quem recebe ----
function fontesCasa() {
  const z = -1.7, fundo = -5.2;
  const out = [];
  const e = [
    [[-7.2, 0, z], [-2.0, 0, z]], [[-7.2, 0, z], [-7.2, 3.0, z]], [[-2.0, 0, z], [-2.0, 3.0, z]],
    [[-7.5, 3.0, z], [-1.7, 3.0, z]], [[-7.5, 3.0, z], [-4.6, 4.75, z]], [[-4.6, 4.75, z], [-1.7, 3.0, z]],
    // a lateral, que dá fundo à casa
    [[-2.0, 0, z], [-2.0, 0, fundo]], [[-2.0, 3.0, z], [-2.0, 3.0, fundo]], [[-2.0, 0, fundo], [-2.0, 3.0, fundo]],
    [[-4.6, 4.75, z], [-4.6, 4.75, fundo]], [[-1.7, 3.0, z], [-1.7, 3.0, fundo]],
  ];
  out.push(...arestas(e, vinco({ size: 5, thick: 0.012 }), 1.3));
  out.push(...faces([[[-7.2, 0, z], [-2.0, 0, z], [-2.0, 3.0, z], [-7.2, 3.0, z]]], miolo({ a: 0.12 }), 0.35));
  // a porta
  out.push([6.2 * D_ARESTA * 1.3, caminho([[-4.2, 0, z], [-4.2, 2.1, z], [-3.2, 2.1, z], [-3.2, 0, z]], vinco({ size: 5, thick: 0.012 }))]);
  out.push(...arestas([[[-4.05, 0.2, z], [-4.05, 1.95, z]], [[-3.35, 0.2, z], [-3.35, 1.95, z]], [[-4.05, 1.95, z], [-3.35, 1.95, z]], [[-4.05, 1.0, z], [-3.35, 1.0, z]]], vinco({ a: 0.45, size: 3, thick: 0.005 }), 0.7));
  out.push([0.3, esfera([-3.42, 1.02, z + 0.04], 0.05, quente({ a: 1, flat: true }))]);
  out.push(...arestas([[[-4.45, 0.13, z], [-2.95, 0.13, z]], [[-4.45, 0.13, z + 0.7], [-2.95, 0.13, z + 0.7]], [[-4.45, 0.13, z], [-4.45, 0.13, z + 0.7]], [[-2.95, 0.13, z], [-2.95, 0.13, z + 0.7]]], vinco({ a: 0.6, size: 3 }), 0.8));
  // a janela acesa
  out.push([5.4 * D_ARESTA, caminho([[-6.6, 1.15, z], [-6.6, 2.35, z], [-5.0, 2.35, z], [-5.0, 1.15, z]], vinco({ closed: true }))]);
  out.push(...arestas([[[-5.8, 1.15, z], [-5.8, 2.35, z]], [[-6.6, 1.75, z], [-5.0, 1.75, z]]], vinco({ a: 0.6, size: 3 }), 0.8));
  out.push([3, (rnd) => {
    pinta(quente({ a: 0.4, size: 3 }));
    pt.x = mistura(-6.6, -5.0, rnd()); pt.y = mistura(1.15, 2.35, rnd()); pt.z = z - 0.02;
    pt.phase = limita(rnd(), 0.004, 0.996);
  }]);
  // a luz da entrada
  out.push([0.9, esfera([-3.7, 2.5, z + 0.12], 0.1, quente({ a: 1, size: 5, flat: true }))]);
  out.push([1.6, (rnd) => {
    const a = rnd() * 6.2831853, q = Math.pow(rnd(), 1.6) * 1.5;
    pinta(quente({ a: 0.3 * (1 - q / 1.5), size: 3 }));
    pt.x = -3.7 + Math.cos(a) * q * 0.8; pt.y = 2.5 - Math.abs(Math.sin(a)) * q; pt.z = z + 0.12 + rnd() * 0.5;
  }]);
  return out;
}

/* ---------- os quadros ----------
   Cada quadro herda o anterior e muda só o que muda. `null` tira o objeto de cena.
   cam = [de onde olha, para onde olha]. Ângulos em graus.
   pe = só na tela em pé (celular): [quanto mais a câmera recua, quanto a cena sobe na tela,
   quanto a câmera anda para o lado]. */
const QUADROS = [];
function quadro(muda) {
  const q = { ...(QUADROS[QUADROS.length - 1] || {}), ...muda };
  QUADROS.push(q);
}
const { m: M, p: P } = CX;
const NA_MAO = (x) => ({ c: [x, 0.97, 0.3], rx: 0, teta: 90 });

quadro({ // 0 · só a poeira de que tudo é feito
  nuvem: true, ganho: 0.42, anda: 0, pe: [1, 0, 0.45], cam: [[-1.5, 1.05, 6.8], [-1.5, 0.95, 0]],
  caixa: null, coracao: null, caminhao: null, portas: null, rodas: null, farol: null, estrada: null,
  beira: null, relevo: null, lua: null, casa: null, recebe: null, entrega: null, poeira: {},
});
quadro({ nuvem: false, ganho: 0.17, pe: [1, 0, 0], caixa: { c: [-1.76, 1.0, 0], rx: 90, teta: 0, fi: 0 }, cam: [[-1.5, 1.0, 3.2], [-1.5, 1.0, 0]] }); // 1 · a folha
quadro({ caixa: { c: [-1.68, 0.72, 0], rx: 60, teta: 30, fi: 0 }, cam: [[-1.35, 1.05, 3.0], [-1.5, 0.78, 0]] }); // 2
quadro({ caixa: { c: [-1.58, 0.4, 0], rx: 30, teta: 60, fi: 0 }, cam: [[-1.15, 1.1, 2.8], [-1.5, 0.52, 0]] }); // 3
quadro({ caixa: { c: [-1.5, 0.03, 0], rx: 0, teta: 90, fi: 0 }, cam: [[-0.95, 1.0, 2.5], [-1.45, 0.3, 0]] }); // 4 · a caixa montada, aberta
quadro({ caixa: { c: [-1.5, 0.03, 0], rx: 0, teta: 90, fi: 45 }, coracao: { esc: 0.075 }, cam: [[-0.85, 0.9, 2.4], [-1.45, 0.26, 0]] }); // 5 · o que importa entra
quadro({ caixa: { c: [-1.5, 0.03, 0], rx: 0, teta: 90, fi: 90 }, cam: [[-0.8, 0.8, 2.5], [-1.45, 0.2, 0]] }); // 6 · fechada
quadro({ caminhao: {}, rodas: {}, portas: 112, estrada: {}, pe: [1.4, 0, 0], cam: [[-5.4, 2.9, 8.4], [1.0, 1.35, 0]] }); // 7 · o caminhão chega
quadro({ caixa: { c: [-0.7, 0.93, 0], rx: 0, teta: 90, fi: 90 }, cam: [[-5.0, 2.7, 8.0], [1.2, 1.35, 0]] }); // 8 · a caixa sobe
quadro({ caixa: { c: [1.3, 0.93, 0], rx: 0, teta: 90, fi: 90 }, cam: [[-4.4, 2.5, 8.2], [1.6, 1.4, 0]] }); // 9 · e entra
quadro({ portas: 56, cam: [[-3.2, 2.3, 9.0], [2.0, 1.45, 0]] }); // 10
quadro({ portas: 0, pe: [1.25, 0, 0], cam: [[-0.5, 2.0, 10.6], [2.5, 1.5, 0]] }); // 11 · portas fechadas
quadro({ anda: 1, beira: {}, relevo: {}, lua: {}, farol: {}, pe: [1, 0, 0], cam: [[3.0, 1.8, 13.2], [3.3, 1.55, 0]] }); // 12 · estrada, de lado
quadro({ cam: [[12.4, 1.3, 7.2], [3.6, 1.45, 0]] }); // 13 · de frente, com os faróis
quadro({ cam: [[-6.8, 4.8, 9.4], [2.9, 1.2, 0]] }); // 14 · por trás e do alto
quadro({ anda: 0, beira: null, farol: null, casa: {}, recebe: { x: -3.7, z: 0.3, vira: 1, pose: 'parado' }, cam: [[-2.4, 1.7, 8.2], [-2.3, 1.3, 0]] }); // 15 · chegou
quadro({ portas: 56, entrega: { x: -2.46, z: 0.3, vira: -1, pose: 'segura' }, cam: [[-2.5, 1.6, 7.4], [-2.4, 1.25, 0]] }); // 16
quadro({ portas: 112, caixa: NA_MAO(-2.88), cam: [[-2.6, 1.55, 6.8], [-2.5, 1.2, 0]] }); // 17 · a caixa sai do baú
quadro({ caixa: NA_MAO(-3.08), entrega: { x: -2.46, z: 0.3, vira: -1, pose: 'estende' }, recebe: { x: -3.7, z: 0.3, vira: 1, pose: 'estende' }, cam: [[-2.9, 1.5, 5.6], [-2.9, 1.15, 0.2]] }); // 18 · de mão em mão
quadro({ caixa: NA_MAO(-3.28), entrega: { x: -2.46, z: 0.3, vira: -1, pose: 'parado' }, recebe: { x: -3.7, z: 0.3, vira: 1, pose: 'segura' }, cam: [[-3.0, 1.5, 4.8], [-3.1, 1.15, 0.3]] }); // 19 · é dela agora
quadro({ caminhao: null, rodas: null, portas: null, estrada: null, entrega: null, relevo: null, cam: [[-2.9, 1.45, 3.5], [-3.3, 1.2, 0.3]] }); // 20 · só ela e a caixa
quadro({ caixa: { ...NA_MAO(-3.28), fi: 60 }, recebe: { x: -3.7, z: 0.3, vira: 1, pose: 'abre1' }, cam: [[-2.8, 1.5, 3.3], [-3.25, 1.25, 0.3]] }); // 21 · abre
quadro({ caixa: { ...NA_MAO(-3.28), fi: 25 }, recebe: { x: -3.7, z: 0.3, vira: 1, pose: 'abre2' }, cam: [[-2.75, 1.55, 3.3], [-3.2, 1.3, 0.3]] }); // 22
quadro({ caixa: { ...NA_MAO(-3.28), fi: -22 }, recebe: { x: -3.7, z: 0.3, vira: 1, pose: 'segura' }, coracao: { esc: 0.2, c: [-3.26, 1.52, 0.3], forma: 1 }, pe: [1.08, 0.1, 0], cam: [[-2.8, 1.65, 3.6], [-3.2, 1.45, 0.3]] }); // 23 · e de dentro sai
quadro({ caixa: { c: [-3.3, 0.93, 0.3], rx: 0, teta: 90, fi: -22 }, recebe: { x: -3.7, z: 0.3, vira: 1, pose: 'olha' }, coracao: { esc: 0.52, c: [-3.05, 2.2, 0.3], forma: 1 }, casa: null, lua: null, ganho: 0.2, pe: [1.2, 0.25, 0], cam: [[-2.7, 1.85, 4.9], [-3.1, 1.7, 0.3]] }); // 24 · o que importava
for (const q of QUADROS) {
  if (q.caixa && q.caixa.fi === undefined) q.caixa.fi = 90;
}
/* De longe a caixa é pequena e os pontos dela se empilham: apaga na medida da distância. */
for (const q of QUADROS) {
  if (!q.caixa) continue;
  const d = Math.hypot(q.cam[0][0] - q.caixa.c[0], q.cam[0][1] - q.caixa.c[1], q.cam[0][2] - q.caixa.c[2]);
  q.caixa = { ...q.caixa, a: limita(3.4 / d, 0.3, 1) };
  if (q.coracao) q.coracao = { ...q.coracao, a: limita(4.2 / d, 0.4, 1) };
}
const TRANSICOES = QUADROS.length - 1;
const centroDoCoracao = (q) => (q.coracao && q.coracao.c) || (q.caixa ? [q.caixa.c[0], q.caixa.c[1] + P * 0.5, q.caixa.c[2]] : [0, 1, 0]);

/* ---------- a cena ---------- */
(function () {
  const capa = document.querySelector('.capa');
  const fixaCapa = capa && capa.querySelector('.capa-fixa');
  if (!capa || !fixaCapa) return;
  const manifesto = document.querySelector('.cena--manifesto');
  const fixaManifesto = manifesto && manifesto.querySelector('.cena-fixa');
  const larga = matchMedia('(min-width: 901px)');

  const css = getComputedStyle(document.documentElement);
  const token = (nome) => css.getPropertyValue(nome).trim();
  BRANCO = luz(token('--branco'), 0.97, 0);
  VERDE = luz(token('--verde-claro'), 0.92, 0.12);
  KRAFT = luz(token('--kraft'), 0.97, 0.16);
  AZUL = luz(token('--azul-claro'), 0.95, 0);

  const tela = document.createElement('canvas');
  tela.setAttribute('aria-hidden', 'true');
  const renderer = new THREE.WebGLRenderer({ canvas: tela, antialias: true, powerPreference: 'high-performance' });
  if (!renderer.capabilities.isWebGL2) {
    renderer.dispose();
    throw new Error('WebGL2 indisponível');
  }
  const leve = !larga.matches;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, leve ? 1.5 : 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  /* Fundo preto de propósito: o campo entra na página somando luz (mix-blend-mode:
     screen no invólucro), então o preto some e o azul do palco aparece por baixo. */
  scene.background = new THREE.Color(0x000000);
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 160);
  const world = new THREE.Group();
  scene.add(world);

  // ---- quantos pontos, e de quem é cada um ----
  const TW = 512;
  const N = leve ? 56000 : 150000;
  const TH = Math.ceil(N / TW);

  const rndNuvem = sorteio(9001);
  const crista = (n, k) => Math.pow(limita(1 - Math.abs(n - 0.5) * k), 3);
  function pontoDaNuvem(out) {
    for (;;) {
      const z = rndNuvem() * 2 - 1, a = rndNuvem() * 6.2831853, q = Math.sqrt(1 - z * z), r = Math.cbrt(rndNuvem());
      const x = q * Math.cos(a) * r, y = q * Math.sin(a) * r, zz = z * r * 0.6;
      const rad = Math.hypot(x, y), th = Math.atan2(y, x) + rad * 2.9;
      const ax = Math.cos(th) * rad, ay = Math.sin(th) * rad;
      const fil = Math.max(crista(fbm(ax * 1.5 + 7.3, ay * 1.5 + 1.9, zz * 2.2 + 4.1), 5.2), 0.55 * crista(fbm(ax * 3.4 + 21, ay * 3.4 + 9, zz * 4.4 + 2), 6.5));
      const miolo = Math.exp(-rad * rad * 9);
      if (rndNuvem() > (fil * 0.95 + miolo * 0.3 + 0.018) * Math.pow(1 - r * r, 0.8)) continue;
      const cor = misturaCor(misturaCor(AZUL, BRANCO, suave(0.25, 0.6, fil)), VERDE, limita(miolo * 1.2 + fil * 0.3));
      out[0] = -0.85 + x * 1.95; out[1] = 0.98 + y * 1.6; out[2] = zz * 2.2;
      out[3] = 3 + Math.floor(rndNuvem() * 3); out[4] = cor[0]; out[5] = cor[1]; out[6] = cor[2]; out[7] = 0.28 + 0.72 * fil;
      return;
    }
  }

  const v4 = [0, 0, 0, 0];
  const giro = (x, z, graus) => {
    const a = graus * G, cs = Math.cos(a), sn = Math.sin(a);
    return [x * cs + z * sn, -x * sn + z * cs];
  };
  /* Objeto rígido: os pontos são colhidos uma vez; o quadro só diz onde ele está. */
  function rigido(id, fracao, fontes, mais = {}) {
    return {
      id, fracao, ...mais,
      prepara(n, rnd) { Object.assign(this, colhe(fontes(), n, rnd)); },
      escreve(estado, q, i, o) {
        const j = i * 9, L = this.local;
        const esc = estado.esc ?? 1, c = mais.centro ? mais.centro(q) : estado.c || [0, 0, 0];
        const [x, z] = estado.ry ? giro(L[j], L[j + 2], estado.ry) : [L[j], L[j + 2]];
        o[0] = c[0] + x * esc; o[1] = c[1] + L[j + 1] * esc; o[2] = c[2] + z * esc;
        o[3] = L[j + 3]; o[4] = L[j + 4]; o[5] = L[j + 5]; o[6] = L[j + 6]; o[7] = L[j + 7]; o[8] = L[j + 8] * (estado.a ?? 1);
      },
    };
  }
  const ELENCO = [
    {
      id: 'caixa', fracao: 0.1,
      prepara(n, rnd) { this.lista = amostrasDaCaixa(n, rnd); this.anim = new Float32Array(n * 4); },
      escreve(estado, q, i, o) {
        const p = this.lista[i];
        posicaoNaCaixa(p, estado.teta * G, (estado.fi ?? 90) * G, v4);
        const a = (estado.rx || 0) * G, cs = Math.cos(a), sn = Math.sin(a);
        const y = v4[1] * cs - v4[2] * sn, z = v4[1] * sn + v4[2] * cs;
        o[0] = estado.c[0] + v4[0]; o[1] = estado.c[1] + y; o[2] = estado.c[2] + z;
        const e = p.forte ? vinco({ thick: 0 }) : miolo();
        o[3] = e.size; o[4] = 0; o[5] = e.color[0]; o[6] = e.color[1]; o[7] = e.color[2]; o[8] = e.a * (estado.a ?? 1);
      },
    },
    {
      id: 'coracao', fracao: 0.09,
      prepara(n, rnd) { Object.assign(this, colhe(comAnim([[1, coracao([0, 0, 0], 1, { color: misturaCor(BRANCO, KRAFT, 0.5), a: 1, size: 3 })]], [3, 0, 0, 0]), n, rnd)); },
      escreve(estado, q, i, o) {
        const j = i * 9, L = this.local, c = centroDoCoracao(q);
        let x = L[j], y = L[j + 1], z = L[j + 2], a = L[j + 8];
        if (!estado.forma) {
          // fechado na caixa, ninguém sabe o que é: uma esfera de luz
          const r = Math.hypot(x, y, z) || 1, k = 0.62 + 0.38 * ((i * 7919) % 97) / 97;
          x = (x / r) * k; y = (y / r) * k; z = (z / r) * k;
          a = 0.5;
        }
        o[0] = c[0] + x * estado.esc; o[1] = c[1] + y * estado.esc; o[2] = c[2] + z * estado.esc;
        o[3] = L[j + 3]; o[4] = ((i % 5) + 1) / 6; o[5] = L[j + 5]; o[6] = L[j + 6]; o[7] = L[j + 7]; o[8] = a * (estado.a ?? 1);
      },
    },
    rigido('caminhao', 0.25, fontesCaminhao),
    {
      id: 'portas', fracao: 0.04,
      prepara(n, rnd) { Object.assign(this, colhe(fontesPorta(), n, rnd)); },
      escreve(graus, q, i, o) {
        const j = i * 9, L = this.local, lado = i % 2 ? 1 : -1; // folhas alternadas: metade para cada
        const d = -L[j + 2], a = graus * G;
        o[0] = -d * Math.sin(a); o[1] = L[j + 1]; o[2] = lado * (BAU.z - d * Math.cos(a));
        o[3] = L[j + 3]; o[4] = L[j + 4]; o[5] = L[j + 5]; o[6] = L[j + 6]; o[7] = L[j + 7]; o[8] = L[j + 8];
      },
    },
    rigido('rodas', 0.06, fontesRodas),
    rigido('farol', 0.025, fontesFarol),
    rigido('estrada', 0.06, fontesEstrada),
    rigido('beira', 0.11, fontesBeira),
    rigido('relevo', 0.05, fontesRelevo),
    rigido('lua', 0.015, fontesLua),
    rigido('casa', 0.075, fontesCasa),
    pessoa('recebe', 0.095, () => misturaCor(BRANCO, KRAFT, 0.3)),
    pessoa('entrega', 0.075, () => misturaCor(BRANCO, AZUL, 0.45)),
    rigido('poeira', 0.03, () => [[1, (rnd) => {
      const a = rnd() * 6.2831853, r = 2.5 + Math.pow(rnd(), 0.7) * 11;
      pinta({ color: misturaCor(BRANCO, rnd() < 0.5 ? VERDE : AZUL, rnd() * 0.7), a: 0.22 + rnd() * 0.4, size: 3 + Math.floor(rnd() * 3) });
      pt.x = Math.cos(a) * r * 1.2; pt.y = -0.5 + rnd() * 9; pt.z = Math.sin(a) * r - 3;
    }]], { sempre: true }),
  ];
  function pessoa(id, fracao, cor) {
    return {
      id, fracao,
      prepara(n, rnd) { this.lista = amostrasDaPessoa(n, rnd); this.anim = new Float32Array(n * 4); this.cor = cor(); },
      escreve(estado, q, i, o) {
        const J = { ...CORPO, ...POSES[estado.pose] };
        posicaoNaPessoa(this.lista[i], J, v4);
        o[0] = estado.x + estado.vira * v4[0]; o[1] = v4[1]; o[2] = estado.z + v4[2];
        const borda = v4[3] * v4[3] * v4[3];
        o[3] = borda > 0.55 ? 6 : 4; o[4] = 0; o[5] = this.cor[0]; o[6] = this.cor[1]; o[7] = this.cor[2];
        o[8] = limita((0.34 + 1.5 * borda) * (0.45 + 0.55 * limita(v4[1] / 0.7)));
      },
    };
  }
  {
    const soma = ELENCO.reduce((s, o) => s + o.fracao, 0);
    let ini = 0;
    ELENCO.forEach((o, k) => {
      o.ini = ini;
      o.n = k === ELENCO.length - 1 ? N - ini : Math.round((o.fracao / soma) * N);
      ini += o.n;
      o.prepara(o.n, sorteio(700 + k * 53));
    });
  }
  const NPO = ELENCO[ELENCO.length - 1].n; // a poeira fica no fim: é o que o atributo `kind` marca
  const NF = N - NPO;

  // onde cada ponto espera, apagado, a sua vez — e onde ele está na nuvem do começo
  const longe = new Float32Array(N * 3), nuvem = new Float32Array(N * 8);
  {
    const rnd = sorteio(31337);
    const o = [0, 0, 0, 0, 0, 0, 0, 0];
    for (let i = 0; i < N; i++) {
      const z = rnd() * 2 - 1, a = rnd() * 6.2831853, q = Math.sqrt(1 - z * z), r = 9 + rnd() * 9;
      longe.set([q * Math.cos(a) * r, 1.5 + Math.abs(q * Math.sin(a)) * r * 0.7 - 1, z * r], i * 3);
      pontoDaNuvem(o);
      nuvem.set(o, i * 8);
    }
  }

  function gravaTexturas(pos, col) {
    const tPos = new THREE.DataTexture(pos, TW, TH, THREE.RGBAFormat, THREE.FloatType);
    tPos.needsUpdate = true;
    const tCol = new THREE.DataTexture(col, TW, TH, THREE.RGBAFormat, THREE.UnsignedByteType);
    tCol.needsUpdate = true;
    return { tPos, tCol };
  }
  const presente = (obj, q) => obj.sempre || (!q.nuvem && q[obj.id] != null);
  function montaQuadro(k) {
    const q = QUADROS[k], antes = QUADROS[k - 1];
    const pos = new Float32Array(TW * TH * 4), col = new Uint8Array(TW * TH * 4);
    const o = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (const obj of ELENCO) {
      const aqui = presente(obj, q);
      // chega em linha reta quem já estava em cena; quem não estava, chega voando
      const sinal = aqui && antes && presente(obj, antes) ? 1 : -1;
      for (let i = 0; i < obj.n; i++) {
        const g = obj.ini + i;
        if (aqui) obj.escreve(q[obj.id], q, i, o);
        else if (q.nuvem) {
          const j = g * 8;
          o[0] = nuvem[j]; o[1] = nuvem[j + 1]; o[2] = nuvem[j + 2]; o[3] = nuvem[j + 3]; o[4] = 0;
          o[5] = nuvem[j + 4]; o[6] = nuvem[j + 5]; o[7] = nuvem[j + 6]; o[8] = nuvem[j + 7];
        } else {
          o[0] = longe[g * 3]; o[1] = longe[g * 3 + 1]; o[2] = longe[g * 3 + 2]; o[3] = 3; o[4] = 0; o[5] = o[6] = o[7] = 1; o[8] = 0;
        }
        pos.set([o[0], o[1], o[2], (Math.round(o[3]) + o[4]) * sinal], g * 4);
        col.set([o[5] * 255, o[6] * 255, o[7] * 255, limita(o[8]) * 255], g * 4);
      }
    }
    return gravaTexturas(pos, col);
  }
  const HISTORIA = { formas: QUADROS.map((q, k) => montaQuadro(k)) };

  // ---- o manifesto: aqui os pontos são de todo mundo, e a forma inteira vira outra ----
  const poeiraM = ELENCO[ELENCO.length - 1];
  function montaForma(semente, fontes) {
    const rnd = sorteio(semente);
    const { local } = colhe(fontes, NF, rnd);
    const ordem = new Uint32Array(NF), chave = new Float32Array(NF);
    for (let i = 0; i < NF; i++) {
      ordem[i] = i;
      chave[i] = Math.atan2(local[i * 9 + 1], local[i * 9]) + (rnd() - 0.5) * 0.5 + Math.hypot(local[i * 9], local[i * 9 + 1]) * 0.04;
    }
    ordem.sort((a, b) => chave[a] - chave[b]);
    const pos = new Float32Array(TW * TH * 4), col = new Uint8Array(TW * TH * 4);
    const poe = (i, v, j, sinal) => {
      pos.set([v[j], v[j + 1], v[j + 2], (Math.round(v[j + 3]) + v[j + 4]) * sinal], i * 4);
      col.set([v[j + 5] * 255, v[j + 6] * 255, v[j + 7] * 255, limita(v[j + 8]) * 255], i * 4);
    };
    for (let i = 0; i < NF; i++) poe(i, local, ordem[i] * 9, -1);
    for (let i = 0; i < NPO; i++) poe(NF + i, poeiraM.local, i * 9, 1);
    return gravaTexturas(pos, col);
  }

  // ---------- formas do manifesto ----------
  function formaAnel() {
    // a caixinha aberta e o anel de pé dentro dela
    const base = caixa([0, -1.05, 0], [2.0, 0.7, 1.7], { aberta: true });
    const tampa = com(caixa([0, -0.5, 0], [2.0, 0.4, 1.7], {}), giraX(-1.85, -0.7, -0.85));
    const R = 0.62;
    const centro = [0, -0.7 + R + 0.12, 0.05];
    const pedra = [0, centro[1] + R + 0.16, 0.05];
    const out = [
      ...base,
      ...tampa,
      // a almofada e a fenda onde o anel entra
      ...faces([[[-0.85, -0.74, -0.7], [0.85, -0.74, -0.7], [0.85, -0.74, 0.7], [-0.85, -0.74, 0.7]]], miolo({ a: 0.4 }), 1.4),
      ...arestas([[[-0.5, -0.74, 0.05], [0.5, -0.74, 0.05]]], vinco({ a: 0.7 }), 1),
      [6.2832 * R * 1.9, toro(centro, R, 0.075, quente({ pulse: true }))],
      [0.5, esfera(pedra, 0.17, { color: BRANCO, a: 1, size: 5, flat: true })],
    ];
    // o brilho da pedra
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * 6.2832 + 0.3, r = i % 2 ? 0.34 : 0.5;
      out.push([0.09, linha(pedra, [pedra[0] + Math.cos(a) * r, pedra[1] + Math.sin(a) * r, pedra[2]], vinco({ a: 0.75, thick: 0.005, size: 3, pulse: true, off: i * 0.17 }))]);
    }
    return com(out, giraY(-0.35));
  }
  function formaBolo() {
    // o bolo dentro da caixa: a caixa é só o contorno, quem aparece é o que vai dentro
    const out = [
      ...com(caixa([0, -0.35, 0], [3.2, 2.5, 3.2], { aberta: true, peso: 0.4, miolo: { a: 0.1 }, vinco: { a: 0.6, size: 3, thick: 0.006 } }), giraY(0.6)),
      ...cilindro([0, -1.18, 0], 1.25, 0.84, { miolo: { a: 0.34 } }),
      ...cilindro([0, -0.38, 0], 0.84, 0.72, { miolo: { a: 0.34 } }),
      [6.2832 * 1.25 * D_ARESTA * 1.3, aro([0, -0.76, 0], 1.25, quente({ onda: 7, altura: 0.3, thick: 0.012 }))],
      [6.2832 * 0.84 * D_ARESTA * 1.3, aro([0, -0.02, 0], 0.84, quente({ onda: 5, altura: 0.26, thick: 0.012 }))],
      [6.2832 * 1.5 * D_ARESTA * 0.6, aro([0, -1.6, 0], 1.5, vinco({ a: 0.6, size: 3 }))],
    ];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * 6.2832 + 0.5, x = Math.cos(a) * 0.46, z = Math.sin(a) * 0.46;
      out.push([0.55, linha([x, -0.02, z], [x, 0.5, z], vinco({ thick: 0.013 }))]);
      out.push([0.4, esfera([x, 0.66, z], 0.085, { color: KRAFT, a: 1, size: 5, flat: true, sy: 1.5 })]);
      out.push([0.12, linha([x, 0.5, z], [x, 0.58, z], quente({ pulse: true, off: i * 0.2, thick: 0.006 }))]);
    }
    return out;
  }
  function formaSacolinha() {
    // a sacolinha da festa, com o balão preso na alça
    const s = com(sacola([-0.55, -0.75, 0], 1.7, 2.0, 0.8), giraY(0.5));
    const no = [0.2, 0.62, 0.2], bal = [1.15, 1.75, 0.1];
    return [
      ...s,
      [5.2, esfera(bal, 0.72, { color: VERDE, a: 0.85, size: 4, sy: 1.16 })],
      [0.25, esfera([bal[0] - 0.26, bal[1] + 0.36, bal[2] + 0.52], 0.07, { color: BRANCO, a: 0.8, size: 3, flat: true })],
      [0.3, esfera([bal[0], bal[1] - 0.9, bal[2]], 0.07, { color: VERDE, a: 1, flat: true })],
      [1.9, curva(bezier2(no, [0.2, 1.3, 0.4], [bal[0], bal[1] - 0.92, bal[2]]), vinco({ a: 0.8, thick: 0.006, size: 3, pulse: true }))],
    ];
  }
  function formaCarta() {
    // a caixa do fundo do armário, com a carta saindo de dentro
    const W = 2.3, H = 1.5, cy = 0.75;
    const x0 = -W / 2, x1 = W / 2, y0 = cy - H / 2, y1 = cy + H / 2, z = 0.1;
    const carta = [
      ...faces([[[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]]], miolo({ a: 0.34 }), 1.2),
      ...arestas([
        [[x0, y0, z], [x1, y0, z]], [[x1, y0, z], [x1, y1, z]], [[x1, y1, z], [x0, y1, z]], [[x0, y1, z], [x0, y0, z]],
        // a aba do envelope e as dobras de baixo
        [[x0, y1, z], [0, cy - 0.12, z]], [[x1, y1, z], [0, cy - 0.12, z]],
      ], vinco(), 1.1),
      ...arestas([[[x0, y0, z], [-0.28, cy - 0.02, z]], [[x1, y0, z], [0.28, cy - 0.02, z]]], vinco({ a: 0.5, size: 3, thick: 0.006 }), 0.8),
      // o lacre
      [0.8, coracao([0, cy - 0.16, z + 0.04], 0.2, { color: KRAFT, a: 1, size: 4 })],
    ];
    return com([
      ...caixa([0, -1.2, 0], [2.9, 1.1, 1.9], { aberta: true }),
      ...com(carta, giraZ(-0.12, 0, cy)),
    ], giraY(-0.4));
  }
  function formaDentro() {
    // o fecho: a caixa aberta e o que vai dentro
    const out = [...com(caixa([0, -1.45, 0], [2.7, 1.15, 2.1], { aberta: true }), giraY(0.45))];
    out.push([9, coracao([0, 0.72, 0], 1.02, { color: misturaCor(BRANCO, KRAFT, 0.35), a: 1, size: 3 })]);
    for (let i = 0; i < 7; i++) {
      const x = (i - 3) * 0.3;
      out.push([0.34, curva(bezier2([x * 1.5, -1.3, 0], [x * 2.1, -0.5, 0.3], [x * 1.1, 0.1, 0]), quente({ a: 0.6, thick: 0.006, size: 3, pulse: true, span: 2, off: i * 0.14 }))]);
    }
    return out;
  }


  const MANIFESTO = fixaManifesto && {
    formas: [
      montaForma(3001, formaAnel()),
      montaForma(3101, formaBolo()),
      montaForma(3201, formaSacolinha()),
      montaForma(3301, formaCarta()),
      montaForma(3401, formaDentro()),
    ],
    poses: [
      { rx: 0.22, sc: 1.2, sway: 0.2, gain: 0.15 },
      { rx: 0.3, sc: 1.08, sway: 0.24, gain: 0.15 },
      { rx: 0.1, sc: 1.12, sway: 0.2, gain: 0.15 },
      { rx: 0.24, sc: 1.1, sway: 0.18, gain: 0.15 },
      { rx: 0.2, sc: 1.1, sway: 0.2, gain: 0.2 },
    ],
  };

  // ---- os pontos ----
  const geo = new THREE.BufferGeometry();
  const ref = new Float32Array(N * 2), seed = new Float32Array(N * 4), kind = new Float32Array(N), anim = new Float32Array(N * 4);
  const srnd = sorteio(77);
  for (let i = 0; i < N; i++) {
    ref.set([((i % TW) + 0.5) / TW, (Math.floor(i / TW) + 0.5) / TH], i * 2);
    seed.set([srnd(), srnd(), srnd(), srnd()], i * 4);
    kind[i] = i >= NF ? 1 : 0;
  }
  for (const obj of ELENCO) anim.set(obj.anim, obj.ini * 4);
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  geo.setAttribute('ref', new THREE.BufferAttribute(ref, 2));
  geo.setAttribute('seed', new THREE.BufferAttribute(seed, 4));
  geo.setAttribute('kind', new THREE.BufferAttribute(kind, 1));
  geo.setAttribute('anim', new THREE.BufferAttribute(anim, 4));
  const U = {
    tPosA: { value: HISTORIA.formas[0].tPos }, tPosB: { value: HISTORIA.formas[1].tPos },
    tColA: { value: HISTORIA.formas[0].tCol }, tColB: { value: HISTORIA.formas[1].tCol },
    uMix: { value: 0 }, uTime: { value: 0 }, uIntro: { value: 0 }, uAnima: { value: 1 }, uDist: { value: 0 },
    uCoracao: { value: new THREE.Vector3() }, uBate: { value: 0 }, uFlow: { value: 0.004 },
    uGain: { value: 0.3 }, uFocus: { value: 14 }, uAperture: { value: 0.0042 }, uScale: { value: 1000 }, uSize: { value: 0.021 },
    uOpacity: { value: leve ? 0.9 : 0.66 }, uRay: { value: new THREE.Vector3(0, 0, -1) }, uPush: { value: 0 },
    uQuente: { value: new THREE.Vector3(...KRAFT) },
  };
  const material = new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
    vertexShader: `
      uniform sampler2D tPosA; uniform sampler2D tPosB; uniform sampler2D tColA; uniform sampler2D tColB;
      uniform float uMix; uniform float uTime; uniform float uIntro; uniform float uAnima; uniform float uDist;
      uniform vec3 uCoracao; uniform float uBate; uniform float uFlow; uniform float uGain;
      uniform float uFocus; uniform float uAperture; uniform float uScale; uniform float uSize;
      uniform vec3 uRay; uniform float uPush; uniform vec3 uQuente;
      attribute vec2 ref; attribute vec4 seed; attribute float kind; attribute vec4 anim;
      varying vec4 vCol; varying float vBlur;
      // fluxo de Arnold–Beltrami–Childress: sem divergência, barato, e parece líquido
      vec3 abc(vec3 p) { return vec3(sin(p.z) + cos(p.y), sin(p.x) + cos(p.z), sin(p.y) + cos(p.x)); }
      vec3 flow(vec3 p, float t) {
        return abc(p * 0.9 + vec3(0.0, t * 0.23, t * 0.17)) + 0.5 * abc(p.yzx * 2.3 + vec3(t * 0.31, 0.0, -t * 0.27));
      }
      /* O que se move sozinho dentro do quadro: a estrada que rola, a roda que gira. */
      vec3 anima(vec3 p, out float beira) {
        beira = 1.0;
        if (uAnima < 0.5) return p;
        if (anim.x > 1.5 && anim.x < 2.5) {
          float a = -uDist / anim.w, cs = cos(a), sn = sin(a);
          vec2 d = p.xy - anim.yz;
          p.xy = anim.yz + vec2(d.x * cs - d.y * sn, d.x * sn + d.y * cs);
        } else if (anim.x > 0.5 && anim.x < 1.5) {
          float meia = anim.y * 0.5;
          p.x = mod(p.x - uDist * anim.z + meia, anim.y) - meia;
          beira = smoothstep(meia, meia - 5.0, abs(p.x));
        }
        return p;
      }
      void main() {
        vec4 a = texture2D(tPosA, ref), b = texture2D(tPosB, ref);
        vec4 ca = texture2D(tColA, ref), cb = texture2D(tColB, ref);
        // o sinal de w diz como o ponto chega em B: em linha reta (objeto já em cena) ou voando
        float direto = step(0.0, b.w);
        float wa = abs(a.w), wb = abs(b.w);
        float beiraA = 1.0, beiraB = 1.0;
        vec3 pa3 = a.xyz, pb3 = b.xyz;
        // ponto apagado está esperando longe: não rola com a estrada
        if (ca.a > 0.003) pa3 = anima(a.xyz, beiraA);
        if (cb.a > 0.003) pb3 = anima(b.xyz, beiraB);

        float sweep = clamp(0.5 + (pa3.x + pb3.x) * 0.06 + (pa3.y + pb3.y) * 0.03, 0.0, 1.0);
        float t = clamp(uMix * 1.42 - (sweep * 0.3 + seed.x * 0.12), 0.0, 1.0);
        t = t * t * t * (t * (6.0 * t - 15.0) + 10.0);
        t = mix(t, uMix, direto);
        float w = sin(3.14159265 * t) * (1.0 - direto);
        vec3 p = mix(pa3, pb3, t);
        // quem chega voando faz a curva em volta do centro da cena
        vec3 eixo = uCoracao;
        float ang = w * (0.8 + 0.25 * seed.y);
        vec2 r2 = p.xz - eixo.xz;
        float cs = cos(ang), sn = sin(ang);
        p.xz = eixo.xz + mat2(cs, -sn, sn, cs) * r2;
        vec3 f = flow(p * 0.45, uTime * 0.4);
        p += f * w * (0.2 + 0.12 * seed.y);
        p += flow(p * 0.55, uTime * 0.6) * uFlow + flow(p * 1.1 + seed.wzy * 3.0, uTime) * (uFlow * 0.12 + kind * 0.09);
        // o coração bate em volta do próprio centro
        if (anim.x > 2.5) p = uCoracao + (p - uCoracao) * (1.0 + uBate);
        // nascimento: tudo sai de um ponto só
        float born = clamp(uIntro * 1.6 - seed.w * 0.6, 0.0, 1.0);
        born = 1.0 - pow(1.0 - born, 4.0);
        p = mix(uCoracao + f * 0.05, p, born);

        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float along = dot(mv.xyz, uRay);
        vec3 perp = mv.xyz - uRay * along;
        float d = length(perp);
        mv.xyz += (perp / max(d, 0.0001)) * uPush * exp(-d * d / 0.5) * (0.4 + 0.6 * seed.z);
        gl_Position = projectionMatrix * mv;
        vec2 naTela = abs(gl_Position.xy / gl_Position.w);
        float borda = smoothstep(1.0, 0.86, naTela.x) * smoothstep(1.0, 0.86, naTela.y);

        float depth = max(0.1, -mv.z);
        float sa = floor(wa + 0.0001), sb = floor(wb + 0.0001);
        float fa = wa - sa, fb = wb - sb;
        float size = mix(sa, sb, t) * 0.25 * uSize;
        float pulse = mix(step(0.002, fa) * pow(0.5 + 0.5 * sin(6.2831853 * (fa - uTime * 0.32)), 10.0),
                          step(0.002, fb) * pow(0.5 + 0.5 * sin(6.2831853 * (fb - uTime * 0.32)), 10.0), t);
        size *= 1.0 + pulse * 0.9 + w * 0.12;
        float coc = depth < uFocus ? (uFocus - depth) * uAperture : (depth - uFocus) * uAperture * 0.12;
        float px = (size + coc) * uScale / depth;
        gl_PointSize = clamp(px, 1.3, 46.0);
        float energy = (size * size) / ((size + coc) * (size + coc));
        float fundo = clamp(1.0 + (uFocus - depth) * 0.1, 0.6, 1.2);
        float twinkle = 0.78 + 0.22 * sin(uTime * (1.2 + seed.y * 2.6) + seed.x * 50.0);
        float reforco = (uAnima > 0.5 && anim.x > 0.5 && anim.x < 1.5) ? 1.0 + anim.w : 1.0;
        vCol = mix(ca, cb, t);
        vCol.rgb = mix(vCol.rgb, uQuente, w * 0.35);
        vCol.rgb *= 1.0 + pulse * 1.6;
        vCol.a *= mix(1.0, energy, 0.9) * twinkle * min(1.0, px * px / 1.69) * (1.0 - w * 0.5) * born;
        vCol.a *= mix(uGain * fundo * reforco, 0.4, kind) * borda * mix(beiraA, beiraB, t);
        vBlur = coc / (size + coc);
      }`,
    fragmentShader: `
      uniform float uOpacity;
      varying vec4 vCol; varying float vBlur;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        if (d > 1.0) discard;
        float core = exp(-d * d * 4.2);
        float disc = smoothstep(1.0, 0.78, d) * 0.5;
        float a = mix(core, disc, smoothstep(0.3, 0.85, vBlur));
        gl_FragColor = vec4(vCol.rgb, a * vCol.a * uOpacity);
      }`,
  });
  const pontos = new THREE.Points(geo, material);
  pontos.frustumCulled = false;
  world.add(pontos);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const rastro = new AfterimagePass(0);
  composer.addPass(rastro);
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.22, 0.45, 0.9));
  composer.addPass(new OutputPass());

  // ---- onde o campo mora em cada palco ----
  const involucro = (pai, classe) => {
    const el = document.createElement('div');
    el.className = 'campo3d ' + classe;
    el.setAttribute('aria-hidden', 'true');
    pai.insertBefore(el, pai.firstChild);
    return el;
  };
  const palcos = {
    historia: { dados: HISTORIA, inv: involucro(fixaCapa, 'campo3d--historia'), dono: capa, visivel: false },
    manifesto: MANIFESTO && { dados: MANIFESTO, inv: involucro(fixaManifesto, 'campo3d--manifesto'), dono: manifesto, visivel: false },
  };
  let ativo = null, nasceu = 0, introForcada = null, aspecto = 1;

  function enquadra() {
    if (!ativo) return;
    const w = Math.max(1, ativo.inv.clientWidth), h = Math.max(1, ativo.inv.clientHeight);
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    aspecto = w / h;
    camera.aspect = aspecto;
    /* Na história o texto fica à esquerda (embaixo, no celular): a ação se acomoda do outro
       lado, sem distorcer a perspectiva. */
    if (ativo === palcos.historia) {
      if (aspecto > 1.05) camera.setViewOffset(w, h, -w * (aspecto < 1.45 ? 0.19 : 0.15), -h * 0.03, w, h);
      else camera.setViewOffset(w, h, 0, h * 0.17, w, h);
    } else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    U.uScale.value = (renderer.domElement.height * 0.5) / TAN;
  }
  const medidor = new ResizeObserver(enquadra);
  function troca(novo) {
    if (novo === ativo) return;
    if (ativo) medidor.unobserve(ativo.inv);
    ativo = novo;
    if (!ativo) return;
    ativo.inv.appendChild(tela);
    medidor.observe(ativo.inv);
    nasceu = -1;
    U.uIntro.value = 0;
    U.uAnima.value = ativo === palcos.historia ? 1 : 0;
    enquadra();
  }

  // ---- a câmera da história: passa pelos quadros numa curva só ----
  const vCam = QUADROS.map((q) => new THREE.Vector3(...q.cam[0]));
  const vAlvo = QUADROS.map((q) => new THREE.Vector3(...q.cam[1]));
  const naCurva = (lista, k, t, out) => {
    const p = (i) => lista[Math.max(0, Math.min(lista.length - 1, i))];
    const p0 = p(k - 1), p1 = p(k), p2 = p(k + 1), p3 = p(k + 2), t2 = t * t, t3 = t2 * t;
    return out.set(0, 0, 0)
      .addScaledVector(p0, -0.5 * t3 + t2 - 0.5 * t).addScaledVector(p1, 1.5 * t3 - 2.5 * t2 + 1)
      .addScaledVector(p2, -1.5 * t3 + 2 * t2 + 0.5 * t).addScaledVector(p3, 0.5 * t3 - 0.5 * t2);
  };

  // ---- as legendas da história ----
  const legendas = [...capa.querySelectorAll('[data-de]')].map((el) => ({ el, de: +el.dataset.de, ate: +el.dataset.ate, on: null }));

  // ---- estado ----
  let relogio = 0, s = 0, sAntes = 0, ritmo = 0, dist = 0, ultimo = performance.now(), quadroPedido = 0;
  let forcado = null, mancheteAntes = -1, fimAntes = null;
  const mouse = new THREE.Vector2(9, 9), mouseS = new THREE.Vector2(), mouseAntes = new THREE.Vector2(9, 9), zero = new THREE.Vector2();
  let velocidade = 0, dentro = false;
  addEventListener('pointermove', (e) => {
    if (!ativo) return;
    const r = ativo.inv.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 2 - 1, y = -((e.clientY - r.top) / r.height) * 2 + 1;
    dentro = Math.abs(x) <= 1.1 && Math.abs(y) <= 1.1;
    mouse.set(limita(x, -1.5, 1.5), limita(y, -1.5, 1.5));
  }, { passive: true });
  const olho = new THREE.Vector3(), alvoCam = new THREE.Vector3(), cA = new THREE.Vector3(), cB = new THREE.Vector3();

  const progresso = (dono) => {
    const r = dono.getBoundingClientRect();
    const curso = r.height - innerHeight;
    return curso > 0 ? limita(-r.top / curso) : 0;
  };

  function passo(dt, agora) {
    if (!ativo) return;
    relogio += dt;
    const time = relogio;
    if (nasceu < 0) nasceu = agora;
    U.uIntro.value = introForcada ?? limita((agora - nasceu) / 2800);
    mouseS.lerp(dentro ? mouse : zero, 1 - Math.exp(-dt * 3.5));
    const dados = ativo.dados;
    const ultimoQuadro = dados.formas.length - 1;
    let k, mix;

    if (ativo === palcos.historia) {
      const alvo = forcado ?? progresso(capa) * TRANSICOES;
      s += (alvo - s) * (1 - Math.exp(-dt * 5));
      k = Math.min(ultimoQuadro - 1, Math.floor(s));
      mix = limita(s - k);
      const A = QUADROS[k], B = QUADROS[k + 1];
      // a estrada só corre enquanto o caminhão anda
      const anda = mistura(A.anda, B.anda, suave(0, 1, mix));
      dist += dt * 7.5 * anda;
      U.uDist.value = dist;
      U.uGain.value = mistura(A.ganho, B.ganho, mix);
      U.uFlow.value = mistura(A.nuvem ? 0.09 : 0.003, B.nuvem ? 0.09 : 0.003, mix);
      cA.set(...centroDoCoracao(A)); cB.set(...centroDoCoracao(B));
      U.uCoracao.value.lerpVectors(cA, cB, mix);
      // bate quando está grande e à vista
      const tamanho = mistura(A.coracao ? A.coracao.esc : 0, B.coracao ? B.coracao.esc : 0, mix);
      U.uBate.value = suave(0.2, 0.45, tamanho) * Math.max(0, Math.sin(time * 5.2)) * 0.075;

      naCurva(vCam, k, mix, olho);
      naCurva(vAlvo, k, mix, alvoCam);
      // tela em pé: a câmera recua para a cena caber na largura, e cada quadro diz quanto mais
      const emPe = aspecto < 0.8;
      const base = limita(0.85 / aspecto, 1.35, 1.85);
      const recuo = emPe ? base * mistura(A.pe[0], B.pe[0], mix) : limita(1.6 / aspecto, 1, 1.35);
      olho.sub(alvoCam).multiplyScalar(recuo).add(alvoCam);
      if (emPe) {
        // quanto mais estreita a tela, mais alta a legenda do fecho e mais a cena precisa subir
        const sobe = mistura(A.pe[1], B.pe[1], mix) * (base - 1.35) * 2, lado = mistura(A.pe[2], B.pe[2], mix);
        olho.y -= sobe; alvoCam.y -= sobe; olho.x += lado; alvoCam.x += lado;
      }
      olho.x += mouseS.x * 0.3; olho.y += mouseS.y * 0.18;
      world.rotation.set(0, 0, 0);
      world.scale.setScalar(1);

      const fim = s > TRANSICOES - 1.2;
      if (fim !== fimAntes) { fimAntes = fim; capa.toggleAttribute('data-fim', fim); }
      const manchete = limita(1 - s / 0.62);
      if (manchete !== mancheteAntes) { mancheteAntes = manchete; capa.style.setProperty('--manchete', manchete.toFixed(3)); }
      for (const l of legendas) {
        const on = s >= l.de && s < l.ate;
        if (on !== l.on) { l.on = on; l.el.setAttribute('data-ativo', String(on)); }
      }
    } else {
      const alvo = forcado ?? limita(progresso(manifesto) * 5.3 - 0.8, 0, ultimoQuadro);
      s += (alvo - s) * (1 - Math.exp(-dt * 4.5));
      k = Math.min(ultimoQuadro - 1, Math.floor(s));
      mix = faixa(ESPERA, 1 - ESPERA, s - k);
      const A = dados.poses[k], B = dados.poses[k + 1], e = vaiEVem(mix);
      const sway = mistura(A.sway, B.sway, e);
      world.rotation.set(mistura(A.rx, B.rx, e) + Math.sin(time * 0.23) * sway * 0.22 - mouseS.y * 0.08, Math.sin(time * 0.31) * sway + mouseS.x * 0.14, 0);
      world.scale.setScalar(mistura(A.sc, B.sc, e));
      U.uGain.value = mistura(A.gain, B.gain, e);
      U.uFlow.value = 0.004;
      U.uCoracao.value.set(0, 0, 0);
      U.uBate.value = 0;
      const d = Math.max(5.6 / (2 * TAN), 5.6 / (2 * TAN * aspecto));
      olho.set(mouseS.x * 0.3, mouseS.y * 0.2, d);
      alvoCam.set(0, 0, 0);
    }

    U.tPosA.value = dados.formas[k].tPos; U.tColA.value = dados.formas[k].tCol;
    U.tPosB.value = dados.formas[k + 1].tPos; U.tColB.value = dados.formas[k + 1].tCol;
    U.uMix.value = mix;
    U.uTime.value = time;
    const anda = limita((Math.abs(s - sAntes) / Math.max(dt, 1e-3)) * 1.6) * Math.sin(Math.PI * mix);
    sAntes = s;
    ritmo += (anda - ritmo) * (1 - Math.exp(-dt * 6));
    rastro.damp = 0.72 * ritmo;

    camera.position.copy(olho);
    camera.lookAt(alvoCam);
    camera.updateMatrixWorld();
    const longeDoAlvo = olho.distanceTo(alvoCam);
    U.uFocus.value = longeDoAlvo;
    // de perto o ponto tem de ser fino: o grão acompanha a distância
    U.uSize.value = 0.021 * limita(longeDoAlvo / 10.5, 0.3, 1.15);

    const moveu = mouseAntes.distanceTo(mouse) / Math.max(dt, 1e-3);
    mouseAntes.copy(mouse);
    velocidade += (Math.min(1, moveu * 0.4) - velocidade) * (1 - Math.exp(-dt * 5));
    U.uRay.value.set(mouse.x, mouse.y, 0.5).applyMatrix4(camera.projectionMatrixInverse).normalize();
    U.uPush.value = dentro ? velocidade * 0.6 * limita(longeDoAlvo / 10, 0.25, 1) : 0;

    composer.render();
  }

  /* Um único ponto de controle: o laço roda quando há palco na tela e a aba está à frente. */
  function avalia() {
    troca(palcos.historia.visivel ? palcos.historia : palcos.manifesto && palcos.manifesto.visivel ? palcos.manifesto : null);
    if (ativo && !document.hidden && !quadroPedido) {
      ultimo = performance.now();
      quadroPedido = requestAnimationFrame(laco);
    }
  }
  function laco(agora) {
    quadroPedido = 0;
    if (!ativo || document.hidden) return;
    const dt = Math.min(0.05, (agora - ultimo) / 1000);
    ultimo = agora;
    passo(dt, agora);
    quadroPedido = requestAnimationFrame(laco);
  }

  /* A história prende a capa à tela e alonga a página. Se a pessoa já desceu, ou chegou por
     uma âncora, fica para a próxima visita: mudar a altura agora tiraria o chão dela.
     Em tela baixa (celular deitado) cena e legenda não cabem juntas: a capa fica como está. */
  const contaHistoria = scrollY < innerHeight * 0.5 && !location.hash && innerHeight >= 480;
  if (contaHistoria) {
    capa.style.setProperty('--quadros', String(TRANSICOES));
    capa.setAttribute('data-campo', 'historia');
    if (typeof window.__campo2dPara === 'function') window.__campo2dPara();
  }
  if (manifesto && MANIFESTO) manifesto.setAttribute('data-campo', '3d');

  const observador = new IntersectionObserver((entradas) => {
    for (const en of entradas) {
      if (en.target === capa) palcos.historia.visivel = contaHistoria && en.isIntersecting;
      else if (palcos.manifesto) palcos.manifesto.visivel = en.isIntersecting && larga.matches;
    }
    avalia();
  });
  observador.observe(capa);
  if (manifesto && MANIFESTO) observador.observe(manifesto);
  document.addEventListener('visibilitychange', avalia);
  larga.addEventListener('change', () => {
    if (palcos.manifesto && !larga.matches) palcos.manifesto.visivel = false;
    avalia();
  });

  // ---- "ver a história": a página rola sozinha, no passo de um filme curto ----
  let sozinha = null;
  const paraSozinha = () => { sozinha = null; capa.removeAttribute('data-rodando'); };
  for (const ev of ['wheel', 'touchstart', 'keydown', 'pointerdown']) addEventListener(ev, (e) => {
    if (sozinha && !(e.target instanceof Element && e.target.closest('[data-ver]'))) paraSozinha();
  }, { passive: true });
  function rola(agora) {
    if (!sozinha) return;
    const u = limita((agora - sozinha.t0) / sozinha.ms);
    // `instant`: o CSS do site pede rolagem suave, e duas suavidades brigariam
    scrollTo({ top: mistura(sozinha.de, sozinha.ate, u), behavior: 'instant' });
    if (u >= 1) paraSozinha();
    else requestAnimationFrame(rola);
  }
  for (const b of capa.querySelectorAll('[data-ver]')) b.addEventListener('click', () => {
    const topo = capa.getBoundingClientRect().top + scrollY;
    const ate = topo + capa.offsetHeight - innerHeight;
    const volta = b.hasAttribute('data-volta');
    sozinha = { de: scrollY, ate: volta ? topo : ate, t0: performance.now(), ms: volta ? 1400 : 34000 * (1 - limita((scrollY - topo) / (ate - topo))) + 800 };
    capa.setAttribute('data-rodando', 'true');
    requestAnimationFrame(rola);
  });

  /* Aba de fundo não roda o laço, mas a figura tem de estar lá quando a pessoa voltar. */
  const naJanela = (el) => {
    const r = el.getBoundingClientRect();
    return r.bottom > 0 && r.top < innerHeight;
  };
  palcos.historia.visivel = contaHistoria && naJanela(capa);
  if (palcos.manifesto) palcos.manifesto.visivel = !palcos.historia.visivel && larga.matches && naJanela(manifesto);
  avalia();
  if (ativo && !quadroPedido) {
    introForcada = 1;
    passo(1 / 60, performance.now());
    introForcada = null;
  }

  /* Só para verificação. A aba da automação fica em segundo plano e congela o laço: estes
     ganchos forçam o estado e desenham na hora. */
  const desenha = (palco, v, n) => {
    for (const p of Object.values(palcos)) if (p) p.visivel = p === palco;
    troca(palco);
    forcado = v;
    s = v;
    introForcada = 1;
    for (let i = 0; i < n; i++) passo(1 / 30, ultimo + i * 33);
  };
  window.__campo3d = {
    historia(v, n = 30) {
      const topo = capa.getBoundingClientRect().top + scrollY;
      scrollTo({ top: topo + (v / TRANSICOES) * (capa.offsetHeight - innerHeight), behavior: 'instant' });
      desenha(palcos.historia, v, n);
    },
    manifesto(v, n = 30) { if (palcos.manifesto) desenha(palcos.manifesto, v, n); },
    nascimento(v) { introForcada = v; passo(1 / 30, ultimo); },
    solta() { forcado = null; introForcada = null; },
    custo(n = 20) {
      const gl = renderer.getContext();
      for (let i = 0; i < 3; i++) passo(1 / 30, ultimo);
      gl.finish();
      const t0 = performance.now();
      for (let i = 0; i < n; i++) passo(1 / 30, ultimo);
      gl.finish();
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
      return (performance.now() - t0) / n;
    },
    pontos: N, quadros: QUADROS.length, historia_ligada: contaHistoria, elenco: ELENCO.map((o) => [o.id, o.n]),
    // o que um objeto guarda num quadro: caixa que envolve os pontos e quanta luz eles têm
    resumo(k, id) {
      const obj = ELENCO.find((o) => o.id === id), P = HISTORIA.formas[k].tPos.image.data, C = HISTORIA.formas[k].tCol.image.data;
      const min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
      let luz = 0, voo = 0;
      for (let i = obj.ini; i < obj.ini + obj.n; i++) {
        for (let e = 0; e < 3; e++) { min[e] = Math.min(min[e], P[i * 4 + e]); max[e] = Math.max(max[e], P[i * 4 + e]); }
        luz += C[i * 4 + 3] / 255;
        if (P[i * 4 + 3] < 0) voo++;
      }
      return { n: obj.n, min: min.map((v) => +v.toFixed(2)), max: max.map((v) => +v.toFixed(2)), luzMedia: +(luz / obj.n).toFixed(3), chegamVoando: voo, anim: [...obj.anim.slice(0, 4)] };
    },
  };
})();
