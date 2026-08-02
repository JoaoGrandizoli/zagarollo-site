/* Zagarollo — campo de partículas da capa.
 *
 * Uma malha de pontos ligados por linhas que morfa entre quatro formas:
 * a planificação (a folha cortada e vincada), a caixa montada, a sacola
 * e, por dois segundos, um coração — que se desmancha antes de virar
 * declaração. É o argumento do site em movimento: o que importa vai dentro.
 *
 * Canvas 2D puro, sem dependência. Os pontos são amostrados rasterizando
 * cada forma num canvas fora da tela e lendo os pixels — assim a silhueta
 * vem da forma de verdade, não de coordenadas digitadas à mão.
 */

(function () {
  'use strict';

  var tela = document.getElementById('campo');
  if (!tela || !tela.getContext) return;

  var ctx = tela.getContext('2d');
  if (!ctx) return;

  var reduzido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Desenho das quatro formas, em coordenadas 0..1 ----------
   *
   * Cada forma é pintada em dois canais no canvas fora da tela:
   *   vermelho = área da peça (de onde os pontos são amostrados)
   *   verde    = os vincos — as linhas de dobra e as arestas das faces
   * Na amostragem, um ponto que caiu em cima de verde vira "vinco" e é
   * desenhado forte. É o que faz a caixa ler como caixa e não como mancha. */

  function areaRet(c, L, T, R, B, e, ax, ay) {
    c.fillStyle = '#f00';
    c.fillRect(L * e + ax, T * e + ay, (R - L) * e, (B - T) * e);
  }

  function vinco(c, e, pontos, fechar) {
    c.strokeStyle = '#0f0';
    c.lineWidth = Math.max(2.5, e * 0.012);
    c.beginPath();
    c.moveTo(pontos[0][0], pontos[0][1]);
    for (var i = 1; i < pontos.length; i++) c.lineTo(pontos[i][0], pontos[i][1]);
    if (fechar) c.closePath();
    c.stroke();
  }

  /* A folha plana: quadrado central, quatro abas e as linhas de dobra. */
  function planificacao(c, e, ax, ay) {
    var P = function (x, y) { return [x * e + ax, y * e + ay]; };

    areaRet(c, 0.36, 0.36, 0.64, 0.64, e, ax, ay);
    areaRet(c, 0.12, 0.38, 0.36, 0.62, e, ax, ay);
    areaRet(c, 0.64, 0.38, 0.88, 0.62, e, ax, ay);
    areaRet(c, 0.38, 0.12, 0.62, 0.36, e, ax, ay);
    areaRet(c, 0.38, 0.64, 0.62, 0.88, e, ax, ay);
    areaRet(c, 0.44, 0.05, 0.56, 0.12, e, ax, ay);
    areaRet(c, 0.44, 0.88, 0.56, 0.95, e, ax, ay);

    /* Os quatro vincos do quadrado central: é por aqui que a folha dobra. */
    vinco(c, e, [P(0.36, 0.36), P(0.64, 0.36), P(0.64, 0.64), P(0.36, 0.64)], true);
  }

  /* A mesma folha, montada: caixa em perspectiva isométrica. */
  function caixa(c, e, ax, ay) {
    var P = function (x, y) { return [x * e + ax, y * e + ay]; };

    var topo = [P(0.50, 0.20), P(0.84, 0.38), P(0.50, 0.56), P(0.16, 0.38)];
    var esq  = [P(0.16, 0.38), P(0.50, 0.56), P(0.50, 0.84), P(0.16, 0.66)];
    var dir  = [P(0.50, 0.56), P(0.84, 0.38), P(0.84, 0.66), P(0.50, 0.84)];

    c.fillStyle = '#f00';
    [topo, esq, dir].forEach(function (face) {
      c.beginPath();
      c.moveTo(face[0][0], face[0][1]);
      for (var i = 1; i < face.length; i++) c.lineTo(face[i][0], face[i][1]);
      c.closePath();
      c.fill();
    });

    /* As arestas das três faces — sem elas o cubo vira um hexágono cheio. */
    vinco(c, e, topo, true);
    vinco(c, e, [P(0.50, 0.56), P(0.50, 0.84)], false);
    vinco(c, e, [P(0.16, 0.38), P(0.16, 0.66), P(0.50, 0.84), P(0.84, 0.66), P(0.84, 0.38)], false);
  }

  /* A sacola: corpo trapezoidal, banda da dobra e alça torcida. */
  function sacola(c, e, ax, ay) {
    var P = function (x, y) { return [x * e + ax, y * e + ay]; };
    var corpo = [P(0.25, 0.33), P(0.75, 0.33), P(0.71, 0.88), P(0.29, 0.88)];

    c.fillStyle = '#f00';
    c.beginPath();
    c.moveTo(corpo[0][0], corpo[0][1]);
    for (var i = 1; i < corpo.length; i++) c.lineTo(corpo[i][0], corpo[i][1]);
    c.closePath();
    c.fill();

    vinco(c, e, corpo, true);
    vinco(c, e, [P(0.25, 0.42), P(0.75, 0.42)], false);   /* a dobra da boca */
    vinco(c, e, [P(0.37, 0.33), P(0.37, 0.88)], false);   /* o fole lateral */
    vinco(c, e, [P(0.63, 0.33), P(0.63, 0.88)], false);

    /* A alça é traço, não área: entra nos dois canais para render pontos. */
    c.lineWidth = Math.max(3, e * 0.03);
    c.beginPath();
    c.moveTo(0.38 * e + ax, 0.33 * e + ay);
    c.bezierCurveTo(0.38 * e + ax, 0.12 * e + ay, 0.62 * e + ax, 0.12 * e + ay, 0.62 * e + ax, 0.33 * e + ay);
    c.strokeStyle = '#f00'; c.stroke();
    c.strokeStyle = '#0f0'; c.lineWidth = Math.max(2, e * 0.014); c.stroke();
  }

  /* O coração. Aparece por dois segundos e some. */
  function coracao(c, e, ax, ay) {
    var X = function (v) { return v * e + ax; };
    var Y = function (v) { return v * e + ay; };

    var traca = function () {
      c.beginPath();
      c.moveTo(X(0.50), Y(0.82));
      c.bezierCurveTo(X(0.50), Y(0.82), X(0.11), Y(0.56), X(0.11), Y(0.36));
      c.bezierCurveTo(X(0.11), Y(0.21), X(0.24), Y(0.15), X(0.33), Y(0.15));
      c.bezierCurveTo(X(0.42), Y(0.15), X(0.48), Y(0.22), X(0.50), Y(0.27));
      c.bezierCurveTo(X(0.52), Y(0.22), X(0.58), Y(0.15), X(0.67), Y(0.15));
      c.bezierCurveTo(X(0.76), Y(0.15), X(0.89), Y(0.21), X(0.89), Y(0.36));
      c.bezierCurveTo(X(0.89), Y(0.56), X(0.50), Y(0.82), X(0.50), Y(0.82));
      c.closePath();
    };

    c.fillStyle = '#f00';
    traca();
    c.fill();

    c.strokeStyle = '#0f0';
    c.lineWidth = Math.max(2.5, e * 0.012);
    traca();
    c.stroke();
  }

  var FORMAS = [planificacao, caixa, sacola, coracao];

  /* A legenda nomeia a forma enquanto ela está parada. O coração não recebe
     nome nenhum — nomear a piada é o que a estragaria. */
  var NOMES = ['a folha plana', 'a caixa montada', 'a sacola', ''];
  var legenda = document.getElementById('campo-legenda');
  var nomeAtual = null;

  /* ---------- Roteiro do ciclo ----------
     Cada trecho diz de qual forma para qual, e quando. O coração é o mais
     curto de todos: entra, bate duas vezes e já está virando folha de novo. */

  var CICLO = 21;
  var ROTEIRO = [
    { de: 0, para: 0, ini: 0.0,  fim: 3.2 },
    { de: 0, para: 1, ini: 3.2,  fim: 5.0 },
    { de: 1, para: 1, ini: 5.0,  fim: 8.4 },
    { de: 1, para: 2, ini: 8.4,  fim: 10.2 },
    { de: 2, para: 2, ini: 10.2, fim: 13.6 },
    { de: 2, para: 3, ini: 13.6, fim: 15.2 },
    { de: 3, para: 3, ini: 15.2, fim: 17.4 },
    { de: 3, para: 0, ini: 17.4, fim: 19.2 },
    { de: 0, para: 0, ini: 19.2, fim: CICLO }
  ];

  function suave(a, b, v) {
    var k = Math.min(1, Math.max(0, (v - a) / (b - a)));
    return k * k * (3 - 2 * k);
  }

  /* ---------- Estado ---------- */

  var L = 0, A = 0, DPR = 1;
  var pontos = [];
  var LIGA = 0, colunas = 1, linhas = 1, grade = [];
  var alcance = 1;
  var ponteiro = { x: -9999, y: -9999 };
  var RAIO_PONTEIRO = 90;
  var progresso = 0;
  var rodando = false;
  var naTela = true;
  /* Carregar numa aba de fundo (cmd-clique) não pode contar como visível:
     o requestIdleCallback dispara mesmo assim e o ciclo começaria a correr. */
  var visivelNaAba = !document.hidden;
  var raf = 0;
  var inicio = 0;

  /* Traços agrupados por faixa de opacidade. */
  var FAIXAS = 6;
  var baldes = new Array(FAIXAS * 2);

  /* ---------- Amostragem: rasteriza a forma e lê os pixels ---------- */

  /* A rasterização roda a meia resolução: o passo da amostragem é bem maior
     que um pixel, então metade da escala não muda o resultado e lê 4x menos
     pixels — era o que segurava a thread principal no carregamento. */
  var ESCALA = 0.5;

  function amostra(desenha, passo) {
    var fora = document.createElement('canvas');
    fora.width = Math.max(1, Math.floor(L * ESCALA));
    fora.height = Math.max(1, Math.floor(A * ESCALA));

    var oc = fora.getContext('2d', { willReadFrequently: true });
    if (!oc) return [];

    /* As formas são desenhadas num quadrado centrado, para não deformarem
       quando o canvas não é quadrado. */
    var lado = Math.min(L, A) * 0.94;
    oc.scale(ESCALA, ESCALA);
    desenha(oc, lado, (L - lado) / 2, (A - lado) / 2);

    var img = oc.getImageData(0, 0, fora.width, fora.height).data;

    var pix = function (x, y) {
      var ex = Math.floor(x * ESCALA), ey = Math.floor(y * ESCALA);
      if (ex < 0 || ey < 0 || ex >= fora.width || ey >= fora.height) return null;
      var i = (ey * fora.width + ex) * 4;
      return { r: img[i], g: img[i + 1] };
    };

    var dentro = function (x, y) {
      var p = pix(x, y);
      return !!p && (p.r > 0 || p.g > 0);
    };

    var lista = [];
    for (var y = passo / 2; y < A; y += passo) {
      for (var x = passo / 2; x < L; x += passo) {
        /* O tremor tira o ar de papel quadriculado da grade regular. */
        var jx = x + (Math.random() - 0.5) * passo * 0.55;
        var jy = y + (Math.random() - 0.5) * passo * 0.55;

        var p = pix(jx, jy);
        if (!p || (!p.r && !p.g)) continue;

        var contorno = !dentro(jx - passo, jy) || !dentro(jx + passo, jy) ||
                       !dentro(jx, jy - passo) || !dentro(jx, jy + passo);

        /* Vinco = linha de dobra (canal verde) ou silhueta da peça. */
        var ehVinco = p.g > 0 || contorno;

        /* O miolo entra rareado: cheio demais vira mancha e some a estrutura. */
        if (!ehVinco && Math.random() > 0.42) continue;

        lista.push({ x: jx, y: jy, borda: ehVinco });
      }
    }
    return lista;
  }

  /* Ordena por ângulo em volta do centro: é o que faz uma forma virar a
     outra sem os pontos se cruzarem em nó. */
  function ordena(lista) {
    var cx = L / 2, cy = A / 2;
    return lista.map(function (p) {
      return { p: p, ang: Math.atan2(p.y - cy, p.x - cx), r: Math.hypot(p.x - cx, p.y - cy) };
    }).sort(function (u, v) {
      return u.ang - v.ang || u.r - v.r;
    }).map(function (u) { return u.p; });
  }

  function monta() {
    var caixaDom = tela.getBoundingClientRect();
    L = Math.max(1, caixaDom.width);
    A = Math.max(1, caixaDom.height);
    DPR = Math.min(1.5, window.devicePixelRatio || 1);

    tela.width = Math.floor(L * DPR);
    tela.height = Math.floor(A * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    var passo = Math.max(6, L / 52);
    LIGA = passo * 2.5;
    colunas = Math.max(1, Math.ceil(L / LIGA));
    linhas = Math.max(1, Math.ceil(A / LIGA));
    alcance = Math.max(L, A) * 0.5;
    RAIO_PONTEIRO = Math.max(55, L * 0.14);

    var conjuntos = FORMAS.map(function (f) { return ordena(amostra(f, passo)); });

    /* A planificação define quantos pontos existem; as outras formas são
       reamostradas para essa mesma contagem. */
    var n = conjuntos[0].length;
    if (!n || conjuntos.some(function (c) { return !c.length; })) { pontos = []; return; }

    pontos = [];
    for (var i = 0; i < n; i++) {
      var poses = conjuntos.map(function (c) {
        return c[Math.floor((i * c.length) / n)] || c[c.length - 1];
      });
      if (poses.some(function (p) { return !p; })) continue;

      pontos.push({
        pos: poses,
        x: poses[0].x,
        y: poses[0].y,
        fase: Math.random() * Math.PI * 2,
        celula: 0
      });
    }
  }

  /* ---------- Quadro ---------- */

  /* `unico` desenha um quadro solto sem entrar no laço: é o que garante que o
     canvas nunca fique em branco quando a página abre numa aba de fundo. */
  function quadro(agora, unico) {
    if (!unico && !rodando) return;

    var t = (agora - inicio) / 1000;
    ctx.clearRect(0, 0, L, A);

    if (!pontos.length) { if (!unico) rodando = false; return; }

    /* Onde estamos no roteiro. */
    var c = reduzido ? 0 : t % CICLO;
    var de = 0, para = 0, k = 0;
    for (var i = 0; i < ROTEIRO.length; i++) {
      var tr = ROTEIRO[i];
      if (c >= tr.ini && c < tr.fim) {
        de = tr.de; para = tr.para;
        k = tr.de === tr.para ? 0 : suave(tr.ini, tr.fim, c);
        break;
      }
    }

    if (legenda) {
      var nome = de === para ? NOMES[de] : '';
      if (nome !== nomeAtual) {
        nomeAtual = nome;
        legenda.textContent = nome;
        legenda.setAttribute('data-visivel', nome ? 'true' : 'false');
      }
    }

    /* Batimento: só enquanto o coração está inteiro na tela. */
    var coracaoVivo = de === 3 && para === 3;
    var batida = 0;
    if (coracaoVivo && !reduzido) {
      var b = (c - 15.2) / 0.85;
      batida = Math.max(0, Math.sin(b * Math.PI * 2)) * 0.055;
    }

    /* O scroll dissolve o campo: uma frente de onda sai do centro. */
    var raioOnda = progresso * alcance * 1.9;
    var sigma = alcance * 0.22;
    var amplitude = alcance * 0.55 * progresso;
    var esmaece = 1 - progresso * 0.92;

    var cx = L / 2, cy = A / 2;

    for (var j = 0; j < pontos.length; j++) {
      var p = pontos[j];
      var a = p.pos[de], b2 = p.pos[para];

      var bx = a.x + (b2.x - a.x) * k;
      var by = a.y + (b2.y - a.y) * k;

      var dx = bx - cx, dy = by - cy;
      var dist = Math.hypot(dx, dy) || 1;

      var onda = Math.exp(-Math.pow(dist - raioOnda, 2) / (2 * sigma * sigma));
      var passou = dist < raioOnda ? (raioOnda - dist) * 0.35 : 0;
      var empurra = amplitude * onda + passou * progresso + dist * batida;

      var balanco = reduzido ? 0 : Math.sin(t * 0.85 + p.fase) * 1.2;

      var px = bx + (dx / dist) * empurra + balanco * 0.6;
      var py = by + (dy / dist) * empurra + balanco;

      var mx = px - ponteiro.x, my = py - ponteiro.y;
      var md = Math.hypot(mx, my);
      if (md < RAIO_PONTEIRO && md > 0.01) {
        var f = Math.pow(1 - md / RAIO_PONTEIRO, 2) * RAIO_PONTEIRO * 0.4;
        px += (mx / md) * f;
        py += (my / md) * f;
      }

      p.x = px; p.y = py;
      p.bordaAtual = k > 0.5 ? b2.borda : a.borda;

      var ci = Math.min(colunas - 1, Math.max(0, Math.floor(px / LIGA)));
      var cj = Math.min(linhas - 1, Math.max(0, Math.floor(py / LIGA)));
      p.celula = cj * colunas + ci;
    }

    grade = [];
    for (var g = 0; g < colunas * linhas; g++) grade.push([]);
    for (var h = 0; h < pontos.length; h++) grade[pontos[h].celula].push(h);

    /* Ligações. Só metade dos vizinhos, para não desenhar cada linha duas vezes.
       Os traços são agrupados por faixa de opacidade: um Path2D por faixa em vez
       de um stroke() por linha derruba milhares de chamadas para algumas dezenas. */
    for (var f2 = 0; f2 < FAIXAS * 2; f2++) baldes[f2] = null;

    for (var gy = 0; gy < linhas; gy++) {
      for (var gx = 0; gx < colunas; gx++) {
        var aqui = grade[gy * colunas + gx];
        if (!aqui.length) continue;

        for (var vy = 0; vy <= 1; vy++) {
          for (var vx = -1; vx <= 1; vx++) {
            if (vy === 0 && vx < 0) continue;
            var nx = gx + vx, ny = gy + vy;
            if (nx < 0 || ny < 0 || nx >= colunas || ny >= linhas) continue;

            var la = grade[ny * colunas + nx];
            if (!la.length) continue;
            var mesma = vx === 0 && vy === 0;

            for (var ii = 0; ii < aqui.length; ii++) {
              var pa = pontos[aqui[ii]];
              for (var jj = mesma ? ii + 1 : 0; jj < la.length; jj++) {
                var pb = pontos[la[jj]];

                var ux = pa.x - pb.x;
                if (ux > LIGA || ux < -LIGA) continue;
                var uy = pa.y - pb.y;
                if (uy > LIGA || uy < -LIGA) continue;

                var d2 = ux * ux + uy * uy;
                if (d2 > LIGA * LIGA) continue;

                /* Nome diferente da função vinco(): um `var` aqui a sombrearia
                   dentro de quadro() inteiro, por içamento. */
                var ehDobra = pa.bordaAtual && pb.bordaAtual;
                var al = Math.min(1, Math.pow(1 - Math.sqrt(d2) / LIGA, 1.4) *
                                     (ehDobra ? 1.05 : 0.26) * esmaece);
                if (al < 0.012) continue;

                var faixa = Math.min(FAIXAS - 1, Math.floor(al * FAIXAS));
                var idx = (ehDobra ? FAIXAS : 0) + faixa;
                var caminho = baldes[idx] || (baldes[idx] = new Path2D());
                caminho.moveTo(pa.x, pa.y);
                caminho.lineTo(pb.x, pb.y);
              }
            }
          }
        }
      }
    }

    for (var fb = 0; fb < FAIXAS * 2; fb++) {
      var cam = baldes[fb];
      if (!cam) continue;
      var ehVinco = fb >= FAIXAS;
      var alfaFaixa = ((fb % FAIXAS) + 0.5) / FAIXAS;
      ctx.lineWidth = ehVinco ? 1.2 : 0.6;
      ctx.strokeStyle = ehVinco
        ? 'rgba(255,255,255,' + alfaFaixa.toFixed(3) + ')'
        : 'rgba(143,208,174,' + alfaFaixa.toFixed(3) + ')';
      ctx.stroke(cam);
    }

    /* Os pontos. O vinco é branco; o miolo, verde apagado. Como a opacidade
       só depende da categoria, os dois grupos saem em dois fills. */
    var pVinco = new Path2D(), pMiolo = new Path2D();
    for (var q = 0; q < pontos.length; q++) {
      var pt = pontos[q];
      var alvo = pt.bordaAtual ? pVinco : pMiolo;
      var raio = pt.bordaAtual ? 1.9 : 1;
      alvo.moveTo(pt.x + raio, pt.y);
      alvo.arc(pt.x, pt.y, raio, 0, Math.PI * 2);
    }

    ctx.fillStyle = 'rgba(143,208,174,' + (0.3 * esmaece).toFixed(3) + ')';
    ctx.fill(pMiolo);
    ctx.fillStyle = 'rgba(255,255,255,' + (0.95 * esmaece).toFixed(3) + ')';
    ctx.fill(pVinco);

    /* Sob "reduzir movimento" o quadro é sempre idêntico: nada morfa, nada
       balança, nada responde a scroll ou ponteiro. Desenha uma vez e para,
       em vez de queimar bateria redesenhando a mesma imagem 60x por segundo. */
    if (unico) return;

    /* Sob "reduzir movimento" o quadro é sempre idêntico: desenha uma vez e
       para, em vez de queimar bateria redesenhando a mesma imagem. */
    if (reduzido) { rodando = false; return; }

    raf = requestAnimationFrame(quadro);
  }

  /* ---------- Ligações com a página ---------- */

  var redimensiona;
  function remonta() {
    monta();
    avalia();
    if (!rodando) quadro(performance.now(), true);
  }

  window.addEventListener('resize', function () {
    clearTimeout(redimensiona);
    redimensiona = setTimeout(remonta, 180);
  }, { passive: true });

  /* Se o canvas nasceu sem altura (ancestral oculto, navegador sem
     aspect-ratio), a amostragem devolve zero pontos e sem isto o campo ficaria
     em branco para sempre — o resize da janela nunca chegaria a acontecer. */
  if ('ResizeObserver' in window) {
    new ResizeObserver(function (entradas) {
      if (entradas[0].contentRect.height > 8 && pontos.length === 0) remonta();
    }).observe(tela);
  }

  if (!reduzido) {
    /* O retângulo do canvas só muda em resize e scroll. Medi-lo a cada evento
       de ponteiro força um reflow síncrono centenas de vezes por segundo. */
    var caixaTela = null;
    var invalida = function () { caixaTela = null; };

    window.addEventListener('pointermove', function (e) {
      if (!caixaTela) caixaTela = tela.getBoundingClientRect();
      ponteiro.x = e.clientX - caixaTela.left;
      ponteiro.y = e.clientY - caixaTela.top;
    }, { passive: true });

    /* pointerleave não borbulha, então um listener em `window` nunca é
       chamado. pointerout borbulha; relatedTarget nulo = saiu da janela. */
    var solta = function (e) {
      if (e && e.type === 'pointerout' && e.relatedTarget) return;
      ponteiro.x = -9999; ponteiro.y = -9999;
    };
    window.addEventListener('pointerout', solta, { passive: true });
    window.addEventListener('pointercancel', solta, { passive: true });
    window.addEventListener('pointerup', solta, { passive: true });

    window.addEventListener('scroll', function () {
      invalida();
      progresso = Math.min(1, Math.max(0, window.scrollY / (window.innerHeight * 0.85)));
    }, { passive: true });

    window.addEventListener('resize', invalida, { passive: true });
  }

  /* O loop só roda quando a capa está na tela E a aba está à frente. Rolar para
     baixo ou trocar de aba mata o rAF — o ciclo congela onde parou e retoma dali,
     em vez de saltar para onde estaria se tivesse continuado. */

  var decorrido = 0;

  function avalia() {
    var deveRodar = naTela && visivelNaAba;
    if (deveRodar === rodando) return;

    rodando = deveRodar;
    if (rodando) {
      inicio = performance.now() - decorrido;
      raf = requestAnimationFrame(quadro);
    } else {
      decorrido = performance.now() - inicio;
      cancelAnimationFrame(raf);
    }
  }

  document.addEventListener('visibilitychange', function () {
    visivelNaAba = !document.hidden;
    avalia();
  });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entradas) {
      naTela = entradas[0].isIntersecting;
      avalia();
    }, { threshold: 0 }).observe(tela);
  }

  /* A montagem rasteriza e amostra quatro formas — trabalho demais para a
     thread principal durante o carregamento. Ela espera a primeira pintura
     e o navegador ficar ocioso; até lá o canvas fica simplesmente vazio. */

  function comeca() {
    monta();
    inicio = performance.now();
    avalia();
    /* Aba de fundo: o laço não roda, mas a figura tem de estar lá quando
       a pessoa voltar para a aba. */
    if (!rodando) quadro(performance.now(), true);
  }

  if ('requestIdleCallback' in window) {
    requestIdleCallback(comeca, { timeout: 1500 });
  } else {
    setTimeout(comeca, 260);
  }
})();
