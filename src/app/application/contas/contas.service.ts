import { computed, inject, Injectable } from '@angular/core';
import { efeitoNasContas } from '../../domain/cofrinhos/cofrinho';
import { type ContaFinanceira, type DadosConta, validarConta } from '../../domain/contas/conta';
import { dinheiro } from '../../domain/shared/dinheiro';
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
  /**
   * Saldo atual de cada conta: transações até hoje e o efeito dos cofrinhos (depósitos
   * saem da conta, retiradas voltam).
   */
  readonly saldos = computed(() => {
    const hoje = this.dados.hoje();
    const saldos = calcularSaldos(this.dados.contas(), this.dados.transacoes(), hoje);
    for (const [contaId, efeito] of efeitoNasContas(this.dados.cofrinhos(), hoje)) {
      const saldo = saldos.get(contaId);
      if (saldo) saldos.set(contaId, dinheiro(saldo.unidades + efeito, saldo.moeda));
    }
    return saldos;
  });

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
          .filter((r) => r.modelo.contaId === id || r.modelo.contaDestinoId === id).length +
        atual.contasAgendadas.filter((c) => ativo(c) && c.contaId === id).length +
        // Movimentações de cofrinhos (mesmo encerrados) afetam o saldo da conta.
        atual.cofrinhos.flatMap((c) => c.movimentacoes).filter((m) => m.contaId === id).length;
      if (emUso > 0) {
        throw new ErroDominio(
          'conta-em-uso',
          `A conta "${conta.nome}" é usada em ${emUso} ${emUso === 1 ? 'item' : 'itens'} (transações, recorrências ou contas a pagar/receber). Exclua-os ou troque a conta deles antes.`,
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
