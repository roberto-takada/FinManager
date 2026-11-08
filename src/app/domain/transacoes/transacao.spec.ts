import { brl, umaCategoria, umaConta, umaTransacao } from '../../../testing/fabricas';
import { somarTodos } from '../shared/dinheiro';
import { ErroDominio } from '../shared/erro-dominio';
import {
  calcularSaldos,
  type DadosTransacao,
  descricaoExibida,
  ehAlteracaoSignificativa,
  filtrarTransacoes,
  gerarParcelas,
  totalizar,
  validarTransacao,
} from './transacao';

const contas = [
  umaConta({ id: 'cc' }),
  umaConta({ id: 'cart', nome: 'Carteira', tipo: 'carteira' }),
];
const categorias = [
  umaCategoria({ id: 'alim', nome: 'Alimentação' }),
  umaCategoria({ id: 'merc', nome: 'Mercado', paiId: 'alim' }),
  umaCategoria({ id: 'rest', nome: 'Restaurantes', paiId: 'alim' }),
  umaCategoria({ id: 'sal', nome: 'Salário', tipo: 'receita' }),
  umaCategoria({ id: 'velha', nome: 'Excluída', excluidoEm: '2026-01-02T00:00:00.000Z' }),
];

const despesa: DadosTransacao = {
  tipo: 'despesa',
  valor: brl(12_000),
  data: '2026-11-05',
  descricao: '  Mercado do mês  ',
  categoriaId: 'merc',
  contaId: 'cc',
  contaDestinoId: null,
};

const codigoDoErro = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as ErroDominio).codigo;
  }
  return null;
};

describe('validarTransacao (RF-010, US-001)', () => {
  it('aceita uma despesa válida e normaliza a descrição', () => {
    expect(validarTransacao(despesa, contas, categorias).descricao).toBe('Mercado do mês');
  });

  it.each([0, -100])('recusa valor %i com mensagem no campo "valor"', (unidades) => {
    try {
      validarTransacao({ ...despesa, valor: brl(unidades) }, contas, categorias);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ErroDominio);
      expect((e as ErroDominio).campo).toBe('valor');
      expect((e as ErroDominio).message).toBe('Informe um valor maior que zero.');
    }
  });

  it('recusa data inválida, conta inexistente e categoria ausente', () => {
    expect(
      codigoDoErro(() => validarTransacao({ ...despesa, data: '2026-02-30' }, contas, categorias)),
    ).toBe('data-invalida');
    expect(
      codigoDoErro(() => validarTransacao({ ...despesa, contaId: 'x' }, contas, categorias)),
    ).toBe('conta-inexistente');
    expect(
      codigoDoErro(() => validarTransacao({ ...despesa, categoriaId: null }, contas, categorias)),
    ).toBe('categoria-inexistente');
  });

  it('recusa categoria excluída ou de outro tipo', () => {
    expect(
      codigoDoErro(() =>
        validarTransacao({ ...despesa, categoriaId: 'velha' }, contas, categorias),
      ),
    ).toBe('categoria-inexistente');
    expect(
      codigoDoErro(() => validarTransacao({ ...despesa, categoriaId: 'sal' }, contas, categorias)),
    ).toBe('categoria-tipo');
  });

  describe('transferência (RF-017)', () => {
    const transferencia: DadosTransacao = {
      ...despesa,
      tipo: 'transferencia',
      categoriaId: 'merc',
      contaDestinoId: 'cart',
    };

    it('não usa categoria', () => {
      expect(validarTransacao(transferencia, contas, categorias).categoriaId).toBeNull();
    });

    it('exige conta de destino diferente da origem', () => {
      expect(
        codigoDoErro(() =>
          validarTransacao({ ...transferencia, contaDestinoId: null }, contas, categorias),
        ),
      ).toBe('destino-inexistente');
      expect(
        codigoDoErro(() =>
          validarTransacao({ ...transferencia, contaDestinoId: 'cc' }, contas, categorias),
        ),
      ).toBe('destino-igual');
    });
  });
});

describe('ehAlteracaoSignificativa (RN-005 b)', () => {
  it('valor, data ou tipo alterados são significativos', () => {
    expect(ehAlteracaoSignificativa(despesa, { ...despesa, valor: brl(1) })).toBe(true);
    expect(ehAlteracaoSignificativa(despesa, { ...despesa, data: '2026-11-06' })).toBe(true);
    expect(ehAlteracaoSignificativa(despesa, { ...despesa, tipo: 'receita' })).toBe(true);
  });

  it('descrição, categoria ou conta alteradas não são', () => {
    expect(
      ehAlteracaoSignificativa(despesa, {
        ...despesa,
        descricao: 'outra',
        categoriaId: 'rest',
        contaId: 'cart',
      }),
    ).toBe(false);
  });
});

