import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DOCUMENT,
  inject,
  input,
} from '@angular/core';

/**
 * Mostra a chave de recuperação com opções de imprimir e baixar (RF-003, §5.6).
 * Não oferece "copiar" de propósito: gerenciadores de área de transferência guardam
 * histórico, o que deixaria a chave exposta.
 */
@Component({
  selector: 'app-exibicao-chave-recuperacao',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <figure class="cartao print:border-0 print:shadow-none">
      <figcaption class="font-medium text-gray-900">Sua chave de recuperação</figcaption>
      <p
        class="mt-3 font-mono text-xl font-semibold tracking-wider break-all text-gray-900 sm:text-2xl"
        data-chave-recuperacao
      >
        @for (grupo of grupos(); track $index; let ultimo = $last) {
          <span
            ><span class="sr-only">Grupo {{ $index + 1 }}: </span
            ><span data-grupo>{{ grupo }}</span></span
          >
          @if (!ultimo) {
            <span aria-hidden="true">-</span>
          }
        }
      </p>
      <p class="ajuda print:block">
        FinManager — guarde esta chave em local seguro, fora do computador. Ela permite redefinir a
        senha mestra.
      </p>
      <div class="mt-4 flex flex-wrap gap-3 print:hidden">
        <button type="button" class="botao-secundario" (click)="imprimir()">Imprimir chave</button>
        <button type="button" class="botao-secundario" (click)="baixar()">
          Baixar chave (.txt)
        </button>
      </div>
    </figure>
  `,
})
export class ExibicaoChaveRecuperacao {
  readonly chave = input.required<string>();
  protected readonly grupos = computed(() => this.chave().split('-'));
  private readonly documento = inject(DOCUMENT);

  protected imprimir(): void {
    this.documento.defaultView?.print();
  }

  protected baixar(): void {
    const conteudo =
      'FinManager — chave de recuperação\r\n\r\n' +
      `${this.chave()}\r\n\r\n` +
      'Guarde este arquivo fora do computador (ex.: impresso ou em um pendrive) e apague-o daqui.\r\n' +
      'Com ela é possível redefinir a senha mestra do seu cofre.\r\n';
    const url = URL.createObjectURL(new Blob([conteudo], { type: 'text/plain;charset=utf-8' }));
    const link = this.documento.createElement('a');
    link.href = url;
    link.download = 'finmanager-chave-de-recuperacao.txt';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
