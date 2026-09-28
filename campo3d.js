/* Zagarollo — campo de partículas em 3D.
 *
 * A mesma ideia do campo 2D (`campo.js`), agora com volume: uma nuvem de pontos de
 * luz que assume, uma a uma, as formas do argumento do site.
 *
 *   capa       a folha plana dobra de verdade, parede por parede, e vira a caixa
 *              montada; a caixa vira a sacola; a sacola, por dois segundos, um coração.
 *   manifesto  cada linha ganha a sua forma: o anel, o bolo, a sacolinha, a carta e,
 *              no fecho, o que vai dentro.
 *
 * Este arquivo é carregado DEPOIS da página pronta, por `campo.js`, e só quando o
 * aparelho dá conta. Se qualquer coisa falhar aqui, o campo 2D continua no ar.
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
    pt.a *= 0.22 + 0.78 * contorno * contorno * contorno;
    if (contorno > 0.93) pt.size = 4;
  };
}

/* ---------- a folha que dobra ----------
   A planificação é uma base quadrada, quatro paredes e duas abas. Cada ponto sabe em que
   face mora e onde; a posição sai do ângulo de dobra. Assim a folha dobra de verdade,
   em vez de derreter de uma forma para a outra. */
const FOLHA = { meia: 0.95, parede: 1.25, aba: 0.38, meiaAba: 0.55 };
function pontosDaFolha(n, rnd) {
  const { meia, parede, aba, meiaAba } = FOLHA;
  const tipos = [];
  const entra = (peso, gera) => tipos.push([peso, gera]);
  const ao = () => (rnd() * 2 - 1) * meia;
  // miolo
  entra(4 * meia * meia * D_FACE, () => ({ f: 'base', x: ao(), y: ao(), forte: false }));
  for (const lado of ['D', 'E', 'C', 'B'])
    entra(2 * meia * parede * D_FACE, () => ({ f: lado, u: ao(), d: rnd() * parede, forte: false }));
  for (const lado of ['abaC', 'abaB'])
    entra(2 * meiaAba * aba * D_FACE, () => ({ f: lado, u: (rnd() * 2 - 1) * meiaAba, d: rnd() * aba, forte: false }));
  // vincos e arestas
  for (const lado of ['D', 'E', 'C', 'B']) {
    entra(2 * meia * D_ARESTA * 1.5, () => ({ f: lado, u: ao(), d: 0, forte: true })); // a linha de dobra
    entra(2 * meia * D_ARESTA, () => ({ f: lado, u: ao(), d: parede, forte: true }));
    entra(2 * parede * D_ARESTA, () => ({ f: lado, u: rnd() < 0.5 ? -meia : meia, d: rnd() * parede, forte: true }));
  }
  for (const lado of ['abaC', 'abaB']) {
    entra(2 * meiaAba * D_ARESTA, () => ({ f: lado, u: (rnd() * 2 - 1) * meiaAba, d: aba, forte: true }));
    entra(2 * aba * D_ARESTA, () => ({ f: lado, u: rnd() < 0.5 ? -meiaAba : meiaAba, d: rnd() * aba, forte: true }));
  }
  const total = tipos.reduce((s, t) => s + t[0], 0);
  const lista = [];
  for (const [peso, gera] of tipos) {
    const q = Math.round((peso / total) * n);
    for (let i = 0; i < q && lista.length < n; i++) lista.push(gera());
  }
  while (lista.length < n) lista.push(tipos[0][1]());
  return lista;
}
function posicaoNaFolha(p, ang, out) {
  const { meia, parede } = FOLHA;
  const cs = Math.cos(ang), sn = Math.sin(ang), c2 = Math.cos(2 * ang), s2 = Math.sin(2 * ang);
  const j = p.forte ? 0 : 0.004;
  let x = 0, y = 0, z = 0;
  if (p.f === 'base') { x = p.x; y = p.y; }
  else if (p.f === 'D') { x = meia + p.d * cs; y = p.u; z = p.d * sn; }
  else if (p.f === 'E') { x = -meia - p.d * cs; y = p.u; z = p.d * sn; }
  else if (p.f === 'C') { x = p.u; y = meia + p.d * cs; z = p.d * sn; }
  else if (p.f === 'B') { x = p.u; y = -meia - p.d * cs; z = p.d * sn; }
  else if (p.f === 'abaC') { x = p.u; y = meia + parede * cs + p.d * c2; z = parede * sn + p.d * s2; }
  else { x = p.u; y = -meia - parede * cs - p.d * c2; z = parede * sn + p.d * s2; }
  // a caixa montada gira em torno do próprio centro, não da base
  out[0] = x; out[1] = y; out[2] = z - (parede * sn) / 2 + j;
}

