import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { bloquear, criarCofre, desbloquear, irPeloMenu } from './cofre.helpers';
import { expect, test } from './fixtures';

/**
 * Relógio fixo: quarta-feira, 18/11/2026. Ontem = 17/11, amanhã = 19/11, tudo na mesma
 * semana e no mesmo mês, para os testes não dependerem do dia em que rodam.
 */
const AGORA = new Date('2026-11-18T12:00:00');

declare global {
  interface Window {
    __notificacoes: { pedidos: number; enviadas: { titulo: string; corpo: string }[] };
    __respostaPermissao: NotificationPermission;
  }
}

/** Substitui a Notifications API por uma versão que registra tudo (RF-024, RF-026). */
async function simularNotificacoes(page: Page, resposta: NotificationPermission = 'granted') {
  await page.addInitScript((respostaInicial) => {
    window.__notificacoes = { pedidos: 0, enviadas: [] };
    window.__respostaPermissao = respostaInicial;
    class NotificacaoFalsa {
      static permission: NotificationPermission = 'default';
      static async requestPermission() {
        window.__notificacoes.pedidos++;
        NotificacaoFalsa.permission = window.__respostaPermissao;
        return NotificacaoFalsa.permission;
      }
      constructor(titulo: string, opcoes?: NotificationOptions) {
        window.__notificacoes.enviadas.push({ titulo, corpo: opcoes?.body ?? '' });
      }
    }
    Object.defineProperty(window, 'Notification', {
      value: NotificacaoFalsa,
      configurable: true,
      writable: true,
    });
  }, resposta);
}

const registro = (page: Page) => page.evaluate(() => window.__notificacoes);

async function criarContaFinanceira(page: Page) {
  await irPeloMenu(page, 'Contas');
  await page.getByRole('link', { name: 'Nova conta' }).click();
  await page.getByLabel('Nome da conta').fill('Banco Teste');
  await page.getByLabel('Saldo inicial (R$)').fill('1.000,00');
  await page.getByRole('button', { name: 'Salvar conta' }).click();
  await expect(page.locator('tr[data-conta]', { hasText: 'Banco Teste' })).toBeVisible();
}

async function novaContaAgendada(
  page: Page,
  dados: {
    descricao: string;
    valor: string;
    vencimento: string;
    categoria: string;
    tipo?: 'A pagar' | 'A receber';
    mensal?: boolean;
  },
) {
  await irPeloMenu(page, 'A pagar e receber', 'Contas a pagar e a receber');
  await page.getByRole('link', { name: 'Nova conta' }).click();
  await page.getByRole('radio', { name: dados.tipo ?? 'A pagar' }).check();
  await page.getByLabel('Descrição').fill(dados.descricao);
  await page.getByLabel('Valor (R$)').fill(dados.valor);
  await page.getByLabel(/Vencimento|Primeiro vencimento/).fill(dados.vencimento);
  await page.getByLabel('Categoria').selectOption({ label: dados.categoria });
  await page
    .getByLabel('Conta para pagar/receber (opcional)')
    .selectOption({ label: 'Banco Teste' });
  if (dados.mensal) await page.getByLabel('Repetir esta conta').check();
  await page.getByRole('button', { name: 'Salvar conta' }).click();
  await expect(page.locator('tr[data-conta-agendada]', { hasText: dados.descricao })).toBeVisible();
}

const ocorrencia = (page: Page, descricao: string) =>
  page.locator('[data-ocorrencia]', { hasText: descricao });

