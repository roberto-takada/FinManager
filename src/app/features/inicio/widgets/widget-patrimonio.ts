import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DashboardService } from '../../../application/dashboard/dashboard.service';
import { formatarDinheiro } from '../../../domain/shared/dinheiro';
import { Grafico } from '../../../ui/grafico/grafico';
import { comSinal, formatadores, mesCurto, mesLongo } from '../../compartilhado/formatos-grafico';

/** Evolução do patrimônio (RF-041): contas + cofrinhos no fim de cada mês. */
@Component({
  selector: 'app-widget-patrimonio',
  imports: [Grafico],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full' },
  template: `
    <section class="h-full space-y-3 cartao" aria-labelledby="titulo-patrimonio">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h2 id="titulo-patrimonio" class="text-lg font-semibold">Evolução do patrimônio</h2>
        @if (evolucao().pontos.length > 1) {
          @let v = evolucao().variacao.unidades;
          <p
            [class]="v > 0 ? 'selo-positivo' : v < 0 ? 'selo-negativo' : 'selo-neutro'"
            data-variacao
          >
            <span aria-hidden="true">{{ v > 0 ? '▲' : v < 0 ? '▼' : '=' }}</span>
            {{ comSinal(evolucao().variacao) }} em {{ evolucao().pontos.length }} meses
          </p>
        }
      </div>
      <app-grafico
        tipo="linha"
        titulo="Patrimônio no fim de cada mês"
        rotuloCategorias="Mês"
        [resumo]="resumo()"
        [rotulos]="rotulos()"
        [rotulosTabela]="rotulosLongos()"
        [series]="series()"
        [formatar]="formato().formatar"
        [formatarEixo]="formato().formatarEixo"
        [legenda]="false"
      />
    </section>
  `,
})
export class WidgetPatrimonio {
  private readonly dashboard = inject(DashboardService);
  protected readonly comSinal = comSinal;

  protected readonly evolucao = this.dashboard.patrimonio;
  protected readonly formato = computed(() =>
    formatadores(this.evolucao().pontos[0]?.valor.moeda ?? 'BRL'),
  );
  protected readonly rotulos = computed(() => this.evolucao().pontos.map((p) => mesCurto(p.mes)));
  protected readonly rotulosLongos = computed(() =>
    this.evolucao().pontos.map((p) => mesLongo(p.mes)),
  );
  protected readonly series = computed(() => [
    {
      nome: 'Patrimônio',
      cor: 'chart-1' as const,
      valores: this.evolucao().pontos.map((p) => p.valor.unidades),
    },
  ]);

  /** Conclusão em texto (RF-045): valor atual e se cresceu ou diminuiu. */
  protected readonly resumo = computed(() => {
    const { pontos, variacao } = this.evolucao();
    const ultimo = pontos.at(-1);
    if (!ultimo) return '';
    const atual = `Patrimônio atual: ${formatarDinheiro(ultimo.valor)}.`;
    if (pontos.length < 2) return `${atual} A evolução aparece a partir do segundo mês de uso.`;
    const desde = mesLongo(pontos[0]!.mes);
    const valor = formatarDinheiro({ ...variacao, unidades: Math.abs(variacao.unidades) });
    if (variacao.unidades > 0) return `${atual} Cresceu ${valor} desde ${desde}.`;
    if (variacao.unidades < 0) return `${atual} Diminuiu ${valor} desde ${desde}.`;
    return `${atual} Sem variação desde ${desde}.`;
  });
}