/* ---------- a cena ---------- */
(function () {
  const capa = document.querySelector('.capa');
  const campo2d = document.querySelector('.capa-campo');
  if (!capa || !campo2d) return;
  const manifesto = document.querySelector('.cena--manifesto');
  const fixa = manifesto && manifesto.querySelector('.cena-fixa');
  const legenda = document.getElementById('campo-legenda');
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
     screen no invólucro), então o preto some e o azul da capa aparece por baixo. */
  scene.background = new THREE.Color(0x000000);
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 120);
  const world = new THREE.Group();
  scene.add(world);

  // ---- quantos pontos e onde ficam guardados ----
  const TW = 512;
  const N = leve ? 60000 : 170000;
  const TH = Math.ceil(N / TW);
  const NPO = Math.floor(N * 0.04); // poeira de luz que nunca entra em forma
  const NF = N - NPO;

  const poeira = (() => {
    const rnd = sorteio(4077);
    const d = new Float32Array(NPO * 9);
    for (let i = 0; i < NPO; i++) {
      const a = rnd() * 6.2831853, r = 2.6 + Math.pow(rnd(), 0.7) * 5.5;
      const c = misturaCor(BRANCO, rnd() < 0.5 ? VERDE : AZUL, rnd() * 0.7);
      d.set([Math.cos(a) * r * 1.25, (rnd() - 0.5) * 7.5, Math.sin(a) * r - 1.5, 3 + Math.floor(rnd() * 3), 0, c[0], c[1], c[2], 0.2 + rnd() * 0.4], i * 9);
    }
    return d;
  })();

  function grava(pts, ordem) {
    const pos = new Float32Array(TW * TH * 4);
    const col = new Uint8Array(TW * TH * 4);
    const poe = (i, v, j) => {
      pos.set([v[j], v[j + 1], v[j + 2], Math.round(v[j + 3]) + v[j + 4]], i * 4);
      col.set([v[j + 5] * 255, v[j + 6] * 255, v[j + 7] * 255, limita(v[j + 8]) * 255], i * 4);
    };
    for (let i = 0; i < NF; i++) poe(i, pts, ordem[i] * 9);
    for (let i = 0; i < NPO; i++) poe(NF + i, poeira, i * 9);
    const tPos = new THREE.DataTexture(pos, TW, TH, THREE.RGBAFormat, THREE.FloatType);
    tPos.needsUpdate = true;
    const tCol = new THREE.DataTexture(col, TW, TH, THREE.RGBAFormat, THREE.UnsignedByteType);
    tCol.needsUpdate = true;
    return { tPos, tCol };
  }
  /* Ordena por ângulo em volta do centro, como o campo 2D: é o que faz uma forma virar
     a outra sem os pontos se cruzarem em nó. */
  function ordemPorAngulo(pts, rnd) {
    const ordem = new Uint32Array(NF), chave = new Float32Array(NF);
    for (let i = 0; i < NF; i++) {
      ordem[i] = i;
      chave[i] = Math.atan2(pts[i * 9 + 1], pts[i * 9]) + (rnd() - 0.5) * 0.5 + Math.hypot(pts[i * 9], pts[i * 9 + 1]) * 0.04;
    }
    return ordem.sort((a, b) => chave[a] - chave[b]);
  }
  function montaForma(semente, fontes) {
    const rnd = sorteio(semente);
    const total = fontes.reduce((s, f) => s + f[0], 0);
    const pts = new Float32Array(NF * 9);
    let n = 0;
    fontes.forEach(([peso, amostra], k) => {
      const q = k === fontes.length - 1 ? NF - n : Math.min(NF - n, Math.round((peso / total) * NF));
      for (let i = 0; i < q; i++, n++) {
        amostra(rnd);
        pts.set([pt.x, pt.y, pt.z, pt.size, pt.phase, pt.r, pt.g, pt.b, pt.a], n * 9);
      }
    });
    return grava(pts, ordemPorAngulo(pts, rnd));
  }
  /* Os estados da dobra dividem os MESMOS pontos, na mesma ordem: só muda o ângulo. */
  function montaDobras(semente, angulos) {
    const rnd = sorteio(semente);
    const lista = pontosDaFolha(NF, rnd);
    const p = [0, 0, 0];
    let ordem = null;
    return angulos.map((ang) => {
      const pts = new Float32Array(NF * 9);
      lista.forEach((q, i) => {
        posicaoNaFolha(q, ang, p);
        const o = q.forte ? vinco() : miolo();
        pts.set([p[0], p[1], p[2], o.size, 0, o.color[0], o.color[1], o.color[2], o.a], i * 9);
      });
      ordem = ordem || ordemPorAngulo(pts, rnd);
      return grava(pts, ordem);
    });
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

  // ---------- os dois palcos ----------
  /* Poses: rx inclina, rz gira em torno do eixo da própria forma, sc é o tamanho.
     `flow` é o quanto a forma respira parada; `gain` compensa formas que concentram luz. */
  const dobras = montaDobras(2001, [0, Math.PI / 6, Math.PI / 3, Math.PI / 2]);
  const CAPA = {
    formas: [
      ...dobras,
      montaForma(2101, sacola([0, -0.35, 0], 2.25, 2.9, 1.0)),
      montaForma(2201, [[1, coracao([0, 0, 0], 1.55, { color: misturaCor(BRANCO, VERDE, 0.25), a: 1, size: 3 })]]),
    ],
    poses: [
      { rx: -0.3, ry: 0.0, rz: 0.0, sc: 0.8, sway: 0.1, flow: 0.004, gain: 0.15 },
      { rx: -0.55, ry: 0.0, rz: 0.2, sc: 0.95, sway: 0.1, flow: 0.004, gain: 0.15 },
      { rx: -0.85, ry: 0.0, rz: 0.45, sc: 1.1, sway: 0.1, flow: 0.004, gain: 0.15 },
      { rx: -1.08, ry: 0.0, rz: 0.7, sc: 1.28, sway: 0.14, flow: 0.004, gain: 0.15 },
      { rx: 0.1, ry: -0.55, rz: 0.0, sc: 1.0, sway: 0.2, flow: 0.005, gain: 0.15 },
      { rx: 0.0, ry: 0.0, rz: 0.0, sc: 1.0, sway: 0.3, flow: 0.006, gain: 0.3 },
    ],
    /* O mesmo roteiro do campo 2D, no mesmo ciclo de 21 s. `dobra` atravessa os quatro
       estados da folha de uma vez, sem parar no meio. */
    ciclo: 21,
    roteiro: [
      { de: 0, para: 0, ini: 0.0, fim: 3.2 },
      { de: 0, para: 3, ini: 3.2, fim: 5.4, dobra: true },
      { de: 3, para: 3, ini: 5.4, fim: 8.4 },
      { de: 3, para: 4, ini: 8.4, fim: 10.4 },
      { de: 4, para: 4, ini: 10.4, fim: 13.6 },
      { de: 4, para: 5, ini: 13.6, fim: 15.2 },
      { de: 5, para: 5, ini: 15.2, fim: 17.4 },
      { de: 5, para: 0, ini: 17.4, fim: 19.4 },
      { de: 0, para: 0, ini: 19.4, fim: 21 },
    ],
    nomes: ['a folha plana', '', '', 'a caixa montada', 'a sacola', ''],
  };
  const MANIFESTO = fixa && {
    formas: [
      montaForma(3001, formaAnel()),
      montaForma(3101, formaBolo()),
      montaForma(3201, formaSacolinha()),
      montaForma(3301, formaCarta()),
      montaForma(3401, formaDentro()),
    ],
    poses: [
      { rx: 0.22, ry: 0.0, rz: 0, sc: 1.2, sway: 0.2, flow: 0.004, gain: 0.15 },
      { rx: 0.3, ry: 0.0, rz: 0, sc: 1.08, sway: 0.24, flow: 0.004, gain: 0.15 },
      { rx: 0.1, ry: 0.0, rz: 0, sc: 1.12, sway: 0.2, flow: 0.005, gain: 0.15 },
      { rx: 0.24, ry: 0.0, rz: 0, sc: 1.1, sway: 0.18, flow: 0.004, gain: 0.15 },
      { rx: 0.2, ry: 0.0, rz: 0, sc: 1.1, sway: 0.2, flow: 0.006, gain: 0.2 },
    ],
  };

  // ---- os pontos ----
  const geo = new THREE.BufferGeometry();
  const ref = new Float32Array(N * 2), seed = new Float32Array(N * 4), kind = new Float32Array(N);
  const srnd = sorteio(77);
  for (let i = 0; i < N; i++) {
    ref.set([((i % TW) + 0.5) / TW, (Math.floor(i / TW) + 0.5) / TH], i * 2);
    seed.set([srnd(), srnd(), srnd(), srnd()], i * 4);
    kind[i] = i >= NF ? 1 : 0;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  geo.setAttribute('ref', new THREE.BufferAttribute(ref, 2));
  geo.setAttribute('seed', new THREE.BufferAttribute(seed, 4));
  geo.setAttribute('kind', new THREE.BufferAttribute(kind, 1));
  const U = {
    tPosA: { value: CAPA.formas[0].tPos }, tPosB: { value: CAPA.formas[1].tPos },
    tColA: { value: CAPA.formas[0].tCol }, tColB: { value: CAPA.formas[1].tCol },
    uMix: { value: 0 }, uDireto: { value: 0 }, uTime: { value: 0 }, uIntro: { value: 0 }, uTurb: { value: 1 },
    uFlowA: { value: 0.01 }, uFlowB: { value: 0.01 }, uGainA: { value: 0.3 }, uGainB: { value: 0.3 },
    uFocus: { value: 14 }, uAperture: { value: 0.0042 }, uScale: { value: 1000 }, uSize: { value: 0.021 },
    uOpacity: { value: leve ? 0.9 : 0.66 }, uSome: { value: 0 }, uRay: { value: new THREE.Vector3(0, 0, -1) }, uPush: { value: 0 },
    uQuente: { value: new THREE.Vector3(...KRAFT) },
  };
  const material = new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
    vertexShader: `
      uniform sampler2D tPosA; uniform sampler2D tPosB; uniform sampler2D tColA; uniform sampler2D tColB;
      uniform float uMix; uniform float uDireto; uniform float uTime; uniform float uIntro; uniform float uTurb;
      uniform float uFlowA; uniform float uFlowB; uniform float uGainA; uniform float uGainB;
      uniform float uFocus; uniform float uAperture; uniform float uScale; uniform float uSize; uniform float uSome;
      uniform vec3 uRay; uniform float uPush; uniform vec3 uQuente;
      attribute vec2 ref; attribute vec4 seed; attribute float kind;
      varying vec4 vCol; varying float vBlur;
      // fluxo de Arnold–Beltrami–Childress: sem divergência, barato, e parece líquido
      vec3 abc(vec3 p) { return vec3(sin(p.z) + cos(p.y), sin(p.x) + cos(p.z), sin(p.y) + cos(p.x)); }
      vec3 flow(vec3 p, float t) {
        return abc(p * 0.9 + vec3(0.0, t * 0.23, t * 0.17)) + 0.5 * abc(p.yzx * 2.3 + vec3(t * 0.31, 0.0, -t * 0.27));
      }
      void main() {
        vec4 a = texture2D(tPosA, ref), b = texture2D(tPosB, ref);
        vec4 ca = texture2D(tColA, ref), cb = texture2D(tColB, ref);
        // a forma nova nasce numa onda que atravessa a cena, não num chuvisco
        float sweep = clamp(0.5 + (a.x + b.x) * 0.075 + (a.y + b.y) * 0.03, 0.0, 1.0);
        float t = clamp(uMix * 1.42 - (sweep * 0.3 + seed.x * 0.12), 0.0, 1.0);
        t = t * t * t * (t * (6.0 * t - 15.0) + 10.0);
        // dobrar não é derreter: todos os pontos andam juntos, em linha reta
        t = mix(t, uMix, uDireto);
        float w = sin(3.14159265 * t) * (1.0 - uDireto);
        vec3 p = mix(a.xyz, b.xyz, t);
        float ang = w * (1.0 + 0.25 * seed.y) * uTurb;
        float cs = cos(ang), sn = sin(ang);
        p.xz = mat2(cs, -sn, sn, cs) * p.xz;
        p.xy = mat2(cos(ang * 0.45), -sin(ang * 0.45), sin(ang * 0.45), cos(ang * 0.45)) * p.xy;
        vec3 f = flow(p * 0.45, uTime * 0.4);
        p += f * w * uTurb * (0.2 + 0.12 * seed.y);
        float idle = mix(uFlowA, uFlowB, t);
        p += flow(p * 0.55, uTime * 0.6) * idle + flow(p * 1.1 + seed.wzy * 3.0, uTime) * (idle * 0.12 + kind * 0.09);
        // nascimento: tudo sai de um ponto só
        float born = clamp(uIntro * 1.6 - seed.w * 0.6, 0.0, 1.0);
        born = 1.0 - pow(1.0 - born, 4.0);
        p = mix(f * 0.05, p, born);
        // ao rolar a página, o campo se desfaz para fora
        p += normalize(p + (seed.yzw - 0.5) * 1.6 + vec3(0.0001)) * uSome * uSome * 4.5 * (0.35 + seed.y) * (1.0 - kind);

        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        // o ponteiro abre caminho na luz (no espaço da câmera: o raio parte da origem)
        float along = dot(mv.xyz, uRay);
        vec3 perp = mv.xyz - uRay * along;
        float d = length(perp);
        mv.xyz += (perp / max(d, 0.0001)) * uPush * exp(-d * d / 0.5) * (0.4 + 0.6 * seed.z);
        gl_Position = projectionMatrix * mv;
        vec2 naTela = abs(gl_Position.xy / gl_Position.w);
        float borda = smoothstep(1.0, 0.8, naTela.x) * smoothstep(1.0, 0.8, naTela.y);

        float depth = max(0.1, -mv.z);
        float sa = floor(a.w + 0.0001), sb = floor(b.w + 0.0001);
        float pa = a.w - sa, pb = b.w - sb;
        float size = mix(sa, sb, t) * 0.25 * uSize;
        float pulse = mix(step(0.002, pa) * pow(0.5 + 0.5 * sin(6.2831853 * (pa - uTime * 0.32)), 10.0),
                          step(0.002, pb) * pow(0.5 + 0.5 * sin(6.2831853 * (pb - uTime * 0.32)), 10.0), t);
        size *= 1.0 + pulse * 0.9 + w * 0.12;
        float coc = abs(depth - uFocus) * uAperture;
        float px = (size + coc) * uScale / depth;
        gl_PointSize = clamp(px, 1.3, 46.0);
        float energy = (size * size) / ((size + coc) * (size + coc));
        float fundo = clamp(1.0 + (uFocus - depth) * 0.3, 0.42, 1.25);
        float twinkle = 0.78 + 0.22 * sin(uTime * (1.2 + seed.y * 2.6) + seed.x * 50.0);
        vCol = mix(ca, cb, t);
        vCol.rgb = mix(vCol.rgb, uQuente, w * 0.35);
        vCol.rgb *= 1.0 + pulse * 1.6;
        vCol.a *= mix(1.0, energy, 0.9) * twinkle * min(1.0, px * px / 1.69) * (1.0 - w * 0.55) * born;
        // formas de linha concentram luz: cada forma tem o seu ganho; a poeira não muda
        vCol.a *= mix(mix(uGainA, uGainB, t) * fundo, 0.4, kind) * borda * (1.0 - uSome * 0.9);
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
  const invCapa = document.createElement('div');
  invCapa.className = 'campo3d campo3d--capa';
  invCapa.setAttribute('aria-hidden', 'true');
  capa.insertBefore(invCapa, capa.firstChild);
  let invManifesto = null;
  if (MANIFESTO) {
    invManifesto = document.createElement('div');
    invManifesto.className = 'campo3d campo3d--manifesto';
    invManifesto.setAttribute('aria-hidden', 'true');
    fixa.insertBefore(invManifesto, fixa.firstChild);
  }

  const palcos = {
    capa: { dados: CAPA, inv: invCapa, dono: capa, visivel: false },
    manifesto: MANIFESTO && { dados: MANIFESTO, inv: invManifesto, dono: manifesto, visivel: false },
  };
  let ativo = null, distancia = 14, nasceu = 0, introForcada = null, inicioDoSome = 0;

  function enquadra() {
    if (!ativo) return;
    const inv = ativo.inv;
    const w = Math.max(1, inv.clientWidth), h = Math.max(1, inv.clientHeight);
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    camera.aspect = w / h;
    if (ativo === palcos.capa) {
      /* A forma fica onde o campo 2D ficava — no meio da coluna da direita (ou abaixo
         do texto, no celular) — e um pouco maior que ele. O quadro é a capa inteira,
         para a luz poder sair da coluna sem ser cortada. */
      const a = inv.getBoundingClientRect(), b = campo2d.getBoundingClientRect();
      const lado = Math.max(120, Math.min(b.width, b.height));
      distancia = (h * 5.0) / (2 * TAN * lado * 0.98);
      const dx = b.left + b.width / 2 - (a.left + a.width / 2);
      const dy = b.top + b.height * 0.47 - (a.top + a.height / 2);
      /* O campo só começa a se desfazer depois de ter passado pelo meio da tela. No
         computador isso é desde o topo; no celular ele fica abaixo do texto, e desfazê-lo
         pela rolagem da página o apagaria antes de alguém chegar nele. */
      inicioDoSome = Math.max(0, b.top + scrollY + b.height / 2 - innerHeight * 0.5);
      camera.setViewOffset(w, h, -dx, -dy, w, h);
    } else {
      distancia = Math.max(5.6 / (2 * TAN), 5.6 / (2 * TAN * camera.aspect));
      camera.clearViewOffset();
    }
    camera.position.set(0, 0, distancia);
    camera.updateProjectionMatrix();
    U.uFocus.value = distancia;
    U.uScale.value = (renderer.domElement.height * 0.5) / TAN;
  }
  const medidor = new ResizeObserver(enquadra);

  function troca(novo) {
    if (novo === ativo) return;
    if (ativo) {
      medidor.unobserve(ativo.inv);
      medidor.unobserve(campo2d);
    }
    ativo = novo;
    if (!ativo) return;
    ativo.inv.appendChild(tela);
    medidor.observe(ativo.inv);
    if (ativo === palcos.capa) medidor.observe(campo2d);
    nasceu = -1;
    U.uIntro.value = 0;
    enquadra();
  }

  // ---- estado ----
  let relogio = 0, tempoCapa = 0, s = 0, sAntes = 0, ritmo = 0, ultimo = performance.now(), quadroPedido = 0, vivo = true;
  let nomeAtual = null, forcado = null;
  const mouse = new THREE.Vector2(9, 9), mouseS = new THREE.Vector2(), mouseAntes = new THREE.Vector2(9, 9), zero = new THREE.Vector2();
  let velocidade = 0, dentro = false;
  addEventListener('pointermove', (e) => {
    if (!ativo) return;
    const r = ativo.inv.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 2 - 1, y = -((e.clientY - r.top) / r.height) * 2 + 1;
    dentro = Math.abs(x) <= 1.1 && Math.abs(y) <= 1.1;
    mouse.set(limita(x, -1.5, 1.5), limita(y, -1.5, 1.5));
  }, { passive: true });
  const pose = { rx: 0, ry: 0, rz: 0, sc: 1 };

  function parDaCapa(t) {
    const c = t % CAPA.ciclo;
    for (const tr of CAPA.roteiro) {
      if (c < tr.ini || c >= tr.fim) continue;
      if (tr.de === tr.para) return { k: tr.de, mix: 0, direto: 0, parada: tr.de };
      const q = (c - tr.ini) / (tr.fim - tr.ini);
      if (tr.dobra) {
        const passos = tr.para - tr.de;
        const e = vaiEVem(q) * passos;
        const i = Math.min(passos - 1, Math.floor(e));
        return { k: tr.de + i, mix: e - i, direto: 1, parada: -1 };
      }
      return { k: tr.de, para: tr.para, mix: suave(0, 1, q), direto: 0, parada: -1 };
    }
    return { k: 0, mix: 0, direto: 0, parada: 0 };
  }

  function passo(dt, agora) {
    if (!ativo) return;
    relogio += dt;
    const time = relogio;
    if (nasceu < 0) nasceu = agora;
    U.uIntro.value = introForcada ?? limita((agora - nasceu) / 2600);
    mouseS.lerp(dentro ? mouse : zero, 1 - Math.exp(-dt * 3.5));

    let k = 0, para = 1, mix = 0, direto = 0, parada = -1;
    const dados = ativo.dados;
    if (ativo === palcos.capa) {
      if (forcado == null) tempoCapa += dt;
      const par = forcado ?? parDaCapa(tempoCapa);
      k = par.k; mix = par.mix; direto = par.direto; parada = par.parada;
      para = par.para ?? (par.mix || par.direto ? par.k + 1 : par.k);
      if (para >= dados.formas.length) para = 0;
      // o coração bate enquanto está inteiro na tela
      const bate = parada === 5 ? Math.max(0, Math.sin(((tempoCapa % CAPA.ciclo) - 15.2) / 0.85 * 6.2832)) * 0.06 : 0;
      pose.bate = bate;
      U.uSome.value = limita((scrollY - inicioDoSome) / (innerHeight * 0.8));
    } else {
      // a rolagem conduz: a forma começa a mudar quando a linha seguinte aparece
      const r = ativo.dono.getBoundingClientRect();
      const curso = r.height - innerHeight;
      const p = curso > 0 ? limita(-r.top / curso) : 0;
      const alvo = forcado ?? limita(p * 5.3 - 0.8, 0, dados.formas.length - 1);
      s += (alvo - s) * (1 - Math.exp(-dt * 4.5));
      k = Math.min(dados.formas.length - 2, Math.floor(s));
      mix = faixa(ESPERA, 1 - ESPERA, s - k);
      para = k + 1;
      pose.bate = 0;
      U.uSome.value = 0;
    }
    const A = dados.poses[k], B = dados.poses[para];
    U.tPosA.value = dados.formas[k].tPos; U.tColA.value = dados.formas[k].tCol;
    U.tPosB.value = dados.formas[para].tPos; U.tColB.value = dados.formas[para].tCol;
    U.uMix.value = mix;
    U.uDireto.value = direto;
    U.uFlowA.value = A.flow; U.uFlowB.value = B.flow;
    U.uGainA.value = A.gain; U.uGainB.value = B.gain;
    U.uTime.value = time;
    // rastro só enquanto a forma muda depressa
    const anda = ativo === palcos.capa ? (direto ? 0 : Math.sin(Math.PI * mix)) : limita((Math.abs(s - sAntes) / Math.max(dt, 1e-3)) * 2.2) * Math.sin(Math.PI * mix);
    sAntes = s;
    ritmo += (anda - ritmo) * (1 - Math.exp(-dt * 6));
    rastro.damp = 0.78 * ritmo;

    const e = direto ? mix : vaiEVem(mix);
    const sway = mistura(A.sway, B.sway, e);
    pose.rx = mistura(A.rx, B.rx, e) + Math.sin(time * 0.23) * sway * 0.22 - mouseS.y * 0.08;
    pose.ry = mistura(A.ry, B.ry, e) + Math.sin(time * 0.31) * sway + mouseS.x * 0.14;
    pose.rz = mistura(A.rz, B.rz, e);
    pose.sc = mistura(A.sc, B.sc, e) * (1 + pose.bate);
    world.rotation.set(pose.rx, pose.ry, pose.rz);
    world.scale.setScalar(pose.sc);

    camera.position.set(mouseS.x * 0.3, mouseS.y * 0.2, distancia);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();

    const moveu = mouseAntes.distanceTo(mouse) / Math.max(dt, 1e-3);
    mouseAntes.copy(mouse);
    velocidade += (Math.min(1, moveu * 0.4) - velocidade) * (1 - Math.exp(-dt * 5));
    U.uRay.value.set(mouse.x, mouse.y, 0.5).applyMatrix4(camera.projectionMatrixInverse).normalize();
    U.uPush.value = dentro ? velocidade * 0.8 : 0;

    composer.render();

    if (ativo === palcos.capa && legenda) {
      const nome = parada >= 0 ? CAPA.nomes[parada] : '';
      if (nome !== nomeAtual) {
        nomeAtual = nome;
        legenda.textContent = nome;
        legenda.setAttribute('data-visivel', nome ? 'true' : 'false');
      }
    }
  }

  /* Um único ponto de controle: o laço roda quando há palco na tela e a aba está à frente. */
  function avalia() {
    const novo = palcos.capa.visivel ? palcos.capa : palcos.manifesto && palcos.manifesto.visivel ? palcos.manifesto : null;
    troca(novo);
    const deve = vivo && !!ativo && !document.hidden;
    if (deve && !quadroPedido) {
      ultimo = performance.now();
      quadroPedido = requestAnimationFrame(laco);
    }
  }
  function laco(agora) {
    quadroPedido = 0;
    if (!vivo || !ativo || document.hidden) return;
    const dt = Math.min(0.05, (agora - ultimo) / 1000);
    ultimo = agora;
    passo(dt, agora);
    quadroPedido = requestAnimationFrame(laco);
  }
  const observador = new IntersectionObserver((entradas) => {
    for (const en of entradas) {
      if (en.target === capa) palcos.capa.visivel = en.isIntersecting;
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

  /* Aba de fundo não roda o laço, mas a figura tem de estar lá quando a pessoa voltar:
     escolhe o palco pela posição e desenha um quadro. */
  const naJanela = (el) => {
    const r = el.getBoundingClientRect();
    return r.bottom > 0 && r.top < innerHeight;
  };
  palcos.capa.visivel = naJanela(capa);
  if (palcos.manifesto) palcos.manifesto.visivel = !palcos.capa.visivel && larga.matches && naJanela(manifesto);
  avalia();
  if (ativo && !quadroPedido) {
    introForcada = 1;
    passo(1 / 60, performance.now());
    introForcada = null;
  }

  // ---- a página passa a usar o campo 3D ----
  capa.setAttribute('data-campo', '3d');
  if (manifesto && MANIFESTO) manifesto.setAttribute('data-campo', '3d');
  if (typeof window.__campo2dPara === 'function') window.__campo2dPara();

  /* Só para verificação. A aba da automação fica em segundo plano e congela o laço:
     estes ganchos forçam o estado e desenham na hora. */
  window.__campo3d = {
    capa(k, mix = 0, direto = 0, n = 30) {
      palcos.capa.visivel = true;
      if (palcos.manifesto) palcos.manifesto.visivel = false;
      troca(palcos.capa);
      forcado = { k, mix, direto, parada: mix ? -1 : k };
      introForcada = 1;
      for (let i = 0; i < n; i++) passo(1 / 30, ultimo + i * 33);
    },
    manifesto(v, n = 30) {
      if (!palcos.manifesto) return;
      palcos.capa.visivel = false;
      palcos.manifesto.visivel = true;
      troca(palcos.manifesto);
      forcado = v;
      s = v;
      introForcada = 1;
      for (let i = 0; i < n; i++) passo(1 / 30, ultimo + i * 33);
    },
    solta() {
      forcado = null;
      introForcada = null;
    },
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
    pontos: N,
  };
})();
