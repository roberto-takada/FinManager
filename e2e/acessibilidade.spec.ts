import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';

/** Regras WCAG 2.0/2.1/2.2 níveis A e AA (RNF-020). */
const TAGS_WCAG_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

test.describe('Acessibilidade (RNF-020)', () => {
  test('página inicial sem violações WCAG 2.2 AA', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    const resultado = await new AxeBuilder({ page }).withTags(TAGS_WCAG_AA).analyze();

    expect(resultado.violations).toEqual([]);
  });

  test('página declara o idioma pt-BR', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
  });
});
