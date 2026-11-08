import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { HistoricoService, type ItemLixeira } from '../../application/historico/historico.service';
import { ACOES_HISTORICO, ENTIDADES } from '../../domain/historico/historico';
import { mensagemDeErro } from '../cofre/compartilhado/mensagens';

/** Lixeira e histórico de ações (RN-004, RF-075, RF-076). */
@Component({
  selector: 'app-historico',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-8">
      <h1 tabindex="-1" class="text-3xl font-bold">Histórico e lixeira</h1>

      <section aria-labelledby="titulo-lixeira" class="space-y-3">
        <h2 id="titulo-lixeira" class="text-xl font-semibold">Lixeira</h2>
        <p class="ajuda">
          Itens excluídos ficam aqui por 180 dias e depois são apagados definitivamente.
        </p>
        <div aria-live="polite">
          @if (mensagem(); as m) {
            <p [class]="erro() ? 'alerta-erro' : 'alerta-sucesso'">{{ m }}</p>
          }
        </div>
        @if (historico.lixeira().length === 0) {
          <p>A lixeira está vazia.</p>
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
                @for (item of historico.lixeira(); track item.id) {
                  <tr data-lixeira>
                    <td>{{ entidades[item.entidade] }}</td>
                    <td>{{ item.resumo }}</td>
                    <td>{{ dataHora(item.excluidoEm) }}</td>
                    <td>
                      {{ item.diasRestantes }} {{ item.diasRestantes === 1 ? 'dia' : 'dias' }}
                    </td>
                    <td>
                      <button
                        type="button"
                        class="botao-acao"
                        (click)="restaurar(item)"
                        [attr.aria-label]="'Restaurar ' + item.resumo"
                      >
                        Restaurar
                      </button>
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
          Exclusões, restaurações e alterações de valor ou data, guardadas por 180 dias.
        </p>
        @if (historico.eventos().length === 0) {
          <p>Nenhuma ação registrada.</p>
        } @else {
          <ol class="space-y-1">
            @for (e of historico.eventos(); track e.id) {
              <li data-evento>
                <time [attr.datetime]="e.ocorridoEm">{{ dataHora(e.ocorridoEm) }}</time> —
                {{ acoes[e.acao] }} de {{ entidades[e.entidade].toLowerCase() }}: {{ e.resumo }}
              </li>
            }
          </ol>
        }
      </section>
    </div>
  `,
})
export class Historico {
  protected readonly historico = inject(HistoricoService);
  protected readonly entidades = ENTIDADES;
  protected readonly acoes = ACOES_HISTORICO;
  protected readonly mensagem = signal<string | null>(null);
  protected readonly erro = signal(false);

  protected dataHora(iso: string): string {
    return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  }

  /** Restaurar não é destrutivo, então não pede confirmação. */
  protected async restaurar(item: ItemLixeira): Promise<void> {
    try {
      await this.historico.restaurar(item.entidade, item.id);
      this.erro.set(false);
      this.mensagem.set(`Restaurado: ${item.resumo}`);
    } catch (e) {
      this.erro.set(true);
      this.mensagem.set(mensagemDeErro(e));
    }
  }
}
