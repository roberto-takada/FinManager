/**
 * Layout da dashboard (RF-043, RF-044): quais widgets aparecem, em que ordem e com que largura.
 * Fica nas preferências cifradas do cofre (RN-001) e, por isso, também no backup.
 */

export type IdWidget =
  | 'resumo'
  | 'patrimonio'
  | 'despesas-categoria'
  | 'receitas-despesas'
  | 'recentes'
  | 'metas'
  | 'contas-a-vencer';

/** Largura em colunas de uma grade de 3 (telas largas); em telas estreitas tudo ocupa a linha. */
export type LarguraWidget = 1 | 2 | 3;

export interface WidgetNoLayout {
  readonly id: IdWidget;
  readonly largura: LarguraWidget;
}

export interface LayoutDashboard {
  /** Widgets visíveis, na ordem de exibição. Os ausentes estão removidos. */
  readonly widgets: readonly WidgetNoLayout[];
}

export interface DescricaoWidget {
  readonly nome: string;
  readonly descricao: string;
  readonly larguraPadrao: LarguraWidget;
}

export const WIDGETS: Readonly<Record<IdWidget, DescricaoWidget>> = {
  resumo: {
    nome: 'Resumo do mês',
    descricao: 'Saldo, receitas, despesas e contas a pagar.',
    larguraPadrao: 3,
  },
  patrimonio: {
    nome: 'Evolução do patrimônio',
    descricao: 'Contas mais cofrinhos no fim de cada mês.',
    larguraPadrao: 2,
  },
  'despesas-categoria': {
    nome: 'Despesas por categoria',
    descricao: 'Para onde foi o dinheiro neste mês.',
    larguraPadrao: 1,
  },
  'receitas-despesas': {
    nome: 'Receitas x despesas',
    descricao: 'Comparação dos últimos 6 meses.',
    larguraPadrao: 2,
  },
  metas: {
    nome: 'Metas',
    descricao: 'Cofrinhos mais próximos da meta.',
    larguraPadrao: 1,
  },
  recentes: {
    nome: 'Transações recentes',
    descricao: 'As 5 últimas transações.',
    larguraPadrao: 2,
  },
  'contas-a-vencer': {
    nome: 'Contas a vencer',
    descricao: 'Contas vencidas ou perto do vencimento.',
    larguraPadrao: 1,
  },
};

export const LARGURAS: Readonly<Record<LarguraWidget, string>> = {
  1: 'Um terço',
  2: 'Dois terços',
  3: 'Linha inteira',
};

const IDS = Object.keys(WIDGETS) as IdWidget[];

export const LAYOUT_PADRAO: LayoutDashboard = {
  widgets: IDS.map((id) => ({ id, largura: WIDGETS[id].larguraPadrao })),
};

const ehId = (id: unknown): id is IdWidget => typeof id === 'string' && id in WIDGETS;
const ehLargura = (l: unknown): l is LarguraWidget => l === 1 || l === 2 || l === 3;

/**
 * Lê um layout guardado sem confiar nele: descarta widgets desconhecidos (ex.: de uma versão
 * futura) e repetidos, e corrige larguras inválidas. Sem layout guardado, vale o padrão.
 */
export function normalizarLayout(guardado: unknown): LayoutDashboard {
  const widgets = (guardado as Partial<LayoutDashboard> | null | undefined)?.widgets;
  if (!Array.isArray(widgets)) return LAYOUT_PADRAO;
  const vistos = new Set<IdWidget>();
  const resultado: WidgetNoLayout[] = [];
  for (const w of widgets as { id?: unknown; largura?: unknown }[]) {
    if (!ehId(w?.id) || vistos.has(w.id)) continue;
    vistos.add(w.id);
    resultado.push({
      id: w.id,
      largura: ehLargura(w.largura) ? w.largura : WIDGETS[w.id].larguraPadrao,
    });
  }
  return { widgets: resultado };
}

/** Widgets que não estão no layout, na ordem do catálogo. */
export function widgetsDisponiveis(layout: LayoutDashboard): IdWidget[] {
  const visiveis = new Set(layout.widgets.map((w) => w.id));
  return IDS.filter((id) => !visiveis.has(id));
}

/** Move um widget `passo` posições (−1 = antes, +1 = depois), sem sair dos limites. */
export function moverWidget(layout: LayoutDashboard, id: IdWidget, passo: number): LayoutDashboard {
  const origem = layout.widgets.findIndex((w) => w.id === id);
  if (origem < 0) return layout;
  const destino = Math.max(0, Math.min(layout.widgets.length - 1, origem + passo));
  if (destino === origem) return layout;
  const widgets = [...layout.widgets];
  widgets.splice(destino, 0, ...widgets.splice(origem, 1));
  return { widgets };
}

export function removerWidget(layout: LayoutDashboard, id: IdWidget): LayoutDashboard {
  return { widgets: layout.widgets.filter((w) => w.id !== id) };
}

/** Acrescenta o widget no fim, com a largura padrão; se já estiver visível, nada muda. */
export function adicionarWidget(layout: LayoutDashboard, id: IdWidget): LayoutDashboard {
  if (!ehId(id) || layout.widgets.some((w) => w.id === id)) return layout;
  return { widgets: [...layout.widgets, { id, largura: WIDGETS[id].larguraPadrao }] };
}

export function redimensionarWidget(
  layout: LayoutDashboard,
  id: IdWidget,
  largura: LarguraWidget,
): LayoutDashboard {
  if (!ehLargura(largura)) throw new RangeError(`Largura inválida: ${String(largura)}`);
  return { widgets: layout.widgets.map((w) => (w.id === id ? { ...w, largura } : w)) };
}

export function layoutsIguais(a: LayoutDashboard, b: LayoutDashboard): boolean {
  return (
    a.widgets.length === b.widgets.length &&
    a.widgets.every((w, i) => w.id === b.widgets[i]?.id && w.largura === b.widgets[i]?.largura)
  );
}
