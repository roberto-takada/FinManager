import { expect, type Page } from '@playwright/test';

/** Senhas fictícias que atendem à força mínima. */
export const SENHA = 'cavalo azul come bateria';
export const NOVA_SENHA = 'outra frase bem comprida 42';

/** Lê a chave de recuperação exibida na tela. */
export async function lerChaveExibida(page: Page): Promise<string> {
  const locator = page.locator('[data-grupo]');
  await expect(locator).toHaveCount(8);
  const grupos = await locator.allTextContents();
  return grupos.map((g) => g.trim()).join('-');
}

/** Preenche os dois grupos pedidos na confirmação ("Grupo N"). */
export async function preencherGrupos(page: Page, chave: string, errado = false): Promise<void> {
  const grupos = chave.split('-');
  const campos = await page.getByRole('textbox', { name: /^Grupo \d+$/ }).all();
  expect(campos).toHaveLength(2);
  for (const campo of campos) {
    const id = await campo.getAttribute('id');
    const rotulo = (await page.locator(`label[for="${id}"]`).textContent()) ?? '';
    const indice = Number(/\d+/.exec(rotulo)![0]) - 1;
    await campo.fill(errado ? grupos[(indice + 1) % 8]! : grupos[indice]!);
  }
}

/** Primeira etapa da criação: senha + aviso. */
export async function preencherSenhaDeCriacao(page: Page, senha = SENHA): Promise<void> {
  await page.getByLabel('Senha mestra', { exact: true }).fill(senha);
  await page.getByLabel('Repita a senha mestra').fill(senha);
  await page.getByLabel(/Entendi que, se eu perder/).check();
  await page.getByRole('button', { name: 'Continuar' }).click();
}

/** Cria o cofre pelo fluxo completo e devolve a chave de recuperação. */
export async function criarCofre(page: Page, senha = SENHA): Promise<string> {
  await page.goto('/');
  await expect(page).toHaveURL(/\/cofre\/criar$/);
  await preencherSenhaDeCriacao(page, senha);
  const chave = await lerChaveExibida(page);
  await preencherGrupos(page, chave);
  await page.getByRole('button', { name: 'Criar cofre' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Início' })).toBeVisible();
  return chave;
}

/** Vai para Segurança pelo menu (recarregar a página bloquearia o cofre). */
export async function irParaSeguranca(page: Page): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Principal' })
    .getByRole('link', { name: 'Segurança' })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'Segurança' })).toBeVisible();
}

export async function bloquear(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Bloquear cofre' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Desbloquear cofre' })).toBeVisible();
}

export async function tentarDesbloquear(page: Page, senha: string): Promise<void> {
  await page.getByLabel('Senha mestra', { exact: true }).fill(senha);
  await page.getByRole('button', { name: 'Desbloquear' }).click();
}

/** Tenta uma senha errada e espera a tentativa terminar (campo limpo e editável). */
export async function errarSenha(page: Page, senha: string): Promise<void> {
  const campo = page.getByLabel('Senha mestra', { exact: true });
  await tentarDesbloquear(page, senha);
  await expect(campo).toHaveValue('');
  await expect(campo).toBeEditable();
}

export async function desbloquear(page: Page, senha = SENHA): Promise<void> {
  await tentarDesbloquear(page, senha);
  await expect(page.getByRole('heading', { level: 1, name: 'Início' })).toBeVisible();
}

/** Conteúdo bruto do IndexedDB do app, como texto. */
export function lerIndexedDb(page: Page): Promise<string> {
  return page.evaluate(
    () =>
      new Promise<string>((resolve, reject) => {
        const pedido = indexedDB.open('finmanager');
        pedido.onerror = () => reject(pedido.error);
        pedido.onsuccess = () => {
          const banco = pedido.result;
          if (!banco.objectStoreNames.contains('cofre')) {
            banco.close();
            resolve('');
            return;
          }
          const todos = banco.transaction('cofre').objectStore('cofre').getAll();
          todos.onsuccess = () => {
            banco.close();
            resolve(JSON.stringify(todos.result));
          };
        };
      }),
  );
}
