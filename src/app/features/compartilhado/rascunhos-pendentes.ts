import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DOCUMENT,
  inject,
  Injector,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';
import { RascunhosService } from '../../application/rascunhos/rascunhos.service';
import type { Rascunho } from '../../domain/rascunhos/rascunho';
import { DialogoConfirmacao } from '../../ui/dialogo-confirmacao/dialogo-confirmacao';
import { formatarDataHora } from './formatos-data';
import { EdicaoFormularios } from './rascunho-formulario';

/**
 * RF-071: depois de desbloquear, avisa sobre formulários que ficaram sem salvar (aba
 * fechada, queda de energia, bloqueio por inatividade) e oferece "Restaurar" ou
 * "Descartar". Fica no shell, acima de qualquer tela, até o usuário decidir ou dispensar.
 */
@Component({
  selector: 'app-rascunhos-pendentes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visiveis().length > 0 && !dispensado()) {
      <section
        class="mb-6 space-y-3 cartao border-primary print:hidden"
        aria-labelledby="rascunhos-pendentes-titulo"
        data-rascunhos-pendentes
      >
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="rascunhos-pendentes-titulo" class="text-lg font-semibold">
              {{
                visiveis().length === 1
                  ? 'Um formulário ficou sem salvar'
                  : visiveis().length + ' formulários ficaram sem salvar'
              }}
            </h2>
            <p class="text-sm text-muted">
              O que você digitou foi guardado cifrado neste navegador. Rascunhos são apagados depois
              de 7 dias.
            </p>
          </div>
          <button type="button" class="botao-acao" (click)="dispensado.set(true)">Agora não</button>
        </div>
        <ul class="divide-y divide-border">
          @for (r of visiveis(); track r.id) {
            <li class="flex flex-wrap items-center justify-between gap-3 py-2" data-rascunho>
              <span>
                <span class="font-medium">{{ r.titulo }}</span>
                <span class="block text-sm text-muted"
                  >Guardado em {{ dataHora(r.atualizadoEm) }}</span
                >
              </span>
              <span class="flex gap-2">
                <button
                  type="button"
                  class="botao-acao"
                  [attr.aria-label]="'Restaurar rascunho: ' + r.titulo"
                  (click)="restaurar(r)"
                >
                  Restaurar
                </button>
                <button
                  type="button"
                  class="botao-acao"
                  [attr.aria-label]="'Descartar rascunho: ' + r.titulo"
                  (click)="descartar(r)"
                >
                  Descartar
                </button>
              </span>
            </li>
          }
        </ul>
      </section>
    }
  `,
})
export class RascunhosPendentes {
  private readonly rascunhos = inject(RascunhosService);
  private readonly edicao = inject(EdicaoFormularios);
  private readonly router = inject(Router);
  private readonly documento = inject(DOCUMENT);
  private readonly injector = inject(Injector);

  protected readonly dataHora = formatarDataHora;
  protected readonly dispensado = signal(false);

  private readonly urlAtual = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  /** O rascunho do formulário aberto agora é tratado dentro do próprio formulário. */
  protected readonly visiveis = computed(() =>
    this.rascunhos.pendentes().filter((r) => r.url !== this.urlAtual()),
  );

  protected restaurar(r: Rascunho): void {
    this.edicao.pedirRestauracao(r.id);
    void this.router.navigateByUrl(r.url);
  }

  protected async descartar(r: Rascunho): Promise<void> {
    await this.rascunhos.descartar(r.id);
    // O botão sumiu: o foco vai para o próximo rascunho ou, sem nenhum, para o título da tela.
    afterNextRender(
      () =>
        (
          this.documento.querySelector<HTMLElement>('[data-rascunho] button') ??
          this.documento.querySelector<HTMLElement>('main h1')
        )?.focus(),
      { injector: this.injector },
    );
  }
}

/** RF-072: "Sair sem salvar?" ao deixar um formulário com alterações pela navegação do app. */
@Component({
  selector: 'app-dialogo-saida',
  imports: [DialogoConfirmacao],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-dialogo-confirmacao
      titulo="Sair sem salvar?"
      [mensagem]="mensagem()"
      rotuloConfirmar="Sair sem salvar"
      [perigoso]="true"
      [aberto]="!!edicao.pedidoSaida()"
      (confirmado)="edicao.pedidoSaida()?.responder(true)"
      (cancelado)="edicao.pedidoSaida()?.responder(false)"
    >
      <p>Para continuar editando, escolha "Cancelar".</p>
    </app-dialogo-confirmacao>
  `,
})
export class DialogoSaida {
  protected readonly edicao = inject(EdicaoFormularios);
  protected readonly mensagem = computed(
    () =>
      `As alterações em "${this.edicao.pedidoSaida()?.titulo ?? ''}" ainda não foram salvas e serão descartadas.`,
  );
}
