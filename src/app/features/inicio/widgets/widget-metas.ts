import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ResumoService } from '../../../application/resumo/resumo.service';
import { type Cofrinho, progresso } from '../../../domain/cofrinhos/cofrinho';
import { formatarDinheiro } from '../../../domain/shared/dinheiro';
import { classeProgresso } from '../../cofrinhos/textos-cofrinho';

/** Até 3 cofrinhos em andamento, os mais próximos da meta primeiro. */
@Component({
  selector: 'app-widget-metas',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full' },
  template: `
    <section class="h-full space-y-4 cartao" aria-labelledby="titulo-metas">
      <div class="flex items-center justify-between gap-3">
        <h2 id="titulo-metas" class="text-lg font-semibold">Metas</h2>
        <a class="link" routerLink="/cofrinhos">Cofrinhos</a>
      </div>
      @if (resumo.metas().length === 0) {
        <p class="text-muted">
          Nenhum cofrinho em andamento.
          <a class="link" routerLink="/cofrinhos/novo">Crie um objetivo</a>.
        </p>
      }
      @for (c of resumo.metas(); track c.id) {
        <div class="space-y-1.5">
          <div class="flex justify-between gap-2 font-medium">
            <span>{{ c.nome }}</span>
            <span class="tabular-nums">{{ progresso(c).percentual }}%</span>
          </div>
          <progress
            max="100"
            [value]="barra(c)"
            [class]="classeProgresso(c)"
            [attr.aria-label]="'Progresso de ' + c.nome"
          ></progress>
          <p class="text-sm text-muted">
            {{ formatar(progresso(c).saldo) }} de {{ formatar(c.meta) }}
          </p>
        </div>
      }
    </section>
  `,
})
export class WidgetMetas {
  protected readonly resumo = inject(ResumoService);
  protected readonly formatar = formatarDinheiro;
  protected readonly progresso = progresso;
  protected readonly classeProgresso = classeProgresso;

  protected barra(c: Cofrinho): number {
    return Math.min(100, progresso(c).percentual);
  }
}
