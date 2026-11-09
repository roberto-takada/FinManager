// Ajustes do build para o GitHub Pages (ADR-0005):
// - 404.html = index.html, para que URLs profundas (ex.: /FinManager/transacoes) carreguem o app;
// - .nojekyll, para o GitHub Pages publicar os arquivos como estão, sem processá-los.
import { copyFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const pasta = join('dist', 'finmanager', 'browser');
const indice = join(pasta, 'index.html');
if (!existsSync(indice)) {
  console.error(`Build não encontrado em ${pasta}. Rode "pnpm build:pages".`);
  process.exit(1);
}
copyFileSync(indice, join(pasta, '404.html'));
writeFileSync(join(pasta, '.nojekyll'), '');
console.log(`Pronto para o GitHub Pages: ${pasta} (com 404.html e .nojekyll).`);
