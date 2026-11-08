import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  type ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import type { Chart, ChartConfiguration } from 'chart.js';

/** Cores dos tokens do design system (`--fm-*`), válidas nos temas claro e escuro. */
export type CorGrafico =
  'chart-1' | 'chart-2' | 'chart-3' | 'chart-4' | 'chart-5' | 'positive' | 'negative';

export type TipoGrafico = 'linha' | 'barras' | 'rosca';

export interface SerieGrafico {
  readonly nome: string;
  readonly valores: readonly number[];
  readonly cor: CorGrafico;
}

/** Coluna de texto pronto, só para a tabela (ex.: percentual de cada fatia). */
export interface ColunaTabela {
  readonly nome: string;
  readonly valores: readonly string[];
}

/** Classes completas (o Tailwind só gera classes que aparecem inteiras no código). */
const AMOSTRA: Record<CorGrafico, string> = {
  'chart-1': 'bg-chart-1',
  'chart-2': 'bg-chart-2',
  'chart-3': 'bg-chart-3',
  'chart-4': 'bg-chart-4',
  'chart-5': 'bg-chart-5',
  positive: 'bg-positive',
  negative: 'bg-negative',
};

const NOMES_TIPO: Record<TipoGrafico, string> = {
  linha: 'Gráfico de linha',
  barras: 'Gráfico de barras',
  rosca: 'Gráfico de rosca',
};

let carregamento: Promise<typeof import('./chart-registrado')> | null = null;
const carregarChart = () => (carregamento ??= import('./chart-registrado'));

/** Hex "#rrggbb" com transparência, para o preenchimento sob a linha. */
function comAlfa(cor: string, alfa: string): string {
  return /^#[0-9a-f]{6}$/i.test(cor) ? cor + alfa : cor;
}

/**
 * Gráfico acessível (RF-045, RNF-024, RNF-028) sobre o Chart.js:
 * - o `<canvas>` tem `role="img"` e nome; a legenda visível usa texto, não só cor;
 * - um resumo em texto fica sempre visível e os dados completos ficam numa tabela
 *   ("Ver dados em tabela"), gerada a partir dos mesmos valores do gráfico;
 * - as cores vêm dos tokens do tema e o gráfico é redesenhado quando o tema muda;
 * - sem animação quando o sistema ou o usuário (RF-082) pede redução de movimento;
 * - o texto dos eixos acompanha o tamanho de fonte escolhido.
 * O Chart.js é carregado sob demanda, só quando um gráfico aparece.
 */
