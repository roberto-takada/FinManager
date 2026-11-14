import { defineConfig, devices, type Project } from '@playwright/test';

const CI = !!process.env['CI'];

/**
 * E2E_MODO=dev roda contra o servidor de desenvolvimento (o mesmo do `pnpm start`).
 * Por padrão, roda contra o build de produção, que é o que será publicado.
 */
const MODO_DEV = process.env['E2E_MODO'] === 'dev';
const PORTA = MODO_DEV ? 4201 : 4300;
/** Build de produção servido como arquivos estáticos (ver scripts/servir-estatico.mjs). */
export const PORTA_ESTATICA = 4301;

/**
 * O WebKit do Playwright depende de bibliotecas do Ubuntu que não existem com o mesmo
 * nome em outras distribuições (ex.: Arch/CachyOS). Ele roda sempre no CI e, localmente,
 * só com E2E_WEBKIT=1.
 */
const COM_WEBKIT = CI || process.env['E2E_WEBKIT'] === '1';

const navegadores: Project[] = [
  { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ...(COM_WEBKIT ? [{ name: 'webkit', use: { ...devices['Desktop Safari'] } }] : []),
];

/** Testes E2E e de acessibilidade (ENGENHARIA_DE_SOFTWARE §8). */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 2 : 0,
  // No CI: anotações nos arquivos do PR + relatório HTML, guardado como artefato se falhar.
  reporter: CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  // O servidor de desenvolvimento compila as telas sob demanda e fica lento sob carga.
  expect: { timeout: MODO_DEV ? 10_000 : 5_000 },
  use: {
    baseURL: `http://localhost:${PORTA}`,
    trace: 'retain-on-failure',
  },
  projects: navegadores,
  webServer: [
    {
      command: MODO_DEV
        ? `pnpm exec ng serve --port ${PORTA}`
        : `pnpm exec ng serve --configuration production --port ${PORTA}`,
      url: `http://localhost:${PORTA}`,
      reuseExistingServer: !CI,
      timeout: 120_000,
    },
    // Build publicado servido como arquivos estáticos (como no GitHub Pages), para o teste
    // de uso offline (RF-073): o service worker confere o hash de cada arquivo.
    ...(MODO_DEV
      ? []
      : [
          {
            command: `pnpm exec ng build && node scripts/servir-estatico.mjs dist/finmanager/browser ${PORTA_ESTATICA}`,
            url: `http://localhost:${PORTA_ESTATICA}`,
            reuseExistingServer: !CI,
            timeout: 180_000,
          },
        ]),
  ],
});
