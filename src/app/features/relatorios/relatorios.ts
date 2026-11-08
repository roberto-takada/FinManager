import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DOCUMENT,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { DadosService } from '../../application/dados/dados.service';
import { RelatoriosService } from '../../application/relatorios/relatorios.service';
import { formatarData } from '../../domain/shared/data';
import { type Dinheiro, dinheiro, formatarDinheiro } from '../../domain/shared/dinheiro';
import {
  deslocarPeriodo,
  intervaloPorExtenso,
  lerPeriodo,
  periodoContendo,
  type TipoPeriodo,
  TIPOS_PERIODO,
} from '../../domain/relatorios/periodo';
import { nomeArquivoCsv, relatorioParaCsv } from '../../domain/relatorios/relatorio-csv';
import { SITUACOES_COFRINHO } from '../../domain/relatorios/relatorio';
import { DialogoConfirmacao } from '../../ui/dialogo-confirmacao/dialogo-confirmacao';
import { type CorGrafico, Grafico } from '../../ui/grafico/grafico';
import { baixarArquivo } from '../compartilhado/baixar-arquivo';
import { percentual } from '../compartilhado/percentual';
import { comSinal, formatadores } from '../compartilhado/formatos-grafico';

const CORES: readonly CorGrafico[] = ['chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5'];
const AMOSTRAS = ['bg-chart-1', 'bg-chart-2', 'bg-chart-3', 'bg-chart-4', 'bg-chart-5'];
const ehTipo = (t: string | undefined): t is TipoPeriodo => !!t && t in TIPOS_PERIODO;

/**
 * Relatórios (RF-050 a RF-053): mensal, trimestral, semestral e anual, com comparação com o
 * período anterior equivalente e exportação em CSV e PDF (impressão). O período escolhido
 * fica na URL (`?tipo=trimestral&periodo=2026-T3`), para o "Voltar" do navegador funcionar.
 */
