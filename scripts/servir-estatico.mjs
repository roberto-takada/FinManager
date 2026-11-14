// Servidor estático mínimo para os E2E que precisam dos arquivos exatamente como
// publicados (ex.: o service worker do RF-073 confere o hash de cada arquivo, e o
// servidor de desenvolvimento não entrega os mesmos bytes do build).
// Como o GitHub Pages, devolve index.html para endereços do app que não são arquivos.
// Uso: node scripts/servir-estatico.mjs <pasta> <porta>
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';

const raiz = resolve(process.argv[2] ?? join('dist', 'finmanager', 'browser'));
const porta = Number(process.argv[3] ?? 4301);
const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
};

if (!existsSync(join(raiz, 'index.html'))) {
  console.error(`Build não encontrado em ${raiz}. Rode "pnpm build".`);
  process.exit(1);
}

createServer((pedido, resposta) => {
  const caminho = decodeURIComponent(new URL(pedido.url ?? '/', 'http://x').pathname);
  let arquivo = normalize(join(raiz, caminho));
  if (arquivo !== raiz && !arquivo.startsWith(raiz + sep)) {
    resposta.writeHead(403).end();
    return;
  }
  if (!existsSync(arquivo) || statSync(arquivo).isDirectory()) {
    // Endereço do app (sem extensão): a SPA cuida da rota. Arquivo inexistente: 404.
    if (extname(caminho)) {
      resposta.writeHead(404).end();
      return;
    }
    arquivo = join(raiz, 'index.html');
  }
  resposta.writeHead(200, {
    'Content-Type': TIPOS[extname(arquivo)] ?? 'application/octet-stream',
    'Cache-Control': 'no-cache',
  });
  createReadStream(arquivo).pipe(resposta);
}).listen(porta, () => console.log(`Servindo ${raiz} em http://localhost:${porta}`));
