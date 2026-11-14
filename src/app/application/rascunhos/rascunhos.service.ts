import { computed, inject, Injectable } from '@angular/core';
import { guardarRascunho, type Rascunho, urlInterna } from '../../domain/rascunhos/rascunho';
import { ErroDominio } from '../../domain/shared/erro-dominio';
import { DadosService } from '../dados/dados.service';

export type DadosRascunho = Omit<Rascunho, 'atualizadoEm'>;

/**
 * Rascunhos de formulários (RN-002, RF-070, RF-071, ENGENHARIA_DE_SOFTWARE §5.2).
 * Ficam na coleção cifrada `rascunhos`, como os demais dados (RN-001).
 */
@Injectable({ providedIn: 'root' })
export class RascunhosService {
  private readonly dados = inject(DadosService);

  /** Rascunhos guardados, do mais recente para o mais antigo. */
  readonly pendentes = computed(() =>
    [...this.dados.rascunhos()].sort((a, b) => b.atualizadoEm.localeCompare(a.atualizadoEm)),
  );

  buscar(chave: string): Rascunho | null {
    return this.dados.rascunhos().find((r) => r.id === chave) ?? null;
  }

  /** Grava (ou substitui) o rascunho de um formulário. */
  salvar(rascunho: DadosRascunho): Promise<Rascunho> {
    if (!urlInterna(rascunho.url)) {
      return Promise.reject(new ErroDominio('url-invalida', 'Endereço de formulário inválido.'));
    }
    return this.dados.alterar((atual) => {
      const novo: Rascunho = {
        ...rascunho,
        valores: structuredClone(rascunho.valores),
        atualizadoEm: this.dados.agora().toISOString(),
      };
      return {
        mudancas: { rascunhos: guardarRascunho(atual.rascunhos, novo) },
        resultado: novo,
      };
    });
  }

  /** Remove o rascunho (o usuário escolheu "Descartar" ou saiu sem salvar). */
  descartar(chave: string): Promise<void> {
    return this.dados.alterar((atual) =>
      atual.rascunhos.some((r) => r.id === chave)
        ? {
            mudancas: { rascunhos: atual.rascunhos.filter((r) => r.id !== chave) },
            resultado: undefined,
          }
        : { mudancas: {}, resultado: undefined },
    );
  }

  /**
   * Salva o formulário por meio de `acao` e remove o rascunho na mesma gravação
   * (ver `DadosService.concluirRascunho`).
   */
  concluir<R>(chave: string, acao: () => Promise<R>): Promise<R> {
    return this.dados.concluirRascunho(chave, acao);
  }
}
