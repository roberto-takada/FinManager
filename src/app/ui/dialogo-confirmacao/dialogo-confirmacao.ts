import {
  ChangeDetectionStrategy,
  Component,
  effect,
  type ElementRef,
  input,
  output,
  viewChild,
} from '@angular/core';

let proximoId = 0;

/**
 * Diálogo de confirmação reutilizável para ações significativas (RN-003, RN-005,
 * ENGENHARIA_DE_SOFTWARE §5.3).
 *
 * - Usa o <dialog> nativo com showModal(): foco preso no diálogo, Esc cancela, fundo inerte.
 * - O foco inicial fica em "Cancelar".
 * - O botão de ação deve ter verbo explícito (ex.: "Alterar senha mestra").
 * - É controlado pelo componente pai via `aberto`; o pai fecha ao receber
 *   `confirmado` ou `cancelado`.
 */
@Component({
  selector: 'app-dialogo-confirmacao',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog
      #dialogo
      class="m-auto w-[min(100%-2rem,32rem)] rounded-lg p-6 shadow-xl backdrop:bg-black/60"
      [attr.aria-labelledby]="id + '-titulo'"
      [attr.aria-describedby]="id + '-descricao'"
      (cancel)="cancelarPorEsc($event)"
    >
      <h2 [id]="id + '-titulo'" class="text-xl font-semibold text-foreground">{{ titulo() }}</h2>
      <div [id]="id + '-descricao'" class="mt-3 space-y-2 text-foreground">
        <p>{{ mensagem() }}</p>
        <ng-content />
      </div>
      <div class="mt-6 flex flex-wrap justify-end gap-3">
        <button #botaoCancelar type="button" class="botao-secundario" (click)="cancelado.emit()">
          Cancelar
        </button>
        <button
          type="button"
          [class]="perigoso() ? 'botao-perigo' : 'botao-primario'"
          (click)="confirmado.emit()"
        >
          {{ rotuloConfirmar() }}
        </button>
      </div>
    </dialog>
  `,
})
export class DialogoConfirmacao {
  readonly titulo = input.required<string>();
  readonly mensagem = input.required<string>();
  readonly rotuloConfirmar = input.required<string>();
  readonly perigoso = input(false);
  readonly aberto = input(false);

  readonly confirmado = output<void>();
  readonly cancelado = output<void>();

  protected readonly id = `dialogo-${++proximoId}`;
  private readonly dialogo = viewChild.required<ElementRef<HTMLDialogElement>>('dialogo');
  private readonly botaoCancelar =
    viewChild.required<ElementRef<HTMLButtonElement>>('botaoCancelar');

  constructor() {
    effect(() => {
      const dialogo = this.dialogo().nativeElement;
      if (this.aberto() && !dialogo.open) {
        // jsdom (testes) não implementa showModal.
        if (typeof dialogo.showModal === 'function') dialogo.showModal();
        else dialogo.setAttribute('open', '');
        this.botaoCancelar().nativeElement.focus();
      } else if (!this.aberto() && dialogo.open) {
        if (typeof dialogo.close === 'function') dialogo.close();
        else dialogo.removeAttribute('open');
      }
    });
  }

  protected cancelarPorEsc(evento: Event): void {
    // O pai decide fechar (mantém `aberto` como fonte da verdade).
    evento.preventDefault();
    this.cancelado.emit();
  }
}
