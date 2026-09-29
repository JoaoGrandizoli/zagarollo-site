# Zagarollo Embalagens — site

Site institucional de duas páginas da Zagarollo Embalagens (Descalvado-SP), fabricante
de caixas flexíveis e sacolas de papel desde 2002.

## Conceito

O eixo da comunicação é o que uma embalagem realmente faz: **presentear, levar e guardar**.
Daí a frase da capa — *"O que importa vai dentro."* A embalagem é sempre a primeira coisa
que a pessoa toca antes de chegar no que está dentro dela.

## Páginas

| Rota | Conteúdo |
| --- | --- |
| `/` | Capa com a animação, os três usos da embalagem, as três famílias, a empresa e o manifesto |
| `/produtos` | Os 29 modelos com foto e a tabela de medidas de cada referência (192 no total) |
| `/personalizacao` | As 6 famílias de acabamento das caixas e as 11 cores das sacolas |
| `/representantes` | 61 representantes em 27 estados, com filtro por UF |
| `/empresa` | Quem somos, missão, visão e valores |
| `/contato` | Telefones, endereço, link do mapa e pedido de orçamento |
| `/404` | Página de erro com os caminhos do site |

Cada rota é um fragmento em `paginas/`, com um cabeçalho JSON no topo, montado
sobre `modelo.html` na compilação. O cabeçalho e o rodapé existem uma vez só.

## De onde vem o conteúdo

Tudo o que o site afirma sobre a empresa vem do material publicado por ela.
Duas fontes viraram dados estruturados em `dados/`:

- **`produtos.json`** — as medidas dos 29 modelos foram **transcritas das fichas
  técnicas** que a fábrica publica em `zagarollo.com.br/imagens/caixas-flexiveis/`.
  Elas existiam só dentro de imagens, ilegíveis para busca e para leitor de tela.
  Nenhuma medida é estimada.
- **`representantes.json`** — a lista de `/representantes` do site original.

⚠️ **Ao escrever qualquer texto novo:** se a frase afirma um fato sobre a
empresa (material, certificação, processo, história), ela precisa ter fonte no
material da própria Zagarollo. Uma versão anterior deste site trazia "100% papel
reciclável" e "papel próprio para alimento" — as duas inventadas, a segunda é
afirmação regulatória. Na dúvida, escreva a pergunta em vez da afirmação.

## A coreografia da página inicial

Só a **home** carrega `cena.js` e `jogo.js` — as outras cinco páginas não pagam por
isso. O sinalizador está no cabeçalho JSON de `paginas/inicio.html` (`"cena": true`,
`"jogo": true`) e o `build.mjs` injeta as tags correspondentes.

`cena.js` é um único laço de `requestAnimationFrame` que lê a rolagem e escreve
propriedades CSS (`--p`, `--saida`, `--lido`). **Quem anima é o CSS**; o JavaScript só
publica o número. Dentro do laço não se lê layout de nada que mude de tamanho — a
largura da faixa horizontal é medida fora dele, no `load` e no `resize`.

O que ele dirige:

| Efeito | Como |
| --- | --- |
| Barra de progresso de leitura | `--lido` → `scaleX` |
| A manchete afunda e apaga ao sair | `--saida` no `.capa` |
| Faixa horizontal do catálogo | cena fixada de 320vh; `--p` → `translateX` da fita |
| Manifesto linha a linha | `data-etapa` no elemento; o CSS revela por `:nth-child` |
| Tipografia cinética | cada letra vira `<span>` com `--i`, atraso escalonado |
| Contadores e botões magnéticos | `IntersectionObserver` e `pointermove` |

Sob `prefers-reduced-motion` o laço **nem começa**: as cenas fixadas viram seções
normais empilhadas e tudo fica legível e estático.

## O campo em 3D

`campo3d.js` conta, com pontos de luz, a ideia que o site inteiro defende: **a caixa é o
caminho, o que importa vai dentro.** São 150 mil pontos no computador e 56 mil em tela
estreita.

