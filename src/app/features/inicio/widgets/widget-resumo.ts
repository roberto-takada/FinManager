import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DadosService } from '../../../application/dados/dados.service';
import { ResumoService } from '../../../application/resumo/resumo.service';
import { formatarDinheiro } from '../../../domain/shared/dinheiro';
import { percentual } from '../../compartilhado/percentual';

/**
 * Resumo do mês (RF-040): saldo, receitas, despesas e contas a pagar. A grade se adapta à
 * largura do widget (container query), não à da tela, para funcionar em qualquer tamanho.
 */
@Component({
  selector: 'app-widget-resumo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full' },
  template: `
    <section aria-labelledby="titulo-resumo" class="@container">
      <h2 id="titulo-resumo" class="sr-only">Resumo do mês</h2>
      <div class="grid gap-4 @lg:grid-cols-2 @4xl:grid-cols-4">
        <article class="space-y-2 cartao" data-kpi="saldo">
          <h3 class="text-sm font-medium text-muted">Saldo em contas</h3>
          <p class="valor-kpi">{{ formatar(resumo.saldoEmContas()) }}</p>
          <p class="selo-primario">Patrimônio {{ formatar(resumo.patrimonio()) }}</p>
        </article>
        <article class="space-y-2 cartao" data-kpi="receitas">
          <h3 class="text-sm font-medium text-muted">Receitas</h3>
          <p class="valor-kpi">{{ formatar(resumo.mes().receitas) }}</p>
          @if (resumo.mes().variacaoReceitas !== null) {
            @let v = resumo.mes().variacaoReceitas!;
            <p [class]="v >= 0 ? 'selo-positivo' : 'selo-negativo'">
              {{ percentual(v) }} vs. {{ resumo.mes().nomeAnterior }}
            </p>
          } @else {
            <p class="selo-neutro">Sem comparação com {{ resumo.mes().nomeAnterior }}</p>
          }
        </article>
        <article class="space-y-2 cartao" data-kpi="despesas">
          <h3 class="text-sm font-medium text-muted">Despesas</h3>
          <p class="valor-kpi">{{ formatar(resumo.mes().despesas) }}</p>
          @if (resumo.mes().variacaoDespesas !== null) {
            @let v = resumo.mes().variacaoDespesas!;
            <!-- Despesas: cair é bom (aqua), subir é alerta (rosa); o sinal fica no texto. -->
            <p [class]="v <= 0 ? 'selo-positivo' : 'selo-negativo'">
              {{ percentual(v) }} vs. {{ resumo.mes().nomeAnterior }}
            </p>
          } @else {
            <p class="selo-neutro">Sem comparação com {{ resumo.mes().nomeAnterior }}</p>
          }
        </article>
        <article class="space-y-2 cartao" data-kpi="a-pagar">
          <h3 class="text-sm font-medium text-muted">Contas a pagar</h3>
          <p class="valor-kpi">{{ formatar(resumo.contasAPagar().total) }}</p>
          @if (resumo.contasAPagar().vencidas > 0) {
            <p class="selo-negativo">
              {{ plural(resumo.contasAPagar().vencidas, 'vencida', 'vencidas') }}
            </p>
          } @else if (resumo.contasAPagar().quantidade > 0) {
            <p class="selo-negativo">
              {{ plural(resumo.contasAPagar().quantidade, 'vence', 'vencem') }} em até
              {{ antecedencia() }}
            </p>
          } @else {
            <p class="selo-positivo">Nada a vencer em {{ antecedencia() }}</p>
          }
        </article>
      </div>
    </section>
  `,
})
export class WidgetResumo {
  protected readonly resumo = inject(ResumoService);
  private readonly dados = inject(DadosService);
  protected readonly formatar = formatarDinheiro;
  protected readonly percentual = percentual;

  protected readonly antecedencia = computed(() => {
    const dias = this.dados.preferencias().notificacao.antecedenciaDias;
    return dias === 0 ? 'hoje' : `${dias} ${dias === 1 ? 'dia' : 'dias'}`;
  });

  protected plural(n: number, singular: string, varios: string): string {
    return `${n} ${n === 1 ? singular : varios}`;
  }
}
