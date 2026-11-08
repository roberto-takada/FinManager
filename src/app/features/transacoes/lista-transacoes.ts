import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CategoriasService } from '../../application/categorias/categorias.service';
import { ContasService } from '../../application/contas/contas.service';
import { DadosService } from '../../application/dados/dados.service';
import { TransacoesService } from '../../application/transacoes/transacoes.service';
import { rotuloCategoria } from '../../domain/categorias/categoria';
import { formatarData } from '../../domain/shared/data';
import { formatarDinheiro } from '../../domain/shared/dinheiro';
import {
  descricaoExibida,
  filtrarTransacoes,
  type TipoTransacao,
  TIPOS_TRANSACAO,
  totalizar,
  type Transacao,
} from '../../domain/transacoes/transacao';
import { DialogoConfirmacao } from '../../ui/dialogo-confirmacao/dialogo-confirmacao';
import { mensagemDeErro } from '../cofre/compartilhado/mensagens';

const POR_PAGINA = 100;

/** Lista, filtros e busca de transações (RF-011, RF-014). */
@Component({
  selector: 'app-lista-transacoes',
  imports: [ReactiveFormsModule, RouterLink, DialogoConfirmacao],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-6">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h1 tabindex="-1" class="text-3xl font-bold">Transações</h1>
        <a class="botao-primario" routerLink="/transacoes/nova">Nova transação</a>
      </div>

      <div class="flex flex-wrap items-center gap-3">
        <button
          type="button"
          class="botao-secundario"
          aria-controls="painel-filtros"
          [attr.aria-expanded]="filtrosAbertos()"
          (click)="filtrosAbertos.set(!filtrosAbertos())"
        >
          <span aria-hidden="true">{{ filtrosAbertos() ? '▴' : '▾' }}</span>
          Filtros
          @if (filtrosAtivos() > 0) {
            <span class="ml-1 selo-primario" data-filtros-ativos
              >{{ filtrosAtivos() }} ativo{{ filtrosAtivos() === 1 ? '' : 's' }}</span
            >
          }
        </button>
        @if (filtrosAtivos() > 0) {
          <button type="button" class="botao-acao" (click)="filtros.reset()">Limpar filtros</button>
        }
      </div>

      <form
        id="painel-filtros"
        class="grid gap-4 cartao sm:grid-cols-3"
        [hidden]="!filtrosAbertos()"
        [formGroup]="filtros"
        role="search"
        aria-label="Filtrar transações"
      >
        <div>
          <label class="rotulo" for="filtro-de">De</label>
          <input id="filtro-de" class="campo" type="date" formControlName="de" />
        </div>
        <div>
          <label class="rotulo" for="filtro-ate">Até</label>
          <input id="filtro-ate" class="campo" type="date" formControlName="ate" />
        </div>
        <div>
          <label class="rotulo" for="filtro-tipo">Tipo</label>
          <select id="filtro-tipo" class="campo" formControlName="tipo">
            <option value="">Todos</option>
            @for (t of tipos; track t.valor) {
              <option [value]="t.valor">{{ t.rotulo }}</option>
            }
          </select>
        </div>
        <div>
          <label class="rotulo" for="filtro-conta">Conta</label>
          <select id="filtro-conta" class="campo" formControlName="contaId">
            <option value="">Todas</option>
            @for (c of contas.ativas(); track c.id) {
              <option [value]="c.id">{{ c.nome }}</option>
            }
          </select>
        </div>
        <div>
          <label class="rotulo" for="filtro-categoria">Categoria</label>
          <select id="filtro-categoria" class="campo" formControlName="categoriaId">
            <option value="">Todas</option>
            @for (c of opcoesCategoria(); track c.id) {
              <option [value]="c.id">{{ c.rotulo }}</option>
            }
          </select>
        </div>
        <div>
          <label class="rotulo" for="filtro-texto">Buscar</label>
          <input id="filtro-texto" class="campo" type="search" formControlName="texto" />
        </div>
      </form>

      <section aria-labelledby="titulo-totais" class="cartao">
        <h2 id="titulo-totais" class="font-semibold">Totais do filtro</h2>
        <dl class="mt-2 grid gap-2 sm:grid-cols-3" data-totais>
          <div>
            <dt>Receitas</dt>
            <dd data-total="receitas" class="tabular-nums">{{ formatar(totais().receitas) }}</dd>
          </div>
          <div>
            <dt>Despesas</dt>
            <dd data-total="despesas" class="tabular-nums">{{ formatar(totais().despesas) }}</dd>
          </div>
          <div>
            <dt>Resultado</dt>
            <dd
              data-total="resultado"
              class="font-semibold tabular-nums"
              [class.text-positive]="totais().resultado.unidades > 0"
              [class.text-negative]="totais().resultado.unidades < 0"
            >
              {{ formatar(totais().resultado) }}
            </dd>
          </div>
        </dl>
        <p class="ajuda">Transferências entre suas contas não entram nos totais.</p>
      </section>

      <p role="status" aria-live="polite">
        {{ resultado().length }}
        {{ resultado().length === 1 ? 'transação encontrada' : 'transações encontradas' }}.
      </p>
      @if (mensagem(); as m) {
        <p class="alerta-erro" role="alert">{{ m }}</p>
      }

      @if (resultado().length > 0) {
        <div class="overflow-x-auto">
          <table class="w-full text-left">
            <caption class="sr-only">
              Transações filtradas
            </caption>
            <thead>
              <tr>
                <th scope="col">Data</th>
                <th scope="col">Descrição</th>
                <th scope="col">Categoria</th>
                <th scope="col">Conta</th>
                <th scope="col">Tipo</th>
                <th scope="col" class="text-right">Valor</th>
                <th scope="col"><span class="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              @for (t of visiveis(); track t.id) {
                <tr data-transacao>
                  <td>{{ formatarData(t.data) }}</td>
                  <td>{{ descricao(t) }}</td>
                  <td>{{ nomeCategoria(t) }}</td>
                  <td>{{ nomeConta(t) }}</td>
                  <td>{{ tiposRotulo[t.tipo] }}</td>
                  <td
                    class="text-right font-semibold whitespace-nowrap tabular-nums"
                    [class.text-positive]="t.tipo === 'receita'"
                    [class.text-negative]="t.tipo === 'despesa'"
                  >
                    {{ sinal(t) }}{{ formatar(t.valor) }}
                  </td>
                  <td class="whitespace-nowrap">
                    <div class="flex gap-2">
                      <a
                        class="botao-acao"
                        [routerLink]="['/transacoes', t.id]"
                        [attr.aria-label]="'Editar ' + descricao(t)"
                        >Editar</a
                      >
                      <button
                        type="button"
                        class="botao-acao-perigo"
                        (click)="pedirExclusao(t)"
                        [attr.aria-label]="'Excluir ' + descricao(t)"
                      >
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        @if (resultado().length > visiveis().length) {
          <button type="button" class="botao-secundario" (click)="limite.set(limite() + porPagina)">
            Mostrar mais ({{ resultado().length - visiveis().length }} restantes)
          </button>
        }
      }
    </div>

    <app-dialogo-confirmacao
      [titulo]="excluirLote() ? 'Excluir todas as parcelas?' : 'Excluir transação?'"
      [mensagem]="mensagemExclusao()"
      [rotuloConfirmar]="excluirLote() ? 'Excluir todas as parcelas' : 'Excluir transação'"
      [perigoso]="true"
      [aberto]="!!alvo()"
      (confirmado)="excluir()"
      (cancelado)="alvo.set(null)"
    >
      @if (alvo()?.parcela; as parcela) {
        <label class="flex items-start gap-2">
          <input
            type="checkbox"
            class="mt-1"
            [checked]="excluirLote()"
            (change)="excluirLote.set(!excluirLote())"
          />
          Excluir também as outras parcelas ativas desta compra ({{ parcela.total }} no total)
        </label>
      }
      <p>Itens excluídos vão para a lixeira e podem ser restaurados por 180 dias.</p>
    </app-dialogo-confirmacao>
  `,
})
export class ListaTransacoes {
  protected readonly contas = inject(ContasService);
  private readonly categorias = inject(CategoriasService);
  private readonly transacoes = inject(TransacoesService);
  private readonly dados = inject(DadosService);

  protected readonly tipos = (Object.keys(TIPOS_TRANSACAO) as TipoTransacao[]).map((valor) => ({
    valor,
    rotulo: TIPOS_TRANSACAO[valor],
  }));
  protected readonly tiposRotulo = TIPOS_TRANSACAO;
  protected readonly porPagina = POR_PAGINA;
  protected readonly formatarData = formatarData;
  protected readonly formatar = formatarDinheiro;
  protected readonly descricao = descricaoExibida;

  protected readonly filtros = inject(NonNullableFormBuilder).group({
    de: [''],
    ate: [''],
    tipo: [''],
    contaId: [''],
    categoriaId: [''],
    texto: [''],
  });
  private readonly valoresFiltro = toSignal(this.filtros.valueChanges, {
    initialValue: this.filtros.getRawValue(),
  });

  /** Filtros ficam recolhidos para não ocupar a visão inicial. */
  protected readonly filtrosAbertos = signal(false);
  protected readonly filtrosAtivos = computed(
    () => Object.values(this.valoresFiltro()).filter((v) => !!v).length,
  );

  protected readonly limite = signal(POR_PAGINA);
  protected readonly alvo = signal<Transacao | null>(null);
  protected readonly excluirLote = signal(false);
  protected readonly mensagem = signal<string | null>(null);

  protected readonly opcoesCategoria = computed(() => {
    const todas = this.dados.categorias();
    return this.categorias.arvore().map((c) => ({ id: c.id, rotulo: rotuloCategoria(c, todas) }));
  });

  protected readonly resultado = computed(() => {
    const f = this.valoresFiltro();
    return filtrarTransacoes(
      this.dados.transacoes(),
      {
        de: f.de || null,
        ate: f.ate || null,
        tipo: (f.tipo || null) as TipoTransacao | null,
        contaId: f.contaId || null,
        categoriaId: f.categoriaId || null,
        texto: f.texto || null,
      },
      this.dados.categorias(),
    );
  });
  protected readonly visiveis = computed(() => this.resultado().slice(0, this.limite()));
  protected readonly totais = computed(() => totalizar(this.resultado()));

  private readonly nomesContas = computed(
    () => new Map(this.dados.contas().map((c) => [c.id, c.nome])),
  );

  protected readonly mensagemExclusao = computed(() => {
    const t = this.alvo();
    if (!t) return '';
    return `${descricaoExibida(t)} — ${formatarDinheiro(t.valor)} em ${formatarData(t.data)}.`;
  });

  protected nomeConta(t: Transacao): string {
    const origem = this.nomesContas().get(t.contaId) ?? '—';
    return t.contaDestinoId
      ? `${origem} → ${this.nomesContas().get(t.contaDestinoId) ?? '—'}`
      : origem;
  }

  protected nomeCategoria(t: Transacao): string {
    const categoria = this.dados.categorias().find((c) => c.id === t.categoriaId);
    return categoria ? rotuloCategoria(categoria, this.dados.categorias()) : '—';
  }

  /** O sinal reforça o tipo em texto, não só por cor (RNF-024). */
  protected sinal(t: Transacao): string {
    return t.tipo === 'receita' ? '+ ' : t.tipo === 'despesa' ? '− ' : '';
  }

  protected pedirExclusao(t: Transacao): void {
    this.mensagem.set(null);
    this.excluirLote.set(false);
    this.alvo.set(t);
  }

  protected async excluir(): Promise<void> {
    const t = this.alvo();
    this.alvo.set(null);
    if (!t) return;
    try {
      if (this.excluirLote() && t.parcela) await this.transacoes.excluirParcelas(t.parcela.grupoId);
      else await this.transacoes.excluir(t.id);
    } catch (erro) {
      this.mensagem.set(mensagemDeErro(erro));
    }
  }
}
