import {
  brl,
  umaCategoria,
  umaConta,
  umaMovimentacao,
  umaTransacao,
  umCofrinho,
} from '../../../testing/fabricas';
import {
  despesasPorCategoria,
  evolucaoPatrimonio,
  mesesAte,
  patrimonioEm,
  percentuaisQueSomam100,
  receitasDespesasPorMes,
} from './indicadores';

const HOJE = '2026-11-08';

describe('mesesAte', () => {
  it('lista os meses até o atual; o corte do mês atual é hoje', () => {
    expect(mesesAte(HOJE, 3)).toEqual([
      { mes: '2026-09', ate: '2026-09-30' },
      { mes: '2026-10', ate: '2026-10-31' },
      { mes: '2026-11', ate: '2026-11-08' },
    ]);
  });

  it('atravessa a virada do ano e fevereiro', () => {
    expect(mesesAte('2027-03-31', 3).map((m) => m.ate)).toEqual([
      '2027-01-31',
      '2027-02-28',
      '2027-03-31',
    ]);
  });
});

describe('patrimônio (RF-041)', () => {
  const contas = [
    umaConta({ id: 'a', saldoInicial: brl(100_000) }),
    umaConta({ id: 'b', saldoInicial: brl(50_000) }),
    umaConta({ id: 'x', saldoInicial: brl(999_999), excluidoEm: '2026-05-01T00:00:00.000Z' }),
  ];
  const transacoes = [
    umaTransacao({ id: '1', tipo: 'receita', valor: brl(30_000), data: '2026-10-05' }),
    umaTransacao({ id: '2', tipo: 'despesa', valor: brl(10_000), data: '2026-11-02' }),
    // Transferência não muda o patrimônio.
    umaTransacao({
      id: '3',
      tipo: 'transferencia',
      valor: brl(20_000),
      data: '2026-11-03',
      contaId: 'a',
      contaDestinoId: 'b',
      categoriaId: null,
    }),
    // Futura e excluída: fora.
    umaTransacao({ id: '4', tipo: 'despesa', valor: brl(5_000), data: '2026-11-20' }),
    umaTransacao({
      id: '5',
      tipo: 'despesa',
      valor: brl(7_000),
      data: '2026-11-01',
      excluidoEm: '2026-11-02T00:00:00.000Z',
    }),
  ].map((t) => ({ ...t, contaId: t.contaId === 'conta-1' ? 'a' : t.contaId }));
  const cofrinhos = [
    umCofrinho({
      movimentacoes: [umaMovimentacao({ valor: brl(40_000), data: '2026-11-04', contaId: 'a' })],
    }),
  ];

  it('soma contas ativas e cofrinhos; guardar no cofrinho não muda o patrimônio', () => {
    expect(patrimonioEm(contas, transacoes, cofrinhos, '2026-09-30')).toEqual(brl(150_000));
    expect(patrimonioEm(contas, transacoes, cofrinhos, '2026-10-31')).toEqual(brl(180_000));
    expect(patrimonioEm(contas, transacoes, cofrinhos, HOJE)).toEqual(brl(170_000));
  });

  it('a série começa no mês do primeiro registro e mostra a variação', () => {
    const e = evolucaoPatrimonio(contas, transacoes, cofrinhos, HOJE);
    expect(e.pontos.map((p) => [p.mes, p.valor.unidades])).toEqual([
      ['2026-10', 180_000],
      ['2026-11', 170_000],
    ]);
    expect(e.variacao).toEqual(brl(-10_000));
  });

  it('limita a série aos últimos meses e, sem registros, mostra só o mês atual', () => {
    const antiga = [umaTransacao({ contaId: 'a', data: '2024-01-10' })];
    expect(evolucaoPatrimonio(contas, antiga, [], HOJE, 12).pontos).toHaveLength(12);
    const vazia = evolucaoPatrimonio(contas, [], [], HOJE);
    expect(vazia.pontos).toEqual([{ mes: '2026-11', ate: HOJE, valor: brl(150_000) }]);
    expect(vazia.variacao).toEqual(brl(0));
  });
});

