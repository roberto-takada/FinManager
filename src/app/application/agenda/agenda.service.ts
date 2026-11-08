import { computed, inject, Injectable } from '@angular/core';
import { calcularAlertas } from '../../domain/agenda/alertas';
import {
  type ContaAgendada,
  type DadosContaAgendada,
  ehAlteracaoSignificativaConta,
  ehVencimentoDaConta,
  ocorrenciasNoPeriodo,
  type Ocorrencia,
  transacaoDoPagamento,
  validarContaAgendada,
} from '../../domain/agenda/conta-agendada';
import { gerarIcs } from '../../domain/agenda/ical';
import { type DataISO, somarDias } from '../../domain/shared/data';
import type { Dinheiro } from '../../domain/shared/dinheiro';
import { ativos } from '../../domain/shared/entidade';
import { ErroDominio } from '../../domain/shared/erro-dominio';
import { type Transacao, validarTransacao } from '../../domain/transacoes/transacao';
import { buscarAtivo, marcarExcluido, substituir } from '../dados/colecoes';
import { DadosService } from '../dados/dados.service';
import { resumoContaAgendada, resumoTransacao } from '../historico/resumos';

export interface DadosPagamento {
  readonly contaAgendadaId: string;
  /** Ocorrência que está sendo paga/recebida. */
  readonly vencimento: DataISO;
  /** Conta financeira de onde sai (ou para onde entra) o dinheiro. */
  readonly contaId: string;
  /** Data do pagamento: vira a data da transação. */
  readonly data: DataISO;
  /** Valor efetivamente pago (pode diferir do previsto, ex.: conta de luz). */
  readonly valor: Dinheiro;
}

/** Contas a pagar/receber, calendário e alertas (RF-020 a RF-025). */
@Injectable({ providedIn: 'root' })
export class AgendaService {
  private readonly dados = inject(DadosService);

  readonly ativas = computed(() =>
    ativos(this.dados.contasAgendadas()).sort((a, b) =>
      a.descricao.localeCompare(b.descricao, 'pt-BR'),
    ),
  );

  /** Ids das transações ativas: a situação de cada ocorrência é derivada delas. */
  readonly transacoesAtivas = computed(
    () => new Set(ativos(this.dados.transacoes()).map((t) => t.id)),
  );

  /** Alertas de vencimento conforme a antecedência configurada (RF-024, RF-026). */
  readonly alertas = computed(() =>
    calcularAlertas(
      this.dados.contasAgendadas(),
      this.transacoesAtivas(),
      this.dados.hoje(),
      this.dados.preferencias().notificacao.antecedenciaDias,
    ),
  );

  /** Ocorrências em [de, ate] com a situação de cada uma (RF-021, RF-022). */
  ocorrencias(de: DataISO, ate: DataISO): Ocorrencia[] {
    return ocorrenciasNoPeriodo(
      this.dados.contasAgendadas(),
      de,
      ate,
      this.transacoesAtivas(),
      this.dados.hoje(),
    );
  }

  /** Primeira ocorrência ainda em aberto (vencida ou futura), se houver. */
  proximaEmAberto(conta: ContaAgendada): Ocorrencia | null {
    const ate = somarDias(this.dados.hoje(), 400);
    return (
      ocorrenciasNoPeriodo(
        [conta],
        conta.vencimento,
        ate,
        this.transacoesAtivas(),
        this.dados.hoje(),
      ).find((o) => o.situacao !== 'paga') ?? null
    );
  }

  /** RF-020: cadastra uma conta a pagar ou a receber, única ou recorrente. */
  criar(dados: DadosContaAgendada): Promise<ContaAgendada> {
    return this.dados.alterar((atual) => {
      const instante = this.dados.agora().toISOString();
      const conta: ContaAgendada = {
        ...validarContaAgendada(dados, atual.categorias, atual.contas),
        id: this.dados.novoId(),
        criadoEm: instante,
        atualizadoEm: instante,
        excluidoEm: null,
        pagamentos: [],
      };
      return { mudancas: { contasAgendadas: [...atual.contasAgendadas, conta] }, resultado: conta };
    });
  }

  /**
   * Edita a conta. Mudar valor, vencimento, tipo ou repetição entra no histórico com o
   * estado anterior; a confirmação (RN-003) é pedida pela interface.
   */
  editar(id: string, dados: DadosContaAgendada): Promise<{ significativa: boolean }> {
    return this.dados.alterar((atual) => {
      const anterior = buscarAtivo(atual.contasAgendadas, id, 'Conta a pagar/receber');
      const conta: ContaAgendada = {
        ...anterior,
        ...validarContaAgendada(dados, atual.categorias, atual.contas),
        atualizadoEm: this.dados.agora().toISOString(),
      };
      const significativa = ehAlteracaoSignificativaConta(anterior, conta);
      const historico = significativa
        ? [
            ...atual.historico,
            this.dados.evento({
              acao: 'edicao',
              entidade: 'contaAgendada',
              entidadeId: id,
              resumo: resumoContaAgendada(anterior),
              estadoAnterior: anterior,
            }),
          ]
        : atual.historico;
      return {
        mudancas: { contasAgendadas: substituir(atual.contasAgendadas, conta), historico },
        resultado: { significativa },
      };
    });
  }

