import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DashboardService } from '../../../application/dashboard/dashboard.service';
import { formatarDinheiro } from '../../../domain/shared/dinheiro';
import { Grafico } from '../../../ui/grafico/grafico';
import { formatadores, mesCurto, mesLongo } from '../../compartilhado/formatos-grafico';

/** Receitas x despesas dos últimos 6 meses (o mês atual até hoje). */
@Component({
  selector: 'app-widget-receitas-despesas',
  imports: [Grafico],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full' },
  template: `
    <section class="h-full space-y-3 cartao" aria-labelledby="titulo-receitas-despesas">
      <h2 id="titulo-receitas-despesas" class="text-lg font-semibold">Receitas x despesas</h2>
      @if (vazio()) {
        <p class="text-muted">Nenhuma receita ou despesa nos últimos 6 meses.</p>
      } @else {
        <app-grafico
          tipo="barras"
          titulo="Receitas e despesas por mês"
          rotuloCategorias="Mês"
          [resumo]="resumo()"
          [rotulos]="rotulos()"
          [rotulosTabela]="rotulosLongos()"
          [series]="series()"
          [formatar]="formato().formatar"
          [formatarEixo]="formato().formatarEixo"
        />
      }
    </section>
  `,
})
export class WidgetReceitasDespesas {
  private readonly meses = inject(DashboardService).receitasDespesas;

  protected readonly vazio = computed(() =>
    this.meses().every((m) => m.receitas.unidades === 0 && m.despesas.unidades === 0),
  );
  protected readonly formato = computed(() =>
    formatadores(this.meses()[0]?.receitas.moeda ?? 'BRL'),
  );
  protected readonly rotulos = computed(() => this.meses().map((m) => mesCurto(m.mes)));
  protected readonly rotulosLongos = computed(() => this.meses().map((m) => mesLongo(m.mes)));
  protected readonly series = computed(() => [
    {
      nome: 'Receitas',
      cor: 'positive' as const,
      valores: this.meses().map((m) => m.receitas.unidades),
    },
    {
      nome: 'Despesas',
      cor: 'negative' as const,
      valores: this.meses().map((m) => m.despesas.unidades),
    },
  ]);

  protected readonly resumo = computed(() => {
    const atual = this.meses().at(-1);
    if (!atual) return '';
    const saldo = atual.receitas.unidades - atual.despesas.unidades;
    const situacao =
      saldo > 0
        ? 'as receitas superam as despesas'
        : saldo < 0
          ? 'as despesas superam as receitas'
          : 'receitas e despesas empatam';
    return `Em ${mesLongo(atual.mes)}, até hoje: receitas de ${formatarDinheiro(atual.receitas)} e despesas de ${formatarDinheiro(atual.despesas)}; ${situacao}.`;
  });
}
