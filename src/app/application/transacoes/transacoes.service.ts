import { computed, inject, Injectable } from '@angular/core';
import {
  type Frequencia,
  type Recorrencia,
  validarDadosRecorrencia,
} from '../../domain/recorrencias/recorrencia';
import type { DataISO } from '../../domain/shared/data';
import { ativos } from '../../domain/shared/entidade';
import { ErroDominio } from '../../domain/shared/erro-dominio';
import {
  type DadosTransacao,
  ehAlteracaoSignificativa,
  gerarParcelas,
  type Transacao,
  validarTransacao,
} from '../../domain/transacoes/transacao';
import { buscarAtivo, marcarExcluido, substituir } from '../dados/colecoes';
import { DadosService } from '../dados/dados.service';
import { resumoTransacao } from '../historico/resumos';
import { gerarOcorrencias } from '../recorrencias/gerar-ocorrencias';

/**
 * RF-013 (parcelamento) está suspenso até a implementação das faturas do cartão (RF-100),
 * por decisão de 2026-11-08: as parcelas precisam cair na fatura certa, não só no mês.
 * As regras do domínio (`gerarParcelas`) continuam prontas e testadas. Para reativar:
 * mudar para `true`, devolver a opção ao formulário e restaurar os testes de parcelamento.
 */
export const PARCELAMENTO_HABILITADO = false;

export interface OpcoesCriacao {
  /** RF-013: quantidade de parcelas (2 a 48), só para despesas. */
  readonly parcelas?: number;
  /** RF-012: repetir a transação. A data informada é a primeira ocorrência. */
  readonly recorrencia?: { readonly frequencia: Frequencia; readonly fim: DataISO | null };
}

/** Receitas, despesas, transferências, parcelamentos e recorrências (RF-010 a RF-017). */
@Injectable({ providedIn: 'root' })
export class TransacoesService {
  private readonly dados = inject(DadosService);

  readonly ativas = computed(() => ativos(this.dados.transacoes()));

  buscar(id: string): Transacao | undefined {
    return this.ativas().find((t) => t.id === id);
  }

  /**
   * Cria uma transação simples, um parcelamento (várias transações) ou uma recorrência
   * (as ocorrências até hoje são criadas na hora). Devolve as transações criadas.
   */
  criar(dados: DadosTransacao, opcoes: OpcoesCriacao = {}): Promise<Transacao[]> {
    return this.dados.alterar((atual) => {
      const validos = validarTransacao(dados, atual.contas, atual.categorias);
      if (opcoes.parcelas && opcoes.parcelas > 1 && !PARCELAMENTO_HABILITADO) {
        throw new ErroDominio(
          'parcelamento-suspenso',
          'O parcelamento estará disponível junto com as faturas do cartão de crédito.',
          'parcelas',
        );
      }
      if (opcoes.parcelas && opcoes.recorrencia) {
        throw new ErroDominio(
          'parcelada-recorrente',
          'Uma transação não pode ser parcelada e recorrente ao mesmo tempo.',
        );
      }
      const instante = this.dados.agora().toISOString();
      const base = () => ({
        id: this.dados.novoId(),
        criadoEm: instante,
        atualizadoEm: instante,
        excluidoEm: null,
      });

      if (opcoes.recorrencia) {
        const { data, ...modelo } = validos;
        const recorrencia: Recorrencia = {
          ...base(),
          ...validarDadosRecorrencia({ modelo, inicio: data, ...opcoes.recorrencia }),
          geradaAte: null,
        };
        const geradas = gerarOcorrencias(
          { transacoes: atual.transacoes, recorrencias: [...atual.recorrencias, recorrencia] },
          this.dados.hoje(),
          this.dados.agora(),
          () => this.dados.novoId(),
        );
        const criadas = geradas.transacoes.slice(atual.transacoes.length);
        return {
          mudancas: { transacoes: geradas.transacoes, recorrencias: geradas.recorrencias },
          resultado: criadas,
        };
      }

      const novas: Transacao[] =
        opcoes.parcelas && opcoes.parcelas > 1
          ? gerarParcelas(validos, opcoes.parcelas, this.dados.novoId()).map(
              ({ dados: d, parcela }) => ({
                ...base(),
                ...d,
                recorrenciaId: null,
                parcela,
              }),
            )
          : [{ ...base(), ...validos, recorrenciaId: null, parcela: null }];
      return { mudancas: { transacoes: [...atual.transacoes, ...novas] }, resultado: novas };
    });
  }

  /**
   * RF-011: edita uma transação. Se valor, data ou tipo mudarem (RN-005 b), a edição é
   * registrada no histórico com o estado anterior (RN-004). A confirmação (RN-003) é
   * pedida pela interface antes de chamar este método.
   */
  editar(
    id: string,
    dados: DadosTransacao,
  ): Promise<{ transacao: Transacao; significativa: boolean }> {
    return this.dados.alterar((atual) => {
      const anterior = buscarAtivo(atual.transacoes, id, 'Transação');
      const validos = validarTransacao(dados, atual.contas, atual.categorias);
      if (anterior.parcela && validos.tipo !== 'despesa') {
        throw new ErroDominio(
          'parcela-tipo',
          'Uma parcela precisa continuar sendo despesa.',
          'tipo',
        );
      }
      const transacao: Transacao = {
        ...anterior,
        ...validos,
        atualizadoEm: this.dados.agora().toISOString(),
      };
      const significativa = ehAlteracaoSignificativa(anterior, transacao);
      const historico = significativa
        ? [
            ...atual.historico,
            this.dados.evento({
              acao: 'edicao',
              entidade: 'transacao',
              entidadeId: id,
              resumo: resumoTransacao(anterior),
              estadoAnterior: anterior,
            }),
          ]
        : atual.historico;
      return {
        mudancas: { transacoes: substituir(atual.transacoes, transacao), historico },
        resultado: { transacao, significativa },
      };
    });
  }

  /** RF-011 / RN-005 a: exclui uma transação (vai para a lixeira). */
  excluir(id: string): Promise<void> {
    return this.excluirVarias((atual) => [buscarAtivo(atual, id, 'Transação')], null);
  }

  /** RN-005 c: exclui todas as parcelas ativas de uma compra, como um lote. */
  excluirParcelas(grupoId: string): Promise<void> {
    return this.excluirVarias((atual) => {
      const parcelas = ativos(atual).filter((t) => t.parcela?.grupoId === grupoId);
      if (parcelas.length === 0)
        throw new ErroDominio('nao-encontrado', 'Parcelas não encontradas.');
      return parcelas;
    }, this.dados.novoId());
  }

  private excluirVarias(
    selecionar: (transacoes: readonly Transacao[]) => Transacao[],
    loteId: string | null,
  ): Promise<void> {
    return this.dados.alterar((atual) => {
      const alvos = selecionar(atual.transacoes);
      const instante = this.dados.agora().toISOString();
      const ids = new Set(alvos.map((t) => t.id));
      const eventos = alvos.map((t) =>
        this.dados.evento({
          acao: 'exclusao',
          entidade: 'transacao',
          entidadeId: t.id,
          resumo: resumoTransacao(t),
          estadoAnterior: t,
          loteId,
        }),
      );
      return {
        mudancas: {
          transacoes: atual.transacoes.map((t) =>
            ids.has(t.id) ? marcarExcluido(t, instante) : t,
          ),
          historico: [...atual.historico, ...eventos],
        },
        resultado: undefined,
      };
    });
  }
}
