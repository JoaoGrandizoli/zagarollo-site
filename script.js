/* Zagarollo Embalagens — comportamento do site.
   Sem dependências. Tudo aqui é progressivo: o conteúdo já vem no HTML e o
   JavaScript só acrescenta menu, filtros, entrada por scroll e o formulário. */

(function () {
  'use strict';

  /* O <head> esconde os elementos com .revela e arma um temporizador de
     segurança. Chegar aqui prova que este arquivo carregou — desarma. */
  clearTimeout(window.__revelaFailsafe);

  var EMAIL_COMERCIAL = 'telemarketing@zagarollo.com.br';
  var semMovimento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function texto(el, valor) { if (el) el.textContent = valor; }

  /* ---------- Menu no celular ---------- */

  var botaoMenu = document.querySelector('.menu-botao');
  var menu = document.getElementById('menu');

  if (botaoMenu && menu) {
    /* Com o menu aberto o painel cobre a página. Marcar o resto como inert
       impede que o Tab leve o foco para trás dele — que é invisível ali. */
    var FORA = ['main', '.rodape', '.topo', '.zap'];

    var aberto = function () { return menu.getAttribute('data-aberto') === 'true'; };

    function alterna(novo, devolverFoco) {
      menu.setAttribute('data-aberto', String(novo));
      botaoMenu.setAttribute('aria-expanded', String(novo));
      botaoMenu.setAttribute('aria-label', novo ? 'Fechar menu' : 'Abrir menu');

      FORA.forEach(function (sel) {
        var el = document.querySelector(sel);
        if (!el) return;
        if (novo) el.setAttribute('inert', '');
        else el.removeAttribute('inert');
      });

      if (!novo && devolverFoco) botaoMenu.focus();
    }

    botaoMenu.addEventListener('click', function () { alterna(!aberto(), false); });

    menu.addEventListener('click', function (evento) {
      if (evento.target.closest('a')) alterna(false, false);
    });

    document.addEventListener('keydown', function (evento) {
      if (evento.key === 'Escape' && aberto()) alterna(false, true);
    });

    document.addEventListener('click', function (evento) {
      if (!aberto()) return;
      if (menu.contains(evento.target) || botaoMenu.contains(evento.target)) return;
      alterna(false, false);
    });

    /* Ao voltar para a largura de desktop o painel some por CSS; o estado
       precisa acompanhar, senão o `inert` fica grudado numa página visível. */
    var largura = window.matchMedia('(min-width: 901px)');
    var aoTrocar = function (e) { if (e.matches && aberto()) alterna(false, false); };
    if (largura.addEventListener) largura.addEventListener('change', aoTrocar);
  }

  /* ---------- Ano no rodapé ---------- */

  texto(document.getElementById('ano'), String(new Date().getFullYear()));

  /* ---------- Formulário de orçamento ----------
     Sem backend: monta um e-mail já preenchido para o comercial. */

  var formulario = document.getElementById('form-orcamento');

  if (formulario) {
    formulario.addEventListener('submit', function (evento) {
      evento.preventDefault();

      var dados = new FormData(formulario);
      var v = function (campo) { return (dados.get(campo) || '').toString().trim(); };

      var linhas = [
        'Nome: ' + v('nome'),
        'Empresa: ' + (v('empresa') || '—'),
        'E-mail: ' + v('email'),
        'Telefone: ' + (v('telefone') || '—'),
        'Cidade: ' + (v('cidade') || '—'),
        'Produto: ' + (v('produto') || '—'),
        'Quantidade estimada: ' + (v('quantidade') || '—'),
        '',
        'Para que serve a embalagem:',
        v('mensagem') || '—',
        '',
        '— enviado pelo site zagarollo.com.br'
      ];

      var assunto = 'Pedido de orçamento — ' + (v('produto') || 'embalagens') + ' — ' + v('nome');

      /* Se não houver cliente de e-mail registrado, atribuir location.href a um
         mailto: não faz nada e não lança erro. O aviso abaixo é o que impede o
         visitante de sair achando que enviou. */
      texto(document.getElementById('form-status'),
        'Abrindo o seu programa de e-mail com o pedido preenchido. Se nada abrir, ' +
        'escreva para ' + EMAIL_COMERCIAL + ' ou ligue 19 3583-1743.');

      var nota = document.getElementById('nota-envio');
      if (nota) nota.classList.add('formulario-nota--ativa');

      /* \r\n, e não \n: a RFC 6068 pede CRLF e o Outlook colapsa as quebras sem ele. */
      window.location.href = 'mailto:' + EMAIL_COMERCIAL +
        '?subject=' + encodeURIComponent(assunto) +
        '&body=' + encodeURIComponent(linhas.join('\r\n'));
    });

    /* Pré-seleciona o assunto quando a pessoa chega de /representantes. */
    if (/[?&]assunto=representacao/.test(window.location.search)) {
      var seletor = document.getElementById('produto');
      if (seletor) {
        for (var i = 0; i < seletor.options.length; i++) {
          if (/representante/i.test(seletor.options[i].text)) { seletor.selectedIndex = i; break; }
        }
      }
    }
  }

  /* ---------- Entrada por scroll ---------- */

  var reveláveis = document.querySelectorAll('.revela');

  if (reveláveis.length) {
    if (semMovimento || !('IntersectionObserver' in window)) {
      Array.prototype.forEach.call(reveláveis, function (el) {
        el.classList.add('revela--visivel');
      });
    } else {
      Array.prototype.forEach.call(reveláveis, function (el) {
        var irmaos = el.parentElement
          ? Array.prototype.filter.call(el.parentElement.children, function (f) {
              return f.classList.contains('revela');
            })
          : [el];
        var i = irmaos.indexOf(el);
        if (i > 0) el.style.setProperty('--atraso', (i * 0.09).toFixed(2) + 's');
      });

      var observador = new IntersectionObserver(function (entradas) {
        entradas.forEach(function (entrada) {
          if (!entrada.isIntersecting) return;
          entrada.target.classList.add('revela--visivel');
          observador.unobserve(entrada.target);
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });

      Array.prototype.forEach.call(reveláveis, function (el) { observador.observe(el); });
    }
  }

  /* ---------- Filtro do catálogo ----------
     Os 29 produtos já vêm no HTML, renderizados na compilação. Aqui só
     escondemos o que não bate com o filtro. */

  var catalogo = document.getElementById('catalogo');

  if (catalogo) {
    var itens = Array.prototype.slice.call(catalogo.querySelectorAll('.produto'));
    var filtros = Array.prototype.slice.call(document.querySelectorAll('.filtro'));
    var vazio = document.getElementById('catalogo-vazio');
    var status = document.getElementById('catalogo-status');

    var combina = function (item, filtro) {
      if (filtro === 'todos') return true;
      if (item.getAttribute('data-familia') === filtro) return true;
      return (item.getAttribute('data-tags') || '').split(' ').indexOf(filtro) !== -1;
    };

    var conta = function (filtro) {
      return itens.filter(function (it) { return combina(it, filtro); }).length;
    };

    function aplicar(filtro, anunciar) {
      var visiveis = 0;
      itens.forEach(function (item) {
        var mostra = combina(item, filtro);
        item.hidden = !mostra;
        if (mostra) visiveis++;
      });

      if (vazio) vazio.hidden = visiveis > 0;

      if (anunciar) {
        var botao = document.querySelector('.filtro[data-filtro="' + filtro + '"]');
        var rotulo = botao ? botao.textContent.replace(/\(\d+\)/, '').trim() : filtro;
        texto(status, visiveis + (visiveis === 1 ? ' modelo' : ' modelos') + ' em ' + rotulo + '.');
      }
    }

    filtros.forEach(function (botao) {
      var chave = botao.getAttribute('data-filtro');
      var alvo = botao.querySelector('[data-contagem]');
      if (alvo) texto(alvo, '(' + conta(chave) + ')');

      botao.addEventListener('click', function () {
        filtros.forEach(function (outro) {
          outro.setAttribute('aria-pressed', String(outro === botao));
        });
        aplicar(chave, true);
      });
    });

    /* Âncoras vindas da home: /produtos#caixas, #sacolas, #transporte */
    var ancora = window.location.hash.replace('#', '');
    var inicial = filtros.some(function (b) { return b.getAttribute('data-filtro') === ancora; })
      ? ancora : 'todos';

    filtros.forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-filtro') === inicial));
    });

    /* No carregamento não se anuncia: despejar 29 produtos num leitor de tela
       sem ninguém ter pedido é o pior comportamento possível ao abrir a página. */
    aplicar(inicial, false);
  }

  /* ---------- Filtro de representantes por estado ---------- */

  var seletorUf = document.getElementById('uf');
  var painelReps = document.getElementById('representantes');

  if (seletorUf && painelReps) {
    var blocos = Array.prototype.slice.call(painelReps.querySelectorAll('.uf'));
    var statusUf = document.getElementById('uf-status');

    function filtrarUf(sigla, anunciar) {
      var visiveis = 0, nome = 'todos os estados';
      blocos.forEach(function (bloco) {
        var mostra = sigla === 'todos' || bloco.getAttribute('data-uf') === sigla;
        bloco.hidden = !mostra;
        if (mostra) visiveis += bloco.querySelectorAll('.rep').length;
      });

      if (sigla !== 'todos') {
        var opt = seletorUf.querySelector('option[value="' + sigla + '"]');
        if (opt) nome = opt.textContent;
      }

      if (anunciar) {
        texto(statusUf, visiveis + (visiveis === 1 ? ' representante' : ' representantes') + ' em ' + nome + '.');
      }
    }

    seletorUf.addEventListener('change', function () { filtrarUf(seletorUf.value, true); });

    /* Chegou por /representantes#SP: já abre no estado certo. */
    var uf = window.location.hash.replace('#', '').toUpperCase();
    if (uf && seletorUf.querySelector('option[value="' + uf + '"]')) {
      seletorUf.value = uf;
      filtrarUf(uf, false);
    }
  }
})();
