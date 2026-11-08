import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Monograma FM (IdentidadeVisual/logo.svg). As letras usam a cor do texto (preto no modo
 * claro, branco no escuro) e só a perna final do M fica em Blush Rose.
 * Decorativo por padrão: o nome "FinManager" deve aparecer em texto ao lado.
 */
@Component({
  selector: 'app-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      viewBox="0 0 64 64"
      [attr.width]="tamanho()"
      [attr.height]="tamanho()"
      aria-hidden="true"
      focusable="false"
      class="shrink-0"
    >
      @if (comFundo()) {
        <rect width="64" height="64" rx="14" fill="var(--fm-logo-bg)" stroke="var(--fm-border)" />
      }
      <g fill="none" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 46V18h12M12 31h10" stroke="currentColor" />
        <path d="M35 46V18l8 14 8-14" stroke="currentColor" />
        <path d="M51 18v28" stroke="#E06183" />
      </g>
    </svg>
  `,
})
export class Logo {
  readonly tamanho = input(32);
  readonly comFundo = input(false);
}
