import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { criarCofre, irPeloMenu } from './cofre.helpers';
import { expect, test } from './fixtures';

/** Relógio fixo: 18/11/2026. Um prazo em 18/11/2027 está a 12 meses. */
const AGORA = new Date('2026-11-18T12:00:00');

async function criarContaFinanceira(page: Page, nome = 'Banco Teste', saldo = '10.000,00') {
  await irPeloMenu(page, 'Contas');
  await page.getByRole('link', { name: 'Nova conta' }).click();
  await page.getByLabel('Nome da conta').fill(nome);
  await page.getByLabel('Saldo inicial (R$)').fill(saldo);
  await page.getByRole('button', { name: 'Salvar conta' }).click();
  await expect(page.locator('tr[data-conta]', { hasText: nome })).toBeVisible();
}

async function criarCofrinho(page: Page, nome: string, meta: string, prazo = '') {
  await irPeloMenu(page, 'Cofrinhos');
  await page.getByRole('link', { name: 'Novo cofrinho' }).click();
  await page.getByLabel('Nome do objetivo').fill(nome);
  await page.getByLabel('Meta (R$)').fill(meta);
  if (prazo) await page.getByLabel('Prazo (opcional)').fill(prazo);
  await page.getByLabel('Ícone').selectOption({ label: '✈️ Viagem' });
  await page.getByRole('button', { name: 'Criar cofrinho' }).click();
  await expect(page.locator('[data-cofrinho]', { hasText: nome })).toBeVisible();
}

async function abrirCofrinho(page: Page, nome: string) {
  await irPeloMenu(page, 'Cofrinhos');
  await page.getByRole('link', { name: nome, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: new RegExp(nome) })).toBeVisible();
}

/** Abre a página de movimentação pelo botão do detalhe e registra a operação. */
async function movimentar(page: Page, operacao: 'Depositar' | 'Retirar', valor: string) {
  await page.getByRole('link', { name: operacao, exact: true }).click();
  await expect(page.getByRole('radio', { name: operacao })).toBeChecked();
  await page.getByLabel('Valor (R$)').fill(valor);
  await page.getByLabel(/Sai da conta|Volta para a conta/).selectOption({ label: 'Banco Teste' });
  await page
    .getByRole('button', {
      name: operacao === 'Depositar' ? 'Registrar depósito' : 'Registrar retirada',
    })
    .click();
}

const saldoDaConta = (page: Page) => page.locator('tr[data-conta]', { hasText: 'Banco Teste' });

