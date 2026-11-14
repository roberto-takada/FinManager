import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  type ElementRef,
  inject,
  Injectable,
  Injector,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { HistoricoService } from '../../application/historico/historico.service';
import { mensagemDeErro } from '../cofre/compartilhado/mensagens';

interface Oferta {
  readonly texto: string;
  readonly eventoId: string;
}

/**
 * RF-077: depois de uma exclusão, oferece "Desfazer" num aviso. O foco vai para o aviso
 * (o botão "Excluir" sumiu com o item), o que faz o leitor de tela anunciá-lo. O aviso fica até o
 * usuário fechá-lo, fazer outra exclusão ou mudar de tela (sem limite de tempo, WCAG 2.2.1);
 * depois disso o item continua restaurável pela lixeira.
 */
@Injectable({ providedIn: 'root' })
export class DesfazerExclusao {
  private readonly historico = inject(HistoricoService);
  readonly oferta = signal<Oferta | null>(null);
  readonly resultado = signal<{ texto: string; erro: boolean } | null>(null);
  /** Conta as ofertas, para o aviso mover o foco a cada nova exclusão. */
  readonly versao = signal(0);

  /** Chame logo depois de uma exclusão bem-sucedida. */
  oferecer(texto: string): void {
    const evento = this.historico.ultimaExclusao();
    if (!evento) return;
    this.resultado.set(null);
    this.oferta.set({ texto, eventoId: evento.id });
    this.versao.update((v) => v + 1);
  }

  fechar(): void {
    this.oferta.set(null);
    this.resultado.set(null);
  }

  async desfazer(): Promise<void> {
    const oferta = this.oferta();
    if (!oferta) return;
    try {
      const n = await this.historico.desfazerExclusao(oferta.eventoId);
      this.oferta.set(null);
      this.resultado.set({
        texto:
          n === 1 ? 'Exclusão desfeita: o item voltou.' : `Exclusão desfeita: ${n} itens voltaram.`,
        erro: false,
      });
    } catch (e) {
      this.oferta.set(null);
      this.resultado.set({ texto: mensagemDeErro(e), erro: true });
    }
    this.versao.update((v) => v + 1);
  }
}

@Component({
  selector: 'app-aviso-desfazer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center p-4 print:hidden"
    >
      <div class="w-full max-w-lg">
        @if (servico.oferta(); as o) {
          <div
            #aviso
            tabindex="-1"
            role="group"
            aria-labelledby="aviso-desfazer-texto"
            class="pointer-events-auto flex flex-wrap items-center gap-3 rounded-lg border border-border-strong bg-surface p-4 text-foreground shadow-card foco"
            data-aviso-desfazer
          >
            <p id="aviso-desfazer-texto" class="min-w-0 flex-1 font-medium">{{ o.texto }}</p>
            <button type="button" class="botao-suave" (click)="servico.desfazer()">Desfazer</button>
            <button
              type="button"
              class="botao-acao"
              aria-label="Fechar aviso"
              (click)="servico.fechar()"
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
        } @else if (servico.resultado(); as r) {
          <div
            #aviso
            tabindex="-1"
            role="group"
            aria-labelledby="aviso-desfazer-resultado"
            class="pointer-events-auto flex items-center gap-3 shadow-card foco"
            [class]="r.erro ? 'alerta-erro' : 'alerta-sucesso'"
            data-aviso-desfazer
          >
            <p id="aviso-desfazer-resultado" class="flex-1">{{ r.texto }}</p>
            <button
              type="button"
              class="botao-acao"
              aria-label="Fechar aviso"
              (click)="servico.fechar()"
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
        }
      </div>
    </div>
  `,
})
export class AvisoDesfazer {
  protected readonly servico = inject(DesfazerExclusao);
  private readonly aviso = viewChild<ElementRef<HTMLElement>>('aviso');
  private readonly injector = inject(Injector);

  constructor() {
    // Mudou de tela: o aviso deixa de fazer sentido (o item segue na lixeira).
    inject(Router)
      .events.pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe(() => this.servico.fechar());

    // O botão "Excluir" sumiu com o item (e o "Desfazer" some ao ser usado): o foco vai
    // para o aviso, que é anunciado e deixa a próxima ação a um Tab de distância.
    let anterior = this.servico.versao();
    effect(() => {
      const versao = this.servico.versao();
      if (versao === anterior) return;
      anterior = versao;
      afterNextRender(() => this.aviso()?.nativeElement.focus(), { injector: this.injector });
    });
  }
}