test.describe('Contas a pagar/receber e calendário (RF-020 a RF-023, US-004)', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: AGORA });
    await criarCofre(page);
    await criarContaFinanceira(page);
  });

  test('cada conta aparece no dia do vencimento, com a situação em texto e símbolo', async ({
    page,
  }) => {
    await novaContaAgendada(page, {
      descricao: 'Internet',
      valor: '120,00',
      vencimento: '2026-11-17',
      categoria: 'Moradia › Contas da casa',
    });
    await novaContaAgendada(page, {
      descricao: 'Escola',
      valor: '900,00',
      vencimento: '2026-11-19',
      categoria: 'Educação',
    });

    await irPeloMenu(page, 'Calendário');
    await expect(page.locator('[data-titulo-calendario]')).toHaveText('novembro de 2026');
    const internet = page.locator('td[data-dia="2026-11-17"]').locator('[data-ocorrencia]');
    await expect(internet).toContainText('Internet');
    await expect(internet).toContainText('Vencida');
    await expect(internet).toContainText('!');
    await expect(page.locator('td[data-dia="2026-11-19"]')).toContainText('Escola');
    await expect(ocorrencia(page, 'Escola')).toContainText('Pendente');
    await expect(page.locator('td[aria-current="date"]')).toHaveAttribute('data-dia', '2026-11-18');
  });

  test('conta mensal aparece em todos os meses; visão semanal e navegação (RF-021)', async ({
    page,
  }) => {
    await novaContaAgendada(page, {
      descricao: 'Condomínio',
      valor: '550,00',
      vencimento: '2026-11-19',
      categoria: 'Moradia',
      mensal: true,
    });
    await irPeloMenu(page, 'Calendário');

    await page.getByRole('button', { name: 'Próximo mês' }).click();
    await expect(page.locator('[data-titulo-calendario]')).toHaveText('dezembro de 2026');
    await expect(page.locator('td[data-dia="2026-12-19"]')).toContainText('Condomínio');

    await page.getByRole('button', { name: 'Hoje' }).click();
    await page.getByRole('button', { name: 'Semana', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Semana', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.locator('[data-titulo-calendario]')).toHaveText('15/11/2026 a 21/11/2026');
    await expect(page.locator('td[data-dia]')).toHaveCount(7);
    await expect(ocorrencia(page, 'Condomínio')).toBeVisible();
  });

  test('marcar como paga gera a transação; desfazer reabre a conta (RF-023, RN-003, RN-004)', async ({
    page,
  }) => {
    await novaContaAgendada(page, {
      descricao: 'Conta de luz',
      valor: '180,00',
      vencimento: '2026-11-17',
      categoria: 'Moradia › Contas da casa',
    });
    await irPeloMenu(page, 'Calendário');
    await ocorrencia(page, 'Conta de luz').click();

    const detalhe = page.locator('[data-detalhe]');
    await expect(detalhe.getByLabel('Pago com a conta')).toHaveValue(/.+/);
    await detalhe.getByLabel('Valor (R$)').fill('195,40');
    await detalhe.getByRole('button', { name: 'Confirmar pagamento' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Pagamento registrado.' }),
    ).toBeVisible();
    await expect(ocorrencia(page, 'Conta de luz')).toContainText('Paga');
    await expect(page.locator('[data-situacao-detalhe]')).toContainText('✓ Paga');

    await irPeloMenu(page, 'Transações');
    await expect(page.locator('tr[data-transacao]', { hasText: 'Conta de luz' })).toContainText(
      '195,40',
    );
    await irPeloMenu(page, 'Contas');
    await expect(page.locator('tr[data-conta]', { hasText: 'Banco Teste' })).toContainText(
      '804,60',
    );

    await irPeloMenu(page, 'Calendário');
    await ocorrencia(page, 'Conta de luz').click();
    await page.getByRole('button', { name: 'Desfazer pagamento' }).click();
    const dialogo = page.getByRole('dialog', { name: 'Desfazer?' });
    await expect(dialogo.getByRole('button', { name: 'Cancelar' })).toBeFocused();
    await dialogo.getByRole('button', { name: 'Desfazer e excluir a transação' }).click();
    await expect(ocorrencia(page, 'Conta de luz')).toContainText('Vencida');

    await irPeloMenu(page, 'Histórico', 'Histórico e lixeira');
    await expect(page.locator('tr[data-lixeira]', { hasText: 'Conta de luz' })).toBeVisible();
  });

  test('conta a receber vira receita e aparece como "Recebida"', async ({ page }) => {
    await novaContaAgendada(page, {
      tipo: 'A receber',
      descricao: 'Reembolso',
      valor: '420,00',
      vencimento: '2026-11-19',
      categoria: 'Outras receitas',
    });
    await irPeloMenu(page, 'Calendário');
    await ocorrencia(page, 'Reembolso').click();
    await page.getByRole('button', { name: 'Confirmar recebimento' }).click();
    await expect(ocorrencia(page, 'Reembolso')).toContainText('Recebida');
  });

  test('excluir a conta pede confirmação e a tira do calendário (RN-003)', async ({ page }) => {
    await novaContaAgendada(page, {
      descricao: 'Academia',
      valor: '99,00',
      vencimento: '2026-11-19',
      categoria: 'Saúde',
      mensal: true,
    });
    await page
      .locator('tr[data-conta-agendada]', { hasText: 'Academia' })
      .getByRole('button', { name: /Excluir/ })
      .click();
    await page.getByRole('dialog').getByRole('button', { name: 'Excluir conta' }).click();
    await expect(page.getByText('Nenhuma conta cadastrada.')).toBeVisible();
    await irPeloMenu(page, 'Calendário');
    await expect(ocorrencia(page, 'Academia')).toHaveCount(0);
  });

  test('exportar iCal avisa que o arquivo não é cifrado (RF-025)', async ({ page }) => {
    await novaContaAgendada(page, {
      descricao: 'Condomínio',
      valor: '550,00',
      vencimento: '2026-11-19',
      categoria: 'Moradia',
      mensal: true,
    });
    await irPeloMenu(page, 'Calendário');
    await page.getByRole('button', { name: 'Exportar calendário (.ics)' }).click();
    const dialogo = page.getByRole('dialog', { name: 'Exportar o calendário sem proteção?' });
    await expect(dialogo).toContainText('NÃO é criptografado');

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      dialogo.getByRole('button', { name: 'Exportar mesmo assim' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('finmanager-calendario.ics');
    const { readFile } = await import('node:fs/promises');
    const ics = await readFile(await download.path(), 'utf8');
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('RRULE:FREQ=MONTHLY');
    expect(ics).toContain('Condomínio');
  });
});

test.describe('Alertas e notificações (RF-024, RF-026)', () => {
  test('a permissão só é pedida no clique; o texto padrão não mostra valores nem descrições', async ({
    page,
  }) => {
    await simularNotificacoes(page, 'granted');
    await page.clock.install({ time: AGORA });
    await criarCofre(page);
    await criarContaFinanceira(page);
    await novaContaAgendada(page, {
      descricao: 'Conta de luz',
      valor: '180,00',
      vencimento: '2026-11-19',
      categoria: 'Moradia › Contas da casa',
    });
    await novaContaAgendada(page, {
      descricao: 'Internet',
      valor: '120,00',
      vencimento: '2026-11-19',
      categoria: 'Moradia › Contas da casa',
    });
    await irPeloMenu(page, 'Calendário');
    await irPeloMenu(page, 'Início');

    expect(await registro(page)).toEqual({ pedidos: 0, enviadas: [] });

    await irPeloMenu(page, 'A pagar e receber', 'Contas a pagar e a receber');
    await page.getByRole('button', { name: 'Ativar notificações do navegador' }).click();
    await expect(page.locator('[data-estado-notificacoes]')).toContainText(
      'Notificações ativadas.',
    );

    const { pedidos, enviadas } = await registro(page);
    expect(pedidos).toBe(1);
    expect(enviadas).toEqual([
      { titulo: 'FinManager: contas a vencer', corpo: '2 contas vencem amanhã.' },
    ]);
    expect(enviadas[0]!.corpo).not.toMatch(/luz|Internet|R\$|180/);
  });

  test('com detalhes ativados, a notificação mostra descrição e valor', async ({ page }) => {
    await simularNotificacoes(page, 'granted');
    await page.clock.install({ time: AGORA });
    await criarCofre(page);
    await criarContaFinanceira(page);
    await novaContaAgendada(page, {
      descricao: 'Conta de luz',
      valor: '180,00',
      vencimento: '2026-11-19',
      categoria: 'Moradia › Contas da casa',
    });
    await page.getByLabel('Mostrar descrições e valores nas notificações').check();
    await expect(page.getByRole('status').filter({ hasText: 'Preferência salva.' })).toBeVisible();
    await page.getByRole('button', { name: 'Ativar notificações do navegador' }).click();
    await expect
      .poll(async () => (await registro(page)).enviadas[0]?.corpo ?? '')
      .toContain('Conta de luz');
  });

  test('permissão negada: nada é notificado e os alertas aparecem no Início ao desbloquear', async ({
    page,
  }) => {
    await simularNotificacoes(page, 'denied');
    await page.clock.install({ time: AGORA });
    await criarCofre(page);
    await criarContaFinanceira(page);
    await novaContaAgendada(page, {
      descricao: 'Conta de luz',
      valor: '180,00',
      vencimento: '2026-11-17',
      categoria: 'Moradia › Contas da casa',
    });
    await page.getByRole('button', { name: 'Ativar notificações do navegador' }).click();
    await expect(
      page.getByText('Permissão não concedida. Os alertas continuam na tela Início.'),
    ).toBeVisible();
    await expect(page.locator('[data-estado-notificacoes]')).toContainText('bloqueadas');
    expect((await registro(page)).enviadas).toEqual([]);

    await bloquear(page);
    await desbloquear(page);
    const alerta = page.locator('[data-alerta]', { hasText: 'Conta de luz' });
    await expect(alerta).toContainText('vencida (17/11/2026)');
    await expect(alerta).toHaveAttribute('data-proximidade', 'vencida');
  });

  test('a antecedência configurada vale para os alertas do Início', async ({ page }) => {
    await page.clock.install({ time: AGORA });
    await criarCofre(page);
    await criarContaFinanceira(page);
    await novaContaAgendada(page, {
      descricao: 'IPVA',
      valor: '1.250,00',
      vencimento: '2026-11-23',
      categoria: 'Transporte',
    });
    await irPeloMenu(page, 'Início');
    await expect(page.locator('[data-alerta]')).toHaveCount(0); // padrão: 3 dias

    await irPeloMenu(page, 'A pagar e receber', 'Contas a pagar e a receber');
    await page
      .getByLabel('Avisar sobre contas que vencem em até')
      .selectOption({ label: '5 dias' });
    await expect(page.getByRole('status').filter({ hasText: 'Antecedência salva.' })).toBeVisible();
    await irPeloMenu(page, 'Início');
    await expect(page.locator('[data-alerta]', { hasText: 'IPVA' })).toBeVisible();
  });
});

test.describe('Dados de demonstração da agenda (RNF-061)', () => {
  test('o cofre de demonstração já traz contas, pagamentos e alertas', async ({
    page,
    monitor,
  }) => {
    await page.clock.install({ time: AGORA });
    await criarCofre(page, undefined, { demonstracao: true });

    await expect(page.locator('[data-alerta]', { hasText: 'Seguro do celular' })).toHaveAttribute(
      'data-proximidade',
      'amanha',
    );
    await expect(
      page.locator('[data-alerta][data-proximidade="vencida"]', { hasText: 'Conta de luz' }),
    ).toBeVisible();

    await irPeloMenu(page, 'A pagar e receber', 'Contas a pagar e a receber');
    await expect(page.locator('tr[data-conta-agendada]')).toHaveCount(7);
    await irPeloMenu(page, 'Calendário');
    await expect(page.locator('[data-situacao="paga"]').first()).toBeVisible();
    await expect(page.locator('[data-situacao="pendente"]').first()).toBeVisible();

    expect(await monitor.violacoesCsp()).toEqual([]);
    expect(monitor.requisicoesExternas).toEqual([]);
  });
});

test.describe('Acessibilidade da agenda (RNF-020)', () => {
  test('calendário (mês e semana) e cadastro', async ({ page, browserName }) => {
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

    await analisar('Início com alertas');
    await irPeloMenu(page, 'Calendário');
    await analisar('Calendário (mês)');
    await page.locator('[data-ocorrencia]').first().click();
    await analisar('Calendário com detalhe');
    await page.getByRole('button', { name: 'Semana', exact: true }).click();
    await analisar('Calendário (semana)');
    await irPeloMenu(page, 'A pagar e receber', 'Contas a pagar e a receber');
    await analisar('Contas a pagar e a receber');
  });
});
