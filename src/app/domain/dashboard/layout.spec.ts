import {
  adicionarWidget,
  LAYOUT_PADRAO,
  layoutsIguais,
  moverWidget,
  normalizarLayout,
  redimensionarWidget,
  removerWidget,
  widgetsDisponiveis,
  WIDGETS,
} from './layout';

const ids = (l: { widgets: readonly { id: string }[] }) => l.widgets.map((w) => w.id);

describe('layout da dashboard (RF-043, RF-044)', () => {
  it('o padrão mostra todos os widgets, com o resumo do mês primeiro em linha inteira', () => {
    expect(ids(LAYOUT_PADRAO)).toEqual(Object.keys(WIDGETS));
    expect(LAYOUT_PADRAO.widgets[0]).toEqual({ id: 'resumo', largura: 3 });
    expect(widgetsDisponiveis(LAYOUT_PADRAO)).toEqual([]);
  });

  it('move um widget para antes ou depois, sem sair dos limites', () => {
    const l = moverWidget(LAYOUT_PADRAO, 'patrimonio', -1);
    expect(ids(l).slice(0, 2)).toEqual(['patrimonio', 'resumo']);
    expect(moverWidget(l, 'patrimonio', -1)).toBe(l);
    const ultimo = ids(LAYOUT_PADRAO).at(-1)!;
    expect(moverWidget(LAYOUT_PADRAO, ultimo as never, 1)).toBe(LAYOUT_PADRAO);
    expect(ids(moverWidget(LAYOUT_PADRAO, 'resumo', 2)).slice(0, 3)).toEqual([
      'patrimonio',
      'despesas-categoria',
      'resumo',
    ]);
  });

  it('remove e volta a adicionar no fim, com a largura padrão', () => {
    let l = redimensionarWidget(LAYOUT_PADRAO, 'metas', 3);
    l = removerWidget(l, 'metas');
    expect(ids(l)).not.toContain('metas');
    expect(widgetsDisponiveis(l)).toEqual(['metas']);
    l = adicionarWidget(l, 'metas');
    expect(l.widgets.at(-1)).toEqual({ id: 'metas', largura: 1 });
    expect(adicionarWidget(l, 'metas')).toBe(l);
  });

  it('redimensiona e recusa largura inválida', () => {
    const l = redimensionarWidget(LAYOUT_PADRAO, 'patrimonio', 3);
    expect(l.widgets.find((w) => w.id === 'patrimonio')!.largura).toBe(3);
    expect(() => redimensionarWidget(LAYOUT_PADRAO, 'patrimonio', 4 as never)).toThrow(RangeError);
  });

  it('normaliza o layout guardado: sem layout vale o padrão; descarta desconhecidos e repetidos', () => {
    expect(normalizarLayout(undefined)).toBe(LAYOUT_PADRAO);
    expect(normalizarLayout({ widgets: 'x' })).toBe(LAYOUT_PADRAO);
    expect(
      normalizarLayout({
        widgets: [
          { id: 'metas', largura: 2 },
          { id: 'futuro', largura: 1 },
          { id: 'metas', largura: 3 },
          { id: 'resumo', largura: 9 },
          null,
        ],
      }),
    ).toEqual({
      widgets: [
        { id: 'metas', largura: 2 },
        { id: 'resumo', largura: 3 },
      ],
    });
    expect(normalizarLayout({ widgets: [] })).toEqual({ widgets: [] });
  });

  it('compara layouts por ordem e largura', () => {
    expect(layoutsIguais(LAYOUT_PADRAO, normalizarLayout(LAYOUT_PADRAO))).toBe(true);
    expect(layoutsIguais(LAYOUT_PADRAO, moverWidget(LAYOUT_PADRAO, 'metas', -1))).toBe(false);
    expect(layoutsIguais(LAYOUT_PADRAO, redimensionarWidget(LAYOUT_PADRAO, 'metas', 2))).toBe(
      false,
    );
  });
});
