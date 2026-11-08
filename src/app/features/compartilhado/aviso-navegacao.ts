import { Injectable } from '@angular/core';

/**
 * Mensagem de resultado que sobrevive a uma navegação: a página de formulário salva,
 * define o aviso e volta para a lista, que o exibe uma vez (heurística 1 de Nielsen:
 * visibilidade do status do sistema).
 */
@Injectable({ providedIn: 'root' })
export class AvisoNavegacao {
  private texto: string | null = null;

  definir(texto: string): void {
    this.texto = texto;
  }

  /** Devolve o aviso pendente e o apaga. */
  consumir(): string | null {
    const texto = this.texto;
    this.texto = null;
    return texto;
  }
}