| Onde | O que os pontos formam |
| --- | --- |
| Capa | Uma história em 25 quadros, conduzida pela rolagem: a poeira vira a folha plana, a folha **dobra de verdade** e vira caixa, algo entra nela, a tampa fecha, a caixa sobe no caminhão, o caminhão pega a estrada, chega a uma casa, a caixa passa de mão em mão, a pessoa abre e de dentro sai um coração. |
| Manifesto | Cada linha ganha a sua forma, à direita do texto: o anel na caixinha, o bolo, a sacolinha com o balão, a carta saindo da caixa e, no fecho, o coração sobre a caixa aberta. |

**A capa em modo história.** Quando o 3D sobe, a capa recebe `data-campo="historia"`,
cresce para `24 × 38vh + 100svh` e o conteúdo fica preso à tela (`.capa-fixa`). A
manchete some no primeiro quadro e seis legendas (`.historia-passo`, com `data-de` e
`data-ate` em quadros) se revezam. O botão "Ver o caminho da caixa" (`data-ver`) rola a
página sozinha em 34 s; qualquer gesto devolve o controle. "Pular a história" leva aos
números. Sem o 3D nada disso existe: a capa é a de sempre, com o campo 2D.

As legendas foram escritas para a história. Nenhuma afirma fato novo sobre a empresa:
reaproveitam frases do manifesto ("Papel, cola e corte…", "o presente que alguém abre")
e o resto é o argumento, não dado. O caminhão não leva marca nem nome.

**Como a história é montada.**

- *Elenco, não morfismo.* Cada ponto pertence a um objeto só (caixa, coração, caminhão,
  portas, rodas, farol, estrada, beira, relevo, lua, casa, as duas pessoas, poeira) do
  começo ao fim. Um quadro diz o estado de cada objeto; o que está fora de cena vira
  poeira ao longe. Por isso a caixa que sai da folha é a mesma que chega na mão.
- *Os quadros herdam.* Em `QUADROS`, cada `quadro({...})` copia o anterior e declara só
  o que muda; `null` tira o objeto de cena. Rotações andam de 30° em 30° para o caminho
  entre dois quadros ser um arco e não uma reta.
- *A dobra sai do ângulo.* Cada ponto sabe em que face da planificação mora; a posição
  vem do ângulo de dobra e do ângulo da tampa.
- *O coração fica escondido.* Dentro da caixa ele é só um brilho; ganha forma quando a
  tampa abre.
- *O que se mexe sozinho* (estrada correndo, rodas girando, coração batendo) é resolvido
  no shader por um atributo fixo de cada ponto — não há textura nova por quadro.
- *A câmera passa pelos quadros numa curva só* (Catmull-Rom) e a ação fica ao lado do
  texto por deslocamento de quadro (`setViewOffset`), sem distorcer a perspectiva.
- *A câmera se ajusta ao formato da tela.* Quanto mais estreita, mais ela recua para a
  cena caber na largura. Na tela em pé, `pe` em cada quadro afina: o caminhão pede mais
  recuo, o fecho sobe para o texto caber embaixo.

**Como entra na página.** O campo 2D (`campo.js`) continua sendo o que carrega com a
página. Depois que ela está pronta e o navegador fica ocioso, `campo.js` pede o arquivo
do 3D (155 kB no fio), no computador e no celular. O 3D sobe em fatias de ~10 ms e monta
os quadros um a um, nas folgas do navegador: num celular mediano a conta passa de um
segundo, e feita de uma vez travaria a rolagem. A história só toma a capa se a pessoa
ainda estiver no topo da página, sem âncora no endereço e com pelo menos 480 px de
altura de tela (celular deitado não tem espaço para cena e legenda); senão o 3D fica só
com o manifesto. Se o 3D não carregar ou falhar, nada muda: o 2D segue no ar.

Não pede o 3D quem tem `prefers-reduced-motion`, economia de dados, menos de 4 GB de
memória, menos de 4 núcleos ou navegador sem WebGL2.

**Decisões que valem explicação.**