describe('despesas por categoria (RF-042)', () => {
  const categorias = [
    umaCategoria({ id: 'casa', nome: 'Moradia' }),
    umaCategoria({ id: 'aluguel', nome: 'Aluguel', paiId: 'casa' }),
    umaCategoria({ id: 'mercado', nome: 'Mercado' }),
    umaCategoria({ id: 'lazer', nome: 'Lazer' }),
  ];
  const despesa = (id: string, categoriaId: string, valor: number, data = '2026-11-05') =>
    umaTransacao({ id, categoriaId, valor: brl(valor), data });

  it('agrupa subcategorias na principal, ordena e ignora receitas e outros meses', () => {
    const fatias = despesasPorCategoria(
      [
        despesa('1', 'aluguel', 60_000),
        despesa('2', 'casa', 15_000),
        despesa('3', 'mercado', 25_000),
        despesa('4', 'lazer', 99_000, '2026-10-30'),
        umaTransacao({ id: '5', tipo: 'receita', categoriaId: 'mercado', data: '2026-11-03' }),
      ],
      categorias,
      '2026-11-01',
      HOJE,
    );
    expect(fatias).toEqual([
      { categoriaId: 'casa', nome: 'Moradia', valor: brl(75_000), percentual: 75 },
      { categoriaId: 'mercado', nome: 'Mercado', valor: brl(25_000), percentual: 25 },
    ]);
  });

  it('além das maiores, agrupa o resto em "Outras"', () => {
    const muitas = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => umaCategoria({ id, nome: id }));
    const fatias = despesasPorCategoria(
      muitas.map((c, i) => despesa(String(i), c.id, (6 - i) * 1_000)),
      muitas,
      '2026-11-01',
      HOJE,
      4,
    );
    expect(fatias.map((f) => [f.nome, f.valor.unidades])).toEqual([
      ['a', 6_000],
      ['b', 5_000],
      ['c', 4_000],
      ['Outras', 6_000],
    ]);
    expect(fatias.reduce((s, f) => s + f.percentual, 0)).toBe(100);
  });

  it('sem despesas, a lista é vazia', () => {
    expect(despesasPorCategoria([], categorias, '2026-11-01', HOJE)).toEqual([]);
  });
});

describe('percentuaisQueSomam100', () => {
  it('distribui o arredondamento pelo maior resto', () => {
    expect(percentuaisQueSomam100([1, 1, 1])).toEqual([34, 33, 33]);
    expect(percentuaisQueSomam100([2, 1])).toEqual([67, 33]);
    expect(percentuaisQueSomam100([0, 0])).toEqual([0, 0]);
  });
});

describe('receitas x despesas por mês', () => {
  it('totaliza cada mês até hoje; transferências não entram', () => {
    const r = receitasDespesasPorMes(
      [
        umaTransacao({ id: '1', tipo: 'receita', valor: brl(10_000), data: '2026-10-01' }),
        umaTransacao({ id: '2', tipo: 'despesa', valor: brl(4_000), data: '2026-10-31' }),
        umaTransacao({ id: '3', tipo: 'despesa', valor: brl(1_000), data: '2026-11-08' }),
        umaTransacao({ id: '4', tipo: 'despesa', valor: brl(9_000), data: '2026-11-09' }),
        umaTransacao({
          id: '5',
          tipo: 'transferencia',
          valor: brl(3_000),
          data: '2026-11-01',
          contaDestinoId: 'b',
          categoriaId: null,
        }),
      ],
      HOJE,
      2,
    );
    expect(r).toEqual([
      { mes: '2026-10', ate: '2026-10-31', receitas: brl(10_000), despesas: brl(4_000) },
      { mes: '2026-11', ate: HOJE, receitas: brl(0), despesas: brl(1_000) },
    ]);
  });
});
