import AxeBuilder from '@axe-core/playwright';
import {
  bloquear,
  criarCofre,
  desbloquear,
  errarSenha,
  irParaSeguranca,
  lerChaveExibida,
  lerIndexedDb,
  NOVA_SENHA,
  preencherGrupos,
  preencherSenhaDeCriacao,
  SENHA,
  tentarDesbloquear,
} from './cofre.helpers';
import { expect, test } from './fixtures';

const TAGS_WCAG_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

test.describe('Criar cofre (RF-001, RF-003, RN-013, US-009)', () => {
  test('primeiro acesso leva à criação do cofre', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/cofre\/criar$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Criar seu cofre' })).toBeVisible();
  });

  test('exibe medidor de força e recusa senha fraca', async ({ page }) => {
    await page.goto('/cofre/criar');
    await page.getByLabel('Senha mestra', { exact: true }).fill('senha123');
    await expect(page.getByText(/Força da senha: \w+/)).toContainText('abaixo do mínimo');

    await preencherSenhaDeCriacao(page, 'senha123');
    await expect(page.getByText('Escolha uma senha que atenda à força mínima.')).toBeVisible();
    await expect(page.locator('[data-grupo]')).toHaveCount(0);
  });

  test('exige aceitar o aviso de irrecuperabilidade (RN-013)', async ({ page }) => {
    await page.goto('/cofre/criar');
    await page.getByLabel('Senha mestra', { exact: true }).fill(SENHA);
    await page.getByLabel('Repita a senha mestra').fill(SENHA);
    await page.getByRole('button', { name: 'Continuar' }).click();

    await expect(page.getByText('Você precisa confirmar que entendeu o aviso.')).toBeVisible();
    await expect(page.locator('[data-grupo]')).toHaveCount(0);
  });

  test('só cria o cofre depois de confirmar a chave de recuperação', async ({ page }) => {
    await page.goto('/cofre/criar');
    await preencherSenhaDeCriacao(page);
    const chave = await lerChaveExibida(page);

    await preencherGrupos(page, chave, true);
    await page.getByRole('button', { name: 'Criar cofre' }).click();
    await expect(page.getByRole('alert')).toContainText('não conferem');
    expect(await lerIndexedDb(page)).not.toContain('chaves');

    await preencherGrupos(page, chave);
    await page.getByRole('button', { name: 'Criar cofre' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Início' })).toBeVisible();
  });

  test('não grava a senha nem a chave em texto claro no IndexedDB (RN-001, RNF-004)', async ({
    page,
  }) => {
    const chave = await criarCofre(page);
    const conteudo = await lerIndexedDb(page);

    expect(conteudo).toContain('dekCifrada');
    expect(conteudo).not.toContain(SENHA);
    expect(conteudo).not.toContain(chave);
    expect(conteudo).not.toContain(chave.replace(/-/g, ''));
  });

  test('oferece baixar a chave de recuperação em .txt', async ({ page }) => {
    await page.goto('/cofre/criar');
    await preencherSenhaDeCriacao(page);
    const chave = await lerChaveExibida(page);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Baixar chave (.txt)' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('finmanager-chave-de-recuperacao.txt');
    const caminho = await download.path();
    const { readFile } = await import('node:fs/promises');
    expect(await readFile(caminho, 'utf8')).toContain(chave);
  });
});

test.describe('Desbloquear e bloquear (RF-002, RNF-006)', () => {
  test('ao recarregar a página, o cofre está bloqueado', async ({ page }) => {
    await criarCofre(page);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Desbloquear cofre' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Principal' })).toHaveCount(0);
  });

  test('senha errada mostra erro e não revela nada; senha certa desbloqueia', async ({ page }) => {
    await criarCofre(page);
    await bloquear(page);

    await tentarDesbloquear(page, 'senha errada qualquer');
    await expect(page.getByText('Senha incorreta.')).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Principal' })).toHaveCount(0);
    await expect(page).toHaveURL(/\/cofre\/desbloquear$/);

    await desbloquear(page);
  });

  test('aplica atraso progressivo após várias senhas erradas', async ({ page }) => {
    await criarCofre(page);
    await bloquear(page);

    for (let i = 0; i < 3; i++) {
      await errarSenha(page, `errada ${i}`);
      await expect(page.getByText('Senha incorreta.')).toBeVisible();
    }
    await expect(page.getByText(/aguarde \d+\s+segundos?/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Desbloquear' })).toBeDisabled();
  });

  test('telas internas não abrem com o cofre bloqueado', async ({ page }) => {
    await criarCofre(page);
    await bloquear(page);
    await page.goto('/seguranca');
    await expect(page).toHaveURL(/\/cofre\/desbloquear$/);
  });

  test('desbloqueio leva menos de 3 s (RNF-033)', async ({ page }) => {
    await criarCofre(page);
    await bloquear(page);

    const inicio = Date.now();
    await desbloquear(page);
    const duracao = Date.now() - inicio;
    test.info().annotations.push({ type: 'desbloqueio (ms)', description: String(duracao) });
    expect(duracao).toBeLessThan(3_000);
  });
});

