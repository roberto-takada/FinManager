import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DadosService } from '../../../application/dados/dados.service';
import { DashboardService } from '../../../application/dashboard/dashboard.service';
import { nomeDoMes } from '../../../domain/shared/data';
import { formatarDinheiro, somarTodos } from '../../../domain/shared/dinheiro';
import { type CorGrafico, Grafico } from '../../../ui/grafico/grafico';
import { formatadores } from '../../compartilhado/formatos-grafico';

const CORES: readonly CorGrafico[] = ['chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5'];
const AMOSTRAS = ['bg-chart-1', 'bg-chart-2', 'bg-chart-3', 'bg-chart-4', 'bg-chart-5'];

/** Despesas do mês por categoria (RF-042), com legenda em texto e percentuais. */
@Component({
  selector: 'app-widget-despesas-categoria',
  imports: [Grafico, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full' },
  template: `
    <section class="@container h-full space-y-3 cartao" aria-labelledby="titulo-despesas-categoria">
      <h2 id="titulo-despesas-categoria" class="text-lg font-semibold">Despesas por categoria</h2>
      @if (fatias().length === 0) {
        <p class="text-muted">
          Nenhuma despesa em {{ mes() }}.
          <a class="link" routerLink="/transacoes/nova">Registre uma transação</a>.
        </p>
      } @else {
        <div class="grid items-start gap-4 @md:grid-cols-[minmax(0,12rem)_1fr]">
          <app-grafico
            tipo="rosca"
            titulo="Despesas por categoria no mês"
            rotuloCategorias="Categoria"
            [resumo]="resumo()"
            [rotulos]="nomes()"
            [series]="series()"
            [coresFatias]="cores()"
            [colunasExtras]="colunas()"
            [formatar]="formato().formatar"
            [altura]="180"
          />
          <ul class="space-y-2 text-sm" aria-label="Legenda: categorias e percentuais">
            @for (f of fatias(); track f.nome; let i = $index) {
              <li class="flex items-center gap-2" data-fatia>
                <span
                  class="size-2.5 shrink-0 rounded-sm"
                  [class]="amostras[i]"
                  aria-hidden="true"
                ></span>
                <span class="min-w-0 flex-1 truncate">{{ f.nome }}</span>
                <span class="font-semibold tabular-nums">{{ f.percentual }}%</span>
              </li>
            }
          </ul>
        </div>
      }
    </section>
  `,
})
export class WidgetDespesasCategoria {
  private readonly dashboard = inject(DashboardService);
  private readonly dados = inject(DadosService);
  protected readonly amostras = AMOSTRAS;

  protected readonly fatias = this.dashboard.despesasPorCategoria;
  protected readonly mes = computed(() => nomeDoMes(this.dados.hoje()));
  protected readonly formato = computed(() => formatadores(this.fatias()[0]?.valor.moeda ?? 'BRL'));
  protected readonly nomes = computed(() => this.fatias().map((f) => f.nome));
  protected readonly cores = computed(() => this.fatias().map((_, i) => CORES[i % CORES.length]!));
  protected readonly series = computed(() => [
    { nome: 'Valor', cor: 'chart-1' as const, valores: this.fatias().map((f) => f.valor.unidades) },
  ]);
  protected readonly colunas = computed(() => [
    { nome: 'Percentual', valores: this.fatias().map((f) => `${f.percentual}%`) },
  ]);

  protected readonly resumo = computed(() => {
    const fatias = this.fatias();
    const maior = fatias[0];
    if (!maior) return '';
    const total = formatarDinheiro(
      somarTodos(
        fatias.map((f) => f.valor),
        maior.valor.moeda,
      ),
    );
    return `${total} em despesas em ${this.mes()}. Maior gasto: ${maior.nome}, com ${maior.percentual}% (${formatarDinheiro(maior.valor)}).`;
  });
}
