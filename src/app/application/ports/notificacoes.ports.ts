import { InjectionToken } from '@angular/core';

/** Estado da permissão de notificações do navegador. */
export type PermissaoNotificacao = 'default' | 'granted' | 'denied' | 'indisponivel';

/** Notificações do navegador (Notifications API), sem servidor nem Push API (§5.10). */
export interface NotificadorNavegador {
  permissao(): PermissaoNotificacao;
  /**
   * Pede a permissão ao usuário. RF-026: só pode ser chamado a partir de uma ação explícita
   * do usuário (ex.: clique em "Ativar notificações"), nunca ao carregar a página.
   */
  solicitarPermissao(): Promise<PermissaoNotificacao>;
  /** Mostra a notificação. A `tag` faz uma nova substituir a anterior. */
  notificar(titulo: string, corpo: string, tag: string): void;
}

export const NOTIFICADOR_NAVEGADOR = new InjectionToken<NotificadorNavegador>(
  'NOTIFICADOR_NAVEGADOR',
);
