/* Build do site.
 *
 * Monta cada página a partir de `modelo.html` + um fragmento em `paginas/`,
 * renderiza no HTML final tudo que vem de `dados/` (catálogo e representantes),
 * minifica CSS e JS e carimba o hash do conteúdo no nome do arquivo.
 *
 * Duas decisões que valem explicação:
 *
 * 1. O catálogo e a lista de representantes são renderizados AQUI, não no
 *    navegador. O JavaScript só filtra o que já existe na página. Assim o
 *    conteúdo existe para quem não roda JS, para os buscadores que não
 *    renderizam e para os raspadores de rede social.
 *
 * 2. O HTML não é minificado: o <script> inline do gate `.js` é liberado na CSP
 *    por hash, e qualquer mexida no conteúdo dele quebraria a política.
 *    Comprimido pelo servidor, a economia seria irrelevante.
 */

import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { rm, mkdir, cp, readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/* fileURLToPath, e não URL.pathname: o pathname vem percent-encoded e quebra
   em qualquer caminho com espaço ou acento (e na letra do drive no Windows). */
const RAIZ = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(RAIZ, 'dist');

/* O domínio real só entra quando o site for publicado nele. Enquanto isso o
   endereço de demonstração é tratado como ambiente de teste — ver robots(). */
const DOMINIO_REAL = 'https://www.zagarollo.com.br';
const SITE = (process.env.SITE_URL || 'https://zealous-hill-02d6ba110.7.azurestaticapps.net').replace(/\/$/, '');
const EH_PRODUCAO = SITE === DOMINIO_REAL;

const WHATSAPP = process.env.WHATSAPP || '5519992910497';

const ENTRADAS = [
  { arquivo: 'estilo.css', loader: 'css' },
  { arquivo: 'script.js', loader: 'js' },
  { arquivo: 'campo.js', loader: 'js' },
];

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const hash = (txt) => createHash('sha256').update(txt).digest('hex').slice(0, 8);
const kb = (n) => (n / 1024).toFixed(1).padStart(6) + ' kB';

const produtos = JSON.parse(await readFile(path.join(RAIZ, 'dados/produtos.json'), 'utf8'));
const estados = JSON.parse(await readFile(path.join(RAIZ, 'dados/representantes.json'), 'utf8'));

/* ---------------- Renderizadores ---------------- */

function cartaoProduto(p) {
  const familia = produtos.familias.find((f) => f.id === p.familia);
  const classe = p.familia === 'sacolas' ? ' produto-tag--sacola'
    : p.familia === 'transporte' ? ' produto-tag--transporte' : '';

  const medidas = p.medidas.length
    ? `<details class="medidas">
        <summary>${p.medidas.length} medida${p.medidas.length > 1 ? 's' : ''}</summary>
        <table>
          <caption class="sr-so">Medidas do ${esc(p.nome)}, em largura × profundidade × altura</caption>
          <thead><tr><th scope="col">Ref.</th><th scope="col">Medida</th></tr></thead>
          <tbody>${p.medidas.map((m) => `
            <tr><th scope="row">nº ${esc(m.ref)}</th><td>${esc(m.dim)}${m.nota ? ` <span class="medida-nota">${esc(m.nota)}</span>` : ''}</td></tr>`).join('')}
          </tbody>
        </table>
      </details>`
    : '<p class="medidas-ausente">Medidas sob consulta.</p>';

  const zap = `https://wa.me/${WHATSAPP}?text=` +
    encodeURIComponent(`Olá! Gostaria de um orçamento do ${p.nome}.`);

  /* Nem todo kit tem ficha publicada pela fábrica. Sem foto, um marcador
     neutro — melhor do que reaproveitar a imagem de outro modelo, que é
     justamente o erro que o site antigo comete no KIT E. */
  const foto = p.semFoto
    ? `<div class="produto-foto produto-foto--vazia" aria-hidden="true"><span>ficha não publicada</span></div>`
    : `<img class="produto-foto" loading="lazy" decoding="async"
         src="imagens/produtos/${p.slug}-480.webp"
         srcset="imagens/produtos/${p.slug}-480.webp 480w, imagens/produtos/${p.slug}-900.webp 900w"
         sizes="(max-width: 560px) 92vw, (max-width: 900px) 46vw, 30vw"
         alt="Ficha do ${esc(p.nome)} com os formatos e as medidas" width="900" height="488">`;

  return `
  <article class="produto" data-familia="${p.familia}" data-tags="${p.tags.join(' ')}" data-nome="${esc(p.nome)}">
    ${foto}
    <div class="produto-corpo">
      <span class="produto-tag${classe}">${esc(familia ? familia.nome : '')}</span>
      <h3>${esc(p.nome)}</h3>
      <p>${esc(p.desc)}</p>
      ${medidas}
      <a class="produto-cta" href="${zap}" target="_blank" rel="noopener"
         aria-label="Pedir orçamento do ${esc(p.nome)} pelo WhatsApp (abre em nova aba)">Pedir orçamento →</a>
    </div>
  </article>`;
}

function cartoesFamilia() {
  return produtos.familias.map((f) => {
    const n = produtos.produtos.filter((p) => p.familia === f.id).length;
    return `
      <a class="familia revela" href="/produtos#${f.id}" aria-label="${esc(f.nome)} — ver os ${n} modelos">
        <img loading="lazy" decoding="async" src="imagens/produtos/${f.foto}-480.webp"
             srcset="imagens/produtos/${f.foto}-480.webp 480w, imagens/produtos/${f.foto}-900.webp 900w"
             sizes="(max-width: 900px) 92vw, 34vw" alt="" width="900" height="488">
        <div class="familia-texto">
          <h3>${esc(f.nome)}</h3>
          <p>${esc(f.chamada)}</p>
          <span aria-hidden="true">${n} modelos →</span>
        </div>
      </a>`;
  }).join('');
}

function blocosRepresentantes() {
  return estados.map((e) => `
    <section class="uf" data-uf="${e.sigla}">
      <h2 class="uf-titulo">${esc(e.uf)} <span>${e.representantes.length} representante${e.representantes.length > 1 ? 's' : ''}</span></h2>
      <div class="reps">${e.representantes.map((r) => `
        <article class="rep">
          <h3>${esc(r.nome)}</h3>
          <p class="rep-area">${esc(r.area)}</p>
          <ul class="rep-contato">
            ${r.telefones.map((t) => `<li><a href="tel:+55${t.replace(/\D/g, '')}">${esc(t)}</a></li>`).join('')}
            ${r.email ? `<li><a href="mailto:${esc(r.email)}">${esc(r.email)}</a></li>` : ''}
          </ul>
        </article>`).join('')}
      </div>
    </section>`).join('');
}

const opcoesUf = () => estados
  .map((e) => `<option value="${e.sigla}">${esc(e.uf)}</option>`).join('\n        ');

const blocosAcabamento = () => produtos.acabamentos.caixas
  .map((a) => `<div class="acabamento revela"><strong>${esc(a.nome)}</strong><span>${esc(a.desc)}</span></div>`).join('');

const listaCores = () => produtos.acabamentos.sacolas.cores
  .map((c) => `<li>${esc(c)}</li>`).join('');

/* ---------------- Dados estruturados ---------------- */

const enderecoLd = {
  '@type': 'PostalAddress',
  streetAddress: 'Rua Cel. Arthur Whitacker, 488 - Centro',
  addressLocality: 'Descalvado',
  addressRegion: 'SP',
  postalCode: '13690-000',
  addressCountry: 'BR',
};

const JSONLD = {
  organizacao: {
    '@context': 'https://schema.org', '@type': 'Organization',
    name: 'Zagarollo Embalagens', url: SITE + '/', logo: SITE + '/imagens/logo.webp',
    foundingDate: '2002', areaServed: 'BR',
    description: 'Fabricação de caixas flexíveis e sacolas de papel.',
    address: enderecoLd, telephone: '+55-19-3583-1743', email: 'telemarketing@zagarollo.com.br',
  },
  local: {
    '@context': 'https://schema.org', '@type': 'LocalBusiness',
    name: 'Zagarollo Embalagens', url: SITE + '/contato', image: SITE + '/imagens/og.jpg',
    address: enderecoLd, telephone: '+55-19-3583-1743', email: 'telemarketing@zagarollo.com.br',
    areaServed: 'BR',
  },
  catalogo: {
    '@context': 'https://schema.org', '@type': 'ItemList',
    name: 'Catálogo Zagarollo Embalagens',
    numberOfItems: produtos.produtos.length,
    itemListElement: produtos.produtos.map((p, i) => ({
      '@type': 'ListItem', position: i + 1, name: p.nome, description: p.desc,
    })),
  },
};

/* ---------------- Montagem ---------------- */

await rm(DIST, { recursive: true, force: true });
await mkdir(DIST, { recursive: true });
await cp(path.join(RAIZ, 'imagens'), path.join(DIST, 'imagens'), { recursive: true });
await cp(path.join(RAIZ, 'staticwebapp.config.json'), path.join(DIST, 'staticwebapp.config.json'));

const renomeados = new Map();
for (const { arquivo, loader } of ENTRADAS) {
  const origem = await readFile(path.join(RAIZ, arquivo), 'utf8');
  const saida = await build({
    stdin: { contents: origem, loader, sourcefile: arquivo },
    minify: true, write: false, legalComments: 'none',
    target: loader === 'css' ? ['chrome90', 'safari15', 'firefox90'] : ['es2018'],
  });
  const conteudo = saida.outputFiles[0].text;
  const ext = path.extname(arquivo);
  const novo = `${path.basename(arquivo, ext)}.${hash(conteudo)}${ext}`;
  await writeFile(path.join(DIST, novo), conteudo);
  renomeados.set(arquivo, novo);
  console.log(`${arquivo.padEnd(14)} ${kb(Buffer.byteLength(origem))} -> ${kb(Buffer.byteLength(conteudo))}  ${novo}`);
}

const modelo = await readFile(path.join(RAIZ, 'modelo.html'), 'utf8');
const fragmentos = (await readdir(path.join(RAIZ, 'paginas'))).filter((f) => f.endsWith('.html'));
const rotas = [];

for (const arq of fragmentos) {
  const bruto = await readFile(path.join(RAIZ, 'paginas', arq), 'utf8');
  const cab = bruto.match(/^<!--(\{[\s\S]*?\})-->/);
  if (!cab) throw new Error(`${arq}: falta o cabeçalho JSON no topo do arquivo`);

  const meta = JSON.parse(cab[1]);
  let corpo = bruto.slice(cab[0].length).trim();

  corpo = corpo
    .replace('{{CATALOGO}}', () => produtos.produtos.map(cartaoProduto).join(''))
    .replace('{{FAMILIAS}}', cartoesFamilia)
    .replace('{{REPRESENTANTES}}', blocosRepresentantes)
    .replace('{{OPCOES_UF}}', opcoesUf)
    .replace('{{ACABAMENTOS}}', blocosAcabamento)
    .replace('{{CORES}}', listaCores)
    .replace('{{TEXTO_SACOLAS}}', () => esc(produtos.acabamentos.sacolas.desc));

  const cabeca = [];
  if (meta.jsonld) {
    cabeca.push(`<script type="application/ld+json">${JSON.stringify(JSONLD[meta.jsonld])}</script>`);
  }

  let html = '<!DOCTYPE html>\n<html lang="pt-BR">\n<head>\n' + modelo
    .replace(/\{\{TITULO\}\}/g, esc(meta.titulo))
    .replace(/\{\{DESCRICAO\}\}/g, esc(meta.descricao))
    .replace(/\{\{SITE\}\}/g, SITE)
    .replace(/\{\{ROTA\}\}/g, meta.rota === '/' ? '/' : meta.rota)
    .replace(/\{\{WHATSAPP\}\}/g, WHATSAPP)
    .replace('{{CABECA}}', cabeca.join('\n'))
    .replace('{{CONTEUDO}}', () => corpo)
    .replace('{{RODAPE_SCRIPTS}}', meta.campo ? '<script src="campo.js" defer></script>' : '')
    + '\n</body>\n</html>\n';

  for (const chave of ['INICIO', 'PRODUTOS', 'PERSONALIZACAO', 'REPRESENTANTES', 'EMPRESA', 'CONTATO']) {
    html = html.replace(`{{ATIVO_${chave}}}`, meta.nav === chave ? ' aria-current="page"' : '');
  }

  for (const [antigo, novo] of renomeados) {
    /* Só dentro de src/href: um replace de substring solto corromperia
       qualquer outro arquivo cujo nome termine igual (ex.: sub-campo.js). */
    html = html.replace(new RegExp(`((?:src|href)=")${antigo.replace(/\./g, '\\.')}(")`, 'g'), `$1${novo}$2`);
  }

  const nome = meta.rota === '/' ? 'index.html'
    : meta.rota.replace(/^\//, '') + '.html';
  await writeFile(path.join(DIST, nome), html);
  rotas.push({ rota: meta.rota, arquivo: nome, bytes: Buffer.byteLength(html) });
  console.log(`${nome.padEnd(24)} ${kb(Buffer.byteLength(html))}  ${meta.rota}`);
}

/* ---------------- robots e sitemap ---------------- */

const publicas = rotas.filter((r) => r.rota !== '/404');

await writeFile(path.join(DIST, 'sitemap.xml'),
  '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  publicas.map((r) => `  <url>\n    <loc>${SITE}${r.rota}</loc>\n` +
    `    <priority>${r.rota === '/' ? '1.0' : '0.8'}</priority>\n  </url>`).join('\n') +
  '\n</urlset>\n');

/* Fora do domínio real, o site é ambiente de teste: não pode ser indexado.
   Indexá-lo criaria conteúdo duplicado competindo com o site oficial e uma
   segunda cópia pública dos dados pessoais dos 61 representantes. */
await writeFile(path.join(DIST, 'robots.txt'), EH_PRODUCAO
  ? `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`
  : '# Ambiente de demonstração — não indexar.\n' +
    '# Publicar em www.zagarollo.com.br com SITE_URL definido libera a indexação.\n' +
    'User-agent: *\nDisallow: /\n');

/* ---------------- Verificação ---------------- */

const publicados = new Set();
async function varre(dir, prefixo = '') {
  for (const nome of await readdir(dir)) {
    const cheio = path.join(dir, nome);
    if ((await stat(cheio)).isDirectory()) await varre(cheio, `${prefixo}${nome}/`);
    else publicados.add(`${prefixo}${nome}`);
  }
}
await varre(DIST);

const rotasValidas = new Set(rotas.map((r) => r.rota));
const quebrados = [];

for (const { arquivo } of rotas) {
  const html = await readFile(path.join(DIST, arquivo), 'utf8');
  const referencias = [];
  for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) referencias.push(m[1]);
  /* srcset traz "arquivo 480w, arquivo 900w" — cada item precisa ser conferido. */
  for (const m of html.matchAll(/srcset="([^"]+)"/g)) {
    for (const parte of m[1].split(',')) referencias.push(parte.trim().split(/\s+/)[0]);
  }

  for (const bruto of referencias) {
    const alvo = bruto.split('#')[0].split('?')[0];
    if (!alvo || /^(https?:|mailto:|tel:|data:)/.test(alvo)) continue;
    if (alvo.startsWith('/')) {
      /* Link absoluto: tem de bater com uma rota que o build gerou. */
      if (!rotasValidas.has(alvo) && !publicados.has(alvo.slice(1))) {
        quebrados.push(`${arquivo} -> ${alvo} (rota inexistente)`);
      }
    } else if (!publicados.has(alvo)) {
      quebrados.push(`${arquivo} -> ${alvo} (arquivo ausente)`);
    }
  }
}

if (quebrados.length) {
  console.error('\nReferências quebradas:\n  ' + [...new Set(quebrados)].join('\n  '));
  process.exit(1);
}

console.log(`\nok — ${rotas.length} páginas, ${produtos.produtos.length} produtos, ` +
  `${estados.reduce((s, e) => s + e.representantes.length, 0)} representantes em ${estados.length} estados`);
console.log(`site: ${SITE}${EH_PRODUCAO ? '' : '  (robots.txt bloqueando indexação — ambiente de teste)'}`);
