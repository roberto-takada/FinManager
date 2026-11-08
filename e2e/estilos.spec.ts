import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { bloquear, criarCofre, desbloquear, irPeloMenu, lerIndexedDb } from './cofre.helpers';
import { expect, test } from './fixtures';

/** Cor de fundo da página, para saber qual tema está ativo. */
const fundo = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const CLARO = 'rgb(247, 246, 251)'; // background #F7F6FB
const ESCURO = 'rgb(14, 12, 31)'; // background #0E0C1F

test.describe('Identidade visual e tema (RF-081)', () => {
  test('sem escolha, segue o tema do sistema desde a primeira tela', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    expect(await fundo(page)).toBe(ESCURO);
    await page.emulateMedia({ colorScheme: 'light' });
    expect(await fundo(page)).toBe(CLARO);
  });

  test('a escolha manual vale após desbloquear e fica cifrada (nada em texto claro)', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await criarCofre(page);
    await page.getByLabel('Tema').selectOption({ label: 'Escuro' });
    await expect(page.locator('html')).toHaveClass(/tema-escuro/);
    expect(await fundo(page)).toBe(ESCURO);
    expect(await lerIndexedDb(page)).not.toContain('escuro');

    // Bloqueado, a preferência não é legível: volta a seguir o sistema.
    await bloquear(page);
    expect(await fundo(page)).toBe(CLARO);
    await desbloquear(page);
    expect(await fundo(page)).toBe(ESCURO);
    await expect(page.getByLabel('Tema')).toHaveValue('escuro');
  });

  test('usa as fontes da identidade, servidas pelo próprio app', async ({ page, monitor }) => {
    await criarCofre(page);
    const fontes = await page.evaluate(async () => {
      await document.fonts.ready;
      return {
        titulo: getComputedStyle(document.querySelector('h1')!).fontFamily,
        texto: getComputedStyle(document.body).fontFamily,
        carregadas: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family),
      };
    });
    expect(fontes.titulo).toContain('Space Grotesk');
    expect(fontes.texto).toContain('Inter');
    expect(fontes.carregadas.join()).toMatch(/Inter/);
    expect(monitor.requisicoesExternas).toEqual([]);
    expect(await monitor.violacoesCsp()).toEqual([]);
  });

  test('menu indica a página atual (aria-current) e recolhe em telas pequenas', async ({
    page,
  }) => {
    await criarCofre(page);
    await irPeloMenu(page, 'Cofrinhos');
    await expect(
      page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Cofrinhos' }),
    ).toHaveAttribute('aria-current', 'page');

    await page.setViewportSize({ width: 390, height: 800 });
    const botao = page.getByRole('button', { name: 'Menu' });
    await expect(botao).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('navigation', { name: 'Principal' })).toBeHidden();
    await botao.click();
    await expect(botao).toHaveAttribute('aria-expanded', 'true');
    await page
      .getByRole('navigation', { name: 'Principal' })
      .getByRole('link', { name: 'Contas', exact: true })
      .click();
    await expect(page.getByRole('heading', { level: 1, name: 'Contas' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Principal' })).toBeHidden();
  });
});

test.describe('Acessibilidade no modo escuro (RNF-020, RNF-023)', () => {
  test('principais telas sem violações WCAG 2.2 AA, inclusive de contraste', async ({
    page,
    browserName,
  }) => {
    test.fixme(
      browserName === 'firefox',
      'axe + Firefox do Playwright: crash intermitente (ver CLAUDE.md)',
    );
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.clock.install({ time: new Date('2026-11-18T12:00:00') });
    await page.goto('/');
    const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
    const analisar = async (nome: string) =>
      expect((await new AxeBuilder({ page }).withTags(TAGS).analyze()).violations, nome).toEqual(
        [],
      );

    await analisar('Criar cofre (escuro)');
    await criarCofre(page, undefined, { demonstracao: true });
    await analisar('Início (escuro)');
    for (const [item, titulo] of [
      ['Transações', 'Transações'],
      ['Calendário', 'Calendário'],
      ['Cofrinhos', 'Cofrinhos'],
      ['A pagar e receber', 'Contas a pagar e a receber'],
    ] as const) {
      await irPeloMenu(page, item, titulo);
      await analisar(`${titulo} (escuro)`);
    }

    // Páginas dedicadas e painéis recolhíveis.
    await irPeloMenu(page, 'Transações');
    await page.getByRole('button', { name: /Filtros/ }).click();
    await analisar('Transações com filtros abertos (escuro)');
    await irPeloMenu(page, 'Contas');
    await page.getByRole('link', { name: 'Nova conta' }).click();
    await analisar('Nova conta (escuro)');
    await irPeloMenu(page, 'Cofrinhos');
    await page.locator('[data-cofrinho] a').first().click();
    await analisar('Detalhe do cofrinho (escuro)');
    await page.getByRole('link', { name: 'Depositar', exact: true }).click();
    await analisar('Depositar no cofrinho (escuro)');
    await page.getByRole('link', { name: 'Voltar para o cofrinho' }).first().click();
    await page.getByRole('link', { name: 'Configurações do cofrinho' }).click();
    await analisar('Configurações do cofrinho (escuro)');
  });
});
