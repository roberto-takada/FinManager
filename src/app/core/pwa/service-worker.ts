import {
  ApplicationRef,
  DOCUMENT,
  type EnvironmentProviders,
  inject,
  isDevMode,
  provideEnvironmentInitializer,
} from '@angular/core';

/** Arquivo gerado pelo build (`ngsw-config.json`): guarda os arquivos do app para uso offline. */
export const SCRIPT_SERVICE_WORKER = 'ngsw-worker.js';
/** Nome da política Trusted Types, autorizada na CSP (`src/index.html`). */
export const POLITICA_SERVICE_WORKER = 'finmanager-sw';

interface FabricaTrustedTypes {
  createPolicy(
    nome: string,
    regras: { createScriptURL: (url: string) => string },
  ): { createScriptURL(url: string): unknown };
}

/**
 * RF-073: registra o service worker que deixa o app funcionar sem internet.
 *
 * Com Trusted Types obrigatório na CSP, `serviceWorker.register` só aceita uma URL
 * confiável. Em vez de uma política `default` (que valeria para qualquer string), uma
 * política própria aceita **somente** o script do service worker. Ele guarda apenas os
 * arquivos do app; os dados do usuário continuam cifrados no IndexedDB.
 */
export function provideServiceWorkerOffline(): EnvironmentProviders {
  return provideEnvironmentInitializer(() => {
    if (isDevMode()) return;
    const janela = inject(DOCUMENT).defaultView;
    const servico = janela?.navigator.serviceWorker;
    if (!janela || !servico) return;
    // Registra depois que a primeira tela está pronta, para não disputar a rede com ela.
    void inject(ApplicationRef)
      .whenStable()
      .then(() => servico.register(urlConfiavel(janela) as string))
      .catch(() => undefined);
  });
}

function urlConfiavel(janela: Window): unknown {
  const fabrica = (janela as Window & { trustedTypes?: FabricaTrustedTypes }).trustedTypes;
  if (!fabrica) return SCRIPT_SERVICE_WORKER;
  return fabrica
    .createPolicy(POLITICA_SERVICE_WORKER, {
      createScriptURL: (url) => {
        if (url !== SCRIPT_SERVICE_WORKER) throw new TypeError('Script não autorizado.');
        return url;
      },
    })
    .createScriptURL(SCRIPT_SERVICE_WORKER);
}