  /**
   * RN-005 a: exclui a conta (todas as ocorrências futuras somem do calendário). As
   * transações de pagamentos já feitos continuam, pois o dinheiro de fato saiu/entrou.
   */
  excluir(id: string): Promise<void> {
    return this.dados.alterar((atual) => {
      const conta = buscarAtivo(atual.contasAgendadas, id, 'Conta a pagar/receber');
      const evento = this.dados.evento({
        acao: 'exclusao',
        entidade: 'contaAgendada',
        entidadeId: id,
        resumo: resumoContaAgendada(conta),
        estadoAnterior: conta,
      });
      return {
        mudancas: {
          contasAgendadas: substituir(
            atual.contasAgendadas,
            marcarExcluido(conta, this.dados.agora().toISOString()),
          ),
          historico: [...atual.historico, evento],
        },
        resultado: undefined,
      };
    });
  }

  /**
   * RF-023: marca a ocorrência como paga/recebida, criando a transação correspondente
   * (despesa ou receita) e o vínculo com a ocorrência, na mesma gravação.
   */
  pagar(pagamento: DadosPagamento): Promise<Transacao> {
    return this.dados.alterar((atual) => {
      const conta = buscarAtivo(
        atual.contasAgendadas,
        pagamento.contaAgendadaId,
        'Conta a pagar/receber',
      );
      if (!ehVencimentoDaConta(conta, pagamento.vencimento)) {
        throw new ErroDominio(
          'ocorrencia-inexistente',
          'Esta data não é um vencimento desta conta.',
        );
      }
      const ativas = new Set(ativos(atual.transacoes).map((t) => t.id));
      if (transacaoDoPagamento(conta, pagamento.vencimento, ativas)) {
        throw new ErroDominio(
          'ocorrencia-paga',
          conta.tipo === 'pagar' ? 'Esta conta já foi paga.' : 'Esta conta já foi recebida.',
        );
      }
      const validos = validarTransacao(
        {
          tipo: conta.tipo === 'pagar' ? 'despesa' : 'receita',
          valor: pagamento.valor,
          data: pagamento.data,
          descricao: conta.descricao,
          categoriaId: conta.categoriaId,
          contaId: pagamento.contaId,
          contaDestinoId: null,
        },
        atual.contas,
        atual.categorias,
      );
      const instante = this.dados.agora().toISOString();
      const transacao: Transacao = {
        ...validos,
        id: this.dados.novoId(),
        criadoEm: instante,
        atualizadoEm: instante,
        excluidoEm: null,
        recorrenciaId: null,
        parcela: null,
      };
      const atualizada: ContaAgendada = {
        ...conta,
        atualizadoEm: instante,
        pagamentos: [
          ...conta.pagamentos,
          { vencimento: pagamento.vencimento, transacaoId: transacao.id },
        ],
      };
      return {
        mudancas: {
          transacoes: [...atual.transacoes, transacao],
          contasAgendadas: substituir(atual.contasAgendadas, atualizada),
        },
        resultado: transacao,
      };
    });
  }

  /**
   * Desfaz o pagamento: a transação gerada vai para a lixeira (RN-004) e a ocorrência volta
   * a ficar em aberto. Restaurar a transação pela lixeira volta a quitá-la.
   */
  desfazerPagamento(contaAgendadaId: string, vencimento: DataISO): Promise<void> {
    return this.dados.alterar((atual) => {
      const conta = buscarAtivo(atual.contasAgendadas, contaAgendadaId, 'Conta a pagar/receber');
      const ativas = new Set(ativos(atual.transacoes).map((t) => t.id));
      const transacaoId = transacaoDoPagamento(conta, vencimento, ativas);
      if (!transacaoId)
        throw new ErroDominio('ocorrencia-aberta', 'Esta ocorrência não está paga.');
      const transacao = buscarAtivo(atual.transacoes, transacaoId, 'Transação');
      const evento = this.dados.evento({
        acao: 'exclusao',
        entidade: 'transacao',
        entidadeId: transacaoId,
        resumo: resumoTransacao(transacao),
        estadoAnterior: transacao,
      });
      return {
        mudancas: {
          transacoes: substituir(
            atual.transacoes,
            marcarExcluido(transacao, this.dados.agora().toISOString()),
          ),
          historico: [...atual.historico, evento],
        },
        resultado: undefined,
      };
    });
  }

  /** RF-025: calendário em iCalendar. O texto NÃO é cifrado. */
  exportarIcs(): string {
    return gerarIcs(this.dados.contasAgendadas(), this.dados.agora());
  }
}
