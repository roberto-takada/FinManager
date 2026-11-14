import { ChangeDetectionStrategy, Component, ElementRef, inject, input } from '@angular/core';
import { formatarDataHora, formatarHora } from './formatos-data';
import type { RascunhoFormulario } from './rascunho-formulario';

/**
 * Dentro de um formulário: oferece restaurar o rascunho encontrado (RF-071) e mostra
 * quando o rascunho foi salvo automaticamente (RF-070).
 */
@Component({
  selector: 'app-aviso-rascunho',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (rascunho().oferta(); as r) {
      <div class="space-y-3 aviso border-primary" role="group" aria-labelledby="rascunho-titulo">
        <p id="rascunho-titulo" class="font-semibold">Há um rascunho não salvo deste formulário</p>
        <p class="text-sm">
          Guardado em {{ dataHora(r.atualizadoEm) }}. Restaure para continuar de onde parou, ou
          descarte para começar com os dados atuais.
        </p>
        <div class="flex flex-wrap gap-3">
          <button type="button" class="botao-primario" (click)="restaurar()">
            Restaurar rascunho
          </button>
          <button type="button" class="botao-secundario" (click)="descartar()">
            Descartar rascunho
          </button>
        </div>
      </div>
    }
    <!-- Existe desde a oferta, para o resultado da escolha ser anunciado (RF-071). -->
    @if (rascunho().oferta() || rascunho().anuncio()) {
      <p class="sr-only" role="status">{{ rascunho().anuncio() }}</p>
    }
    @if (rascunho().salvoEm(); as salvo) {
      <p class="ajuda flex items-center gap-1.5" data-rascunho-salvo>
        <span aria-hidden="true">✓</span> Rascunho salvo neste navegador, cifrado, às
        {{ hora(salvo) }}.
      </p>
    }
  `,
})
export class AvisoRascunho {
  readonly rascunho = input.required<RascunhoFormulario>();
  private readonly elemento = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly dataHora = formatarDataHora;
  protected readonly hora = formatarHora;

  protected restaurar(): void {
    this.rascunho().restaurar();
    this.focarPrimeiroCampo();
  }

  protected async descartar(): Promise<void> {
    this.focarPrimeiroCampo();
    await this.rascunho().descartar();
  }

  /** Os botões somem após a escolha: o foco vai para o primeiro campo do formulário. */
  private focarPrimeiroCampo(): void {
    this.elemento.nativeElement
      .closest('form')
      ?.querySelector<HTMLElement>('input:not([type=hidden]):not(.sr-only), select, textarea')
      ?.focus();
  }
}
