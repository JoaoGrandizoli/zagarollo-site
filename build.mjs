/* Build do site: minifica CSS e JS, carimba o hash do conteúdo no nome do
 * arquivo e reescreve as referências no HTML. Com o nome carregando o hash,
 * os assets podem ser servidos como `immutable` — o navegador nunca revalida,
 * e uma publicação nova muda o nome, então nunca serve conteúdo velho.
 *
 * O HTML não é minificado de propósito: o <script> inline do gate `.js` é
 * liberado na CSP por hash, e qualquer mexida no conteúdo dele quebraria a
 * política. Comprimido pelo servidor, a economia seria irrelevante.
 */

import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { rm, mkdir, cp, readFile, writeFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const RAIZ = path.dirname(new URL(import.meta.url).pathname);
const DIST = path.join(RAIZ, 'dist');

const PAGINAS = ['index.html', 'produtos.html'];
const ESTATICOS = ['imagens', 'robots.txt', 'sitemap.xml', 'staticwebapp.config.json'];
const ENTRADAS = [
  { arquivo: 'estilo.css', loader: 'css' },
  { arquivo: 'script.js', loader: 'js' },
  { arquivo: 'campo.js', loader: 'js' },
];

const hash = (txt) => createHash('sha256').update(txt).digest('hex').slice(0, 8);

const kb = (n) => (n / 1024).toFixed(1).padStart(6) + ' kB';

await rm(DIST, { recursive: true, force: true });
await mkdir(DIST, { recursive: true });

for (const item of ESTATICOS) {
  await cp(path.join(RAIZ, item), path.join(DIST, item), { recursive: true });
}

/* Minifica cada entrada e guarda o nome novo para reescrever no HTML. */
const renomeados = new Map();

for (const { arquivo, loader } of ENTRADAS) {
  const origem = await readFile(path.join(RAIZ, arquivo), 'utf8');

  const saida = await build({
    stdin: { contents: origem, loader, sourcefile: arquivo },
    minify: true,
    write: false,
    target: loader === 'css' ? ['chrome90', 'safari15', 'firefox90'] : ['es2018'],
    legalComments: 'none',
  });

  const conteudo = saida.outputFiles[0].text;
  const ext = path.extname(arquivo);
  const novo = `${path.basename(arquivo, ext)}.${hash(conteudo)}${ext}`;

  await writeFile(path.join(DIST, novo), conteudo);
  renomeados.set(arquivo, novo);

  console.log(`${arquivo.padEnd(14)} ${kb(Buffer.byteLength(origem))} -> ${kb(Buffer.byteLength(conteudo))}  ${novo}`);
}

for (const pagina of PAGINAS) {
  let html = await readFile(path.join(RAIZ, pagina), 'utf8');

  for (const [antigo, novo] of renomeados) {
    if (!html.includes(antigo)) continue;
    html = html.split(antigo).join(novo);
  }

  /* Links internos sem .html: o servidor já reescreve /produtos, e a URL
     limpa é a que vai para o sitemap e para o histórico do navegador. */
  html = html.replace(/href="index\.html"/g, 'href="/"');
  html = html.replace(/href="index\.html#/g, 'href="/#');
  html = html.replace(/href="produtos\.html"/g, 'href="/produtos"');
  html = html.replace(/href="produtos\.html#/g, 'href="/produtos#');

  await writeFile(path.join(DIST, pagina), html);
  console.log(`${pagina.padEnd(14)} ${kb(Buffer.byteLength(html))}`);
}

/* Confere que nada ficou apontando para um arquivo que não foi publicado. */
const publicados = new Set();
async function varre(dir, prefixo = '') {
  for (const nome of await readdir(dir)) {
    const cheio = path.join(dir, nome);
    if ((await stat(cheio)).isDirectory()) await varre(cheio, `${prefixo}${nome}/`);
    else publicados.add(`${prefixo}${nome}`);
  }
}
await varre(DIST);

const quebrados = [];
for (const pagina of PAGINAS) {
  const html = await readFile(path.join(DIST, pagina), 'utf8');
  for (const m of html.matchAll(/(?:href|src)="(?!https?:|mailto:|tel:|#|\/)([^"]+)"/g)) {
    if (!publicados.has(m[1])) quebrados.push(`${pagina} -> ${m[1]}`);
  }
}

if (quebrados.length) {
  console.error('\nReferências quebradas:\n  ' + quebrados.join('\n  '));
  process.exit(1);
}

const total = [...publicados].filter((f) => !f.startsWith('imagens/') && f !== 'og.jpg');
console.log(`\nok — ${publicados.size} arquivos em dist/, ${total.length} na raiz`);
