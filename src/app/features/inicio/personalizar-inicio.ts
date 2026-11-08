import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  Injector,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { DashboardService } from '../../application/dashboard/dashboard.service';
import {
  adicionarWidget,
  type IdWidget,
  LARGURAS,
  type LarguraWidget,
  LAYOUT_PADRAO,
  layoutsIguais,
  moverWidget,
  redimensionarWidget,
  removerWidget,
  widgetsDisponiveis,
  WIDGETS,
} from '../../domain/dashboard/layout';
import { mensagemDeErro } from '../cofre/compartilhado/mensagens';
import { AvisoNavegacao } from '../compartilhado/aviso-navegacao';

const COLUNAS_PREVIA: Record<LarguraWidget, string> = {
  1: 'col-span-1',
  2: 'col-span-2',
  3: 'col-span-3',
};

/**
 * Personalização da dashboard (`/inicio/personalizar`, RF-043, US-007): adicionar, remover,
 * reordenar e redimensionar widgets, tudo por botões e campos (operável só por teclado,
 * RNF-021). As mudanças ficam num rascunho e só valem ao salvar (RF-044).
 */
@Component({
  selector: 'app-personalizar-inicio',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="max-w-3xl space-y-6">
      <a class="botao-secundario" routerLink="/"
        ><span aria-hidden="true">←</span> Voltar para o Início</a
      >
      <div>
        <h1 tabindex="-1" class="text-3xl font-bold">Personalizar o Início</h1>
        <p class="mt-1 text-muted">
          Escolha os widgets, a ordem e a largura. As mudanças valem depois de salvar.
        </p>
      </div>

      <!-- Anuncia a nova posição depois de mover, remover ou adicionar (leitores de tela). -->
      <p class="sr-only" role="status">{{ anuncio() }}</p>

      <section class="space-y-3 cartao" aria-labelledby="titulo-no-inicio">
        <h2 id="titulo-no-inicio" class="text-lg font-semibold" tabindex="-1">Widgets no Início</h2>
        @if (rascunho().widgets.length === 0) {
          <p class="text-muted">Nenhum widget. Adicione algum em "Widgets disponíveis".</p>
        } @else {
          <ol class="divide-y divide-border">
            @for (
              w of rascunho().widgets;
              track w.id;
              let i = $index, primeiro = $first, ultimo = $last
            ) {
              <li class="flex flex-wrap items-center gap-3 py-3" [attr.data-widget-layout]="w.id">
                <span class="w-6 text-muted tabular-nums" aria-hidden="true">{{ i + 1 }}.</span>
                <div class="min-w-48 flex-1">
                  <p class="font-medium">{{ nome(w.id) }}</p>
                  <p class="text-sm text-muted">{{ widgets[w.id].descricao }}</p>
                </div>
                <div>
                  <label class="sr-only" [for]="'largura-' + w.id"
                    >Largura de {{ nome(w.id) }}</label
                  >
                  <select
                    class="campo mt-0 w-auto"
                    [id]="'largura-' + w.id"
                    [value]="w.largura"
                    (change)="redimensionar(w.id, $any($event.target).value)"
                  >
                    @for (l of larguras; track l.valor) {
                      <option [value]="l.valor" [selected]="l.valor === w.largura">
                        {{ l.rotulo }}
                      </option>
                    }
                  </select>
                </div>
                <div class="flex flex-wrap gap-2">
                  <button
                    type="button"
                    class="botao-acao"
                    [id]="'subir-' + w.id"
                    [disabled]="primeiro"
                    [attr.aria-label]="'Subir ' + nome(w.id)"
                    (click)="mover(w.id, -1)"
                  >
                    <span aria-hidden="true">↑</span>&nbsp;Subir
                  </button>
                  <button
                    type="button"
                    class="botao-acao"
                    [id]="'descer-' + w.id"
                    [disabled]="ultimo"
                    [attr.aria-label]="'Descer ' + nome(w.id)"
                    (click)="mover(w.id, 1)"
                  >
                    <span aria-hidden="true">↓</span>&nbsp;Descer
                  </button>
                  <button
                    type="button"
                    class="botao-acao-perigo"
                    [id]="'remover-' + w.id"
                    [attr.aria-label]="'Remover ' + nome(w.id)"
                    (click)="remover(w.id, i)"
                  >
                    Remover
                  </button>
                </div>
              </li>
            }
          </ol>
        }
        <p class="ajuda">
          A largura vale para telas largas; em telas estreitas, cada widget ocupa a linha toda.
        </p>
      </section>

      <section class="space-y-3 cartao" aria-labelledby="titulo-disponiveis">
        <h2 id="titulo-disponiveis" class="text-lg font-semibold" tabindex="-1">
          Widgets disponíveis
        </h2>
        @if (disponiveis().length === 0) {
          <p class="text-muted">Todos os widgets já estão no Início.</p>
        } @else {
          <ul class="divide-y divide-border">
            @for (id of disponiveis(); track id) {
              <li class="flex flex-wrap items-center gap-3 py-3" [attr.data-widget-disponivel]="id">
                <div class="min-w-48 flex-1">
                  <p class="font-medium">{{ nome(id) }}</p>
                  <p class="text-sm text-muted">{{ widgets[id].descricao }}</p>
                </div>
                <button
                  type="button"
                  class="botao-acao"
                  [id]="'adicionar-' + id"
                  [attr.aria-label]="'Adicionar ' + nome(id)"
                  (click)="adicionar(id)"
                >
                  <span aria-hidden="true">+</span>&nbsp;Adicionar
                </button>
              </li>
            }
          </ul>
        }
      </section>

      <!-- Prévia só visual: a lista acima já descreve ordem e largura. -->
      <div class="space-y-2" aria-hidden="true">
        <p class="rotulo-secao">Prévia em telas largas</p>
        <div class="grid grid-cols-3 gap-2 rounded-lg bg-surface-muted p-3">
          @for (w of rascunho().widgets; track w.id) {
            <div
              class="truncate rounded-md border border-border bg-surface px-3 py-4 text-sm font-medium"
              [class]="colunasPrevia[w.largura]"
            >
              {{ nome(w.id) }}
            </div>
          } @empty {
            <div class="col-span-3 py-4 text-center text-sm text-muted">Início vazio</div>
          }
        </div>
      </div>

      @if (erro(); as m) {
        <p class="alerta-erro" role="alert">{{ m }}</p>
      }

      <div class="flex flex-wrap gap-3">
        <a class="botao-secundario" routerLink="/">Cancelar</a>
        <button
          type="button"
          class="botao-secundario"
          [disabled]="ehPadrao()"
          (click)="restaurarPadrao()"
        >
          Restaurar padrão
        </button>
        <button
          type="button"
          class="botao-primario"
          [disabled]="salvando()"
          [attr.aria-busy]="salvando()"
          (click)="salvar()"
        >
          {{ salvando() ? 'Salvando…' : 'Salvar' }}
        </button>
      </div>
    </div>
  `,
})
export class PersonalizarInicio {
  private readonly dashboard = inject(DashboardService);
  private readonly router = inject(Router);
  private readonly aviso = inject(AvisoNavegacao);
  private readonly injector = inject(Injector);

  protected readonly widgets = WIDGETS;
  protected readonly colunasPrevia = COLUNAS_PREVIA;
  protected readonly larguras = (Object.keys(LARGURAS) as unknown as LarguraWidget[]).map((l) => ({
    valor: Number(l) as LarguraWidget,
    rotulo: LARGURAS[l],
  }));

  protected readonly rascunho = signal(this.dashboard.layout());
  protected readonly disponiveis = computed(() => widgetsDisponiveis(this.rascunho()));
  protected readonly ehPadrao = computed(() => layoutsIguais(this.rascunho(), LAYOUT_PADRAO));
  protected readonly anuncio = signal('');
  protected readonly salvando = signal(false);
  protected readonly erro = signal<string | null>(null);

  protected nome(id: IdWidget): string {
    return WIDGETS[id].nome;
  }

  protected mover(id: IdWidget, passo: -1 | 1): void {
    this.rascunho.update((l) => moverWidget(l, id, passo));
    const lista = this.rascunho().widgets;
    const posicao = lista.findIndex((w) => w.id === id);
    this.anunciar(`${this.nome(id)} na posição ${posicao + 1} de ${lista.length}.`);
    // O foco fica no mesmo botão; se ele ficou desabilitado (topo ou fim), vai para o oposto.
    const noLimite = passo < 0 ? posicao === 0 : posicao === lista.length - 1;
    const botao = passo < 0 ? 'subir' : 'descer';
    const oposto = passo < 0 ? 'descer' : 'subir';
    this.focar(`${noLimite ? oposto : botao}-${id}`);
  }

  protected remover(id: IdWidget, indice: number): void {
    this.rascunho.update((l) => removerWidget(l, id));
    this.anunciar(`${this.nome(id)} removido. Ele fica em "Widgets disponíveis".`);
    const lista = this.rascunho().widgets;
    const vizinho = lista[Math.min(indice, lista.length - 1)];
    this.focar(vizinho ? `remover-${vizinho.id}` : 'titulo-no-inicio');
  }

  protected adicionar(id: IdWidget): void {
    this.rascunho.update((l) => adicionarWidget(l, id));
    const total = this.rascunho().widgets.length;
    this.anunciar(`${this.nome(id)} adicionado na posição ${total} de ${total}.`);
    this.focar(`remover-${id}`);
  }

  protected redimensionar(id: IdWidget, valor: string): void {
    this.rascunho.update((l) => redimensionarWidget(l, id, Number(valor) as LarguraWidget));
  }

  protected restaurarPadrao(): void {
    this.rascunho.set(LAYOUT_PADRAO);
    this.anunciar('Layout padrão restaurado. Salve para aplicar.');
    this.focar('titulo-no-inicio');
  }

  protected async salvar(): Promise<void> {
    this.erro.set(null);
    this.salvando.set(true);
    try {
      await this.dashboard.salvarLayout(this.rascunho());
      this.aviso.definir('Início personalizado.');
      await this.router.navigateByUrl('/');
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    } finally {
      this.salvando.set(false);
    }
  }

  private anunciar(texto: string): void {
    // Limpa antes, para que a mesma frase seja anunciada de novo.
    this.anuncio.set('');
    afterNextRender(() => this.anuncio.set(texto), { injector: this.injector });
  }

  private focar(id: string): void {
    afterNextRender(() => document.getElementById(id)?.focus(), { injector: this.injector });
  }
}
