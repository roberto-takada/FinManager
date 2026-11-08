import { computed, inject, Injectable } from '@angular/core';
import { ativos } from '../../domain/shared/entidade';
import { buscarAtivo, marcarExcluido, substituir } from '../dados/colecoes';
import { DadosService } from '../dados/dados.service';
import { resumoRecorrencia } from '../historico/resumos';

/** Recorrências (RF-012). A criação acontece em TransacoesService.criar. */
@Injectable({ providedIn: 'root' })
export class RecorrenciasService {
  private readonly dados = inject(DadosService);

  readonly ativas = computed(() =>
    ativos(this.dados.recorrencias()).sort((a, b) => a.inicio.localeCompare(b.inicio)),
  );

  /**
   * Exclui a recorrência (RN-005 a): novas ocorrências deixam de ser geradas. As
   * transações já criadas continuam, pois representam o que de fato aconteceu.
   */
  excluir(id: string): Promise<void> {
    return this.dados.alterar((atual) => {
      const recorrencia = buscarAtivo(atual.recorrencias, id, 'Recorrência');
      const evento = this.dados.evento({
        acao: 'exclusao',
        entidade: 'recorrencia',
        entidadeId: id,
        resumo: resumoRecorrencia(recorrencia),
        estadoAnterior: recorrencia,
      });
      return {
        mudancas: {
          recorrencias: substituir(
            atual.recorrencias,
            marcarExcluido(recorrencia, this.dados.agora().toISOString()),
          ),
          historico: [...atual.historico, evento],
        },
        resultado: undefined,
      };
    });
  }
}