test.describe('Cofrinhos (RF-030 a RF-033, US-005)', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: AGORA });
    await criarCofre(page);
    await criarContaFinanceira(page);
  });

  test('US-005: meta de R$ 6.000 em 12 meses começa em 0% e sugere R$ 500/mês; R$ 600 levam a 10%', async ({
    page,
  }) => {
    await criarCofrinho(page, 'Viagem', '6.000,00', '2027-11-18');
    const cartao = page.locator('[data-cofrinho]', { hasText: 'Viagem' });
    await expect(cartao.locator('[data-progresso]')).toContainText('(0%)');
    await expect(cartao.locator('[data-planejamento]')).toContainText(
      /Guarde R\$\s500,00 por mês, durante 12 meses/,
    );

    await abrirCofrinho(page, 'Viagem');
    await movimentar(page, 'Depositar', '600,00');
    await expect(
      page.getByRole('status').filter({ hasText: 'Depósito registrado.' }),
    ).toBeVisible();
    await expect(page.locator('[data-progresso]')).toContainText('(10%)');
    await expect(page.locator('[data-progresso]')).toContainText(/faltam R\$\s5\.400,00/);
    await expect(page.locator('[data-planejamento]')).toContainText(/R\$\s450,00 por mês/);
    await expect(page.locator('tr[data-movimentacao]')).toContainText('Depósito');

    await irPeloMenu(page, 'Contas');
    await expect(saldoDaConta(page)).toContainText('9.400,00');
  });

  test('meta é obrigatória e cofrinho sem prazo não sugere valor mensal', async ({ page }) => {
    await irPeloMenu(page, 'Cofrinhos');
    await page.getByRole('link', { name: 'Novo cofrinho' }).click();
    await page.getByLabel('Nome do objetivo').fill('Carro');
    await page.getByRole('button', { name: 'Criar cofrinho' }).click();
    await expect(page.getByText('Informe uma meta maior que zero.')).toBeVisible();

    await criarCofrinho(page, 'Carro', '20.000,00');
    await expect(
      page.locator('[data-cofrinho]', { hasText: 'Carro' }).locator('[data-planejamento]'),
    ).toHaveText('Sem prazo definido.');
  });

  test('retirada não pode passar do saldo e volta para a conta (RF-031)', async ({ page }) => {
    await criarCofrinho(page, 'Viagem', '1.000,00');
    await abrirCofrinho(page, 'Viagem');
    await movimentar(page, 'Depositar', '300,00');
    await movimentar(page, 'Retirar', '300,01');
    await expect(page.getByRole('alert')).toContainText('não tem saldo suficiente');

    // Continua na página de retirada: corrige o valor e registra.
    await page.getByLabel('Valor (R$)').fill('100,00');
    await page.getByRole('button', { name: 'Registrar retirada' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Retirada registrada.' }),
    ).toBeVisible();
    await expect(page.locator('tr[data-movimentacao]')).toHaveCount(2);
    await irPeloMenu(page, 'Contas');
    await expect(saldoDaConta(page)).toContainText('9.800,00');
  });
});

test.describe('Zerar, encerrar e excluir (RF-034, RN-005)', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: AGORA });
    await criarCofre(page);
    await criarContaFinanceira(page);
    await criarCofrinho(page, 'Viagem', '1.000,00');
    await abrirCofrinho(page, 'Viagem');
    await movimentar(page, 'Depositar', '250,00');
    await expect(page.locator('[data-progresso]')).toContainText('(25%)');
    await page.getByRole('link', { name: 'Configurações do cofrinho' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Configurações do cofrinho' }),
    ).toBeVisible();
  });

  test('zerar exige escolher a conta e confirmar; cancelar não altera nada', async ({ page }) => {
    await page.getByRole('button', { name: 'Zerar cofrinho…' }).click();
    await expect(page.getByRole('alert')).toContainText('Escolha a conta que recebe o saldo.');

    await page.getByLabel('Conta que recebe o saldo').selectOption({ label: 'Banco Teste' });
    await page.getByRole('button', { name: 'Zerar cofrinho…' }).click();
    const dialogo = page.getByRole('dialog', { name: 'Zerar o cofrinho?' });
    await expect(dialogo).toContainText(/R\$\s250,00 voltarão para "Banco Teste"/);
    await expect(dialogo.getByRole('button', { name: 'Cancelar' })).toBeFocused();
    await dialogo.getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.getByText(/saldo R\$\s250,00/)).toBeVisible();

    await page.getByRole('button', { name: 'Zerar cofrinho…' }).click();
    await dialogo.getByRole('button', { name: 'Zerar cofrinho' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Cofrinho zerado.' })).toBeVisible();
    await expect(page.locator('[data-progresso]')).toContainText('(0%)');
    await expect(page.locator('tr[data-movimentacao]').first()).toContainText(
      'Retirada (zeramento)',
    );

    await irPeloMenu(page, 'Histórico', 'Histórico e lixeira');
    await expect(page.locator('li[data-evento]').first()).toContainText('Zeramento de cofrinho');
  });

  test('encerrar devolve o saldo, arquiva e deixa só consulta', async ({ page }) => {
    await page.getByLabel('Conta que recebe o saldo').selectOption({ label: 'Banco Teste' });
    await page.getByRole('button', { name: 'Encerrar cofrinho…' }).click();
    await page
      .getByRole('dialog', { name: 'Encerrar o cofrinho?' })
      .getByRole('button', { name: 'Encerrar cofrinho' })
      .click();
    await expect(page.getByText(/Este cofrinho foi encerrado em/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Depositar', exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Configurações do cofrinho' })).toHaveCount(0);

    await irPeloMenu(page, 'Cofrinhos');
    await expect(page.locator('[data-cofrinho]')).toHaveCount(0);
    await expect(page.locator('[data-cofrinho-encerrado]', { hasText: 'Viagem' })).toBeVisible();
    await irPeloMenu(page, 'Contas');
    await expect(saldoDaConta(page)).toContainText('10.000,00');
    await irPeloMenu(page, 'Histórico', 'Histórico e lixeira');
    await expect(page.locator('li[data-evento]').first()).toContainText('Encerramento de cofrinho');
  });

  test('excluir só aparece sem movimentações, pede confirmação e vai para a lixeira', async ({
    page,
  }) => {
    await expect(page.getByRole('button', { name: 'Excluir cofrinho…' })).toHaveCount(0);

    await criarCofrinho(page, 'Celular', '2.000,00');
    await abrirCofrinho(page, 'Celular');
    await page.getByRole('link', { name: 'Configurações do cofrinho' }).click();
    await page.getByRole('button', { name: 'Excluir cofrinho…' }).click();
    await page
      .getByRole('dialog', { name: 'Excluir o cofrinho?' })
      .getByRole('button', { name: 'Excluir cofrinho' })
      .click();
    await expect(page.getByRole('heading', { level: 1, name: 'Cofrinhos' })).toBeVisible();
    await expect(page.locator('[data-cofrinho]', { hasText: 'Celular' })).toHaveCount(0);

    await irPeloMenu(page, 'Histórico', 'Histórico e lixeira');
    await expect(page.locator('tr[data-lixeira]', { hasText: 'Celular' })).toContainText(
      '180 dias',
    );
  });
});

