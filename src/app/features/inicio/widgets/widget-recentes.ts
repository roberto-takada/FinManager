import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DadosService } from '../../../application/dados/dados.service';
import { ResumoService } from '../../../application/resumo/resumo.service';
import { rotuloCategoria } from '../../../domain/categorias/categoria';
import { formatarData } from '../../../domain/shared/data';
import { formatarDinheiro } from '../../../domain/shared/dinheiro';
import { descricaoExibida, type Transacao } from '../../../domain/transacoes/transacao';

/** As 5 transações mais recentes até hoje. */
@Component({
  selector: 'app-widget-recentes',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full' },
  template: `
    <section class="h-full cartao" aria-labelledby="titulo-recentes">
      <div class="mb-3 flex items-center justify-between gap-3">
        <h2 id="titulo-recentes" class="text-lg font-semibold">Transações recentes</h2>
        <a class="link" routerLink="/transacoes">Ver todas</a>
      </div>
      @if (resumo.recentes().length === 0) {
        <p class="text-muted">
          Nenhuma transação ainda.
          <a class="link" routerLink="/transacoes/nova">Registre a primeira</a>.
        </p>
      } @else {
        <div class="overflow-x-auto">
          <table class="w-full text-left text-sm">
            <caption class="sr-only">
              As 5 transações mais recentes
            </caption>
            <thead>
              <tr>
                <th scope="col">Descrição</th>
                <th scope="col">Categoria</th>
                <th scope="col">Data</th>
                <th scope="col" class="text-right">Valor</th>
              </tr>
            </thead>
            <tbody>
              @for (t of resumo.recentes(); track t.id) {
                <tr>
                  <td class="font-medium">{{ descricao(t) }}</td>
                  <td>
                    <span class="selo-neutro">{{ categoria(t) }}</span>
                  </td>
                  <td class="text-muted tabular-nums">{{ formatarData(t.data) }}</td>
                  <td
                    class="text-right font-semibold whitespace-nowrap tabular-nums"
                    [class.text-positive]="t.tipo === 'receita'"
                    [class.text-negative]="t.tipo === 'despesa'"
                  >
                    {{ sinal(t) }}{{ formatar(t.valor) }}
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </section>
  `,
})
export class WidgetRecentes {
  protected readonly resumo = inject(ResumoService);
  private readonly dados = inject(DadosService);
  protected readonly formatar = formatarDinheiro;
  protected readonly formatarData = formatarData;
  protected readonly descricao = descricaoExibida;

  /** Sinal em texto, não só cor (RNF-024). */
  protected sinal(t: Transacao): string {
    return t.tipo === 'receita' ? '+ ' : t.tipo === 'despesa' ? '− ' : '';
  }

  protected categoria(t: Transacao): string {
    if (t.tipo === 'transferencia') return 'Transferência';
    const c = this.dados.categorias().find((x) => x.id === t.categoriaId);
    return c ? rotuloCategoria(c, this.dados.categorias()) : '—';
  }
}