- *Sem cor própria.* A luz sai das variáveis do `estilo.css` (`--branco`,
  `--verde-claro`, `--kraft`, `--azul-claro`). Vinco é branco e forte, miolo é verde e
  ralo: a mesma regra do campo 2D.
- *O canvas desenha sobre preto e soma luz* (`mix-blend-mode: screen` no invólucro
  `.campo3d`). A mistura fica no invólucro, junto com a opacidade: num filho, qualquer
  ancestral que crie contexto de empilhamento a anularia e apareceria um retângulo
  preto. Os palcos fixos (`.capa-fixa`, `.cena-fixa` do manifesto) têm fundo próprio
  pelo mesmo motivo.
- *É o único arquivo empacotado.* Importa a three.js (MIT, aviso de licença mantido no
  fim do arquivo) e sai com ~600 kB minificado. Não entra em nenhuma tag `<script>`: o
  build carimba o nome com hash no atributo `data-src` de `.capa-campo`.
- *A política de segurança não mudou.* O arquivo é servido pelo próprio site
  (`script-src 'self'`), não usa `eval` e só mexe em estilo por JavaScript.

No manifesto o 3D só aparece acima de 900 px de largura; abaixo disso o texto ocupa a
tela inteira.

**Verificação.** `window.__campo3d.historia(quadro)` e
`window.__campo3d.manifesto(posicao)` forçam um estado e desenham na hora — aba em
segundo plano congela o laço. `solta()` devolve o controle à rolagem, `custo()` mede o
tempo de um quadro, `resumo(quadro, objeto)` diz onde um objeto está, `tempos` guarda
quanto levou cada etapa da subida.

## O jogo

`jogo.js` — "Corre, Sacola": um corredor lateral curto no fim da home. Você é uma
sacola de papel, recolhe sacolinhas verdes e desvia de **gota d'água e tesoura**, que
são o que de fato estraga papel.

Duas decisões que importam para o desempenho: **nada é imagem** (tudo é desenhado com
formas no canvas, zero byte de asset) e **nada roda até o clique em Jogar** — o
carregamento da página não paga pelo jogo. Ele pausa sozinho ao sair da tela, ao perder
o foco e ao trocar de aba. O recorde fica em `localStorage`.

Operável por teclado: o canvas é focável e espaço ou seta para cima pulam. A barra de
espaço só é capturada quando o jogo tem o foco — senão quebraria a rolagem da página.

## A animação da capa

O visual da capa não é uma foto: é uma malha de pontos ligados por linhas que **morfa
entre quatro formas** — a planificação (a folha cortada e vincada), a caixa montada, a
sacola e, por dois segundos no fim do ciclo, um coração, que se desmancha antes de virar
declaração. É o argumento do site em movimento, e é literal do produto: caixa flexível é
exatamente isso, uma folha plana que vira caixa.

Como funciona (`campo.js`, canvas 2D puro, sem biblioteca):

1. Cada forma é **rasterizada** num canvas fora da tela em dois canais: vermelho marca a
   área da peça, verde marca os vincos (linhas de dobra e arestas das faces).
2. Os pontos são amostrados lendo esses pixels. Quem cai em cima de verde vira "vinco" e
   é desenhado forte — sem isso o cubo lia como um hexágono cheio.
3. Os pontos de cada forma são **ordenados por ângulo** em volta do centro, o que faz uma
   forma virar a outra sem os pontos se cruzarem em nó.
4. O scroll dissolve o campo com uma frente de onda gaussiana; o ponteiro do mouse
   empurra as partículas.

Para trocar as formas, edite as funções de desenho no topo de `campo.js` (coordenadas
normalizadas de 0 a 1) e o `ROTEIRO`, que diz de qual forma para qual e quando.

## Stack

HTML, CSS e JavaScript puros — sem framework. O único passo de build é minificação.

- `estilo.css` — folha única. Paleta, fontes, grão do papel e traço de faca em variáveis CSS
  no topo do arquivo (ver "Visual").
