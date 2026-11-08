import {
  brl,
  umaCategoria,
  umaConta,
  umaMovimentacao,
  umaTransacao,
  umCofrinho,
} from '../../../testing/fabricas';
import { criarPeriodo } from './periodo';
import { gerarRelatorio, primeiroRegistro } from './relatorio';
import { relatorioParaCsv } from './relatorio-csv';

const categorias = [
  umaCategoria({ id: 'casa', nome: 'Moradia' }),
  umaCategoria({ id: 'mercado', nome: 'Mercado' }),
  umaCategoria({ id: 'lazer', nome: 'Lazer' }),
  umaCategoria({ id: 'salario', nome: 'Salário', tipo: 'receita' }),
];
const contas = [umaConta({ id: 'c', saldoInicial: brl(100_000) })];
let n = 0;
const t = (tipo: 'receita' | 'despesa', valor: number, data: string, categoriaId: string) =>
  umaTransacao({ id: `t${++n}`, tipo, valor: brl(valor), data, categoriaId, contaId: 'c' });

/** US-006: 3º trimestre de 2026 comparado com o 2º. */
const transacoes = [
  t('receita', 500_000, '2026-05-05', 'salario'),
  t('despesa', 100_000, '2026-05-10', 'casa'),
  t('despesa', 50_000, '2026-06-10', 'lazer'),
  t('receita', 600_000, '2026-08-05', 'salario'),
  t('despesa', 120_000, '2026-08-10', 'casa'),
  t('despesa', 30_000, '2026-09-15', 'mercado'),
  t('despesa', 99_999, '2026-10-01', 'mercado'), // fora do trimestre
];
const cofrinhos = [
  umCofrinho({
    id: 'viagem',
    nome: 'Viagem',
    meta: brl(100_000),
    movimentacoes: [
      umaMovimentacao({ id: 'm1', valor: brl(40_000), data: '2026-06-01', contaId: 'c' }),
      umaMovimentacao({ id: 'm2', valor: brl(60_000), data: '2026-07-10', contaId: 'c' }),
      umaMovimentacao({
        id: 'm3',
        tipo: 'retirada',
        valor: brl(10_000),
        data: '2026-09-20',
        contaId: 'c',
      }),
    ],
  }),
  umCofrinho({
    id: 'antigo',
    nome: 'Antigo',
    encerradoEm: '2026-03-01T12:00:00.000Z',
  }),
];
const entrada = { contas, categorias, transacoes, cofrinhos };

