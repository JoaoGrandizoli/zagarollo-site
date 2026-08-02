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

- `estilo.css` — folha única. Paleta em variáveis CSS no topo do arquivo (`--azul`, `--verde`).
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

Lighthouse em emulação de celular com rede 4G lenta, nas cinco páginas públicas:
**100 em desempenho, 100 em acessibilidade e 100 em boas práticas**. LCP entre
0,9 s e 1,1 s, bloqueio da thread principal em 0 ms, nenhum deslocamento de layout.

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
- **Nenhuma fonte é baixada.** A tipografia usa a pilha do sistema.
- **A montagem do canvas espera o navegador ficar ocioso** e rasteriza a meia resolução.
  Feita de forma síncrona no carregamento, ela sozinha travava a thread por 360 ms.

### Reprocessar imagens

As imagens em `imagens/` já estão no tamanho de exibição e em WebP. Se trocar alguma,
redimensione para ~2x o tamanho em que ela aparece na tela e converta — por exemplo com
[`sharp`](https://sharp.pixelplumbing.com/) ou `cwebp`. Duas exceções ficam fora do WebP
de propósito: `logo-96.png` (favicon — nem todo navegador aceita WebP aí) e `og.jpg`
(compartilhamento em rede social, 1200x630; nem todo raspador lê WebP).

## Paleta

Extraída do próprio logo da empresa:

| Cor | Hex |
| --- | --- |
| Azul royal | `#2f4b8f` |
| Azul escuro | `#23386b` |
| Verde | `#00874a` |
| Verde claro | `#8fd0ae` |

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
