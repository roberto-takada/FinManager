import { computed, inject, Injectable } from '@angular/core';
import {
  despesasPorCategoria,
  evolucaoPatrimonio,
  receitasDespesasPorMes,
} from '../../domain/dashboard/indicadores';
import { type LayoutDashboard, normalizarLayout } from '../../domain/dashboard/layout';
import { intervaloDoMes } from '../../domain/shared/data';
import { DadosService } from '../dados/dados.service';

/**
 * Dashboard da tela Início: gráficos (RF-041, RF-042) e layout personalizado (RF-043, RF-044).
 * O resumo do mês (RF-040) vem do `ResumoService`.
 */
@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly dados = inject(DadosService);

  /** Layout guardado nas preferências cifradas, já normalizado; sem escolha, o padrão. */
  readonly layout = computed(() => normalizarLayout(this.dados.preferencias().dashboard));

  readonly patrimonio = computed(() =>
    evolucaoPatrimonio(
      this.dados.contas(),
      this.dados.transacoes(),
      this.dados.cofrinhos(),
      this.dados.hoje(),
    ),
  );

  /** Despesas do mês atual até hoje, como os indicadores do resumo. */
  readonly despesasPorCategoria = computed(() => {
    const hoje = this.dados.hoje();
    const [inicio] = intervaloDoMes(hoje);
    return despesasPorCategoria(this.dados.transacoes(), this.dados.categorias(), inicio, hoje);
  });

  readonly receitasDespesas = computed(() =>
    receitasDespesasPorMes(this.dados.transacoes(), this.dados.hoje()),
  );

  /** RF-044: grava o layout nas preferências (cifradas e incluídas no backup). */
  salvarLayout(layout: LayoutDashboard): Promise<void> {
    const normalizado = normalizarLayout(layout);
    return this.dados.alterar((atual) => {
      const preferencias = atual.preferencias[0] ?? this.dados.preferencias();
      return {
        mudancas: { preferencias: [{ ...preferencias, dashboard: normalizado }] },
        resultado: undefined,
      };
    });
  }
}
