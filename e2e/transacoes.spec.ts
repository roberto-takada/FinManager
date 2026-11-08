import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { bloquear, criarCofre, desbloquear, irPeloMenu, lerIndexedDb } from './cofre.helpers';
import { expect, test } from './fixtures';

/** Data local no formato AAAA-MM-DD, `meses` meses atrás (dia 1, para evitar fim de mês). */
function data(mesesAtras = 0, dia?: number): string {
  const hoje = new Date();
  const d =
    mesesAtras === 0 && dia === undefined
      ? hoje
      : new Date(hoje.getFullYear(), hoje.getMonth() - mesesAtras, dia ?? 1);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

async function criarConta(page: Page, nome: string, saldo = '0,00', tipo = 'Conta corrente') {
  await irPeloMenu(page, 'Contas');
  await page.getByLabel('Nome da conta').fill(nome);
  await page.getByLabel('Tipo de conta').selectOption({ label: tipo });
  await page.getByLabel('Saldo inicial (R$)').fill(saldo);
  await page.getByRole('button', { name: 'Adicionar conta' }).click();
  await expect(page.locator('tr[data-conta]', { hasText: nome })).toBeVisible();
}

interface NovaTransacao {
  tipo?: 'Receita' | 'Despesa' | 'Transferência';
  valor: string;
  data?: string;
  descricao?: string;
  categoria?: string;
  conta: string;
  destino?: string;
  recorrente?: 'Todo mês' | 'Toda semana' | 'Todo ano';
}

async function preencherTransacao(page: Page, t: NovaTransacao) {
  await page.getByRole('radio', { name: t.tipo ?? 'Despesa', exact: true }).check();
  await page.getByLabel('Valor (R$)').fill(t.valor);
  if (t.data) await page.getByLabel(/^Data/).fill(t.data);
  if (t.descricao !== undefined) await page.getByLabel('Descrição (opcional)').fill(t.descricao);
  if (t.categoria) await page.getByLabel('Categoria').selectOption({ label: t.categoria });
  await page
    .getByLabel(t.destino ? 'Conta de origem' : 'Conta', { exact: true })
    .selectOption({ label: t.conta });
  if (t.destino) await page.getByLabel('Conta de destino').selectOption({ label: t.destino });
}

async function novaTransacao(page: Page, t: NovaTransacao) {
  await irPeloMenu(page, 'Transações');
  await page.getByRole('link', { name: 'Nova transação' }).click();
  await preencherTransacao(page, t);
  if (t.recorrente) {
    await page.getByRole('radio', { name: 'Recorrente' }).check();
    await page.getByLabel('Frequência').selectOption({ label: t.recorrente });
  }
  await page.getByRole('button', { name: 'Salvar transação' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Transações' })).toBeVisible();
}

const linha = (page: Page, texto: string | RegExp) =>
  page.locator('tr[data-transacao]', { hasText: texto });

test.describe('Transações (RF-010, RF-011, US-001)', () => {
  test.beforeEach(async ({ page }) => {
    await criarCofre(page);
    await criarConta(page, 'Banco Teste', '1.000,00');
  });

  test('registra uma despesa: aparece na lista e o saldo é atualizado', async ({ page }) => {
    await novaTransacao(page, {
      valor: '120,50',
      descricao: 'Supermercado',
      categoria: 'Alimentação › Mercado',
      conta: 'Banco Teste',
    });

    await expect(linha(page, 'Supermercado')).toContainText('120,50');
    await expect(linha(page, 'Supermercado')).toContainText('Alimentação › Mercado');
    await irPeloMenu(page, 'Contas');
    await expect(page.locator('tr[data-conta]', { hasText: 'Banco Teste' })).toContainText(
      '879,50',
    );
  });

  test('valor zero, negativo ou vazio mostra erro junto ao campo', async ({ page }) => {
    await irPeloMenu(page, 'Transações');
    await page.getByRole('link', { name: 'Nova transação' }).click();
    for (const valor of ['0', '-5,00', '']) {
      await page.getByLabel('Valor (R$)').fill(valor);
      await page.getByRole('button', { name: 'Salvar transação' }).click();
      await expect(page.getByText('Informe um valor maior que zero.')).toBeVisible();
      await expect(page.getByLabel('Valor (R$)')).toHaveAttribute('aria-invalid', 'true');
    }
    await expect(page.getByRole('heading', { level: 1, name: 'Nova transação' })).toBeVisible();
  });

  test('editar a descrição não pede confirmação; editar o valor pede e vai para o histórico (RN-003, RN-004)', async ({
    page,
  }) => {
    await novaTransacao(page, {
      valor: '50,00',
      descricao: 'Farmácia',
      categoria: 'Saúde',
      conta: 'Banco Teste',
    });

    await linha(page, 'Farmácia')
      .getByRole('link', { name: /Editar/ })
      .click();
    await page.getByLabel('Descrição (opcional)').fill('Farmácia do bairro');
    await page.getByRole('button', { name: 'Salvar transação' }).click();
    await expect(linha(page, 'Farmácia do bairro')).toBeVisible();

    await linha(page, 'Farmácia do bairro')
      .getByRole('link', { name: /Editar/ })
      .click();
    await page.getByLabel('Valor (R$)').fill('65,00');
    await page.getByRole('button', { name: 'Salvar transação' }).click();
    const dialogo = page.getByRole('dialog', { name: /Alterar valor, data ou tipo/ });
    await expect(dialogo).toContainText('50,00');
    await expect(dialogo.getByRole('button', { name: 'Cancelar' })).toBeFocused();
    await dialogo.getByRole('button', { name: 'Salvar alteração' }).click();
    await expect(linha(page, 'Farmácia do bairro')).toContainText('65,00');

    await irPeloMenu(page, 'Histórico', 'Histórico e lixeira');
    const eventos = page.locator('li[data-evento]');
    await expect(eventos).toHaveCount(1);
    await expect(eventos.first()).toContainText('Edição de transação');
    await expect(eventos.first()).toContainText('50,00');
  });

  test('excluir pede confirmação, vai para a lixeira e pode ser restaurada (RN-003, RN-004)', async ({
    page,
  }) => {
    await novaTransacao(page, {
      valor: '30,00',
      descricao: 'Cinema',
      categoria: 'Lazer',
      conta: 'Banco Teste',
    });

    await linha(page, 'Cinema')
      .getByRole('button', { name: /Excluir/ })
      .click();
    const dialogo = page.getByRole('dialog', { name: 'Excluir transação?' });
    await dialogo.getByRole('button', { name: 'Cancelar' }).click();
    await expect(linha(page, 'Cinema')).toBeVisible();

    await linha(page, 'Cinema')
      .getByRole('button', { name: /Excluir/ })
      .click();
    await dialogo.getByRole('button', { name: 'Excluir transação' }).click();
    await expect(linha(page, 'Cinema')).toHaveCount(0);

    await irPeloMenu(page, 'Histórico', 'Histórico e lixeira');
    const item = page.locator('tr[data-lixeira]', { hasText: 'Cinema' });
    await expect(item).toContainText('180 dias');
    await expect(page.locator('li[data-evento]').first()).toContainText('Exclusão de transação');
    await item.getByRole('button', { name: /Restaurar/ }).click();
    await expect(page.getByText('A lixeira está vazia.')).toBeVisible();

    await irPeloMenu(page, 'Transações');
    await expect(linha(page, 'Cinema')).toBeVisible();
  });

  test('parcelamento (RF-013) não é oferecido enquanto as faturas (RF-100) não existem', async ({
    page,
  }) => {
    await irPeloMenu(page, 'Transações');
    await page.getByRole('link', { name: 'Nova transação' }).click();
    await page.getByRole('radio', { name: 'Despesa', exact: true }).check();
    await expect(page.getByRole('radio', { name: 'Só uma vez' })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Parcelada' })).toHaveCount(0);
  });

  test('recorrente (RF-012): registra as ocorrências até hoje', async ({ page }) => {
    await novaTransacao(page, {
      valor: '89,90',
      data: data(2),
      descricao: 'Academia',
      categoria: 'Saúde',
      conta: 'Banco Teste',
      recorrente: 'Todo mês',
    });

    await expect(linha(page, 'Academia')).toHaveCount(3);
    await irPeloMenu(page, 'Recorrências');
    await expect(page.locator('tr[data-recorrencia]', { hasText: 'Academia' })).toContainText(
      'Todo mês',
    );
  });

  test('transferência (RF-017) muda saldos mas não entra nos totais', async ({ page }) => {
    await criarConta(page, 'Carteira Teste', '0,00', 'Carteira');
    await novaTransacao(page, {
      tipo: 'Transferência',
      valor: '200,00',
      descricao: 'Saque',
      conta: 'Banco Teste',
      destino: 'Carteira Teste',
    });

    await expect(linha(page, 'Saque')).toContainText('Banco Teste → Carteira Teste');
    await expect(page.locator('[data-total="despesas"]')).toContainText('0,00');
    await expect(page.locator('[data-total="receitas"]')).toContainText('0,00');
    await irPeloMenu(page, 'Contas');
    await expect(page.locator('tr[data-conta]', { hasText: 'Carteira Teste' })).toContainText(
      '200,00',
    );
    await expect(page.locator('tr[data-conta]', { hasText: 'Banco Teste' })).toContainText(
      '800,00',
    );
  });

  test('filtros e busca (RF-014)', async ({ page }) => {
    await novaTransacao(page, {
      valor: '10,00',
      data: data(1, 10),
      descricao: 'Pão de açúcar',
      categoria: 'Alimentação › Mercado',
      conta: 'Banco Teste',
    });
    await novaTransacao(page, {
      valor: '40,00',
      descricao: 'Pizzaria',
      categoria: 'Alimentação › Restaurantes',
      conta: 'Banco Teste',
    });
    await novaTransacao(page, {
      tipo: 'Receita',
      valor: '500,00',
      descricao: 'Projeto',
      categoria: 'Renda extra › Freelance',
      conta: 'Banco Teste',
    });

    await expect(page.locator('tr[data-transacao]')).toHaveCount(3);
    await page.getByLabel('Buscar').fill('acucar');
    await expect(page.locator('tr[data-transacao]')).toHaveCount(1);
    await page.getByRole('button', { name: 'Limpar filtros' }).click();

    await page.getByLabel('Tipo', { exact: true }).selectOption({ label: 'Receita' });
    await expect(page.locator('tr[data-transacao]')).toHaveCount(1);
    await expect(page.locator('[data-total="receitas"]')).toContainText('500,00');
    await page.getByRole('button', { name: 'Limpar filtros' }).click();

    await page.getByLabel('Categoria').selectOption({ label: 'Alimentação' });
    await expect(page.locator('tr[data-transacao]')).toHaveCount(2);
    await page.getByLabel('De', { exact: true }).fill(data());
    await expect(page.locator('tr[data-transacao]')).toHaveCount(1);
    await expect(page.getByRole('status')).toContainText('1 transação encontrada');
  });
});

test.describe('Categorias e contas (RF-015, RF-016)', () => {
  test('cria subcategoria e a usa; categoria em uso não pode ser excluída', async ({ page }) => {
    await criarCofre(page);
    await criarConta(page, 'Banco Teste');
    await irPeloMenu(page, 'Categorias');
    await page.getByLabel('Nome da categoria').fill('Pets');
    await page.getByRole('button', { name: 'Adicionar categoria' }).click();
    await expect(page.locator('li[data-categoria]', { hasText: 'Pets' })).toBeVisible();
    await page.getByLabel('Nome da categoria').fill('Ração');
    await page.getByLabel('Subcategoria de (opcional)').selectOption({ label: 'Pets' });
    await page.getByRole('button', { name: 'Adicionar categoria' }).click();
    await expect(page.locator('li[data-categoria]', { hasText: 'Ração' })).toBeVisible();

    await novaTransacao(page, {
      valor: '90,00',
      descricao: 'Ração do gato',
      categoria: 'Pets › Ração',
      conta: 'Banco Teste',
    });
    await irPeloMenu(page, 'Categorias');
    await page
      .locator('li[data-categoria]', { hasText: 'Ração' })
      .getByRole('button', { name: /Excluir/ })
      .click();
    await page.getByRole('dialog').getByRole('button', { name: 'Excluir categoria' }).click();
    await expect(page.getByRole('alert')).toContainText('é usada em 1 transação');
  });
});

test.describe('Persistência e criptografia (RN-001, RNF-004)', () => {
  test('os dados sobrevivem a bloquear/recarregar e ficam cifrados no IndexedDB', async ({
    page,
  }) => {
    await criarCofre(page);
    await criarConta(page, 'Banco Sigiloso');
    await novaTransacao(page, {
      valor: '12,34',
      descricao: 'Padaria Fictícia',
      categoria: 'Alimentação',
      conta: 'Banco Sigiloso',
    });

    const conteudo = await lerIndexedDb(page);
    expect(conteudo).not.toContain('Padaria');
    expect(conteudo).not.toContain('Banco Sigiloso');

    await page.reload();
    await desbloquear(page);
    await irPeloMenu(page, 'Transações');
    await expect(linha(page, 'Padaria Fictícia')).toContainText('12,34');

    await bloquear(page);
    await page.goto('/transacoes');
    await expect(page).toHaveURL(/\/cofre\/desbloquear$/);
  });
});

test.describe('Dados de demonstração (RNF-061)', () => {
  test('cria o cofre com 6 meses de uso fictício', async ({ page, monitor }) => {
    await criarCofre(page, undefined, { demonstracao: true });

    await irPeloMenu(page, 'Contas');
    await expect(page.locator('tr[data-conta]')).toHaveCount(4);
    await irPeloMenu(page, 'Recorrências');
    await expect(page.locator('tr[data-recorrencia]')).toHaveCount(6);
    await irPeloMenu(page, 'Transações');
    await expect(page.getByRole('status')).toContainText(/\d{3,} transações encontradas/);
    await page.getByLabel('Buscar').fill('Salário');
    await expect(linha(page, 'Salário')).toHaveCount(6);
    await page.getByRole('button', { name: 'Limpar filtros' }).click();

    await page.getByLabel('De', { exact: true }).fill(data(6, 1));
    await page.getByLabel('Até', { exact: true }).fill(data(5, 1));
    await expect(page.locator('tr[data-transacao]').first()).toBeVisible();

    expect(await monitor.violacoesCsp()).toEqual([]);
    expect(monitor.requisicoesExternas).toEqual([]);
  });
});

test.describe('Acessibilidade das telas financeiras (RNF-020)', () => {
  const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

  test('transações, formulário, contas, categorias, recorrências e histórico', async ({
    page,
    browserName,
  }) => {
    test.fixme(
      browserName === 'firefox',
      'axe + Firefox do Playwright: crash intermitente (ver CLAUDE.md)',
    );
    await criarCofre(page, undefined, { demonstracao: true });
    for (const [item, titulo] of [
      ['Transações', 'Transações'],
      ['Contas', 'Contas'],
      ['Categorias', 'Categorias'],
      ['Recorrências', 'Recorrências'],
      ['Histórico', 'Histórico e lixeira'],
    ] as const) {
      await irPeloMenu(page, item, titulo);
      const resultado = await new AxeBuilder({ page }).withTags(TAGS).analyze();
      expect(resultado.violations, `${titulo}`).toEqual([]);
    }
    await irPeloMenu(page, 'Transações');
    await page.getByRole('link', { name: 'Nova transação' }).click();
    const resultado = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(resultado.violations).toEqual([]);
  });
});
