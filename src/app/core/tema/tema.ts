import {
  DOCUMENT,
  effect,
  type EnvironmentProviders,
  inject,
  provideEnvironmentInitializer,
} from '@angular/core';
import { PreferenciasService } from '../../application/preferencias/preferencias.service';

/**
 * Aplica o tema (RF-081) e os ajustes de acessibilidade (RF-082) no <html>. Sem classe, o
 * CSS segue prefers-color-scheme; assim o app abre no tema do sistema sem guardar nada fora
 * do cofre e sem "piscar". Os ajustes viram as classes fonte-grande/fonte-maior,
 * contraste-alto e animacoes-reduzidas (ver src/styles.css).
 */
export function provideTema(): EnvironmentProviders {
  return provideEnvironmentInitializer(() => {
    const preferencias = inject(PreferenciasService);
    const raiz = inject(DOCUMENT).documentElement;
    effect(() => {
      const tema = preferencias.tema();
      raiz.classList.toggle('tema-claro', tema === 'claro');
      raiz.classList.toggle('tema-escuro', tema === 'escuro');
    });
    effect(() => {
      const a = preferencias.acessibilidade();
      raiz.classList.toggle('fonte-grande', a.tamanhoFonte === 'grande');
      raiz.classList.toggle('fonte-maior', a.tamanhoFonte === 'maior');
      raiz.classList.toggle('contraste-alto', a.contraste === 'alto');
      raiz.classList.toggle('animacoes-reduzidas', a.animacoes === 'reduzidas');
    });
  });
}