- `fontes/` — a fonte dos títulos, servida pelo próprio site, com a licença ao lado.
- `script.js` — menu no celular, formulário de orçamento, catálogo filtrável e entradas por scroll.
- `campo.js` — a animação da capa.
- `build.mjs` — minifica com esbuild, carimba o hash do conteúdo no nome do arquivo e
  reescreve as referências no HTML. Falha se sobrar link para arquivo não publicado.
- `staticwebapp.config.json` — rotas, cabeçalhos de segurança e cache do Azure Static Web Apps.

### Por que o hash no nome do arquivo

Com o hash embutido (`estilo.1b95af24.css`), os assets são servidos com
`Cache-Control: immutable` — o navegador nunca revalida. Uma publicação nova muda o
conteúdo, muda o hash, muda o nome: nunca há risco de servir versão velha. O HTML fica
com `max-age=0, must-revalidate`, porque é ele que aponta para os nomes novos.

### CSP por hash, não por `unsafe-inline`

Há um `<script>` inline de uma linha no `<head>` que marca `<html class="js">` antes da
primeira pintura — é o que evita as entradas por scroll piscarem. Em vez de liberar todo
script inline, a CSP libera **só o hash SHA-256 daquele script**. Se você mexer nele,
recalcule o hash e atualize `staticwebapp.config.json`:

```bash
python3 -c "import hashlib,base64; s=\"document.documentElement.classList.add('js');\"; print('sha256-'+base64.b64encode(hashlib.sha256(s.encode()).digest()).decode())"
```

## Desempenho

> Os números abaixo foram medidos ANTES do campo 3D, da história da capa e da fonte dos
> títulos. Não foram medidos de novo depois dessas mudanças.

Lighthouse em emulação de celular com rede 4G lenta: **100 em acessibilidade e 100 em
boas práticas em todas as páginas**; desempenho 100 nas internas e **99 na home**, que
carrega as 29 miniaturas da faixa de catálogo. LCP entre 0,9 s e 1,0 s, bloqueio da
thread principal em 0 ms, nenhum deslocamento de layout.

O SEO fica em 69 **de propósito**: a única auditoria que falha é `is-crawlable`,
porque o `robots.txt` bloqueia a indexação enquanto o site não está no domínio
real (ver "Indexação" abaixo). Publicando com `SITE_URL` definido, vai a 100.

### Indexação

`build.mjs` gera um `robots.txt` que **proíbe indexação** sempre que `SITE_URL`
não for `https://www.zagarollo.com.br`. Dois motivos:

1. Um segundo site indexado com o mesmo conteúdo competiria com o oficial.
2. A página de representantes publica nome, celular e e-mail de 61 pessoas.
   Esses dados são públicos no site da empresa; criar uma segunda cópia
   indexável num domínio que a empresa não controla, não.

Para publicar de verdade: `SITE_URL=https://www.zagarollo.com.br npm run build`.

Três decisões carregam a maior parte disso:

- **As imagens são reprocessadas**, não usadas como vieram. O logo original tinha 433 px
  e 137 kB para aparecer a 46 px; agora tem 1,6 kB. O conjunto todo caiu de ~600 kB para
  ~90 kB. Regenerar: veja "Reprocessar imagens" abaixo.
- **Uma fonte é baixada, a dos títulos** (Fraunces, 67 kB; o itálico, 81 kB, só quando
  aparece). Vem do próprio site, com `preload` e `font-display: swap`. O texto corrido
  continua na pilha do sistema.
- **A montagem do canvas espera o navegador ficar ocioso** e rasteriza a meia resolução.
  Feita de forma síncrona no carregamento, ela sozinha travava a thread por 360 ms.

### Reprocessar imagens

