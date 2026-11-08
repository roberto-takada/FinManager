import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { bloquear, criarCofre, desbloquear, irPeloMenu, lerIndexedDb } from './cofre.helpers';
import { expect, test } from './fixtures';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const raiz = (page: Page) => page.locator('html');

/** PNG fictício gerado no próprio navegador (gradiente 300 × 200). */
async function pngFicticio(page: Page): Promise<Buffer> {
  const base64 = await page.evaluate(() => {
    const tela = document.createElement('canvas');
    tela.width = 300;
    tela.height = 200;
    const ctx = tela.getContext('2d')!;
    const g = ctx.createLinearGradient(0, 0, 300, 200);
    g.addColorStop(0, '#8b51ff');
    g.addColorStop(1, '#1fb9b7');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 300, 200);
    return tela.toDataURL('image/png').split(',')[1]!;
  });
  return Buffer.from(base64, 'base64');
}

test.describe('Perfil (RF-080)', () => {
  test('edita nome, e-mail e cor; aparece no menu e no Início; fica cifrado', async ({ page }) => {
    await criarCofre(page);
    await expect(page.locator('[data-perfil-menu]')).toHaveCount(0);
    await irPeloMenu(page, 'Perfil');
    await expect(page.locator('[data-perfil-nome]')).toHaveText('Sem nome');

    await page.getByRole('link', { name: 'Editar perfil' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Editar perfil' })).toBeVisible();
    await page.getByLabel('Nome (opcional)').fill('Bia Teste');
    await page.getByLabel('E-mail (opcional)').fill('bia@');
    await page.getByRole('button', { name: 'Salvar perfil' }).click();
    await expect(page.getByRole('alert')).toContainText('nome@exemplo.com');
    await expect(page.getByLabel('E-mail (opcional)')).toHaveAttribute('aria-invalid', 'true');

    await page.getByLabel('E-mail (opcional)').fill('bia@example.com');
    await page.getByRole('radio', { name: 'Rosa' }).check({ force: true });
    await page.getByRole('button', { name: 'Salvar perfil' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Perfil' })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'Perfil salvo.' })).toBeVisible();
    await expect(page.locator('[data-perfil-nome]')).toHaveText('Bia Teste');
    await expect(page.locator('[data-perfil-email]')).toHaveText('bia@example.com');
    await expect(page.locator('[data-perfil-menu]')).toContainText('Bia Teste');

    expect(await lerIndexedDb(page)).not.toContain('Bia');
    await bloquear(page);
    await desbloquear(page);
    await expect(page.getByText('Olá, Bia!')).toBeVisible();

    // Editar abre com os dados atuais.
    await irPeloMenu(page, 'Perfil');
    await page.getByRole('link', { name: 'Editar perfil' }).click();
    await expect(page.getByLabel('Nome (opcional)')).toHaveValue('Bia Teste');
    await expect(page.getByRole('radio', { name: 'Rosa' })).toBeChecked();
  });

  test('foto: reduzida no navegador e salva; arquivo inválido é recusado', async ({ page }) => {
    await criarCofre(page);
    await irPeloMenu(page, 'Perfil');
    await page.getByRole('link', { name: 'Editar perfil' }).click();
    await page.getByRole('radio', { name: 'Foto' }).check();

    await page.getByLabel('Escolher foto').setInputFiles({
      name: 'quebrada.png',
      mimeType: 'image/png',
      buffer: Buffer.from('isto não é uma imagem'),
    });
    await expect(page.getByRole('alert')).toContainText('Não foi possível ler essa imagem');

    await page.getByLabel('Escolher foto').setInputFiles({
      name: 'foto.png',
      mimeType: 'image/png',
      buffer: await pngFicticio(page),
    });
    const previa = page.locator('app-avatar img').first();
    await expect(previa).toHaveAttribute('src', /^data:image\/jpeg;base64,/);
    expect(await previa.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(128);
    await expect(page.getByRole('alert')).toHaveCount(0);

    await page.getByRole('button', { name: 'Salvar perfil' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Perfil salvo.' })).toBeVisible();
    await expect(page.locator('main app-avatar img')).toHaveAttribute('alt', '');
  });
});

test.describe('Aparência e acessibilidade (RF-081, RF-082)', () => {
  test('tamanho do texto, contraste e animações valem na hora, por teclado, e voltam após desbloquear', async ({
    page,
  }) => {
    await criarCofre(page);
    await irPeloMenu(page, 'Perfil');
    const tamanhoRaiz = () =>
      page.evaluate(() => getComputedStyle(document.documentElement).fontSize);
    expect(await tamanhoRaiz()).toBe('16px');

    // Grupo de rádios: as setas trocam a opção (RNF-021).
    await page.getByRole('radio', { name: 'Padrão (100%)' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('radio', { name: 'Grande (112%)' })).toBeChecked();
    await expect(raiz(page)).toHaveClass(/fonte-grande/);
    expect(await tamanhoRaiz()).toBe('18px');
    await expect(page.getByRole('status').filter({ hasText: 'Preferência salva.' })).toBeAttached();

    await page.getByRole('radio', { name: 'Maior (125%)' }).check({ force: true });
    await page.getByRole('radio', { name: 'Alto contraste' }).check({ force: true });
    await page.getByRole('radio', { name: 'Reduzir animações' }).check({ force: true });
    await expect(raiz(page)).toHaveClass(/fonte-maior/);
    await expect(raiz(page)).toHaveClass(/contraste-alto/);
    await expect(raiz(page)).toHaveClass(/animacoes-reduzidas/);
    expect(await tamanhoRaiz()).toBe('20px');

    // Bloqueado, as preferências não são legíveis: tudo volta ao padrão.
    await bloquear(page);
    await expect(raiz(page)).not.toHaveClass(/fonte-maior|contraste-alto|animacoes-reduzidas/);
    await desbloquear(page);
    await expect(raiz(page)).toHaveClass(/fonte-maior/);
    await expect(raiz(page)).toHaveClass(/contraste-alto/);
    expect(await lerIndexedDb(page)).not.toContain('contraste');
  });
});

test.describe('Exportar todos os dados (RF-084)', () => {
  test('baixa um backup .json cifrado, sem nada legível dos dados', async ({ page }) => {
    await criarCofre(page, undefined, { demonstracao: true });
    await irPeloMenu(page, 'Perfil');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Exportar backup cifrado' }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^finmanager-backup-\d{4}-\d{2}-\d{2}\.json$/);
    const texto = await readFile(await download.path(), 'utf8');
    const arquivo = JSON.parse(texto) as Record<string, unknown>;
    expect(arquivo).toMatchObject({
      app: 'FinManager',
      formatVersion: 1,
      cipher: { algorithm: 'AES-256-GCM' },
    });
    expect(Object.keys(arquivo['keys'] as object)).toEqual(['password', 'recovery']);
    for (const segredo of ['Ana Exemplo', 'Banco Fictício', 'Supermercado', 'Salário']) {
      expect(texto).not.toContain(segredo);
    }
    await expect(page.getByRole('status').filter({ hasText: 'Backup exportado' })).toBeVisible();
  });
});

test('acessibilidade (axe): perfil, edição e alto contraste escuro', async ({
  page,
  browserName,
}) => {
  test.fixme(
    browserName === 'firefox',
    'axe + Firefox do Playwright: crash intermitente (ver CLAUDE.md)',
  );
  const analisar = async (nome: string) =>
    expect((await new AxeBuilder({ page }).withTags(TAGS).analyze()).violations, nome).toEqual([]);
  await page.emulateMedia({ colorScheme: 'dark' });
  await criarCofre(page, undefined, { demonstracao: true });
  await irPeloMenu(page, 'Perfil');
  await analisar('Perfil (escuro)');
  await page.getByRole('radio', { name: 'Alto contraste' }).check({ force: true });
  await page.getByRole('radio', { name: 'Reduzir animações' }).check({ force: true });
  await expect(raiz(page)).toHaveClass(/contraste-alto/);
  await analisar('Perfil (alto contraste escuro)');
  await irPeloMenu(page, 'Relatórios');
  await analisar('Relatórios (alto contraste escuro)');
  await irPeloMenu(page, 'Perfil');
  await page.getByRole('link', { name: 'Editar perfil' }).click();
  await analisar('Editar perfil (alto contraste escuro)');
});
