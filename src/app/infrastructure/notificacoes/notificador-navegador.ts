import type {
  NotificadorNavegador,
  PermissaoNotificacao,
} from '../../application/ports/notificacoes.ports';

/**
 * Adaptador da Notifications API do navegador (RF-024, §5.10). Não usa Push API nem
 * service worker: as notificações só existem com a aba aberta.
 */
export class NotificadorNavegadorWeb implements NotificadorNavegador {
  constructor(private readonly global: typeof globalThis = globalThis) {}

  private get api(): typeof Notification | undefined {
    return (this.global as { Notification?: typeof Notification }).Notification;
  }

  permissao(): PermissaoNotificacao {
    return this.api ? this.api.permission : 'indisponivel';
  }

  async solicitarPermissao(): Promise<PermissaoNotificacao> {
    if (!this.api) return 'indisponivel';
    return this.api.requestPermission();
  }

  notificar(titulo: string, corpo: string, tag: string): void {
    if (!this.api || this.api.permission !== 'granted') return;
    try {
      new this.api(titulo, { body: corpo, tag, lang: 'pt-BR' });
    } catch {
      // Alguns navegadores móveis só permitem notificações via service worker; nesse caso
      // os alertas continuam aparecendo dentro do app.
    }
  }
}
