import { brl, umaCategoria, umaConta, umaContaAgendada } from '../../../testing/fabricas';
import { ErroDominio } from '../shared/erro-dominio';
import {
  type DadosContaAgendada,
  ehAlteracaoSignificativaConta,
  ehVencimentoDaConta,
  ocorrenciasNoPeriodo,
  rotuloSituacao,
  situacaoDaOcorrencia,
  validarContaAgendada,
  vencimentosNoPeriodo,
} from './conta-agendada';

const categorias = [
  umaCategoria({ id: 'casa', nome: 'Contas da casa' }),
  umaCategoria({ id: 'sal', nome: 'Salário', tipo: 'receita' }),
];
const contas = [umaConta({ id: 'cc' })];

const luz: DadosContaAgendada = {
  tipo: 'pagar',
  descricao: ' Conta de luz ',
  valor: brl(18_000),
  vencimento: '2026-11-10',
  categoriaId: 'casa',
  contaId: 'cc',
  recorrencia: null,
};

const codigo = (fn: () => unknown) => {
  try {
    fn();
    return null;
  } catch (e) {
    return (e as ErroDominio).codigo;
  }
};

describe('validarContaAgendada (RF-020)', () => {
  it('aceita conta a pagar com valor, vencimento, descrição e categoria', () => {
    expect(validarContaAgendada(luz, categorias, contas).descricao).toBe('Conta de luz');
  });

  it('a conta financeira é opcional (escolhida ao pagar)', () => {
    expect(() => validarContaAgendada({ ...luz, contaId: null }, categorias, contas)).not.toThrow();
  });

  it('recusa valor zero, descrição vazia, data inválida e conta inexistente', () => {
    expect(codigo(() => validarContaAgendada({ ...luz, valor: brl(0) }, categorias, contas))).toBe(
      'valor-invalido',
    );
    expect(codigo(() => validarContaAgendada({ ...luz, descricao: ' ' }, categorias, contas))).toBe(
      'descricao-obrigatoria',
    );
    expect(
      codigo(() => validarContaAgendada({ ...luz, vencimento: '2026-02-30' }, categorias, contas)),
    ).toBe('vencimento-invalido');
    expect(codigo(() => validarContaAgendada({ ...luz, contaId: 'x' }, categorias, contas))).toBe(
      'conta-inexistente',
    );
  });

  it('a categoria precisa combinar com o tipo: despesa a pagar, receita a receber', () => {
    expect(
      codigo(() => validarContaAgendada({ ...luz, categoriaId: 'sal' }, categorias, contas)),
    ).toBe('categoria-tipo');
    expect(() =>
      validarContaAgendada({ ...luz, tipo: 'receber', categoriaId: 'sal' }, categorias, contas),
    ).not.toThrow();
  });

  it('recorrência: frequência válida e fim não anterior ao primeiro vencimento', () => {
    expect(
      codigo(() =>
        validarContaAgendada(
          { ...luz, recorrencia: { frequencia: 'mensal', fim: '2026-10-01' } },
          categorias,
          contas,
        ),
      ),
    ).toBe('fim-invalido');
    expect(
      codigo(() =>
        validarContaAgendada(
          { ...luz, recorrencia: { frequencia: 'diaria' as never, fim: null } },
          categorias,
          contas,
        ),
      ),
    ).toBe('frequencia-invalida');
  });
});

describe('vencimentos (RF-020, RF-021)', () => {
  it('conta única tem um só vencimento', () => {
    expect(vencimentosNoPeriodo(luz, '2026-11-01', '2026-11-30')).toEqual(['2026-11-10']);
    expect(vencimentosNoPeriodo(luz, '2026-12-01', '2026-12-31')).toEqual([]);
  });

  it('conta mensal no dia 31 respeita meses curtos e a data final', () => {
    const aluguel = {
      ...luz,
      vencimento: '2026-01-31',
      recorrencia: { frequencia: 'mensal' as const, fim: '2026-04-30' },
    };
    expect(vencimentosNoPeriodo(aluguel, '2026-01-01', '2026-12-31')).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ]);
    expect(ehVencimentoDaConta(aluguel, '2026-02-28')).toBe(true);
    expect(ehVencimentoDaConta(aluguel, '2026-02-27')).toBe(false);
  });
});

describe('situação das ocorrências (RF-022, RF-023)', () => {
  const conta = umaContaAgendada({
    id: 'luz',
    vencimento: '2026-09-10',
    recorrencia: { frequencia: 'mensal', fim: null },
    pagamentos: [
      { vencimento: '2026-09-10', transacaoId: 't-set' },
      { vencimento: '2026-10-10', transacaoId: 't-out-excluida' },
    ],
  });
  const ativas = new Set(['t-set']);

  it('paga quando há transação ativa; vencida no passado; pendente a partir de hoje', () => {
    expect(situacaoDaOcorrencia(conta, '2026-09-10', ativas, '2026-11-08')).toBe('paga');
    expect(situacaoDaOcorrencia(conta, '2026-10-10', ativas, '2026-11-08')).toBe('vencida');
    expect(situacaoDaOcorrencia(conta, '2026-11-10', ativas, '2026-11-08')).toBe('pendente');
    expect(situacaoDaOcorrencia(conta, '2026-11-08', ativas, '2026-11-08')).toBe('pendente'); // vence hoje
  });

  it('se a transação do pagamento for excluída, a ocorrência volta a ficar em aberto', () => {
    expect(
      situacaoDaOcorrencia(conta, '2026-10-10', new Set(['t-out-excluida']), '2026-11-08'),
    ).toBe('paga');
    expect(situacaoDaOcorrencia(conta, '2026-10-10', new Set(), '2026-11-08')).toBe('vencida');
  });

  it('lista ocorrências do período em ordem, ignorando contas excluídas', () => {
    const excluida = umaContaAgendada({
      id: 'velha',
      vencimento: '2026-11-05',
      excluidoEm: '2026-11-01T00:00:00.000Z',
    });
    const lista = ocorrenciasNoPeriodo(
      [conta, excluida],
      '2026-09-01',
      '2026-11-30',
      ativas,
      '2026-11-08',
    );
    expect(lista.map((o) => [o.vencimento, o.situacao])).toEqual([
      ['2026-09-10', 'paga'],
      ['2026-10-10', 'vencida'],
      ['2026-11-10', 'pendente'],
    ]);
    expect(lista[0]!.transacaoId).toBe('t-set');
  });

  it('rótulos em texto, com "Recebida" para contas a receber', () => {
    expect(rotuloSituacao('pagar', 'paga')).toBe('Paga');
    expect(rotuloSituacao('receber', 'paga')).toBe('Recebida');
    expect(rotuloSituacao('receber', 'vencida')).toBe('Vencida');
    expect(rotuloSituacao('pagar', 'pendente')).toBe('Pendente');
  });
});

describe('ehAlteracaoSignificativaConta (RN-003, RN-004)', () => {
  it('valor, vencimento, tipo ou repetição são significativos; descrição e categoria não', () => {
    expect(ehAlteracaoSignificativaConta(luz, { ...luz, valor: brl(1) })).toBe(true);
    expect(ehAlteracaoSignificativaConta(luz, { ...luz, vencimento: '2026-11-11' })).toBe(true);
    expect(
      ehAlteracaoSignificativaConta(luz, {
        ...luz,
        recorrencia: { frequencia: 'mensal', fim: null },
      }),
    ).toBe(true);
    expect(
      ehAlteracaoSignificativaConta(luz, { ...luz, descricao: 'Energia', contaId: null }),
    ).toBe(false);
  });
});
