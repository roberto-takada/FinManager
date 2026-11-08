import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { criarCofre, irPeloMenu } from './cofre.helpers';
import { expect, test } from './fixtures';

/** Relógio fixo: domingo, 08/11/2026 (4º trimestre em andamento). */
const AGORA = new Date('2026-11-08T12:00:00');
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function abrirComDemonstracao(page: Page): Promise<void> {
  await page.clock.install({ time: AGORA });
  await criarCofre(page, undefined, { demonstracao: true });
  await irPeloMenu(page, 'Relatórios');
}

const tipo = (page: Page, nome: string) => page.getByRole('radio', { name: nome, exact: true });

test.describe('Relatórios (RF-050 a RF-053)', () => {
  test('US-006: 3º trimestre comparado com o 2º, com categorias, patrimônio e cofrinhos', async ({
    page,
  }) => {
    await abrirComDemonstracao(page);
    // Padrão: mensal, mês atual em andamento.
    await expect(tipo(page, 'Mensal')).toBeChecked();
    await expect(page.locator('[data-periodo]')).toContainText('novembro de 2026');
    await expect(page.locator('[data-em-andamento]')).toContainText('até hoje (08/11/2026)');

    // Trocar o tipo não tira o foco do controle (a tela é a mesma).
    await tipo(page, 'Trimestral').check({ force: true });
    await expect(page).toHaveURL(/tipo=trimestral&periodo=2026-T4/);
    await expect(tipo(page, 'Trimestral')).toBeFocused();

    await page
      .getByLabel('Período', { exact: true })
      .selectOption({ label: '3º trimestre de 2026' });
    await expect(page).toHaveURL(/periodo=2026-T3/);
    await expect(page.locator('[data-periodo]')).toContainText('01/07/2026 a 30/09/2026');
    await expect(page.locator('[data-em-andamento]')).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: /Resumo comparado com 2º trimestre de 2026/ }),
    ).toBeVisible();

    for (const total of ['receitas', 'despesas', 'saldo']) {
      const cartao = page.locator(`[data-total="${total}"]`);
      await expect(cartao).toContainText('R$');
      await expect(cartao).toContainText('Antes:');
      await expect(cartao.locator('[data-variacao]')).toHaveText(
        /[+−]\d+,\d% vs\. período anterior/,
      );
    }

    const categorias = page.getByRole('table', { name: /Despesas por categoria em 3º trimestre/ });
    await expect(categorias.getByRole('columnheader', { name: 'Período anterior' })).toBeVisible();
    expect(await categorias.locator('tbody tr').count()).toBeGreaterThan(2);
    const percentuais = await categorias.locator('tbody tr td:nth-child(3)').allTextContents();
    expect(percentuais.reduce((s, t) => s + Number.parseInt(t, 10), 0)).toBe(100);

    const patrimonio = page.getByRole('table', { name: 'Patrimônio no período' });
    await expect(patrimonio.getByRole('rowheader')).toHaveText([
      '30/06/2026',
      '31/07/2026',
      '31/08/2026',
      '30/09/2026',
    ]);
    await expect(
      page.getByRole('img', { name: /Gráfico de linha: Patrimônio no período/ }),
    ).toBeVisible();

    const cofrinhos = page.getByRole('table', { name: /Situação dos cofrinhos/ });
    await expect(cofrinhos.getByRole('rowheader', { name: 'Viagem de férias' })).toBeVisible();
    await expect(cofrinhos).toContainText('Meta atingida');

    // Anterior/Próximo e o "Voltar" do navegador.
    await page.getByRole('button', { name: 'Período anterior: 2º trimestre de 2026' }).click();
    await expect(page.locator('[data-periodo]')).toContainText('2º trimestre de 2026');
    await page.goBack();
    await expect(page.locator('[data-periodo]')).toContainText('3º trimestre de 2026');
    await page.getByRole('button', { name: 'Próximo período: 4º trimestre de 2026' }).click();
    await expect(page.getByRole('button', { name: 'Próximo período' })).toBeDisabled();
  });

  test('os quatro tipos de período e nada de períodos futuros', async ({ page }) => {
    await abrirComDemonstracao(page);
    const periodo = page.getByLabel('Período', { exact: true });
    for (const [nome, primeiro, quantidade] of [
      ['Mensal', 'novembro de 2026', 13],
      ['Trimestral', '4º trimestre de 2026', 5],
      ['Semestral', '2º semestre de 2026', 3],
      ['Anual', '2026', 2],
    ] as const) {
      await tipo(page, nome).check({ force: true });
      await expect(periodo.locator('option').first()).toHaveText(primeiro);
      await expect(periodo.locator('option')).toHaveCount(quantidade);
    }
  });

  test('CSV (com confirmação, pois não é cifrado) e PDF pela impressão', async ({ page }) => {
    await abrirComDemonstracao(page);
    await tipo(page, 'Trimestral').check({ force: true });
    await page
      .getByLabel('Período', { exact: true })
      .selectOption({ label: '3º trimestre de 2026' });

    await page.getByRole('button', { name: 'Exportar CSV' }).click();
    const dialogo = page.getByRole('dialog', { name: 'Exportar o relatório sem proteção?' });
    await expect(dialogo.getByRole('button', { name: 'Cancelar' })).toBeFocused();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      dialogo.getByRole('button', { name: 'Exportar mesmo assim' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('finmanager-relatorio-2026-T3.csv');
    const csv = await readFile(await download.path(), 'utf8');
    expect(csv.startsWith('﻿Relatório;3º trimestre de 2026\r\n')).toBe(true);
    expect(csv).toMatch(/\r\nReceitas;\d+,\d{2};\d+,\d{2};-?\d+(,\d)?\r\n/);
    expect(csv).toContain('\r\nCofrinho;Depósitos;Retiradas;');
    await expect(page.getByRole('status').filter({ hasText: 'Relatório exportado' })).toBeVisible();

    // PDF: abre a impressão do navegador; na impressão, só o relatório aparece.
    await page.evaluate(() => {
      (window as unknown as { impressoes: number }).impressoes = 0;
      window.print = () => {
        (window as unknown as { impressoes: number }).impressoes++;
      };
    });
    await page.getByRole('button', { name: 'Exportar PDF' }).click();
    expect(
      await page.evaluate(() => (window as unknown as { impressoes: number }).impressoes),
    ).toBe(1);
    await page.emulateMedia({ media: 'print' });
    await expect(page.getByRole('form', { name: 'Escolher o relatório' })).toBeHidden();
    await expect(page.getByRole('navigation', { name: 'Principal' })).toBeHidden();
    await expect(page.getByRole('table', { name: 'Patrimônio no período' })).toBeVisible();
    await expect(page.getByText(/Gerado pelo FinManager em 08\/11\/2026/)).toBeVisible();
  });

  test('cofre vazio: zeros, estados vazios e sem período anterior para navegar', async ({
    page,
  }) => {
    await page.clock.install({ time: AGORA });
    await criarCofre(page);
    await irPeloMenu(page, 'Relatórios');
    await expect(page.locator('[data-total="receitas"]')).toContainText('R$ 0,00');
    await expect(page.locator('[data-total="receitas"]')).toContainText('Sem base de comparação');
    await expect(page.getByText('Nenhuma despesa neste período nem no anterior.')).toBeVisible();
    await expect(page.getByText('Nenhum cofrinho neste período.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Período anterior' })).toBeDisabled();
  });

  test('acessibilidade (axe), claro e escuro', async ({ page, browserName }) => {
    test.fixme(
      browserName === 'firefox',
      'axe + Firefox do Playwright: crash intermitente (ver CLAUDE.md)',
    );
    const analisar = async (nome: string) =>
      expect((await new AxeBuilder({ page }).withTags(TAGS).analyze()).violations, nome).toEqual(
        [],
      );
    for (const tema of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: tema });
      await abrirComDemonstracao(page);
      await tipo(page, 'Trimestral').check({ force: true });
      await analisar(`Relatórios (${tema})`);
      await page.getByRole('button', { name: 'Exportar CSV' }).click();
      await analisar(`Confirmação do CSV (${tema})`);
      await page.getByRole('button', { name: 'Cancelar' }).click();
      await page.evaluate(() => indexedDB.deleteDatabase('finmanager'));
    }
  });
});
