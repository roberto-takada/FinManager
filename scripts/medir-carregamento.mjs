// Mede o carregamento da primeira tela (RNF-030) a partir do build de produção.
// Uso: pnpm build && node scripts/medir-carregamento.mjs [rotulo]
//
// Serve dist/finmanager/browser localmente (com gzip, como o GitHub Pages) e abre a página várias vezes no Chromium,
// com cache vazio, em dois cenários: sem limitação e com "4G lento" (150 ms de latência,
// 1,6 Mbit/s, CPU 4x mais lenta, como o perfil móvel do Lighthouse). Mostra a mediana.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { createGzip } from 'node:zlib';
import { chromium } from '@playwright/test';

const RAIZ = join(process.cwd(), 'dist/finmanager/browser');
const PORTA = 4350;
const RODADAS = 7;
const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
};

if (!existsSync(RAIZ)) {
  console.error('Build não encontrado. Rode "pnpm build" antes.');
  process.exit(1);
}

const servidor = createServer((req, res) => {
  const caminho = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
  let arquivo = join(RAIZ, caminho);
  if (!arquivo.startsWith(RAIZ) || !existsSync(arquivo) || statSync(arquivo).isDirectory()) {
    arquivo = join(RAIZ, 'index.html'); // rotas da SPA
  }
  const tipo = TIPOS[extname(arquivo)] ?? 'application/octet-stream';
  // Como o GitHub Pages: texto vai comprimido com gzip (fontes woff2 já são comprimidas).
  const comprimir =
    /html|javascript|css|svg|wasm/.test(tipo) && /gzip/.test(req.headers['accept-encoding'] ?? '');
  res.writeHead(200, {
    'Content-Type': tipo,
    ...(comprimir ? { 'Content-Encoding': 'gzip' } : {}),
  });
  const fluxo = createReadStream(arquivo);
  (comprimir ? fluxo.pipe(createGzip()) : fluxo).pipe(res);
});
await new Promise((ok) => servidor.listen(PORTA, ok));

const CENARIOS = [
  { nome: 'Sem limitação', rede: null, cpu: 1 },
  {
    nome: '4G lento + CPU 4x',
    rede: {
      latency: 150,
      downloadThroughput: (1.6 * 1024 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8,
    },
    cpu: 4,
  },
];

const mediana = (valores) => {
  const ordenados = [...valores].sort((a, b) => a - b);
  return ordenados[Math.floor(ordenados.length / 2)];
};

const navegador = await chromium.launch();
const resultados = {};
for (const cenario of CENARIOS) {
  const medidas = [];
  for (let i = 0; i < RODADAS; i++) {
    const contexto = await navegador.newContext();
    const pagina = await contexto.newPage();
    const cdp = await contexto.newCDPSession(pagina);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    if (cenario.rede) {
      await cdp.send('Network.emulateNetworkConditions', { offline: false, ...cenario.rede });
    }
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: cenario.cpu });
    await pagina.addInitScript(() => {
      window.__lcp = 0;
      new PerformanceObserver((lista) => {
        for (const e of lista.getEntries()) window.__lcp = e.startTime;
      }).observe({ type: 'largest-contentful-paint', buffered: true });
    });

    await pagina.goto(`http://localhost:${PORTA}/`, { waitUntil: 'load' });
    // A primeira tela está pronta quando o título da página aparece.
    await pagina.getByRole('heading', { level: 1 }).waitFor();
    await pagina.waitForTimeout(300);
    medidas.push(
      await pagina.evaluate(() => {
        const nav = performance.getEntriesByType('navigation')[0];
        const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? 0;
        const recursos = performance.getEntriesByType('resource');
        const bytes = recursos.reduce((t, r) => t + r.transferSize, nav.transferSize);
        const fontes = recursos.filter((r) => r.name.endsWith('.woff2'));
        return {
          fcp,
          lcp: window.__lcp,
          load: nav.loadEventEnd,
          kb: bytes / 1024,
          fontesKb: fontes.reduce((t, r) => t + r.transferSize, 0) / 1024,
        };
      }),
    );
    await contexto.close();
  }
  resultados[cenario.nome] = Object.fromEntries(
    ['fcp', 'lcp', 'load', 'kb', 'fontesKb'].map((m) => [
      m,
      Math.round(mediana(medidas.map((x) => x[m]))),
    ]),
  );
}
await navegador.close();
servidor.close();

console.log(
  `\nCarregamento da primeira tela — ${process.argv[2] ?? 'build atual'} (mediana de ${RODADAS})`,
);
console.table(resultados);
console.log(JSON.stringify(resultados));
