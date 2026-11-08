import { computed, inject, Injectable } from '@angular/core';
import { saldoCofrinho } from '../../domain/cofrinhos/cofrinho';
import {
  intervaloDoMes,
  nomeDoMes,
  somarMeses,
  variacaoPercentual,
} from '../../domain/shared/data';
import { type Dinheiro, somarTodos } from '../../domain/shared/dinheiro';
import { ativos } from '../../domain/shared/entidade';
import { filtrarTransacoes, totalizar } from '../../domain/transacoes/transacao';
import { AgendaService } from '../agenda/agenda.service';
import { CofrinhosService } from '../cofrinhos/cofrinhos.service';
import { ContasService } from '../contas/contas.service';
import { DadosService } from '../dados/dados.service';

export interface ResumoMes {
  /** Ex.: "novembro de 2026". */
  readonly nome: string;
  /** Mês anterior, ex.: "outubro". */
  readonly nomeAnterior: string;
  readonly receitas: Dinheiro;
  readonly despesas: Dinheiro;
  /** Variação em % contra o mesmo período do mês anterior; `null` sem base de comparação. */
  readonly variacaoReceitas: number | null;
  readonly variacaoDespesas: number | null;
}

/**
 * Números da tela Início: saldos, mês atual, contas a pagar, transações recentes e metas
 * (RF-040). Os gráficos da dashboard vêm do `DashboardService`.
 */
@Injectable({ providedIn: 'root' })
export class ResumoService {
  private readonly dados = inject(DadosService);
  private readonly contas = inject(ContasService);
  private readonly agenda = inject(AgendaService);
  private readonly cofrinhos = inject(CofrinhosService);

  readonly saldoEmContas = computed(() =>
    somarTodos(this.contas.ativas().map((c) => this.contas.saldos().get(c.id) ?? c.saldoInicial)),
  );

  readonly guardadoEmCofrinhos = computed(() =>
    somarTodos(this.cofrinhos.emAndamento().map(saldoCofrinho)),
  );

  /** Patrimônio = contas + cofrinhos (glossário). */
  readonly patrimonio = computed(() =>
    somarTodos([this.saldoEmContas(), this.guardadoEmCofrinhos()]),
  );

  /** Receitas e despesas do mês até hoje, comparadas com o mesmo período do mês anterior. */
  readonly mes = computed<ResumoMes>(() => {
    const hoje = this.dados.hoje();
    const mesmoDiaAnterior = somarMeses(hoje, -1);
    const [inicio] = intervaloDoMes(hoje);
    const [inicioAnterior] = intervaloDoMes(mesmoDiaAnterior);
    const total = (de: string, ate: string) =>
      totalizar(filtrarTransacoes(this.dados.transacoes(), { de, ate }, this.dados.categorias()));
    const atual = total(inicio, hoje);
    const anterior = total(inicioAnterior, mesmoDiaAnterior);
    return {
      nome: nomeDoMes(hoje),
      nomeAnterior: nomeDoMes(mesmoDiaAnterior, false),
      receitas: atual.receitas,
      despesas: atual.despesas,
      variacaoReceitas: variacaoPercentual(atual.receitas.unidades, anterior.receitas.unidades),
      variacaoDespesas: variacaoPercentual(atual.despesas.unidades, anterior.despesas.unidades),
    };
  });

  /** Contas a pagar em aberto dentro da antecedência configurada (inclui vencidas). */
  readonly contasAPagar = computed(() => {
    const alertas = this.agenda.alertas().filter((a) => a.ocorrencia.conta.tipo === 'pagar');
    return {
      total: somarTodos(alertas.map((a) => a.ocorrencia.conta.valor)),
      quantidade: alertas.length,
      vencidas: alertas.filter((a) => a.proximidade === 'vencida').length,
    };
  });

  /** As 5 transações mais recentes até hoje. */
  readonly recentes = computed(() =>
    filtrarTransacoes(
      ativos(this.dados.transacoes()),
      { ate: this.dados.hoje() },
      this.dados.categorias(),
    ).slice(0, 5),
  );

  /** Até 3 cofrinhos em andamento, os mais próximos da meta primeiro. */
  readonly metas = computed(() =>
    [...this.cofrinhos.emAndamento()]
      .sort(
        (a, b) =>
          saldoCofrinho(b).unidades / b.meta.unidades - saldoCofrinho(a).unidades / a.meta.unidades,
      )
      .slice(0, 3),
  );
}
