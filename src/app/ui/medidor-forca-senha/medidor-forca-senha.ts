import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { AvaliacaoSenha } from '../../domain/cofre/forca-senha';

/**
 * Medidor de força da senha (RF-001). A força é informada em texto, não só por cor
 * (RNF-024); o campo de senha deve referenciar `idDescricao` em aria-describedby.
 * A barra é decorativa: 4 segmentos que se preenchem conforme o nível.
 */
@Component({
  selector: 'app-medidor-forca-senha',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div [id]="idDescricao()" class="mt-2">
      <div class="flex items-center gap-3">
        <div class="flex w-32 gap-1" aria-hidden="true">
          @for (segmento of [1, 2, 3, 4]; track segmento) {
            <span
              class="h-1.5 flex-1 rounded-full"
              [class]="segmento <= avaliacao().nivel ? cor() : 'bg-surface-muted'"
            ></span>
          }
        </div>
        <span class="text-sm text-foreground">
          Força da senha: <strong>{{ avaliacao().rotulo }}</strong>
          @if (avaliacao().aceitavel) {
            <span>(atende ao mínimo)</span>
          } @else {
            <span>(abaixo do mínimo)</span>
          }
        </span>
      </div>
      @if (avaliacao().sugestoes.length > 0) {
        <ul class="mt-1 list-disc pl-5 text-sm text-muted">
          @for (sugestao of avaliacao().sugestoes; track sugestao) {
            <li>{{ sugestao }}</li>
          }
        </ul>
      }
    </div>
  `,
})
export class MedidorForcaSenha {
  readonly avaliacao = input.required<AvaliacaoSenha>();
  readonly idDescricao = input.required<string>();
  /** Rosa abaixo do mínimo, aqua quando aceitável (a identidade usa aqua para progresso). */
  protected readonly cor = computed(() =>
    this.avaliacao().aceitavel ? 'bg-chart-2' : 'bg-chart-3',
  );
}