describe('relatório (RF-050 a RF-052)', () => {
  const r = gerarRelatorio(entrada, criarPeriodo('trimestral', 2026, 3), '2026-11-08');

  it('totaliza o período e compara com o anterior equivalente', () => {
    expect(r.anterior.nome).toBe('2º trimestre de 2026');
    expect(r.emAndamento).toBe(false);
    expect(r.totais).toEqual({
      receitas: brl(600_000),
      despesas: brl(150_000),
      saldo: brl(450_000),
    });
    expect(r.totaisAnteriores).toEqual({
      receitas: brl(500_000),
      despesas: brl(150_000),
      saldo: brl(350_000),
    });
    expect(r.variacoes).toEqual({ receitas: 20, despesas: 0, saldo: 28.6 });
  });

  it('despesas por categoria com a comparação; a que só existia antes aparece zerada', () => {
    expect(
      r.categorias.map((c) => [
        c.nome,
        c.valor.unidades,
        c.percentual,
        c.valorAnterior.unidades,
        c.variacao,
      ]),
    ).toEqual([
      ['Moradia', 120_000, 80, 100_000, 20],
      ['Mercado', 30_000, 20, 0, null],
      ['Lazer', 0, 0, 50_000, -100],
    ]);
  });

  it('evolução patrimonial do início ao fim, com o fim de cada mês', () => {
    expect(r.patrimonio.pontos.map((p) => [p.data, p.valor.unidades])).toEqual([
      ['2026-06-30', 450_000],
      ['2026-07-31', 450_000],
      ['2026-08-31', 930_000],
      ['2026-09-30', 900_000],
    ]);
    expect(r.patrimonio.variacao).toEqual(brl(450_000));
  });

  it('cofrinhos que existiam no período, com o movimento dele e o saldo no fim', () => {
    expect(r.cofrinhos).toEqual([
      {
        id: 'viagem',
        nome: 'Viagem',
        depositos: brl(60_000),
        retiradas: brl(10_000),
        saldoFinal: brl(90_000),
        meta: brl(100_000),
        percentual: 90,
        situacao: 'andamento',
      },
    ]);
  });

  it('cofrinho criado depois, mas com movimentação retroativa, entra no período', () => {
    const tardio = umCofrinho({
      id: 'tardio',
      nome: 'Tardio',
      criadoEm: '2026-11-01T12:00:00.000Z',
      movimentacoes: [umaMovimentacao({ id: 'm9', data: '2026-08-01', contaId: 'c' })],
    });
    const comTardio = gerarRelatorio(
      { ...entrada, cofrinhos: [tardio] },
      criarPeriodo('trimestral', 2026, 3),
      '2026-11-08',
    );
    expect(comTardio.cofrinhos.map((c) => c.nome)).toEqual(['Tardio']);
    const antes = gerarRelatorio(
      { ...entrada, cofrinhos: [tardio] },
      criarPeriodo('trimestral', 2026, 2),
      '2026-11-08',
    );
    expect(antes.cofrinhos).toEqual([]);
  });

  it('período em andamento vai só até hoje', () => {
    const atual = gerarRelatorio(entrada, criarPeriodo('trimestral', 2026, 4), '2026-11-08');
    expect(atual.emAndamento).toBe(true);
    expect(atual.ate).toBe('2026-11-08');
    expect(atual.totais.despesas).toEqual(brl(99_999));
    expect(atual.patrimonio.pontos.at(-1)!.data).toBe('2026-11-08');
  });

  it('o relatório mensal mostra o patrimônio por semana', () => {
    const mes = gerarRelatorio(entrada, criarPeriodo('mensal', 2026, 8), '2026-11-08');
    expect(mes.patrimonio.pontos.map((p) => p.data)).toEqual([
      '2026-07-31',
      '2026-08-07',
      '2026-08-14',
      '2026-08-21',
      '2026-08-28',
      '2026-08-31',
    ]);
  });

  it('o primeiro registro limita os períodos', () => {
    expect(primeiroRegistro(entrada, '2026-11-08')).toBe('2026-05-05');
    expect(primeiroRegistro({ ...entrada, transacoes: [], cofrinhos: [] }, '2026-11-08')).toBe(
      '2026-11-08',
    );
  });
});

describe('relatório em CSV (RF-053)', () => {
  it('usa ";", vírgula decimal, BOM e CRLF', () => {
    const csv = relatorioParaCsv(
      gerarRelatorio(entrada, criarPeriodo('trimestral', 2026, 3), '2026-11-08'),
    );
    expect(csv.startsWith('﻿Relatório;3º trimestre de 2026\r\n')).toBe(true);
    expect(csv).toContain('\r\nReceitas;6000,00;5000,00;20\r\n');
    expect(csv).toContain('\r\nSaldo;4500,00;3500,00;28,6\r\n');
    expect(csv).toContain('\r\nViagem;600,00;100,00;900,00;1000,00;90;Em andamento\r\n');
  });

  it('neutraliza fórmulas e escapa aspas e ";" em nomes digitados', () => {
    const perigosas = [
      umaCategoria({ id: 'x', nome: '=HYPERLINK("http://exemplo.invalid")' }),
      umaCategoria({ id: 'y', nome: 'Casa; jardim' }),
    ];
    const csv = relatorioParaCsv(
      gerarRelatorio(
        {
          contas,
          categorias: perigosas,
          transacoes: [t('despesa', 100, '2026-08-01', 'x'), t('despesa', 100, '2026-08-02', 'y')],
          cofrinhos: [],
        },
        criarPeriodo('mensal', 2026, 8),
        '2026-11-08',
      ),
    );
    expect(csv).toContain(`\r\n"'=HYPERLINK(""http://exemplo.invalid"")";1,00;`);
    expect(csv).toContain('\r\n"Casa; jardim";1,00;');
  });
});