describe('gerarParcelas (RF-013)', () => {
  it('divide em parcelas mensais com o resto na 1ª e guarda a data da compra', () => {
    const parcelas = gerarParcelas({ ...despesa, valor: brl(10_000), data: '2026-01-31' }, 3, 'g1');

    expect(parcelas.map((p) => p.dados.valor)).toEqual([brl(3_334), brl(3_333), brl(3_333)]);
    expect(parcelas.map((p) => p.dados.data)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
    expect(parcelas.map((p) => p.parcela)).toEqual([
      { grupoId: 'g1', numero: 1, total: 3, dataCompra: '2026-01-31' },
      { grupoId: 'g1', numero: 2, total: 3, dataCompra: '2026-01-31' },
      { grupoId: 'g1', numero: 3, total: 3, dataCompra: '2026-01-31' },
    ]);
    expect(somarTodos(parcelas.map((p) => p.dados.valor))).toEqual(brl(10_000));
  });

  it('só parcela despesas, entre 2 e 48 vezes', () => {
    expect(codigoDoErro(() => gerarParcelas({ ...despesa, tipo: 'receita' }, 3, 'g'))).toBe(
      'parcela-tipo',
    );
    expect(codigoDoErro(() => gerarParcelas(despesa, 1, 'g'))).toBe('parcelas-invalidas');
    expect(codigoDoErro(() => gerarParcelas(despesa, 49, 'g'))).toBe('parcelas-invalidas');
  });

  it('exibe a parcela na descrição', () => {
    const t = umaTransacao({
      descricao: 'Geladeira',
      parcela: { grupoId: 'g', numero: 3, total: 10, dataCompra: '2026-01-01' },
    });
    expect(descricaoExibida(t)).toBe('Geladeira (3/10)');
  });
});

describe('filtrarTransacoes (RF-014)', () => {
  const lista = [
    umaTransacao({
      id: 'a',
      data: '2026-10-01',
      descricao: 'Pão de açúcar',
      categoriaId: 'merc',
      contaId: 'cc',
    }),
    umaTransacao({
      id: 'b',
      data: '2026-10-15',
      descricao: 'Pizzaria',
      categoriaId: 'rest',
      contaId: 'cart',
    }),
    umaTransacao({
      id: 'c',
      data: '2026-11-05',
      tipo: 'receita',
      descricao: 'Salário',
      categoriaId: 'sal',
      contaId: 'cc',
    }),
    umaTransacao({
      id: 'd',
      data: '2026-11-06',
      tipo: 'transferencia',
      descricao: 'Saque',
      categoriaId: null,
      contaId: 'cc',
      contaDestinoId: 'cart',
    }),
    umaTransacao({
      id: 'e',
      data: '2026-11-07',
      descricao: 'Excluída',
      excluidoEm: '2026-11-08T00:00:00.000Z',
    }),
  ];
  const ids = (filtro: Parameters<typeof filtrarTransacoes>[1]) =>
    filtrarTransacoes(lista, filtro, categorias).map((t) => t.id);

  it('sem filtros, lista as ativas da mais recente para a mais antiga', () => {
    expect(ids({})).toEqual(['d', 'c', 'b', 'a']);
  });

  it('filtra por período (inclusive)', () => {
    expect(ids({ de: '2026-10-15', ate: '2026-11-05' })).toEqual(['c', 'b']);
  });

  it('filtra por tipo e por conta (inclui transferências recebidas)', () => {
    expect(ids({ tipo: 'despesa' })).toEqual(['b', 'a']);
    expect(ids({ contaId: 'cart' })).toEqual(['d', 'b']);
  });

  it('categoria-pai inclui as subcategorias', () => {
    expect(ids({ categoriaId: 'alim' })).toEqual(['b', 'a']);
    expect(ids({ categoriaId: 'rest' })).toEqual(['b']);
  });

  it('busca por texto sem diferenciar acentos e maiúsculas, também no nome da categoria', () => {
    expect(ids({ texto: 'ACUCAR' })).toEqual(['a']);
    expect(ids({ texto: 'restaurantes' })).toEqual(['b']);
  });
});

describe('totais e saldos', () => {
  const lista = [
    umaTransacao({
      id: '1',
      tipo: 'receita',
      valor: brl(500_000),
      data: '2026-11-05',
      contaId: 'cc',
    }),
    umaTransacao({
      id: '2',
      tipo: 'despesa',
      valor: brl(12_050),
      data: '2026-11-06',
      contaId: 'cc',
    }),
    umaTransacao({
      id: '3',
      tipo: 'transferencia',
      valor: brl(20_000),
      data: '2026-11-07',
      contaId: 'cc',
      contaDestinoId: 'cart',
      categoriaId: null,
    }),
    umaTransacao({
      id: '4',
      tipo: 'despesa',
      valor: brl(3_000),
      data: '2026-12-10',
      contaId: 'cart',
    }),
    umaTransacao({
      id: '5',
      tipo: 'despesa',
      valor: brl(99_999),
      excluidoEm: '2026-11-08T00:00:00.000Z',
    }),
  ];

  it('transferências não entram em receitas e despesas (RF-017)', () => {
    expect(totalizar(lista)).toEqual({
      receitas: brl(500_000),
      despesas: brl(15_050),
      resultado: brl(484_950),
    });
  });

  it('saldo considera saldo inicial, transferências e só transações até a data', () => {
    const saldos = calcularSaldos(
      [
        umaConta({ id: 'cc', saldoInicial: brl(10_000) }),
        umaConta({ id: 'cart', saldoInicial: brl(0) }),
      ],
      lista,
      '2026-11-30',
    );
    expect(saldos.get('cc')).toEqual(brl(10_000 + 500_000 - 12_050 - 20_000));
    expect(saldos.get('cart')).toEqual(brl(20_000)); // a despesa de dezembro ainda não conta
  });
});
