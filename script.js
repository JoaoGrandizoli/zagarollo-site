/* Zagarollo Embalagens — comportamento do site.
   Sem dependências externas: menu, ano do rodapé, formulário e catálogo. */

(function () {
  'use strict';

  var EMAIL_COMERCIAL = 'telemarketing@zagarollo.com.br';

  /* ---------- Menu no celular ---------- */

  var botaoMenu = document.querySelector('.menu-botao');
  var menu = document.getElementById('menu');

  if (botaoMenu && menu) {
    botaoMenu.addEventListener('click', function () {
      var aberto = menu.getAttribute('data-aberto') === 'true';
      menu.setAttribute('data-aberto', String(!aberto));
      botaoMenu.setAttribute('aria-expanded', String(!aberto));
    });

    menu.addEventListener('click', function (evento) {
      if (evento.target.tagName === 'A') {
        menu.setAttribute('data-aberto', 'false');
        botaoMenu.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /* ---------- Ano no rodapé ---------- */

  var ano = document.getElementById('ano');
  if (ano) ano.textContent = String(new Date().getFullYear());

  /* ---------- Formulário de orçamento ----------
     Sem backend: monta um e-mail já preenchido para o comercial. */

  var formulario = document.getElementById('form-orcamento');

  if (formulario) {
    formulario.addEventListener('submit', function (evento) {
      evento.preventDefault();

      var dados = new FormData(formulario);
      var valor = function (campo) { return (dados.get(campo) || '').toString().trim(); };

      var linhas = [
        'Nome: ' + valor('nome'),
        'Empresa: ' + (valor('empresa') || '—'),
        'E-mail: ' + valor('email'),
        'Telefone: ' + (valor('telefone') || '—'),
        'Produto: ' + valor('produto'),
        'Quantidade estimada: ' + (valor('quantidade') || '—'),
        '',
        'Para que serve a embalagem:',
        valor('mensagem') || '—',
        '',
        '— enviado pelo site zagarollo.com.br'
      ];

      var assunto = 'Pedido de orçamento — ' + valor('produto') + ' — ' + valor('nome');

      window.location.href = 'mailto:' + EMAIL_COMERCIAL +
        '?subject=' + encodeURIComponent(assunto) +
        '&body=' + encodeURIComponent(linhas.join('\n'));
    });
  }

  /* ---------- Catálogo de produtos ---------- */

  var catalogo = document.getElementById('catalogo');
  var dados = document.getElementById('dados-produtos');
  if (!catalogo || !dados) return;

  var produtos;
  try {
    produtos = JSON.parse(dados.textContent);
  } catch (erro) {
    catalogo.innerHTML = '<p class="vazio">Não foi possível carregar o catálogo. ' +
      'Ligue para 19 3583-1743 e a gente passa a linha completa.</p>';
    return;
  }

  var vazio = document.getElementById('catalogo-vazio');
  var filtros = Array.prototype.slice.call(document.querySelectorAll('.filtro'));

  function combina(produto, filtro) {
    if (filtro === 'todos') return true;
    if (filtro === 'caixa' || filtro === 'sacola') return produto.cat === filtro;
    return produto.tags.indexOf(filtro) !== -1;
  }

  function assuntoDe(produto) {
    return 'https://wa.me/551935831743?text=' +
      encodeURIComponent('Olá! Gostaria de um orçamento do ' + produto.nome + '.');
  }

  function desenhar(filtro) {
    var visiveis = produtos.filter(function (produto) { return combina(produto, filtro); });

    catalogo.innerHTML = visiveis.map(function (produto) {
      var rotulo = produto.cat === 'sacola' ? 'Sacolas' : 'Caixa flexível';
      var classe = produto.cat === 'sacola' ? 'produto-tag produto-tag--sacola' : 'produto-tag';

      return '<article class="produto">' +
        '<span class="' + classe + '">' + rotulo + '</span>' +
        '<h3>' + produto.nome + '</h3>' +
        '<p>' + produto.desc + '</p>' +
        '<a href="' + assuntoDe(produto) + '" target="_blank" rel="noopener">Pedir orçamento deste modelo →</a>' +
        '</article>';
    }).join('');

    if (vazio) vazio.hidden = visiveis.length > 0;
  }

  filtros.forEach(function (botao) {
    botao.addEventListener('click', function () {
      filtros.forEach(function (outro) {
        outro.setAttribute('aria-pressed', String(outro === botao));
      });
      desenhar(botao.getAttribute('data-filtro'));
    });
  });

  /* Contagens nos botões principais */
  var contagens = {
    todos: produtos.length,
    caixa: produtos.filter(function (p) { return p.cat === 'caixa'; }).length,
    sacola: produtos.filter(function (p) { return p.cat === 'sacola'; }).length
  };

  Object.keys(contagens).forEach(function (chave) {
    var alvo = document.querySelector('[data-contagem="' + chave + '"]');
    if (alvo) alvo.textContent = '(' + contagens[chave] + ')';
  });

  /* Âncoras vindas da home: produtos.html#caixas / #sacolas */
  var ancora = window.location.hash.replace('#', '');
  var inicial = (ancora === 'caixas') ? 'caixa' : (ancora === 'sacolas') ? 'sacola' : 'todos';

  filtros.forEach(function (botao) {
    botao.setAttribute('aria-pressed', String(botao.getAttribute('data-filtro') === inicial));
  });

  desenhar(inicial);
})();
