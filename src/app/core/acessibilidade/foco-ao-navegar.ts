import {
  afterNextRender,
  DOCUMENT,
  type EnvironmentProviders,
  inject,
  Injector,
  provideEnvironmentInitializer,
} from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';

/**
 * Após cada navegação, move o foco para o título principal da nova tela (WCAG 2.4.3),
 * para que leitores de tela anunciem a mudança de página. Os <h1> usam tabindex="-1".
 */
export function provideFocoAoNavegar(): EnvironmentProviders {
  return provideEnvironmentInitializer(() => {
    const router = inject(Router);
    const documento = inject(DOCUMENT);
    const injector = inject(Injector);

    router.events.subscribe((evento) => {
      if (!(evento instanceof NavigationEnd)) return;
      afterNextRender(
        () => documento.querySelector<HTMLElement>('main h1')?.focus({ preventScroll: false }),
        { injector },
      );
    });
  });
}