test.describe('Bloqueio automático (RF-005)', () => {
  test('bloqueia após o tempo de inatividade e avisa o motivo', async ({ page }) => {
    await page.clock.install();
    await criarCofre(page);

    await page.clock.fastForward('04:30');
    await expect(page.getByRole('heading', { level: 1, name: 'Início' })).toBeVisible();

    await page.clock.fastForward('00:45');
    await expect(page.getByRole('heading', { level: 1, name: 'Desbloquear cofre' })).toBeVisible();
    await expect(page.getByRole('status')).toContainText(
      'bloqueado automaticamente após 5 minutos',
    );
  });

  test('o tempo é configurável na tela de Segurança', async ({ page }) => {
    await page.clock.install();
    await criarCofre(page);
    await irParaSeguranca(page);
    await page.getByLabel('Bloquear após').selectOption('1');
    await expect(page.getByText('Tempo de bloqueio automático salvo.')).toBeVisible();

    await page.clock.fastForward('01:10');
    await expect(page.getByRole('heading', { level: 1, name: 'Desbloquear cofre' })).toBeVisible();
    await expect(page.getByRole('status')).toContainText('após 1 minuto');
  });
});

test.describe('Recuperar acesso com a chave (RF-003)', () => {
  test('redefine a senha mestra com a chave de recuperação', async ({ page }) => {
    const chave = await criarCofre(page);
    await bloquear(page);

    await page.getByRole('link', { name: 'Esqueci minha senha mestra' }).click();
    await page.getByLabel('Chave de recuperação').fill(chave.toLowerCase());
    await page.getByLabel('Nova senha mestra', { exact: true }).fill(NOVA_SENHA);
    await page.getByLabel('Repita a nova senha mestra').fill(NOVA_SENHA);
    await page.getByRole('button', { name: 'Redefinir senha mestra' }).click();

    const dialogo = page.getByRole('dialog', { name: 'Redefinir a senha mestra?' });
    await expect(dialogo).toBeVisible();
    await expect(dialogo.getByRole('button', { name: 'Cancelar' })).toBeFocused();
    await dialogo.getByRole('button', { name: 'Redefinir senha mestra' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Início' })).toBeVisible();

    await bloquear(page);
    await tentarDesbloquear(page, SENHA);
    await expect(page.getByText('Senha incorreta.')).toBeVisible();
    await desbloquear(page, NOVA_SENHA);
  });

  test('recusa chave errada sem alterar nada', async ({ page }) => {
    await criarCofre(page);
    await bloquear(page);

    await page.goto('/cofre/recuperar');
    await page.getByLabel('Chave de recuperação').fill('0000-0000-0000-0000-0000-0000-0000-0000');
    await page.getByLabel('Nova senha mestra', { exact: true }).fill(NOVA_SENHA);
    await page.getByLabel('Repita a nova senha mestra').fill(NOVA_SENHA);
    await page.getByRole('button', { name: 'Redefinir senha mestra' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Redefinir senha mestra' }).click();

    await expect(page.getByRole('alert')).toContainText('Chave de recuperação incorreta');
    await page.goto('/cofre/desbloquear');
    await desbloquear(page, SENHA);
  });
});

test.describe('Segurança: trocar senha e chave (RF-004, RF-007, RN-003)', () => {
  test('alterar a senha exige a atual e confirmação', async ({ page }) => {
    await criarCofre(page);
    await irParaSeguranca(page);

    await page.getByLabel('Senha mestra atual').fill('senha atual errada');
    await page.getByLabel('Nova senha mestra', { exact: true }).fill(NOVA_SENHA);
    await page.getByLabel('Repita a nova senha mestra').fill(NOVA_SENHA);
    await page.getByRole('button', { name: 'Alterar senha mestra' }).click();
    const dialogo = page.getByRole('dialog', { name: 'Alterar a senha mestra?' });
    await dialogo.getByRole('button', { name: 'Alterar senha mestra' }).click();
    await expect(page.getByText('A senha mestra atual está incorreta.')).toBeVisible();

    await page.getByLabel('Senha mestra atual').fill(SENHA);
    await page.getByRole('button', { name: 'Alterar senha mestra' }).click();
    await dialogo.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialogo).toBeHidden();

    await page.getByRole('button', { name: 'Alterar senha mestra' }).click();
    await dialogo.getByRole('button', { name: 'Alterar senha mestra' }).click();
    await expect(page.getByText('Senha mestra alterada.')).toBeVisible();

    await bloquear(page);
    await tentarDesbloquear(page, SENHA);
    await expect(page.getByText('Senha incorreta.')).toBeVisible();
    await desbloquear(page, NOVA_SENHA);
  });

  test('nova chave de recuperação invalida a anterior', async ({ page }) => {
    const chaveAntiga = await criarCofre(page);
    await irParaSeguranca(page);

    await page.getByRole('button', { name: 'Gerar nova chave de recuperação' }).click();
    const chaveNova = await lerChaveExibida(page);
    expect(chaveNova).not.toBe(chaveAntiga);
    await preencherGrupos(page, chaveNova);
    await page.getByLabel('Senha mestra', { exact: true }).fill(SENHA);
    await page.getByRole('button', { name: 'Salvar nova chave' }).click();
    await page
      .getByRole('dialog', { name: 'Substituir a chave de recuperação?' })
      .getByRole('button', { name: 'Substituir chave de recuperação' })
      .click();
    await expect(page.getByText('Nova chave de recuperação salva.')).toBeVisible();

    await bloquear(page);
    for (const [chave, esperado] of [
      [chaveAntiga, 'incorreta'],
      [chaveNova, 'ok'],
    ] as const) {
      await page.goto('/cofre/recuperar');
      await page.getByLabel('Chave de recuperação').fill(chave);
      await page.getByLabel('Nova senha mestra', { exact: true }).fill(NOVA_SENHA);
      await page.getByLabel('Repita a nova senha mestra').fill(NOVA_SENHA);
      await page.getByRole('button', { name: 'Redefinir senha mestra' }).click();
      await page
        .getByRole('dialog')
        .getByRole('button', { name: 'Redefinir senha mestra' })
        .click();
      if (esperado === 'incorreta') {
        await expect(page.getByRole('alert')).toContainText('incorreta');
      } else {
        await expect(page.getByRole('heading', { level: 1, name: 'Início' })).toBeVisible();
      }
    }
  });
});

test.describe('Apagar cofre (RF-006, RN-010)', () => {
  test('exige digitar a frase e apaga tudo, mesmo com o cofre bloqueado', async ({ page }) => {
    await criarCofre(page);
    await bloquear(page);

    await page.getByRole('link', { name: 'Apagar o cofre e começar do zero' }).click();
    await expect(page.getByText(/exporte um backup antes de apagar/)).toBeVisible();
    const botao = page.getByRole('button', { name: 'Apagar cofre definitivamente' });
    await expect(botao).toBeDisabled();

    await page.getByLabel(/Para confirmar, digite/).fill('apagar');
    await expect(botao).toBeDisabled();
    await page.getByLabel(/Para confirmar, digite/).fill('APAGAR TUDO');
    await botao.click();

    await expect(page.getByRole('heading', { level: 1, name: 'Criar seu cofre' })).toBeVisible();
    expect(await lerIndexedDb(page)).not.toContain('dekCifrada');
  });
});

test.describe('Segurança da página durante os fluxos do cofre', () => {
  test('nenhuma violação de CSP nem requisição externa (Argon2id em WASM incluído)', async ({
    page,
    monitor,
  }) => {
    await criarCofre(page);
    await bloquear(page);
    await desbloquear(page);

    expect(await monitor.violacoesCsp()).toEqual([]);
    expect(monitor.requisicoesExternas).toEqual([]);
  });
});

test.describe('Acessibilidade das telas do cofre (RNF-020)', () => {
  const semViolacoes = async (page: import('@playwright/test').Page) => {
    const resultado = await new AxeBuilder({ page }).withTags(TAGS_WCAG_AA).analyze();
    expect(resultado.violations).toEqual([]);
  };

  test('criação (duas etapas)', async ({ page }) => {
    await page.goto('/cofre/criar');
    await semViolacoes(page);
    await preencherSenhaDeCriacao(page);
    await expect(page.locator('[data-grupo]').first()).toBeVisible();
    await semViolacoes(page);
  });

  // No Firefox do Playwright, a análise do axe na tela de Segurança derruba o processo da
  // página de forma intermitente ("Page crashed"). Reproduzido de forma isolada; não ocorre
  // no Chromium nem afeta os testes funcionais desta tela no Firefox. Verificado no
  // Chromium (e no WebKit, no CI) até a causa ser identificada.
  const pularNoFirefox = (browserName: string) =>
    test.fixme(browserName === 'firefox', 'axe + Firefox do Playwright: crash intermitente');

  test('segurança', async ({ page, browserName }) => {
    pularNoFirefox(browserName);
    await criarCofre(page);
    await irParaSeguranca(page);
    await semViolacoes(page);
  });

  test('segurança com o diálogo de confirmação aberto', async ({ page, browserName }) => {
    pularNoFirefox(browserName);
    await criarCofre(page);
    await irParaSeguranca(page);
    await page.getByLabel('Senha mestra atual').fill(SENHA);
    await page.getByLabel('Nova senha mestra', { exact: true }).fill(NOVA_SENHA);
    await page.getByLabel('Repita a nova senha mestra').fill(NOVA_SENHA);
    await page.getByRole('button', { name: 'Alterar senha mestra' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await semViolacoes(page);
  });

  test('desbloqueio, recuperação e apagar', async ({ page }) => {
    await criarCofre(page);
    await bloquear(page);
    await semViolacoes(page);
    await page.goto('/cofre/recuperar');
    await semViolacoes(page);
    await page.goto('/cofre/apagar');
    await semViolacoes(page);
  });
});
