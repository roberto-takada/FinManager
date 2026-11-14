import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  type ElementRef,
  inject,
  Injector,
  signal,
  viewChild,
} from '@angular/core';
import { HistoricoService, type ItemLixeira } from '../../application/historico/historico.service';
import { ACOES_HISTORICO, ENTIDADES, quantidadeItens } from '../../domain/historico/historico';
import { DialogoConfirmacao } from '../../ui/dialogo-confirmacao/dialogo-confirmacao';
import { mensagemDeErro } from '../cofre/compartilhado/mensagens';
import { formatarDataHora } from '../compartilhado/formatos-data';

/** O que aguarda confirmação: um item ou a lixeira inteira (RF-079, RN-005 a/c). */
type Pedido = { tipo: 'item'; item: ItemLixeira } | { tipo: 'tudo' };

/** Até quantos dependentes listar no diálogo; o resto vira "e mais N". */
const MAXIMO_DEPENDENTES_LISTADOS = 5;

/** Lixeira e histórico de ações (RN-004, RF-075, RF-076, RF-079). */
@Component({
  selector: 'app-historico',
  imports: [DialogoConfirmacao],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-8">
      <h1 tabindex="-1" class="text-3xl font-bold">Histórico e lixeira</h1>

      <section aria-labelledby="titulo-lixeira" class="space-y-3">
        <div class="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="titulo-lixeira" class="text-xl font-semibold">Lixeira</h2>
            <p class="ajuda">
              Itens excluídos ficam aqui por 180 dias e depois são apagados definitivamente. Backups
              exportados antes disso continuam com eles.
            </p>
          </div>
          @if (historico.lixeira().length > 0) {
            <button type="button" class="botao-perigo" (click)="pedido.set({ tipo: 'tudo' })">
              Esvaziar lixeira…
            </button>
          }
        </div>
        <div #mensagemLixeira tabindex="-1" aria-live="polite" class="rounded-md foco">
          @if (mensagem(); as m) {
            <p [class]="erro() ? 'alerta-erro' : 'alerta-sucesso'">{{ m }}</p>
          }
        </div>
        @if (historico.lixeira().length === 0) {
          <p class="aviso">A lixeira está vazia.</p>
        } @else {
          <div class="overflow-x-auto">
            <table class="w-full text-left">
              <caption class="sr-only">
                Itens na lixeira
              </caption>
              <thead>
                <tr>
                  <th scope="col">Tipo</th>
                  <th scope="col">Item</th>
                  <th scope="col">Excluído em</th>
                  <th scope="col">Apagado definitivamente em</th>
                  <th scope="col"><span class="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                @for (item of historico.lixeira(); track item.entidade + item.id) {
                  <tr data-lixeira>
                    <td>{{ entidades[item.entidade] }}</td>
                    <td>{{ item.resumo }}</td>
                    <td>{{ dataHora(item.excluidoEm) }}</td>
                    <td>
                      <span [class]="item.diasRestantes <= 7 ? 'selo-negativo' : 'selo-neutro'">
                        {{ item.diasRestantes }} {{ item.diasRestantes === 1 ? 'dia' : 'dias' }}
                      </span>
                    </td>
                    <td>
                      <div class="flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          class="botao-acao"
                          (click)="restaurar(item)"
                          [attr.aria-label]="'Restaurar ' + item.resumo"
                        >
                          Restaurar
                        </button>
                        <button
                          type="button"
                          class="botao-acao-perigo"
                          (click)="pedido.set({ tipo: 'item', item })"
                          [attr.aria-label]="'Excluir definitivamente ' + item.resumo"
                        >
                          Excluir definitivamente
                        </button>
                      </div>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </section>

      <section aria-labelledby="titulo-eventos" class="space-y-3">
        <h2 id="titulo-eventos" class="text-xl font-semibold">Histórico de ações</h2>
        <p class="ajuda">
          Exclusões, restaurações e alterações de valor ou data, guardadas por 180 dias. Ao apagar
          um item definitivamente, os registros com cópias dele também são apagados.
        </p>
        @if (historico.eventos().length === 0) {
          <p class="aviso">Nenhuma ação registrada.</p>
        } @else {
          <ol class="divide-y divide-border rounded-lg border border-border bg-surface">
            @for (e of historico.eventos(); track e.id) {
              <li class="flex flex-wrap gap-x-3 gap-y-1 px-4 py-2.5" data-evento>
                <time class="text-sm text-muted tabular-nums" [attr.datetime]="e.ocorridoEm">{{
                  dataHora(e.ocorridoEm)
                }}</time>
                <span>
                  <span class="font-medium">{{ acoes[e.acao] }}</span>
                  de {{ entidades[e.entidade].toLowerCase() }}: {{ e.resumo }}
                </span>
              </li>
            }
          </ol>
        }
      </section>
    </div>

    <app-dialogo-confirmacao
      [titulo]="tituloConfirmacao()"
      [mensagem]="mensagemConfirmacao()"
      [rotuloConfirmar]="rotuloConfirmacao()"
      [perigoso]="true"
      [aberto]="!!pedido()"
      (confirmado)="confirmar()"
      (cancelado)="pedido.set(null)"
    >
      @if (dependentes().length > 0) {
        <p>
          Também {{ dependentes().length === 1 ? 'será apagado' : 'serão apagados' }}
          {{ quantidade(dependentes().length) }} da lixeira que
          {{ dependentes().length === 1 ? 'depende' : 'dependem' }} dele e não poderiam mais ser
          restaurados:
        </p>
        <ul class="list-disc pl-5 text-sm">
          @for (d of dependentesListados(); track d.entidade + d.id) {
            <li>{{ entidades[d.entidade] }}: {{ d.resumo }}</li>
          }
          @if (dependentes().length > maximoListados) {
            <li>e mais {{ dependentes().length - maximoListados }}</li>
          }
        </ul>
      }
      <p class="font-semibold">Esta ação não pode ser desfeita.</p>
    </app-dialogo-confirmacao>
  `,
})
export class Historico {
  protected readonly historico = inject(HistoricoService);
  private readonly injector = inject(Injector);
  protected readonly entidades = ENTIDADES;
  protected readonly acoes = ACOES_HISTORICO;
  protected readonly dataHora = formatarDataHora;
  protected readonly quantidade = quantidadeItens;
  protected readonly maximoListados = MAXIMO_DEPENDENTES_LISTADOS;
  protected readonly mensagem = signal<string | null>(null);
  protected readonly erro = signal(false);
  protected readonly pedido = signal<Pedido | null>(null);
  private readonly mensagemLixeira = viewChild.required<ElementRef<HTMLElement>>('mensagemLixeira');

  protected readonly dependentes = computed(() => {
    const p = this.pedido();
    return p?.tipo === 'item'
      ? this.historico.dependentesNaLixeira(p.item.entidade, p.item.id)
      : [];
  });
  protected readonly dependentesListados = computed(() =>
    this.dependentes().slice(0, MAXIMO_DEPENDENTES_LISTADOS),
  );

  protected readonly tituloConfirmacao = computed(() =>
    this.pedido()?.tipo === 'tudo' ? 'Esvaziar a lixeira?' : 'Excluir definitivamente?',
  );
  protected readonly rotuloConfirmacao = computed(() =>
    this.pedido()?.tipo === 'tudo' ? 'Esvaziar lixeira' : 'Excluir definitivamente',
  );
  protected readonly mensagemConfirmacao = computed(() => {
    const p = this.pedido();
    if (!p) return '';
    if (p.tipo === 'tudo') {
      const n = this.historico.lixeira().length;
      return n === 1
        ? 'O item da lixeira será apagado definitivamente, junto com os registros do histórico que guardam cópias dele.'
        : `Os ${quantidadeItens(n)} da lixeira serão apagados definitivamente, junto com os registros do histórico que guardam cópias deles.`;
    }
    return `O item "${p.item.resumo}" (${ENTIDADES[p.item.entidade].toLowerCase()}) será apagado definitivamente, junto com os registros do histórico que guardam cópias dele.`;
  });

  /** Restaurar não é destrutivo, então não pede confirmação. */
  protected async restaurar(item: ItemLixeira): Promise<void> {
    try {
      await this.historico.restaurar(item.entidade, item.id);
      this.mostrar(`Restaurado: ${item.resumo}`, false);
    } catch (e) {
      this.mostrar(mensagemDeErro(e), true);
    }
  }

  protected async confirmar(): Promise<void> {
    const p = this.pedido();
    this.pedido.set(null);
    if (!p) return;
    try {
      const n =
        p.tipo === 'tudo'
          ? await this.historico.esvaziarLixeira()
          : await this.historico.excluirDefinitivamente(p.item.entidade, p.item.id);
      this.mostrar(
        p.tipo === 'tudo'
          ? `Lixeira esvaziada: ${quantidadeItens(n)} ${n === 1 ? 'apagado' : 'apagados'} definitivamente.`
          : n === 1
            ? `Apagado definitivamente: ${p.item.resumo}`
            : `${quantidadeItens(n)} apagados definitivamente.`,
        false,
      );
    } catch (e) {
      this.mostrar(mensagemDeErro(e), true);
    }
  }

  /** O botão usado sumiu com o item: o foco vai para a mensagem do resultado. */
  private mostrar(texto: string, erro: boolean): void {
    this.erro.set(erro);
    this.mensagem.set(texto);
    afterNextRender(() => this.mensagemLixeira().nativeElement.focus(), {
      injector: this.injector,
    });
  }
}
