import { test as base, expect } from '@playwright/test';

declare global {
  interface Window {
    __violacoesCsp: string[];
  }
}

interface Monitoramento {
  /** Violações de CSP/Trusted Types registradas pelo navegador. */
  violacoesCsp: () => Promise<string[]>;
  /** Requisições feitas para fora da origem do app. */
  requisicoesExternas: string[];
}

/**
 * Fixture que monitora toda página: violações de CSP e requisições de rede para outras
 * origens (RN-011: nenhum dado sai do navegador).
 */
export const test = base.extend<{ monitor: Monitoramento }>({
  monitor: async ({ page, baseURL }, use) => {
    await page.addInitScript(() => {
      window.__violacoesCsp = [];
      document.addEventListener('securitypolicyviolation', (e) => {
        window.__violacoesCsp.push(`${e.violatedDirective}: ${e.blockedURI}`);
      });
    });

    const origemDoApp = new URL(baseURL ?? '').origin;
    const requisicoesExternas: string[] = [];
    page.on('request', (req) => {
      const url = new URL(req.url());
      if (url.protocol.startsWith('http') && url.origin !== origemDoApp) {
        requisicoesExternas.push(req.url());
      }
    });

    await use({
      violacoesCsp: () => page.evaluate(() => window.__violacoesCsp),
      requisicoesExternas,
    });
  },
});

export { expect };