As imagens em `imagens/` já estão no tamanho de exibição e em WebP. Se trocar alguma,
redimensione para ~2x o tamanho em que ela aparece na tela e converta — por exemplo com
[`sharp`](https://sharp.pixelplumbing.com/) ou `cwebp`. Duas exceções ficam fora do WebP
de propósito: `logo-96.png` (favicon — nem todo navegador aceita WebP aí) e `og.jpg`
(compartilhamento em rede social, 1200x630; nem todo raspador lê WebP).

## Visual

A casa faz embalagem de papel, e o site parece feito disso: fundo em tom de papel, faixa
de kraft, fio fino no lugar de caixa com sombra. O azul e o verde são os do logo.

| Cor | Variável | Hex | Onde |
| --- | --- | --- | --- |
| Azul royal | `--azul` | `#2f4b8f` | links |
| Azul escuro | `--azul-escuro` | `#23386b` | capa, cenas |
| Azul noite | `--azul-noite` | `#182545` | topo, rodapé, botão sobre kraft |
| Verde | `--verde` | `#00874a` | botão principal |
| Verde claro | `--verde-claro` | `#8fd0ae` | ênfase do título sobre azul |
| Kraft | `--kraft` | `#b98a5a` | fios, molduras |
| Kraft (texto) | `--kraft-texto` | `#855a2e` | sobretítulos sobre papel (5,5:1) |
| Kraft claro | `--kraft-claro` | `#d9b48a` | sobretítulos sobre azul (5,9:1) |
| Kraft folha | `--kraft-folha` | `#c39a6b` | faixa da chamada final |
| Papel | `--papel` | `#f8f5ee` | fundo da página |
| Papel forte | `--papel-forte` | `#f0eadf` | seções alternadas |
| Folha | `--folha` | `#fffdf9` | cartões e formulário |

`--azul-claro`, `--branco`, `--verde-claro` e `--kraft` também são lidas pelo campo 3D:
mudar o valor muda a luz dos pontos.

**Tipografia.** Títulos em Fraunces (serifa variável, SIL Open Font License 1.1 — o texto
da licença está em `fontes/`), peso leve e itálico na ênfase. Texto corrido na fonte do
sistema. Sobretítulos, botões e etiquetas em caixa alta pequena, bem espaçada.

**Três sinais que se repetem.**

- *O fio de kraft* antes de cada sobretítulo (`.selo`, `.capa-selo`).
- *O tracejado é vinco.* Divisórias internas são tracejadas, como a linha de dobra na faca
  de corte; o fio cheio fica para o que separa de verdade.
- *A planificação da caixa* em traço de faca no canto das capas internas (`--faca`): o
  desenho que toda embalagem é antes de ser dobrada, o mesmo que abre a história da home.

**O grão do papel** (`--grao`) é um ruído em SVG embutido na própria folha de estilo. A
política de segurança já aceitava imagem embutida (`img-src 'self' data:`); nada mudou nela.

## Formulário de orçamento

Não há backend. O envio monta um `mailto:` já preenchido para
`telemarketing@zagarollo.com.br`, e cada modelo do catálogo tem um link direto de
WhatsApp com o nome do kit na mensagem.

Para trocar o destino, edite `EMAIL_COMERCIAL` no topo de `script.js`.

> ⚠️ O número de WhatsApp usado nos links (`551935831743`) é o telefone comercial da
> empresa e precisa ser confirmado antes de ir para o ar em domínio próprio.

## Rodar localmente

```bash
npm install
npm run dev     # serve a raiz em http://localhost:8080 (fontes, sem minificar)
npm run build   # gera dist/ como vai para produção
```

Servindo a raiz direto, `/produtos` não resolve (quem reescreve é o Azure) — abra
`produtos.html`.

## Deploy

Hospedado no Azure Static Web Apps. Todo push na `main` roda `npm run build` e publica
`dist/` via GitHub Actions.

| Recurso | Nome |
| --- | --- |
| Static Web App | `stapp-zagarollo-site-prod-cus` |
| Grupo de recursos | `rg-zagarollo-site-prod-cus` (Central US, SKU Free) |

O repositório é público de propósito: em repositório privado o GitHub Actions consome a
cota de minutos da conta, e em público é ilimitado. Nenhum segredo mora no código — o
token de publicação fica nos secrets do repositório.
