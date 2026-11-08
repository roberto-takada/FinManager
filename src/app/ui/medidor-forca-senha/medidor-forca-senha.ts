import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { AvaliacaoSenha } from '../../domain/cofre/forca-senha';

/**
 * Medidor de força da senha (RF-001). A força é informada em texto, não só por cor
 * (RNF-024); o campo de senha deve referenciar `idDescricao` em aria-describedby.
 */
@Component({
  selector: 'app-medidor-forca-senha',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div [id]="idDescricao()" class="mt-2">
      <div class="flex items-center gap-3">
        <meter
          class="h-2 w-32"
          min="0"
          max="4"
          low="2"
          high="3"
          optimum="4"
          [value]="avaliacao().nivel"
          aria-hidden="true"
        ></meter>
        <span class="text-sm text-gray-900">
          Força da senha: <strong>{{ avaliacao().rotulo }}</strong>
          @if (avaliacao().aceitavel) {
            <span>(atende ao mínimo)</span>
          } @else {
            <span>(abaixo do mínimo)</span>
          }
        </span>
      </div>
      @if (avaliacao().sugestoes.length > 0) {
        <ul class="mt-1 list-disc pl-5 text-sm text-gray-700">
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
}