test.describe('Dados de demonstração dos cofrinhos (RNF-061)', () => {
  test('cofrinhos em cada situação', async ({ page, monitor }) => {
    await page.clock.install({ time: AGORA });
    await criarCofre(page, undefined, { demonstracao: true });
    await irPeloMenu(page, 'Cofrinhos');

    await expect(page.locator('[data-cofrinho]')).toHaveCount(4);
    await expect(page.locator('[data-cofrinho]', { hasText: 'Curso de inglês' })).toContainText(
      'Meta atingida!',
    );
    await expect(
      page
        .locator('[data-cofrinho]', { hasText: 'Viagem de férias' })
        .locator('[data-planejamento]'),
    ).toContainText('por mês');
    await expect(
      page.locator('[data-cofrinho-encerrado]', { hasText: 'Presente de aniversário' }),
    ).toBeVisible();

    expect(await monitor.violacoesCsp()).toEqual([]);
  });
});

test.describe('Acessibilidade dos cofrinhos (RNF-020)', () => {
  test('lista e detalhe', async ({ page, browserName }) => {
    test.fixme(
      browserName === 'firefox',
      'axe + Firefox do Playwright: crash intermitente (ver CLAUDE.md)',
    );
    await page.clock.install({ time: AGORA });
    await criarCofre(page, undefined, { demonstracao: true });
    const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
    const analisar = async (nome: string) =>
      expect((await new AxeBuilder({ page }).withTags(TAGS).analyze()).violations, nome).toEqual(
        [],
      );

    await irPeloMenu(page, 'Cofrinhos');
    await analisar('Lista de cofrinhos');
    await page.getByRole('link', { name: 'Viagem de férias', exact: true }).click();
    await expect(page.locator('tr[data-movimentacao]').first()).toBeVisible();
    await analisar('Detalhe do cofrinho');
  });
});