@Component({
  selector: 'app-relatorios',
  imports: [Grafico, DialogoConfirmacao],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let r = relatorio();
    <div class="space-y-6">
      <div class="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 tabindex="-1" class="text-3xl font-bold">Relatórios</h1>
          <p class="mt-1 text-lg" data-periodo aria-live="polite">
            Relatório {{ nomeTipo() }}: <strong>{{ r.periodo.nome }}</strong
            >&nbsp;<span class="text-muted">({{ intervalo(r.periodo.de, r.ate) }})</span>
          </p>
        </div>
        <div class="flex flex-wrap gap-3 print:hidden">
          <button type="button" class="botao-secundario" (click)="confirmandoCsv.set(true)">
            Exportar CSV
          </button>
          <button type="button" class="botao-primario" (click)="exportarPdf()">Exportar PDF</button>
        </div>
      </div>

      <form
        class="space-y-4 cartao print:hidden"
        aria-label="Escolher o relatório"
        (submit)="$event.preventDefault()"
      >
        <div class="flex flex-wrap items-end gap-x-6 gap-y-4">
          <fieldset>
            <legend class="rotulo">Tipo de relatório</legend>
            <div class="mt-1 flex flex-wrap gap-2">
              @for (t of tipos; track t.valor) {
                <label
                  class="botao-secundario cursor-pointer has-checked:border-primary has-checked:bg-primary-soft has-checked:text-primary-soft-foreground has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring"
                >
                  <input
                    type="radio"
                    name="tipo"
                    class="sr-only"
                    [value]="t.valor"
                    [checked]="t.valor === tipoAtual()"
                    (change)="escolherTipo(t.valor)"
                  />
                  {{ t.rotulo }}
                </label>
              }
            </div>
          </fieldset>
          <div>
            <label class="rotulo" for="periodo">Período</label>
            <select
              id="periodo"
              class="campo w-auto"
              (change)="escolherPeriodo($any($event.target).value)"
            >
              @for (p of periodos(); track p.id) {
                <option [value]="p.id" [selected]="p.id === r.periodo.id">{{ p.nome }}</option>
              }
            </select>
          </div>
          <div class="flex gap-2">
            <button
              type="button"
              class="botao-secundario"
              [disabled]="!anterior()"
              [attr.aria-label]="'Período anterior' + (anterior() ? ': ' + anterior()!.nome : '')"
              (click)="escolherPeriodo(anterior()!.id)"
            >
              <span aria-hidden="true">←</span> Anterior
            </button>
            <button
              type="button"
              class="botao-secundario"
              [disabled]="!seguinte()"
              [attr.aria-label]="'Próximo período' + (seguinte() ? ': ' + seguinte()!.nome : '')"
              (click)="escolherPeriodo(seguinte()!.id)"
            >
              Próximo <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>
        <p class="ajuda">
          "Exportar PDF" abre a impressão: escolha "Salvar como PDF". O CSV abre em planilhas e
          <strong>não é cifrado</strong>.
        </p>
      </form>

      @if (mensagem(); as m) {
        <p class="alerta-sucesso print:hidden" role="status">{{ m }}</p>
      }
      @if (r.emAndamento) {
        <p class="aviso" data-em-andamento>
          Período em andamento: os números vão até hoje ({{ data(r.ate) }}). A comparação é com
          {{ r.anterior.nome }} completo.
        </p>
      }

      <!-- RF-051/052: totais e comparação -->
      <section aria-labelledby="titulo-totais" class="space-y-3">
        <h2 id="titulo-totais" class="text-xl font-semibold">
          Resumo <span class="font-normal text-muted">comparado com {{ r.anterior.nome }}</span>
        </h2>
        <div class="grid gap-4 sm:grid-cols-3">
          @for (k of kpis(); track k.chave) {
            <article class="space-y-2 cartao" [attr.data-total]="k.chave">
              <h3 class="text-sm font-medium text-muted">{{ k.nome }}</h3>
              <p
                class="valor-kpi"
                [class.text-positive]="k.chave === 'saldo' && k.valor.unidades > 0"
                [class.text-negative]="k.chave === 'saldo' && k.valor.unidades < 0"
              >
                {{ k.chave === 'saldo' ? comSinal(k.valor) : formatar(k.valor) }}
              </p>
              <p class="text-sm text-muted">
                Antes: {{ k.chave === 'saldo' ? comSinal(k.anterior) : formatar(k.anterior) }}
              </p>
              @if (k.variacao !== null) {
                <p [class]="k.bom ? 'selo-positivo' : 'selo-negativo'" data-variacao>
                  {{ percentual(k.variacao) }} vs. período anterior
                </p>
              } @else {
                <p class="selo-neutro">Sem base de comparação</p>
              }
            </article>
          }
        </div>
      </section>

      <!-- RF-051: despesas por categoria -->
      <section class="space-y-4 cartao" aria-labelledby="titulo-categorias">
        <h2 id="titulo-categorias" class="text-lg font-semibold">Despesas por categoria</h2>
        @if (r.categorias.length === 0) {
          <p class="text-muted">Nenhuma despesa neste período nem no anterior.</p>
        } @else {
          <div class="grid items-start gap-6 lg:grid-cols-[16rem_1fr]">
            @if (fatias().length > 0) {
              <app-grafico
                tipo="rosca"
                titulo="Despesas por categoria"
                rotuloCategorias="Categoria"
                [resumo]="resumoCategorias()"
                [rotulos]="nomesFatias()"
                [series]="seriesFatias()"
                [coresFatias]="coresFatias()"
                [formatar]="formato().formatar"
                [altura]="200"
                [tabela]="false"
              />
            } @else {
              <p class="text-muted">Nenhuma despesa neste período.</p>
            }
            <div class="overflow-x-auto">
              <table class="w-full text-left text-sm" data-tabela="categorias">
                <caption class="sr-only">
                  Despesas por categoria em
                  {{
                    r.periodo.nome
                  }}, comparadas com
                  {{
                    r.anterior.nome
                  }}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Categoria</th>
                    <th scope="col" class="text-right">Valor</th>
                    <th scope="col" class="text-right">% das despesas</th>
                    <th scope="col" class="text-right">Período anterior</th>
                    <th scope="col" class="text-right">Variação</th>
                  </tr>
                </thead>
                <tbody>
                  @for (c of r.categorias; track c.nome; let i = $index) {
                    <tr>
                      <th
                        scope="row"
                        class="text-sm font-medium tracking-normal text-foreground normal-case"
                      >
                        <span class="flex items-center gap-2">
                          @if (c.valor.unidades > 0) {
                            <span
                              class="size-2.5 shrink-0 rounded-sm"
                              [class]="amostras[i % amostras.length]"
                              aria-hidden="true"
                            ></span>
                          }
                          {{ c.nome }}
                        </span>
                      </th>
                      <td class="text-right whitespace-nowrap tabular-nums">
                        {{ formatar(c.valor) }}
                      </td>
                      <td class="text-right tabular-nums">{{ c.percentual }}%</td>
                      <td class="text-right whitespace-nowrap text-muted tabular-nums">
                        {{ formatar(c.valorAnterior) }}
                      </td>
                      <td
                        class="text-right whitespace-nowrap tabular-nums"
                        [class.text-negative]="(c.variacao ?? 0) > 0"
                        [class.text-positive]="(c.variacao ?? 0) < 0"
                      >
                        {{ c.variacao === null ? 'Novo' : percentual(c.variacao) }}
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        }
      </section>

      <!-- RF-051: evolução patrimonial -->
      <section class="space-y-4 cartao" aria-labelledby="titulo-patrimonio">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 id="titulo-patrimonio" class="text-lg font-semibold">Evolução patrimonial</h2>
          @let v = r.patrimonio.variacao.unidades;
          <p
            [class]="v > 0 ? 'selo-positivo' : v < 0 ? 'selo-negativo' : 'selo-neutro'"
            data-variacao-patrimonio
          >
            <span aria-hidden="true">{{ v > 0 ? '▲' : v < 0 ? '▼' : '=' }}</span>
            {{ comSinal(r.patrimonio.variacao) }} no período
          </p>
        </div>
        <div class="grid items-start gap-6 lg:grid-cols-[1fr_18rem]">
          <app-grafico
            tipo="linha"
            titulo="Patrimônio no período"
            rotuloCategorias="Data"
            [resumo]="resumoPatrimonio()"
            [rotulos]="rotulosPatrimonio()"
            [series]="seriePatrimonio()"
            [formatar]="formato().formatar"
            [formatarEixo]="formato().formatarEixo"
            [legenda]="false"
            [altura]="220"
            [tabela]="false"
          />
          <div class="overflow-x-auto">
            <table class="w-full text-left text-sm" data-tabela="patrimonio">
              <caption class="sr-only">
                Patrimônio no período
              </caption>
              <thead>
                <tr>
                  <th scope="col">Data</th>
                  <th scope="col" class="text-right">Patrimônio</th>
                </tr>
              </thead>
              <tbody>
                @for (p of r.patrimonio.pontos; track p.data) {
                  <tr>
                    <th
                      scope="row"
                      class="text-sm font-normal tracking-normal text-foreground normal-case tabular-nums"
                    >
                      {{ data(p.data) }}
                    </th>
                    <td class="text-right whitespace-nowrap tabular-nums">
                      {{ formatar(p.valor) }}
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <!-- RF-051: situação dos cofrinhos -->
      <section class="space-y-3 cartao" aria-labelledby="titulo-cofrinhos">
        <h2 id="titulo-cofrinhos" class="text-lg font-semibold">Cofrinhos</h2>
        @if (r.cofrinhos.length === 0) {
          <p class="text-muted">Nenhum cofrinho neste período.</p>
        } @else {
          <div class="overflow-x-auto">
            <table class="w-full text-left text-sm" data-tabela="cofrinhos">
              <caption class="sr-only">
                Situação dos cofrinhos em
                {{
                  r.periodo.nome
                }}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Cofrinho</th>
                  <th scope="col" class="text-right">Depósitos</th>
                  <th scope="col" class="text-right">Retiradas</th>
                  <th scope="col" class="text-right">Saldo no fim</th>
                  <th scope="col" class="text-right">Meta</th>
                  <th scope="col" class="text-right">Progresso</th>
                  <th scope="col">Situação</th>
                </tr>
              </thead>
              <tbody>
                @for (c of r.cofrinhos; track c.id) {
                  <tr>
                    <th
                      scope="row"
                      class="text-sm font-medium tracking-normal text-foreground normal-case"
                    >
                      {{ c.nome }}
                    </th>
                    <td
                      class="text-right whitespace-nowrap tabular-nums"
                      [class.text-positive]="c.depositos.unidades > 0"
                    >
                      {{ c.depositos.unidades > 0 ? '+ ' : '' }}{{ formatar(c.depositos) }}
                    </td>
                    <td
                      class="text-right whitespace-nowrap tabular-nums"
                      [class.text-negative]="c.retiradas.unidades > 0"
                    >
                      {{ c.retiradas.unidades > 0 ? '− ' : '' }}{{ formatar(c.retiradas) }}
                    </td>
                    <td class="text-right whitespace-nowrap tabular-nums">
                      {{ formatar(c.saldoFinal) }}
                    </td>
                    <td class="text-right whitespace-nowrap text-muted tabular-nums">
                      {{ formatar(c.meta) }}
                    </td>
                    <td class="text-right tabular-nums">{{ c.percentual }}%</td>
                    <td>
                      <span
                        [class]="
                          c.situacao === 'meta-atingida'
                            ? 'selo-positivo'
                            : c.situacao === 'encerrado'
                              ? 'selo-neutro'
                              : 'selo-primario'
                        "
                        >{{ situacoes[c.situacao] }}</span
                      >
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </section>

      <p class="hidden text-sm print:block">
        Gerado pelo FinManager em {{ data(hoje()) }}. Dados processados só neste navegador.
      </p>
    </div>

    <app-dialogo-confirmacao
      titulo="Exportar o relatório sem proteção?"
      mensagem="O arquivo .csv NÃO é criptografado: contém valores, categorias e cofrinhos do período, e qualquer pessoa com acesso a ele poderá lê-los."
      rotuloConfirmar="Exportar mesmo assim"
      [aberto]="confirmandoCsv()"
      (confirmado)="exportarCsv()"
      (cancelado)="confirmandoCsv.set(false)"
    >
      <p>Use-o na sua planilha e apague-o depois, se não precisar mais.</p>
    </app-dialogo-confirmacao>
  `,
})
export class Relatorios {
  /** Query params (withComponentInputBinding). */
  readonly tipo = input<string>();
  readonly periodo = input<string>();

  private readonly relatorios = inject(RelatoriosService);
  private readonly dados = inject(DadosService);
  private readonly router = inject(Router);
  private readonly documento = inject(DOCUMENT);

  protected readonly tipos = (Object.keys(TIPOS_PERIODO) as TipoPeriodo[]).map((valor) => ({
    valor,
    rotulo: TIPOS_PERIODO[valor],
  }));
  protected readonly amostras = AMOSTRAS;
  protected readonly situacoes = SITUACOES_COFRINHO;
  protected readonly percentual = percentual;
  protected readonly comSinal = comSinal;
  protected readonly formatar = formatarDinheiro;
  protected readonly data = formatarData;
  protected readonly intervalo = intervaloPorExtenso;
  protected readonly hoje = () => this.dados.hoje();
  protected readonly mensagem = signal<string | null>(null);
  protected readonly confirmandoCsv = signal(false);

  protected readonly tipoAtual = computed<TipoPeriodo>(() => {
    const t = this.tipo();
    return ehTipo(t) ? t : 'mensal';
  });
  protected readonly nomeTipo = computed(() => TIPOS_PERIODO[this.tipoAtual()].toLowerCase());
  protected readonly periodos = computed(() => this.relatorios.periodos(this.tipoAtual()));

  /** Período da URL, se for válido e estiver entre os disponíveis; senão, o atual. */
  private readonly periodoAtual = computed(() => {
    const lista = this.periodos();
    const pedido = lerPeriodo(this.tipoAtual(), this.periodo());
    return (
      (pedido && lista.find((p) => p.id === pedido.id)) ??
      lista[0] ??
      periodoContendo(this.tipoAtual(), this.dados.hoje())
    );
  });
  protected readonly relatorio = computed(() => this.relatorios.gerar(this.periodoAtual()));

  protected readonly anterior = computed(() => {
    const id = deslocarPeriodo(this.periodoAtual(), -1).id;
    return this.periodos().find((p) => p.id === id) ?? null;
  });
  protected readonly seguinte = computed(() => {
    const id = deslocarPeriodo(this.periodoAtual(), 1).id;
    return this.periodos().find((p) => p.id === id) ?? null;
  });

  protected readonly formato = computed(() => formatadores(this.relatorio().totais.receitas.moeda));

  protected readonly kpis = computed(() => {
    const r = this.relatorio();
    const v = r.variacoes;
    return [
      {
        chave: 'receitas',
        nome: 'Receitas',
        valor: r.totais.receitas,
        anterior: r.totaisAnteriores.receitas,
        variacao: v.receitas,
        bom: (v.receitas ?? 0) >= 0,
      },
      {
        chave: 'despesas',
        nome: 'Despesas',
        valor: r.totais.despesas,
        anterior: r.totaisAnteriores.despesas,
        variacao: v.despesas,
        // Despesas: cair é bom; o sinal fica no texto (RNF-024).
        bom: (v.despesas ?? 0) <= 0,
      },
      {
        chave: 'saldo',
        nome: 'Saldo (receitas − despesas)',
        valor: r.totais.saldo,
        anterior: r.totaisAnteriores.saldo,
        variacao: v.saldo,
        bom: r.totais.saldo.unidades >= r.totaisAnteriores.saldo.unidades,
      },
    ];
  });

  /** Só as categorias com gasto no período entram no gráfico. */
  protected readonly fatias = computed(() =>
    this.relatorio().categorias.filter((c) => c.valor.unidades > 0),
  );
  protected readonly nomesFatias = computed(() => this.fatias().map((c) => c.nome));
  protected readonly seriesFatias = computed(() => [
    { nome: 'Valor', cor: 'chart-1' as const, valores: this.fatias().map((c) => c.valor.unidades) },
  ]);
  protected readonly coresFatias = computed(() =>
    this.fatias().map((_, i) => CORES[i % CORES.length]!),
  );
  protected readonly resumoCategorias = computed(() => {
    const maior = this.fatias()[0];
    if (!maior) return '';
    return `${formatarDinheiro(this.relatorio().totais.despesas)} em despesas. Maior gasto: ${maior.nome}, com ${maior.percentual}% (${formatarDinheiro(maior.valor)}). Detalhes na tabela de categorias.`;
  });

  protected readonly rotulosPatrimonio = computed(() =>
    this.relatorio().patrimonio.pontos.map((p) => formatarData(p.data).slice(0, 5)),
  );
  protected readonly seriePatrimonio = computed(() => [
    {
      nome: 'Patrimônio',
      cor: 'chart-1' as const,
      valores: this.relatorio().patrimonio.pontos.map((p) => p.valor.unidades),
    },
  ]);
  protected readonly resumoPatrimonio = computed(() => {
    const { inicial, final, variacao } = this.relatorio().patrimonio;
    const verbo =
      variacao.unidades > 0 ? 'cresceu' : variacao.unidades < 0 ? 'diminuiu' : 'ficou estável';
    const valor = absoluto(variacao);
    return `O patrimônio ${verbo}${variacao.unidades !== 0 ? ` ${formatarDinheiro(valor)}` : ''}: de ${formatarDinheiro(inicial)} para ${formatarDinheiro(final)}.`;
  });

  protected escolherTipo(tipo: TipoPeriodo): void {
    // Ao trocar o tipo, fica o período desse tipo que contém o período atual.
    const id = periodoContendo(tipo, this.periodoAtual().de).id;
    void this.irPara(tipo, id);
  }

  protected escolherPeriodo(id: string): void {
    void this.irPara(this.tipoAtual(), id);
  }

  protected exportarCsv(): void {
    this.confirmandoCsv.set(false);
    const r = this.relatorio();
    const nome = nomeArquivoCsv(r);
    baixarArquivo(this.documento, nome, relatorioParaCsv(r), 'text/csv;charset=utf-8');
    this.mensagem.set(`Relatório exportado: ${nome}.`);
  }

  /** RF-053: PDF pela impressão do navegador, com estilos de impressão (sem biblioteca). */
  protected exportarPdf(): void {
    this.mensagem.set(null);
    this.documento.defaultView?.print();
  }

  private irPara(tipo: TipoPeriodo, periodo: string): Promise<boolean> {
    this.mensagem.set(null);
    return this.router.navigate([], { queryParams: { tipo, periodo } });
  }
}

function absoluto(valor: Dinheiro): Dinheiro {
  return dinheiro(Math.abs(valor.unidades), valor.moeda);
}
