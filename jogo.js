/* Zagarollo — "Corre, Sacola!"
 *
 * Um corredor lateral curto no fim da página inicial. Você é uma sacola de
 * papel: pula, recolhe sacolinhas e desvia do que estraga papel — gota d'água
 * e tesoura.
 *
 * Nada é imagem: tudo é desenhado com formas, então o jogo não pesa um byte de
 * asset. E nada roda até alguém apertar Jogar — o carregamento da página não
 * paga por ele.
 */

(function () {
  'use strict';

  var tela = document.getElementById('jogo');
  if (!tela || !tela.getContext) return;

  var ctx = tela.getContext('2d');
  if (!ctx) return;

  var botao = document.getElementById('jogo-botao');
  var placar = document.getElementById('jogo-placar');
  var aviso = document.getElementById('jogo-aviso');
  var recordeEl = document.getElementById('jogo-recorde');

  /* Sistema de coordenadas fixo: o canvas escala, a lógica não muda. */
  var L = 900, A = 300;
  var CHAO = A - 52;

  var AZUL = '#2f4b8f', AZUL_ESCURO = '#23386b';
  var VERDE = '#00874a', VERDE_CLARO = '#8fd0ae';
  var KRAFT = '#c08b57', KRAFT_ESCURO = '#9a6b3d';
  var BRANCO = '#ffffff';

  var GRAVIDADE = 0.72, IMPULSO = -13.4;

  var estado = 'parado';   /* parado | jogando | fim */
  var raf = 0, ultimo = 0;
  var heroi, obstaculos, itens, chaoDeslize, velocidade, pontos, distancia, piscar, bonus;

  var recorde = 0;
  try { recorde = parseInt(localStorage.getItem('zagarollo-recorde') || '0', 10) || 0; } catch (e) { recorde = 0; }
  if (recordeEl) recordeEl.textContent = String(recorde);

  /* ---------- Desenho ---------- */

  function sacola(x, y, w, h, cor, corEscura) {
    /* alça torcida */
    ctx.strokeStyle = corEscura;
    ctx.lineWidth = Math.max(2, w * 0.07);
    ctx.beginPath();
    ctx.moveTo(x + w * 0.28, y);
    ctx.bezierCurveTo(x + w * 0.28, y - h * 0.34, x + w * 0.72, y - h * 0.34, x + w * 0.72, y);
    ctx.stroke();

    /* corpo */
    ctx.fillStyle = cor;
    ctx.fillRect(x, y, w, h);

    /* banda da dobra e fole */
    ctx.fillStyle = corEscura;
    ctx.fillRect(x, y, w, h * 0.16);
    ctx.fillRect(x + w * 0.62, y + h * 0.16, Math.max(1, w * 0.05), h * 0.84);
  }

  function gota(x, y, r) {
    ctx.fillStyle = '#3d7fd6';
    ctx.beginPath();
    ctx.moveTo(x, y - r * 1.9);
    ctx.bezierCurveTo(x + r * 1.15, y - r * 0.4, x + r, y + r * 0.75, x, y + r * 0.75);
    ctx.bezierCurveTo(x - r, y + r * 0.75, x - r * 1.15, y - r * 0.4, x, y - r * 1.9);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    ctx.beginPath();
    ctx.arc(x - r * 0.3, y - r * 0.1, r * 0.22, 0, Math.PI * 2);
    ctx.fill();
  }

  function tesoura(x, y, s) {
    ctx.strokeStyle = '#8b93a5';
    ctx.lineWidth = s * 0.16;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - s * 0.5, y - s * 0.6); ctx.lineTo(x + s * 0.45, y + s * 0.5);
    ctx.moveTo(x + s * 0.5, y - s * 0.6); ctx.lineTo(x - s * 0.45, y + s * 0.5);
    ctx.stroke();
    ctx.fillStyle = '#5a6478';
    ctx.beginPath(); ctx.arc(x - s * 0.5, y + s * 0.62, s * 0.22, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + s * 0.5, y + s * 0.62, s * 0.22, 0, Math.PI * 2); ctx.fill();
  }

  function cenario() {
    var ceu = ctx.createLinearGradient(0, 0, 0, A);
    ceu.addColorStop(0, AZUL_ESCURO);
    ceu.addColorStop(1, AZUL);
    ctx.fillStyle = ceu;
    ctx.fillRect(0, 0, L, A);

    /* caixas ao fundo, em paralaxe lenta */
    ctx.fillStyle = 'rgba(255,255,255,.06)';
    for (var i = 0; i < 7; i++) {
      var bx = ((i * 190 - chaoDeslize * 0.28) % (L + 190)) - 95;
      var bh = 34 + (i % 3) * 22;
      ctx.fillRect(bx, CHAO - bh, 74, bh);
    }

    ctx.fillStyle = VERDE;
    ctx.fillRect(0, CHAO, L, A - CHAO);

    ctx.strokeStyle = 'rgba(255,255,255,.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (var j = -1; j < 14; j++) {
      var lx = j * 72 - (chaoDeslize % 72);
      ctx.moveTo(lx, CHAO + 14);
      ctx.lineTo(lx + 26, CHAO + 14);
    }
    ctx.stroke();
  }

  /* ---------- Jogo ---------- */

  function reinicia() {
    heroi = { x: 96, y: CHAO - 52, w: 38, h: 52, vy: 0, noChao: true, pulos: 0 };
    obstaculos = [];
    itens = [];
    chaoDeslize = 0;
    velocidade = 5.4;
    pontos = 0;
    distancia = 0;
    piscar = 0;
    bonus = 0;
  }

  function pula() {
    if (estado === 'parado' || estado === 'fim') { comeca(); return; }
    if (heroi.pulos < 2) {
      heroi.vy = IMPULSO * (heroi.pulos === 0 ? 1 : 0.82);
      heroi.pulos++;
      heroi.noChao = false;
    }
  }

  function nasce() {
    var ultimoX = 0;
    obstaculos.concat(itens).forEach(function (o) { if (o.x > ultimoX) ultimoX = o.x; });
    if (ultimoX > L - 210) return;

    if (Math.random() < 0.62) {
      var eGota = Math.random() < 0.5;
      obstaculos.push(eGota
        ? { tipo: 'gota', x: L + 40, y: CHAO - 16, w: 26, h: 46 }
        : { tipo: 'tesoura', x: L + 40, y: CHAO - 22, w: 40, h: 48 });
    } else {
      itens.push({ x: L + 40, y: CHAO - 96 - Math.random() * 52, w: 24, h: 30, giro: 0 });
    }
  }

  function bateu(a, b) {
    /* margem generosa: o jogo é uma piada no fim da página, não um desafio */
    var m = 7;
    return a.x + m < b.x + b.w && a.x + a.w - m > b.x &&
           a.y + m < b.y + b.h && a.y + a.h - m > b.y;
  }

  function fim() {
    estado = 'fim';
    cancelAnimationFrame(raf);

    var total = Math.floor(pontos);
    if (total > recorde) {
      recorde = total;
      try { localStorage.setItem('zagarollo-recorde', String(recorde)); } catch (e) { /* sem storage, sem recorde */ }
      if (recordeEl) recordeEl.textContent = String(recorde);
    }

    if (botao) botao.textContent = 'Jogar de novo';
    if (aviso) {
      aviso.textContent = 'Fim de jogo. Você fez ' + total + ' ponto' + (total === 1 ? '' : 's') +
        '. O recorde é ' + recorde + '.';
    }
    desenha(true);
  }

  function passo(agora) {
    if (estado !== 'jogando') return;

    var dt = Math.min(2.6, (agora - ultimo) / 16.667);
    ultimo = agora;

    velocidade = Math.min(11.4, velocidade + 0.0022 * dt);
    chaoDeslize += velocidade * dt;
    distancia += velocidade * dt;
    /* Distância rende devagar; a sacola recolhida é que faz o placar andar. */
    pontos = distancia / 24 + bonus;

    heroi.vy += GRAVIDADE * dt;
    heroi.y += heroi.vy * dt;

    if (heroi.y >= CHAO - heroi.h) {
      heroi.y = CHAO - heroi.h;
      heroi.vy = 0;
      heroi.noChao = true;
      heroi.pulos = 0;
    }

    nasce();

    obstaculos = obstaculos.filter(function (o) {
      o.x -= velocidade * dt;
      if (bateu(heroi, o)) { fim(); return false; }
      return o.x > -80;
    });

    if (estado !== 'jogando') return;

    itens = itens.filter(function (o) {
      o.x -= velocidade * dt;
      o.giro += 0.05 * dt;
      if (bateu(heroi, o)) { bonus += 12; piscar = 12; return false; }
      return o.x > -80;
    });

    if (piscar > 0) piscar -= dt;
    if (placar) placar.textContent = String(Math.floor(pontos));

    desenha(false);
    raf = requestAnimationFrame(passo);
  }

  function desenha(acabou) {
    cenario();

    itens.forEach(function (o) {
      ctx.save();
      ctx.translate(o.x + o.w / 2, o.y + o.h / 2 + Math.sin(o.giro) * 4);
      sacola(-o.w / 2, -o.h / 2, o.w, o.h, VERDE_CLARO, '#5fae86');
      ctx.restore();
    });

    obstaculos.forEach(function (o) {
      if (o.tipo === 'gota') gota(o.x + o.w / 2, o.y + o.h * 0.55, 13);
      else tesoura(o.x + o.w / 2, o.y + o.h * 0.5, 24);
    });

    ctx.save();
    if (piscar > 0 && Math.floor(piscar / 3) % 2 === 0) ctx.globalAlpha = 0.55;
    if (acabou) {
      ctx.translate(heroi.x + heroi.w / 2, heroi.y + heroi.h / 2);
      ctx.rotate(-0.32);
      sacola(-heroi.w / 2, -heroi.h / 2, heroi.w, heroi.h, KRAFT, KRAFT_ESCURO);
    } else {
      sacola(heroi.x, heroi.y, heroi.w, heroi.h, KRAFT, KRAFT_ESCURO);
    }
    ctx.restore();

    ctx.fillStyle = BRANCO;
    ctx.font = '700 22px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(String(Math.floor(pontos)), L - 22, 40);

    if (acabou) {
      ctx.fillStyle = 'rgba(35,56,107,.82)';
      ctx.fillRect(0, 0, L, A);
      ctx.fillStyle = BRANCO;
      ctx.textAlign = 'center';
      ctx.font = '700 34px "Segoe UI", system-ui, sans-serif';
      ctx.fillText('A sacola não sobreviveu.', L / 2, A / 2 - 12);
      ctx.font = '400 19px "Segoe UI", system-ui, sans-serif';
      ctx.fillStyle = VERDE_CLARO;
      ctx.fillText(Math.floor(pontos) + ' pontos · recorde ' + recorde, L / 2, A / 2 + 24);
    }

    ctx.textAlign = 'left';
  }

  function comeca() {
    reinicia();
    estado = 'jogando';
    ultimo = performance.now();
    if (botao) botao.textContent = 'Recomeçar';
    if (aviso) aviso.textContent = 'Jogo em andamento. Espaço ou seta para cima para pular.';
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(passo);
  }

  function pausa() {
    if (estado !== 'jogando') return;
    estado = 'fim';
    cancelAnimationFrame(raf);
    if (botao) botao.textContent = 'Continuar';
    if (aviso) aviso.textContent = 'Jogo pausado.';
  }

  /* ---------- Controles ---------- */

  if (botao) botao.addEventListener('click', function () { comeca(); });

  tela.addEventListener('pointerdown', function (e) {
    tela.focus();
    if (estado === 'jogando') { e.preventDefault(); pula(); }
    else comeca();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key !== ' ' && e.key !== 'ArrowUp' && e.key !== 'Spacebar') return;
    /* Só sequestra a barra de espaço quando o jogo tem o foco — senão quebra
       a rolagem da página inteira. */
    var dentro = document.activeElement === tela || document.activeElement === botao;
    if (!dentro) return;
    e.preventDefault();
    if (estado === 'jogando') pula();
    else comeca();
  });

  tela.addEventListener('blur', pausa);
  document.addEventListener('visibilitychange', function () { if (document.hidden) pausa(); });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entradas) {
      if (!entradas[0].isIntersecting) pausa();
    }, { threshold: 0.15 }).observe(tela);
  }

  /* ---------- Tamanho ---------- */

  function dimensiona() {
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var largura = tela.clientWidth || L;
    tela.width = Math.round(largura * dpr);
    tela.height = Math.round(largura * (A / L) * dpr);
    ctx.setTransform((largura * dpr) / L, 0, 0, (largura * dpr) / L, 0, 0);
    if (estado !== 'jogando') { reinicia(); desenha(false); }
  }

  var espera;
  window.addEventListener('resize', function () {
    clearTimeout(espera);
    espera = setTimeout(dimensiona, 160);
  }, { passive: true });

  reinicia();
  dimensiona();
})();
