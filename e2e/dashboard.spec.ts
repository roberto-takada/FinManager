import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { bloquear, criarCofre, desbloquear, lerIndexedDb } from './cofre.helpers';
import { expect, test } from './fixtures';

const PADRAO = [
  'resumo',
  'patrimonio',
  'despesas-categoria',
  'receitas-despesas',
  'metas',
  'recentes',
  'contas-a-vencer',
];

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/** Ids dos widgets na ordem em que aparecem no Início. */
const widgetsNoInicio = (page: Page) =>
  page.locator('[data-widget]').evaluateAll((els) => els.map((e) => e.getAttribute('data-widget')));

const personalizar = async (page: Page) => {
  await page.getByRole('link', { name: 'Personalizar' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Personalizar o Início' }),
  ).toBeVisible();
};

test.describe('Dashboard: resumo e gráficos (RF-040 a RF-042, RF-045)', () => {
  test('com dados de demonstração, mostra o resumo e os gráficos com resumo em texto e tabela', async ({
    page,
    monitor,
  }) => {
    await criarCofre(page, undefined, { demonstracao: true });

    // RF-040: resumo do mês e próximas contas.
    for (const kpi of ['saldo', 'receitas', 'despesas', 'a-pagar']) {
      await expect(page.locator(`[data-kpi="${kpi}"]`)).toContainText('R$');
    }
    await expect(page.getByRole('heading', { name: 'Contas a vencer' })).toBeVisible();

    // RF-041: patrimônio com gráfico nomeado, conclusão em texto e variação com sinal.
    const patrimonio = page.locator('[data-widget="patrimonio"]');
    await expect(
      patrimonio.getByRole('img', { name: /Gráfico de linha: Patrimônio no fim de cada mês/ }),
    ).toBeVisible();
    await expect(patrimonio.locator('[data-resumo-grafico]')).toContainText('Patrimônio atual: R$');
    await expect(patrimonio.locator('[data-variacao]')).toHaveText(/[+−] R\$\s.* em \d+ meses/);

    // RF-045: os dados do gráfico estão numa tabela acessível.
    await patrimonio.getByText('Ver dados em tabela').click();
    const tabela = patrimonio.getByRole('table', { name: 'Patrimônio no fim de cada mês' });
    await expect(tabela.getByRole('columnheader', { name: 'Mês' })).toBeVisible();
    expect(await tabela.getByRole('row').count()).toBeGreaterThan(2);
    await expect(tabela.getByRole('rowheader', { name: /novembro de \d{4}/ })).toBeVisible();

    // RF-042: despesas por categoria, com legenda em texto cujos percentuais somam 100.
    const despesas = page.locator('[data-widget="despesas-categoria"]');
    await expect(despesas.getByRole('img', { name: /Gráfico de rosca/ })).toBeVisible();
    const percentuais = await despesas.locator('[data-fatia]').allTextContents();
    expect(percentuais.length).toBeGreaterThan(0);
    expect(percentuais.reduce((s, t) => s + Number(/(\d+)%/.exec(t)![1]), 0)).toBe(100);

    const barras = page.locator('[data-widget="receitas-despesas"]');
    await barras.getByText('Ver dados em tabela').click();
    await expect(barras.getByRole('columnheader', { name: 'Receitas' })).toBeVisible();
    await expect(barras.getByRole('columnheader', { name: 'Despesas' })).toBeVisible();

    // Os gráficos desenham de fato no canvas.
    await expect
      .poll(() =>
        page.locator('canvas').evaluateAll((telas) =>
          telas.every((c) => {
            const d = (c as HTMLCanvasElement)
              .getContext('2d')!
              .getImageData(
                0,
                0,
                (c as HTMLCanvasElement).width,
                (c as HTMLCanvasElement).height,
              ).data;
            for (let i = 3; i < d.length; i += 4) if (d[i]) return true;
            return false;
          }),
        ),
      )
      .toBe(true);

    expect(await monitor.violacoesCsp()).toEqual([]);
    expect(monitor.requisicoesExternas).toEqual([]);
  });

  test('cofre novo: estados vazios explicam o próximo passo', async ({ page }) => {
    await criarCofre(page);
    await expect(page.locator('[data-widget="despesas-categoria"]')).toContainText(
      'Nenhuma despesa em',
    );
    await expect(page.locator('[data-widget="receitas-despesas"]')).toContainText(
      'Nenhuma receita ou despesa nos últimos 6 meses.',
    );
    await expect(page.locator('[data-widget="patrimonio"] [data-resumo-grafico]')).toContainText(
      'A evolução aparece a partir do segundo mês de uso.',
    );
  });
});

test.describe('Dashboard: personalização (RF-043, RF-044, US-007)', () => {
  test('reordena por teclado, remove, redimensiona e salva; vale de novo ao desbloquear', async ({
    page,
  }) => {
    await criarCofre(page);
    await expect.poll(() => widgetsNoInicio(page)).toEqual(PADRAO);

    await personalizar(page);
    // Só teclado (RNF-021): o foco continua no botão do widget que se moveu.
    const subir = page.getByRole('button', { name: 'Subir Evolução do patrimônio' });
    await subir.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('status')).toHaveText('Evolução do patrimônio na posição 1 de 7.');
    await expect(subir).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Descer Evolução do patrimônio' })).toBeFocused();

    await page.getByRole('button', { name: 'Remover Metas' }).click();
    await expect(page.getByRole('status')).toContainText('Metas removido');
    await expect(page.locator('[data-widget-disponivel="metas"]')).toBeVisible();
    await page.getByLabel('Largura de Contas a vencer').selectOption({ label: 'Linha inteira' });

    await page.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Início' })).toBeVisible();
    await expect(
      page.getByRole('status').filter({ hasText: 'Início personalizado.' }),
    ).toBeVisible();
    const esperado = [
      'patrimonio',
      'resumo',
      'despesas-categoria',
      'receitas-despesas',
      'recentes',
      'contas-a-vencer',
    ];
    await expect.poll(() => widgetsNoInicio(page)).toEqual(esperado);
    await expect(page.locator('[data-widget="contas-a-vencer"]')).toHaveClass(/lg:col-span-3/);

    // RF-044 + RN-001: o layout persiste e fica cifrado.
    expect(await lerIndexedDb(page)).not.toContain('contas-a-vencer');
    await bloquear(page);
    await desbloquear(page);
    await expect.poll(() => widgetsNoInicio(page)).toEqual(esperado);

    // Adicionar de volta: entra no fim.
    await personalizar(page);
    await page.getByRole('button', { name: 'Adicionar Metas' }).click();
    await expect(page.getByRole('button', { name: 'Remover Metas' })).toBeFocused();
    await page.getByRole('button', { name: 'Salvar' }).click();
    await expect.poll(async () => (await widgetsNoInicio(page)).at(-1)).toBe('metas');
  });

  test('cancelar descarta o rascunho; Início vazio oferece escolher widgets; restaurar padrão', async ({
    page,
  }) => {
    await criarCofre(page);

    await personalizar(page);
    await page.getByRole('button', { name: 'Remover Resumo do mês' }).click();
    await page.getByRole('link', { name: 'Cancelar' }).click();
    await expect.poll(() => widgetsNoInicio(page)).toEqual(PADRAO);

    await personalizar(page);
    const itens = page.locator('[data-widget-layout]');
    for (let restantes = await itens.count(); restantes > 0; restantes--) {
      await itens
        .first()
        .getByRole('button', { name: /^Remover / })
        .click();
      await expect(itens).toHaveCount(restantes - 1);
    }
    await expect(page.getByRole('heading', { name: 'Widgets no Início' })).toBeFocused();
    await page.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByText('Nenhum widget no Início.')).toBeVisible();

    await page.getByRole('link', { name: 'Escolher widgets' }).click();
    await page.getByRole('button', { name: 'Restaurar padrão' }).click();
    await expect(page.getByRole('button', { name: 'Restaurar padrão' })).toBeDisabled();
    await page.getByRole('button', { name: 'Salvar' }).click();
    await expect.poll(() => widgetsNoInicio(page)).toEqual(PADRAO);
  });

  test('acessibilidade (axe) do Início com tabelas abertas e da personalização', async ({
    page,
    browserName,
  }) => {
    test.fixme(
      browserName === 'firefox',
      'axe + Firefox do Playwright: crash intermitente (ver CLAUDE.md)',
    );
    const analisar = async (nome: string) =>
      expect((await new AxeBuilder({ page }).withTags(TAGS).analyze()).violations, nome).toEqual(
        [],
      );
    // Tema escolhido antes de abrir a página: sem transições de cor durante a análise.
    for (const tema of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: tema });
      await criarCofre(page, undefined, { demonstracao: true });
      for (const resumo of await page.getByText('Ver dados em tabela').all()) await resumo.click();
      await analisar(`Início (${tema})`);
      await personalizar(page);
      await analisar(`Personalizar (${tema})`);
      await page.evaluate(() => indexedDB.deleteDatabase('finmanager'));
    }
  });
});
