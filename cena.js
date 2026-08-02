/* Zagarollo — coreografia de scroll da página inicial.
 *
 * Um único laço de requestAnimationFrame lê a posição da rolagem e escreve
 * propriedades CSS (--p, --escala, ...). Quem anima é o CSS; o JavaScript só
 * publica o número. Nada aqui lê layout dentro do laço além de um
 * getBoundingClientRect por cena, e as cenas são poucas.
 *
 * Tudo desliga sob prefers-reduced-motion: o conteúdo fica visível e estático,
 * e o laço nem chega a começar.
 */

(function () {
  'use strict';

  var semMovimento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var barra = document.getElementById('progresso');
  var capa = document.querySelector('.capa');
  var cenas = Array.prototype.slice.call(document.querySelectorAll('[data-cena]'));
  var contadores = Array.prototype.slice.call(document.querySelectorAll('[data-conta]'));

  /* ---------- Tipografia cinética ----------
     Cada letra vira um <span> com o próprio atraso. Feito antes de tudo para
     que o reveal já encontre a manchete fatiada. */

  Array.prototype.forEach.call(document.querySelectorAll('[data-letras]'), function (el) {
    if (semMovimento) return;

    var texto = el.textContent;
    el.textContent = '';
    el.setAttribute('aria-label', texto);

    texto.split('').forEach(function (ch, i) {
      var span = document.createElement('span');
      span.className = 'letra';
      span.setAttribute('aria-hidden', 'true');
      span.textContent = ch === ' ' ? ' ' : ch;
      span.style.setProperty('--i', String(i));
      el.appendChild(span);
    });
  });

  /* ---------- Contadores ----------
     Sobem até o valor final quando entram na tela. O valor já está no HTML,
     então sem JavaScript o número aparece pronto. */

  if (contadores.length && 'IntersectionObserver' in window) {
    var obsConta = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (entrada) {
        if (!entrada.isIntersecting) return;
        obsConta.unobserve(entrada.target);

        var el = entrada.target;
        var alvo = parseInt(el.getAttribute('data-conta'), 10);
        if (isNaN(alvo) || semMovimento) return;

        var inicio = performance.now();
        var dur = 1100;

        (function passo(agora) {
          var k = Math.min(1, (agora - inicio) / dur);
          var suave = 1 - Math.pow(1 - k, 3);
          el.textContent = String(Math.round(alvo * suave));
          if (k < 1) requestAnimationFrame(passo);
          else el.textContent = String(alvo);
        })(inicio);
      });
    }, { threshold: 0.6 });

    contadores.forEach(function (el) { obsConta.observe(el); });
  }

  /* ---------- Botões magnéticos ----------
     Só em ponteiro fino: no toque não existe hover e o deslocamento atrapalha. */

  if (!semMovimento && !window.matchMedia('(pointer: coarse)').matches) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-imã]'), function (el) {
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect();
        el.style.setProperty('--mx', ((e.clientX - (r.left + r.width / 2)) * 0.28).toFixed(1) + 'px');
        el.style.setProperty('--my', ((e.clientY - (r.top + r.height / 2)) * 0.28).toFixed(1) + 'px');
      });
      el.addEventListener('pointerleave', function () {
        el.style.setProperty('--mx', '0px');
        el.style.setProperty('--my', '0px');
      });
    });
  }

  if (semMovimento) return;

  /* ---------- O laço ---------- */

  var alvos = cenas.map(function (el) {
    return {
      el: el, p: 0, suave: 0, etapa: -1,
      etapas: parseInt(el.getAttribute('data-etapas'), 10) || 0,
      trilha: el.querySelector('[data-trilha]')
    };
  });

  /* O curso da faixa horizontal é a diferença entre a largura da fita e a da
     janela. Medido aqui e guardado numa propriedade: dentro do laço não se lê
     layout de elemento que muda de tamanho. */
  function medeTrilhas() {
    alvos.forEach(function (c) {
      if (!c.trilha) return;
      var curso = Math.max(0, c.trilha.scrollWidth - window.innerWidth + 48);
      c.el.style.setProperty('--curso', curso.toFixed(0) + 'px');
    });
  }
  var pendente = false;
  var rodando = true;

  function limita(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  function medir() {
    pendente = false;
    if (!rodando) return;

    var altura = window.innerHeight;

    /* Barra de progresso de leitura. */
    if (barra) {
      var total = document.documentElement.scrollHeight - altura;
      barra.style.setProperty('--lido', total > 0 ? (window.scrollY / total).toFixed(4) : '0');
    }

    /* A manchete da capa afunda, apaga e encolhe ao sair. */
    if (capa) {
      var k = limita(window.scrollY / (altura * 0.85));
      capa.style.setProperty('--saida', k.toFixed(4));
    }

    /* Cada cena fixada publica o próprio progresso de 0 a 1, amortecido para
       o movimento não ficar preso ao passo do dedo. */
    alvos.forEach(function (c) {
      var r = c.el.getBoundingClientRect();
      var curso = r.height - altura;
      c.p = curso > 0 ? limita(-r.top / curso) : (r.top < altura ? 1 : 0);
      c.suave += (c.p - c.suave) * 0.16;
      if (Math.abs(c.p - c.suave) < 0.0004) c.suave = c.p;
      c.el.style.setProperty('--p', c.suave.toFixed(4));

      /* Cena por etapas: em vez de interpolar, troca de trecho. É o que faz
         as linhas do manifesto entrarem uma de cada vez conforme se rola. */
      if (c.etapas) {
        var i = Math.min(c.etapas - 1, Math.floor(c.suave * c.etapas * 1.06));
        if (i !== c.etapa) { c.etapa = i; c.el.setAttribute('data-etapa', String(i)); }
      }
    });

    /* Continua enquanto alguma cena ainda estiver alcançando o alvo. */
    if (alvos.some(function (c) { return c.p !== c.suave; })) agenda();
  }

  function agenda() {
    if (pendente || !rodando) return;
    pendente = true;
    requestAnimationFrame(medir);
  }

  window.addEventListener('scroll', agenda, { passive: true });
  window.addEventListener('resize', function () { medeTrilhas(); agenda(); }, { passive: true });

  /* As miniaturas da faixa entram com lazy loading: a largura só é definitiva
     depois que elas chegam. */
  window.addEventListener('load', function () { medeTrilhas(); agenda(); });

  medeTrilhas();

  document.addEventListener('visibilitychange', function () {
    rodando = !document.hidden;
    if (rodando) agenda();
  });

  medir();
})();