@Component({
  selector: 'app-grafico',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <figure class="space-y-3">
      @if (legenda() && tipo() !== 'rosca') {
        <ul
          class="flex flex-wrap justify-end gap-x-4 gap-y-1 text-sm text-muted"
          aria-hidden="true"
        >
          @for (s of series(); track s.nome) {
            <li class="flex items-center gap-1.5">
              <span class="size-2.5 rounded-sm" [class]="amostra[s.cor]"></span>{{ s.nome }}
            </li>
          }
        </ul>
      }
      <div class="relative" [style.height.px]="altura()">
        <canvas
          #tela
          role="img"
          [attr.aria-label]="
            nomeTipo[tipo()] + ': ' + titulo() + '. Os dados estão na tabela a seguir.'
          "
        ></canvas>
      </div>
      <figcaption class="text-sm text-muted" data-resumo-grafico>{{ resumo() }}</figcaption>
      @if (tabela()) {
        <details class="text-sm" data-tabela-grafico>
          <summary class="inline-block link">Ver dados em tabela</summary>
          <div class="mt-2 overflow-x-auto">
            <table class="w-full text-left">
              <caption class="sr-only">
                {{
                  titulo()
                }}
              </caption>
              <thead>
                <tr>
                  <th scope="col">{{ rotuloCategorias() }}</th>
                  @for (s of series(); track s.nome) {
                    <th scope="col" class="text-right">{{ s.nome }}</th>
                  }
                  @for (c of colunasExtras(); track c.nome) {
                    <th scope="col" class="text-right">{{ c.nome }}</th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (r of rotulosTabela() ?? rotulos(); track $index; let i = $index) {
                  <tr>
                    <th
                      scope="row"
                      class="text-sm font-normal tracking-normal text-foreground normal-case"
                    >
                      {{ r }}
                    </th>
                    @for (s of series(); track s.nome) {
                      <td class="text-right whitespace-nowrap tabular-nums">
                        {{ formatar()(s.valores[i] ?? 0) }}
                      </td>
                    }
                    @for (c of colunasExtras(); track c.nome) {
                      <td class="text-right tabular-nums">{{ c.valores[i] }}</td>
                    }
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </details>
      }
    </figure>
  `,
})
export class Grafico {
  readonly tipo = input.required<TipoGrafico>();
  /** Nome do gráfico (legenda da tabela e nome acessível do canvas). */
  readonly titulo = input.required<string>();
  /** Conclusão em texto, sempre visível (ex.: "Cresceu R$ 500,00 em 6 meses"). */
  readonly resumo = input.required<string>();
  /** Rótulos do eixo X ou das fatias. */
  readonly rotulos = input.required<readonly string[]>();
  /** Rótulos por extenso para a tabela (ex.: "novembro de 2026"); padrão: `rotulos`. */
  readonly rotulosTabela = input<readonly string[]>();
  readonly series = input.required<readonly SerieGrafico[]>();
  /** Cabeçalho da 1ª coluna da tabela (ex.: "Mês", "Categoria"). */
  readonly rotuloCategorias = input('Item');
  readonly formatar = input<(valor: number) => string>((v) => v.toLocaleString('pt-BR'));
  /** Formato do eixo Y (mais curto); padrão: `formatar`. */
  readonly formatarEixo = input<(valor: number) => string>();
  /** Na rosca, a cor de cada fatia (na ordem dos rótulos). */
  readonly coresFatias = input<readonly CorGrafico[]>([]);
  readonly colunasExtras = input<readonly ColunaTabela[]>([]);
  readonly legenda = input(true);
  readonly altura = input(256);
  /**
   * `false` só quando a página já mostra uma tabela visível com os mesmos dados logo após o
   * gráfico (ex.: relatórios, que são impressos com as tabelas abertas).
   */
  readonly tabela = input(true);

  protected readonly amostra = AMOSTRA;
  protected readonly nomeTipo = NOMES_TIPO;

  private readonly tela = viewChild.required<ElementRef<HTMLCanvasElement>>('tela');
  private readonly versaoTema = signal(0);
  private grafico: Chart | null = null;
  private geracao = 0;

  constructor() {
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() => {
      this.geracao++;
      this.grafico?.destroy();
    });
    this.observarTema(destroyRef);

    afterRenderEffect({
      write: () => {
        this.versaoTema();
        const config = {
          tipo: this.tipo(),
          rotulos: this.rotulos(),
          series: this.series(),
          formatar: this.formatar(),
          formatarEixo: this.formatarEixo() ?? this.formatar(),
          coresFatias: this.coresFatias(),
        };
        void this.desenhar(this.tela().nativeElement, config);
      },
    });
  }

  /** A troca de tema (classe no <html> ou preferência do sistema) muda as cores. */
  private observarTema(destroyRef: DestroyRef): void {
    if (typeof MutationObserver === 'undefined') return;
    const avisar = () => this.versaoTema.update((v) => v + 1);
    const observador = new MutationObserver(avisar);
    observador.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    const escuro =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-color-scheme: dark)')
        : null;
    escuro?.addEventListener('change', avisar);
    destroyRef.onDestroy(() => {
      observador.disconnect();
      escuro?.removeEventListener('change', avisar);
    });
  }

  private async desenhar(
    canvas: HTMLCanvasElement,
    c: {
      tipo: TipoGrafico;
      rotulos: readonly string[];
      series: readonly SerieGrafico[];
      formatar: (v: number) => string;
      formatarEixo: (v: number) => string;
      coresFatias: readonly CorGrafico[];
    },
  ): Promise<void> {
    const geracao = ++this.geracao;
    let Chart: (typeof import('./chart-registrado'))['Chart'];
    try {
      ({ Chart } = await carregarChart());
    } catch {
      return; // Sem o gráfico, o resumo e a tabela continuam disponíveis.
    }
    if (geracao !== this.geracao || !canvas.isConnected) return;
    this.grafico?.destroy();
    this.grafico = null;

    const estilo = getComputedStyle(canvas);
    const cor = (token: string) => estilo.getPropertyValue(`--fm-${token}`).trim() || '#777';
    const raiz = document.documentElement;
    const reduzirMovimento =
      raiz.classList.contains('animacoes-reduzidas') ||
      (typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    Chart.defaults.font.family = estilo.fontFamily;
    // Acompanha o tamanho de texto escolhido (RF-082): 12 px na escala padrão.
    Chart.defaults.font.size = Math.round(
      (parseFloat(getComputedStyle(raiz).fontSize) || 16) * 0.75,
    );
    Chart.defaults.color = cor('muted');

    const rotulos = [...c.rotulos];
    const dica = {
      callbacks: {
        label: (ctx: { dataset: { label?: string }; label: string; raw: unknown }) =>
          `${c.tipo === 'rosca' ? ctx.label : (ctx.dataset.label ?? '')}: ${c.formatar(Number(ctx.raw))}`,
      },
    };
    const eixos = {
      x: { grid: { display: false }, border: { color: cor('border') } },
      y: {
        beginAtZero: c.tipo === 'barras',
        grid: { color: cor('border') },
        border: { display: false },
        ticks: { maxTicksLimit: 6, callback: (v: number | string) => c.formatarEixo(Number(v)) },
      },
    };

    let config: ChartConfiguration;
    if (c.tipo === 'rosca') {
      config = {
        type: 'doughnut',
        data: {
          labels: rotulos,
          datasets: [
            {
              data: [...(c.series[0]?.valores ?? [])],
              backgroundColor: c.coresFatias.map(cor),
              borderColor: cor('surface'),
              borderWidth: 2,
            },
          ],
        },
        options: { cutout: '62%' },
      } as ChartConfiguration<'doughnut'> as unknown as ChartConfiguration;
    } else if (c.tipo === 'barras') {
      config = {
        type: 'bar',
        data: {
          labels: rotulos,
          datasets: c.series.map((s) => ({
            label: s.nome,
            data: [...s.valores],
            backgroundColor: cor(s.cor),
            borderRadius: 4,
            maxBarThickness: 28,
          })),
        },
        options: { scales: eixos },
      } as ChartConfiguration<'bar'> as unknown as ChartConfiguration;
    } else {
      config = {
        type: 'line',
        data: {
          labels: rotulos,
          datasets: c.series.map((s) => ({
            label: s.nome,
            data: [...s.valores],
            borderColor: cor(s.cor),
            backgroundColor: comAlfa(cor(s.cor), '22'),
            pointBackgroundColor: cor(s.cor),
            pointRadius: 3,
            fill: true,
            tension: 0.3,
          })),
        },
        options: { scales: eixos },
      } as ChartConfiguration<'line'> as unknown as ChartConfiguration;
    }

    config.options = {
      ...config.options,
      responsive: true,
      maintainAspectRatio: false,
      animation: reduzirMovimento ? false : { duration: 400 },
      plugins: { legend: { display: false }, tooltip: dica },
    } as ChartConfiguration['options'];

    try {
      this.grafico = new Chart(canvas, config);
    } catch {
      this.grafico = null; // Ex.: navegador sem canvas; o resumo e a tabela continuam.
    }
  }
}
