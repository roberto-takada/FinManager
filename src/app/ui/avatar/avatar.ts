import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { type Avatar as DadosAvatar, type CorAvatar, iniciais } from '../../domain/perfil/perfil';

/** Classes completas (o Tailwind só gera classes que aparecem inteiras). Contraste AA. */
const CORES: Record<CorAvatar, string> = {
  roxo: 'bg-primary-soft text-primary-soft-foreground',
  aqua: 'bg-positive-soft text-positive',
  rosa: 'bg-negative-soft text-negative',
  cinza: 'bg-surface-muted text-foreground',
};

/**
 * Avatar do perfil (RF-080): foto ou iniciais sobre uma cor. É decorativo: o nome sempre
 * aparece em texto ao lado (ou em `rotulo`), então a imagem não tem texto alternativo.
 */
@Component({
  selector: 'app-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex shrink-0' },
  template: `
    @let a = avatar();
    @if (a.tipo === 'foto') {
      <img
        [src]="a.imagem"
        alt=""
        class="rounded-full object-cover"
        [style.width.px]="tamanho()"
        [style.height.px]="tamanho()"
      />
    } @else {
      <span
        aria-hidden="true"
        class="inline-flex items-center justify-center rounded-full font-semibold select-none"
        [class]="cores[a.cor]"
        [style.width.px]="tamanho()"
        [style.height.px]="tamanho()"
        [style.font-size.px]="tamanho() * 0.4"
        >{{ letras() || '?' }}</span
      >
    }
  `,
})
export class Avatar {
  readonly avatar = input.required<DadosAvatar>();
  readonly nome = input('');
  readonly tamanho = input(40);
  protected readonly cores = CORES;
  protected readonly letras = computed(() => iniciais(this.nome()));
}
