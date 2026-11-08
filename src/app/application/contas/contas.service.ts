import { computed, inject, Injectable } from '@angular/core';
import { type ContaFinanceira, type DadosConta, validarConta } from '../../domain/contas/conta';
import { ativo, ativos } from '../../domain/shared/entidade';
import { ErroDominio } from '../../domain/shared/erro-dominio';
import { calcularSaldos } from '../../domain/transacoes/transacao';
import { buscarAtivo, marcarExcluido, substituir } from '../dados/colecoes';
import { DadosService } from '../dados/dados.service';
import { resumoConta } from '../historico/resumos';

/** Contas financeiras (RF-016). */
@Injectable({ providedIn: 'root' })
export class ContasService {
  private readonly dados = inject(DadosService);

  readonly ativas = computed(() =>
    ativos(this.dados.contas()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
  );

  /** Saldo atual de cada conta (transações até hoje). */
  readonly saldos = computed(() =>
    calcularSaldos(this.dados.contas(), this.dados.transacoes(), this.dados.hoje()),
  );

  criar(dados: DadosConta): Promise<ContaFinanceira> {
    return this.dados.alterar((atual) => {
      const instante = this.dados.agora().toISOString();
      const conta: ContaFinanceira = {
        ...validarConta(dados, atual.contas),
        id: this.dados.novoId(),
        criadoEm: instante,
        atualizadoEm: instante,
        excluidoEm: null,
      };
      return { mudancas: { contas: [...atual.contas, conta] }, resultado: conta };
    });
  }

  editar(id: string, dados: DadosConta): Promise<ContaFinanceira> {
    return this.dados.alterar((atual) => {
      const anterior = buscarAtivo(atual.contas, id, 'Conta');
      const conta: ContaFinanceira = {
        ...anterior,
        ...validarConta(dados, atual.contas, id),
        atualizadoEm: this.dados.agora().toISOString(),
      };
      return { mudancas: { contas: substituir(atual.contas, conta) }, resultado: conta };
    });
  }

  /** Exclusão (RN-005 a): vai para a lixeira e entra no histórico. */
  excluir(id: string): Promise<void> {
    return this.dados.alterar((atual) => {
      const conta = buscarAtivo(atual.contas, id, 'Conta');
      const emUso =
        atual.transacoes.filter(ativo).filter((t) => t.contaId === id || t.contaDestinoId === id)
          .length +
        atual.recorrencias
          .filter(ativo)
          .filter((r) => r.modelo.contaId === id || r.modelo.contaDestinoId === id).length;
      if (emUso > 0) {
        throw new ErroDominio(
          'conta-em-uso',
          `A conta "${conta.nome}" tem ${emUso} ${emUso === 1 ? 'transação ou recorrência' : 'transações ou recorrências'}. Exclua-as ou mova-as para outra conta antes.`,
        );
      }
      const instante = this.dados.agora().toISOString();
      const evento = this.dados.evento({
        acao: 'exclusao',
        entidade: 'conta',
        entidadeId: id,
        resumo: resumoConta(conta),
        estadoAnterior: conta,
      });
      return {
        mudancas: {
          contas: substituir(atual.contas, marcarExcluido(conta, instante)),
          historico: [...atual.historico, evento],
        },
        resultado: undefined,
      };
    });
  }
}
