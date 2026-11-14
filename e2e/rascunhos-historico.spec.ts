import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import {
  bloquear,
  criarCofre,
  desbloquear,
  irPeloMenu,
  lerChaveExibida,
  lerIndexedDb,
  preencherGrupos,
  preencherSenhaDeCriacao,
} from './cofre.helpers';
import { PORTA_ESTATICA } from '../playwright.config';
import { expect, test } from './fixtures';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const MODO_DEV = process.env['E2E_MODO'] === 'dev';

const salvoAutomaticamente = (page: Page) => page.locator('[data-rascunho-salvo]');
const avisoRascunhos = (page: Page) => page.locator('[data-rascunhos-pendentes]');
const avisoDesfazer = (page: Page) => page.locator('[data-aviso-desfazer]');

async function abrirNovaConta(page: Page): Promise<void> {
  await irPeloMenu(page, 'Contas');
  await page.getByRole('link', { name: 'Nova conta' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Nova conta' })).toBeVisible();
}

test.describe('Rascunhos (RF-070 a RF-072, US-002)', () => {
  test('o formulário é salvo cifrado enquanto digito e volta depois de fechar a aba', async ({
    page,
  }) => {
    await criarCofre(page, undefined, { demonstracao: true });
    await irPeloMenu(page, 'Transações');
    await page.getByRole('link', { name: 'Nova transação' }).click();
    await page.getByLabel('Valor (R$)').fill('87,65');
    await page.getByLabel('Descrição (opcional)').fill('Feira orgânica fictícia');
    await expect(salvoAutomaticamente(page)).toContainText('Rascunho salvo neste navegador');
    expect(await lerIndexedDb(page)).not.toContain('Feira orgânica');

    // RF-072: fechar/recarregar com alterações não salvas pede confirmação do navegador.
    const dialogos: string[] = [];
    page.on('dialog', (d) => {
      dialogos.push(d.type());
      void d.accept();
    });
    await page.reload();
    expect(dialogos).toContain('beforeunload');

    // RF-071: depois de desbloquear, o app oferece restaurar.
    await desbloquear(page);
    const aviso = avisoRascunhos(page);
    await expect(
      aviso.getByRole('heading', { name: 'Um formulário ficou sem salvar' }),
    ).toBeVisible();
    await expect(aviso.locator('[data-rascunho]')).toContainText('Nova transação');
    await aviso.getByRole('button', { name: 'Restaurar rascunho: Nova transação' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Nova transação' })).toBeVisible();
    await expect(page.getByLabel('Valor (R$)')).toHaveValue('87,65');
    await expect(page.getByLabel('Descrição (opcional)')).toHaveValue('Feira orgânica fictícia');
    await expect(avisoRascunhos(page)).toHaveCount(0);

    await page.getByLabel('Categoria').selectOption({ index: 1 });
    await page.getByLabel('Conta', { exact: true }).selectOption({ index: 1 });
    await page.getByRole('button', { name: 'Salvar transação' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Transações' })).toBeVisible();
    await expect(page.locator('tr[data-transacao]', { hasText: 'Feira orgânica' })).toBeVisible();

    // Salvo de verdade: o rascunho saiu junto, e nada é oferecido ao reabrir.
    await bloquear(page);
    await desbloquear(page);
    await expect(page.getByRole('heading', { level: 1, name: 'Início' })).toBeVisible();
    await expect(avisoRascunhos(page)).toHaveCount(0);
  });

  test('sair pelo menu com alterações pergunta antes; "Cancelar" continua editando', async ({
    page,
  }) => {
    await criarCofre(page);
    await abrirNovaConta(page);
    await page.getByLabel('Nome da conta').fill('Conta Rascunho');

    const menu = page.getByRole('navigation', { name: 'Principal' });
    await menu.getByRole('link', { name: 'Início', exact: true }).click();
    const dialogo = page.getByRole('dialog', { name: 'Sair sem salvar?' });
    await expect(dialogo).toContainText('"Nova conta" ainda não foram salvas');
    await expect(dialogo.getByRole('button', { name: 'Cancelar' })).toBeFocused();
    await dialogo.getByRole('button', { name: 'Cancelar' }).click();
    await expect(page).toHaveURL(/\/contas\/nova$/);
    await expect(page.getByLabel('Nome da conta')).toHaveValue('Conta Rascunho');

    await menu.getByRole('link', { name: 'Início', exact: true }).click();
    await dialogo.getByRole('button', { name: 'Sair sem salvar' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Início' })).toBeVisible();
    // Quem escolheu sair sem salvar não recebe o rascunho de volta.
    await expect(avisoRascunhos(page)).toHaveCount(0);

    // Sem alterações, sai sem perguntar.
    await abrirNovaConta(page);
    await menu.getByRole('link', { name: 'Início', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Início' })).toBeVisible();
  });

  test('bloquear não pergunta nada; o formulário oferece restaurar ou descartar', async ({
    page,
  }) => {
    await criarCofre(page);
    await abrirNovaConta(page);
    await page.getByLabel('Nome da conta').fill('Conta Interrompida');
    await expect(salvoAutomaticamente(page)).toBeVisible();
    await bloquear(page);
    await desbloquear(page);
    await expect(avisoRascunhos(page)).toContainText('Nova conta');
    await page.getByRole('button', { name: 'Agora não' }).click();
    await expect(avisoRascunhos(page)).toHaveCount(0);

    // Abrindo o formulário direto: a oferta aparece nele, sem sobrescrever o rascunho.
    await abrirNovaConta(page);
    await expect(page.getByLabel('Nome da conta')).toHaveValue('');
    const oferta = page.getByRole('group', { name: 'Há um rascunho não salvo deste formulário' });
    await expect(oferta).toBeVisible();
    await oferta.getByRole('button', { name: 'Descartar rascunho' }).click();
    await expect(oferta).toHaveCount(0);
    await expect(page.getByLabel('Nome da conta')).toBeFocused();
    await expect(
      page.getByRole('status').filter({ hasText: 'Rascunho descartado.' }),
    ).toBeAttached();

    await irPeloMenu(page, 'Início');
    await expect(avisoRascunhos(page)).toHaveCount(0);
  });

  test('"Descartar" no aviso apaga o rascunho e devolve o foco à tela (US-002)', async ({
    page,
  }) => {
    await criarCofre(page);
    await abrirNovaConta(page);
    await page.getByLabel('Nome da conta').fill('Conta Esquecida');
    await expect(salvoAutomaticamente(page)).toBeVisible();
    await bloquear(page);
    await desbloquear(page);
    await avisoRascunhos(page)
      .getByRole('button', { name: 'Descartar rascunho: Nova conta' })
      .click();
    await expect(avisoRascunhos(page)).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1, name: 'Início' })).toBeFocused();
    await abrirNovaConta(page);
    await expect(page.getByRole('group', { name: /Há um rascunho/ })).toHaveCount(0);
  });

  test('editar uma conta: o rascunho guarda a edição e restaurar a traz de volta', async ({
    page,
  }) => {
    await criarCofre(page, undefined, { demonstracao: true });
    await irPeloMenu(page, 'Contas');
    await page.getByRole('link', { name: /Editar Carteira/ }).click();
    await page.getByLabel('Nome da conta').fill('Carteira de bolso');
    await expect(salvoAutomaticamente(page)).toBeVisible();
    await bloquear(page);
    await desbloquear(page);
    await avisoRascunhos(page)
      .getByRole('button', { name: 'Restaurar rascunho: Editar conta "Carteira"' })
      .click();
    await expect(page.getByLabel('Nome da conta')).toHaveValue('Carteira de bolso');
    await expect(
      page.getByRole('status').filter({ hasText: 'Rascunho restaurado' }),
    ).toBeAttached();
  });
});

test.describe('Desfazer e lixeira (RF-076, RF-077, RF-079)', () => {
  test('excluir mostra "Desfazer", que traz o item de volta (US-003)', async ({ page }) => {
    await criarCofre(page);
    await abrirNovaConta(page);
    await page.getByLabel('Nome da conta').fill('Conta Temporária');
    await page.getByRole('button', { name: 'Salvar conta' }).click();
    const linha = page.locator('tr[data-conta]', { hasText: 'Conta Temporária' });
    await linha.getByRole('button', { name: 'Excluir Conta Temporária' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Excluir conta' }).click();
    await expect(linha).toHaveCount(0);

    const aviso = avisoDesfazer(page);
    await expect(aviso).toContainText('Conta "Conta Temporária" excluída e enviada à lixeira.');
    await expect(aviso).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(aviso.getByRole('button', { name: 'Desfazer' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(avisoDesfazer(page)).toContainText('Exclusão desfeita');
    await expect(linha).toBeVisible();

    // Mudou de tela: o aviso some (o item continuaria restaurável pela lixeira).
    await irPeloMenu(page, 'Histórico', 'Histórico e lixeira');
    await expect(avisoDesfazer(page)).toHaveCount(0);
    await expect(page.locator('[data-evento]').first()).toContainText('Restauração de conta');
  });

  test('dados de demonstração na lixeira; excluir definitivamente e esvaziar pedem confirmação', async ({
    page,
  }) => {
    await criarCofre(page, undefined, { demonstracao: true });
    await irPeloMenu(page, 'Histórico', 'Histórico e lixeira');
    const itens = page.locator('tr[data-lixeira]');
    await expect(itens).toHaveCount(3);
    const revista = itens.filter({ hasText: 'Assinatura de revista' });
    await expect(revista).toContainText('5 dias');
    await expect(page.locator('[data-evento]', { hasText: 'Edição de transação' })).toBeVisible();

    await revista.getByRole('button', { name: /^Excluir definitivamente/ }).click();
    const dialogo = page.getByRole('dialog', { name: 'Excluir definitivamente?' });
    await expect(dialogo).toContainText('Esta ação não pode ser desfeita.');
    await expect(dialogo.getByRole('button', { name: 'Cancelar' })).toBeFocused();
    await dialogo.getByRole('button', { name: 'Excluir definitivamente' }).click();
    await expect(page.getByText(/Apagado definitivamente: Assinatura de revista/)).toBeVisible();
    await expect(itens).toHaveCount(2);
    await expect(page.locator('[data-evento]').first()).toContainText(
      'Exclusão definitiva de transação: 1 item',
    );
    await expect(page.locator('[data-evento]', { hasText: 'Assinatura de revista' })).toHaveCount(
      0,
    );

    await page.getByRole('button', { name: 'Esvaziar lixeira…' }).click();
    const esvaziar = page.getByRole('dialog', { name: 'Esvaziar a lixeira?' });
    await expect(esvaziar).toContainText('Os 2 itens da lixeira serão apagados definitivamente');
    await esvaziar.getByRole('button', { name: 'Esvaziar lixeira' }).click();
    await expect(page.getByText('A lixeira está vazia.')).toBeVisible();
    await expect(
      page.getByText('Lixeira esvaziada: 2 itens apagados definitivamente.'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Esvaziar lixeira…' })).toHaveCount(0);
  });

  test('acessibilidade (axe): lixeira, confirmação, aviso de rascunho e "Desfazer"', async ({
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
    await page.emulateMedia({ colorScheme: 'dark' });
    await criarCofre(page, undefined, { demonstracao: true });
    await irPeloMenu(page, 'Histórico', 'Histórico e lixeira');
    await analisar('Histórico e lixeira (escuro)');
    await page.getByRole('button', { name: 'Esvaziar lixeira…' }).click();
    await analisar('Confirmação de esvaziar (escuro)');
    await page.getByRole('button', { name: 'Cancelar' }).click();

    await abrirNovaConta(page);
    await page.getByLabel('Nome da conta').fill('Conta Axe');
    await expect(salvoAutomaticamente(page)).toBeVisible();
    await bloquear(page);
    await desbloquear(page);
    await expect(avisoRascunhos(page)).toBeVisible();
    await analisar('Aviso de rascunhos pendentes (escuro)');
    await abrirNovaConta(page);
    await analisar('Oferta de rascunho no formulário (escuro)');
    await page.getByRole('button', { name: 'Descartar rascunho' }).click();
    await page.getByLabel('Nome da conta').fill('Conta Axe');
    await page.getByRole('button', { name: 'Salvar conta' }).click();
    await page
      .locator('tr[data-conta]', { hasText: 'Conta Axe' })
      .getByRole('button', { name: /Excluir/ })
      .click();
    await page.getByRole('dialog').getByRole('button', { name: 'Excluir conta' }).click();
    await expect(avisoDesfazer(page)).toBeVisible();
    await analisar('Aviso "Desfazer" (escuro)');
  });
});

test.describe('Uso sem internet (RF-073)', () => {
  test.skip(MODO_DEV, 'o service worker só existe no build de produção');
  // Os arquivos exatamente como publicados (o service worker confere o hash de cada um).
  test.use({ baseURL: `http://localhost:${PORTA_ESTATICA}` });

  test('depois do primeiro acesso, abre e funciona offline', async ({ page, context }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Criar seu cofre' })).toBeVisible();
    await page.evaluate(() => navigator.serviceWorker.ready);
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    // Espera o service worker guardar todos os arquivos do app (inclusive as telas
    // carregadas sob demanda e as fontes) listados no ngsw.json gerado pelo build.
    await expect
      .poll(
        () =>
          page.evaluate(async () => {
            const manifesto = (await (await fetch('ngsw.json')).json()) as {
              assetGroups: { name: string; urls: string[] }[];
            };
            const urls = manifesto.assetGroups.find((g) => g.name === 'app')?.urls ?? [];
            const nome = (await caches.keys()).find((n) => n.endsWith(':assets:app:cache'));
            if (!nome || urls.length === 0) return false;
            const guardados = new Set(
              (await (await caches.open(nome)).keys()).map((r) => new URL(r.url).pathname),
            );
            return urls.every((u) => guardados.has(u));
          }),
        { timeout: 30_000 },
      )
      .toBe(true);

    const falhas: string[] = [];
    page.on('requestfailed', (r) => falhas.push(r.url()));
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Criar seu cofre' })).toBeVisible();
    expect(await page.evaluate(() => navigator.onLine)).toBe(false);

    // Sem rede: cria o cofre (Argon2id em WebAssembly) e abre telas carregadas sob demanda.
    await criarCofreSemNavegar(page);
    await irPeloMenu(page, 'Relatórios');
    await irPeloMenu(page, 'Histórico', 'Histórico e lixeira');
    // Tudo veio do service worker, inclusive as fontes usadas em português.
    expect(falhas.filter((url) => !url.includes('ngsw.json'))).toEqual([]);
  });

  test('o app é instalável: manifesto com nome, ícones e modo standalone', async ({ page }) => {
    await page.goto('/');
    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    const manifesto = (await (await page.request.get(href!)).json()) as {
      name: string;
      display: string;
      start_url: string;
      icons: { sizes: string; purpose: string }[];
    };
    expect(manifesto).toMatchObject({ name: 'FinManager', display: 'standalone', start_url: './' });
    expect(manifesto.icons.map((i) => `${i.sizes} ${i.purpose}`)).toEqual([
      '192x192 any',
      '512x512 any',
      '512x512 maskable',
    ]);
  });
});

/** Como `criarCofre`, mas sem `page.goto` (offline, a página já está aberta). */
async function criarCofreSemNavegar(page: Page): Promise<void> {
  await preencherSenhaDeCriacao(page);
  await preencherGrupos(page, await lerChaveExibida(page));
  await page.getByRole('button', { name: 'Criar cofre' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Início' })).toBeVisible();
}
