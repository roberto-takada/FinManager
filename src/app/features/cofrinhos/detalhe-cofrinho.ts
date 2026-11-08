import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DadosService } from '../../application/dados/dados.service';
import {
  emAndamento,
  ICONES_COFRINHO,
  type OrigemMovimentacao,
  progresso,
} from '../../domain/cofrinhos/cofrinho';
import { formatarData } from '../../domain/shared/data';
import { formatarDinheiro } from '../../domain/shared/dinheiro';
import { AvisoNavegacao } from '../compartilhado/aviso-navegacao';
import { classeProgresso, textoPlanejamento, textoProgresso } from './textos-cofrinho';

const ORIGENS: Record<OrigemMovimentacao, string> = {
  manual: '',
  zeramento: ' (zeramento)',
  encerramento: ' (encerramento)',
};

/**
 * Detalhe do cofrinho: progresso (RF-032), planejamento (RF-033) e movimentações (RF-031).
 * Depositar/retirar e as configurações (editar, zerar, encerrar, excluir) ficam em páginas próprias.
 */
@Component({
  selector: 'app-detalhe-cofrinho',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-8">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <a class="botao-secundario" routerLink="/cofrinhos"
          ><span aria-hidden="true">←</span> Voltar para os cofrinhos</a
        >
        @if (aberto()) {
          <a class="botao-secundario" [routerLink]="['/cofrinhos', id(), 'configuracoes']"
            >Configurações do cofrinho</a
          >
        }
      </div>

      @if (cofrinho(); as c) {
        <div class="space-y-6">
          <h1 tabindex="-1" class="text-3xl font-bold">
            <span aria-hidden="true">{{ icones[c.icone].simbolo }}</span> {{ c.nome }}
          </h1>

          @if (mensagem(); as m) {
            <p class="alerta-sucesso" role="status">{{ m }}</p>
          }
          @if (!aberto()) {
            <p class="aviso">
              Este cofrinho foi encerrado em {{ data(c.encerradoEm!) }}. O histórico fica disponível
              só para consulta.
            </p>
          }

          <section class="space-y-3 cartao" aria-labelledby="titulo-progresso">
            <h2 id="titulo-progresso" class="text-lg font-semibold">Progresso</h2>
            <progress
              max="100"
              [value]="barra()"
              [class]="classeProgresso(c)"
              aria-labelledby="titulo-progresso"
            ></progress>
            <p data-progresso>{{ textoProgresso(c) }}</p>
            @if (aberto()) {
              <p class="text-sm text-muted" data-planejamento>
                {{ textoPlanejamento(c, dados.hoje()) }}
              </p>
              <div class="flex flex-wrap gap-3 pt-2">
                <a
                  class="botao-primario"
                  [routerLink]="['/cofrinhos', c.id, 'movimentar']"
                  [queryParams]="{ tipo: 'deposito' }"
                  >Depositar</a
                >
                <a
                  class="botao-secundario"
                  [routerLink]="['/cofrinhos', c.id, 'movimentar']"
                  [queryParams]="{ tipo: 'retirada' }"
                  >Retirar</a
                >
              </div>
            }
          </section>

          <section class="space-y-2 cartao" aria-labelledby="titulo-movimentacoes">
            <h2 id="titulo-movimentacoes" class="text-lg font-semibold">Movimentações</h2>
            @if (c.movimentacoes.length === 0) {
              <p class="text-muted">
                Nenhuma movimentação ainda. Use "Depositar" para guardar o primeiro valor.
              </p>
            } @else {
              <div class="overflow-x-auto">
                <table class="w-full text-left">
                  <caption class="sr-only">
                    Depósitos e retiradas do cofrinho
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Data</th>
                      <th scope="col">Operação</th>
                      <th scope="col" class="text-right">Valor</th>
                      <th scope="col">Conta</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (m of movimentacoes(); track m.id) {
                      <tr data-movimentacao>
                        <td class="tabular-nums">{{ formatarData(m.data) }}</td>
                        <td>
                          {{ m.tipo === 'deposito' ? 'Depósito' : 'Retirada'
                          }}{{ origens[m.origem] }}
                        </td>
                        <td
                          class="text-right font-semibold tabular-nums"
                          [class.text-positive]="m.tipo === 'deposito'"
                          [class.text-negative]="m.tipo === 'retirada'"
                        >
                          {{ m.tipo === 'deposito' ? '+ ' : '− ' }}{{ formatar(m.valor) }}
                        </td>
                        <td>{{ nomeConta(m.contaId) }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </section>
        </div>
      } @else {
        <h1 tabindex="-1" class="text-3xl font-bold">Cofrinho não encontrado</h1>
      }
    </div>
  `,
})
export class DetalheCofrinho {
  readonly id = input.required<string>();

  protected readonly dados = inject(DadosService);
  protected readonly icones = ICONES_COFRINHO;
  protected readonly origens = ORIGENS;
  protected readonly formatar = formatarDinheiro;
  protected readonly formatarData = formatarData;
  protected readonly textoProgresso = textoProgresso;
  protected readonly textoPlanejamento = textoPlanejamento;
  protected readonly classeProgresso = classeProgresso;
  protected readonly mensagem = signal<string | null>(inject(AvisoNavegacao).consumir());

  protected readonly cofrinho = computed(
    () => this.dados.cofrinhos().find((c) => c.id === this.id() && c.excluidoEm === null) ?? null,
  );
  protected readonly aberto = computed(() => {
    const c = this.cofrinho();
    return !!c && emAndamento(c);
  });
  protected readonly movimentacoes = computed(() =>
    [...(this.cofrinho()?.movimentacoes ?? [])].sort(
      (a, b) => b.data.localeCompare(a.data) || b.registradoEm.localeCompare(a.registradoEm),
    ),
  );
  protected readonly barra = computed(() => {
    const c = this.cofrinho();
    return c ? Math.min(100, progresso(c).percentual) : 0;
  });

  protected nomeConta(id: string): string {
    return this.dados.contas().find((c) => c.id === id)?.nome ?? '—';
  }

  protected data(iso: string): string {
    return new Date(iso).toLocaleDateString('pt-BR');
  }
}
