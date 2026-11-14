import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { ApplicationConfig, LOCALE_ID, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding, withRouterConfig } from '@angular/router';
import { routes } from './app.routes';
import { provideFocoAoNavegar } from './core/acessibilidade/foco-ao-navegar';
import { provideCofre } from './core/cofre/cofre.providers';
import { provideServiceWorkerOffline } from './core/pwa/service-worker';
import { provideTema } from './core/tema/tema';

registerLocaleData(localePt);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      withComponentInputBinding(),
      // "Sair sem salvar?" respondido com Cancelar pelo botão Voltar: o endereço continua certo.
      withRouterConfig({ canceledNavigationResolution: 'computed' }),
    ),
    { provide: LOCALE_ID, useValue: 'pt-BR' },
    provideCofre(),
    provideFocoAoNavegar(),
    provideTema(),
    // RF-073: funciona sem internet depois do primeiro acesso (só em produção).
    provideServiceWorkerOffline(),
  ],
};
