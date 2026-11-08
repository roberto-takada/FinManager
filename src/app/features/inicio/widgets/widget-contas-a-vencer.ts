import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AgendaService } from '../../../application/agenda/agenda.service';
import { DadosService } from '../../../application/dados/dados.service';
import { descricaoDoAlerta } from '../../../domain/agenda/alertas';

/** Contas vencidas ou perto do vencimento (RF-026). */
@Component({
  selector: 'app-widget-contas-a-vencer',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full' },
  template: `
    <section class="h-full space-y-3 cartao" aria-labelledby="titulo-alertas" data-alertas>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h2 id="titulo-alertas" class="text-lg font-semibold">Contas a vencer</h2>
        <a class="link" routerLink="/calendario">Abrir o calendário</a>
      </div>
      @if (agenda.alertas().length === 0) {
        <p class="text-muted">{{ textoSemAlertas() }}</p>
      } @else {
        <ul class="divide-y divide-border">
          @for (a of agenda.alertas(); track a.chave) {
            <li
              class="flex flex-wrap items-center gap-3 py-2"
              data-alerta
              [attr.data-proximidade]="a.proximidade"
            >
              <span [class]="a.proximidade === 'vencida' ? 'selo-negativo' : 'selo-primario'">
                <span aria-hidden="true">{{ a.proximidade === 'vencida' ? '!' : '○' }}</span>
                {{ a.proximidade === 'vencida' ? 'Vencida' : 'A vencer' }}
              </span>
              <span>{{ descricaoAlerta(a) }}</span>
            </li>
          }
        </ul>
      }
    </section>
  `,
})
export class WidgetContasAVencer {
  protected readonly agenda = inject(AgendaService);
  private readonly dados = inject(DadosService);
  protected readonly descricaoAlerta = descricaoDoAlerta;

  protected readonly textoSemAlertas = computed(() => {
    const dias = this.dados.preferencias().notificacao.antecedenciaDias;
    return dias === 0
      ? 'Nenhuma conta vencida ou vencendo hoje.'
      : `Nenhuma conta vencida ou vencendo nos próximos ${dias} ${dias === 1 ? 'dia' : 'dias'}.`;
  });
}
