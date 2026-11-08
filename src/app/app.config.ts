import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { ApplicationConfig, LOCALE_ID, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { routes } from './app.routes';
import { provideFocoAoNavegar } from './core/acessibilidade/foco-ao-navegar';
import { provideCofre } from './core/cofre/cofre.providers';
import { provideTema } from './core/tema/tema';

registerLocaleData(localePt);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    { provide: LOCALE_ID, useValue: 'pt-BR' },
    provideCofre(),
    provideFocoAoNavegar(),
    provideTema(),
  ],
};
