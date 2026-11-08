import { brl, umaConta, umaMovimentacao, umCofrinho } from '../../../testing/fabricas';
import { ErroDominio } from '../shared/erro-dominio';
import {
  type DadosCofrinho,
  efeitoNasContas,
  planejamento,
  progresso,
  saldoCofrinho,
  validarCofrinho,
  validarMovimentacao,
} from './cofrinho';

const HOJE = '2026-11-08';
const viagem: DadosCofrinho = {
  nome: ' Viagem ',
  meta: brl(600_000),
  prazo: '2027-11-08',
  icone: 'viagem',
  cor: 'azul',
};

const codigo = (fn: () => unknown) => {
  try {
    fn();
    return null;
  } catch (e) {
    return (e as ErroDominio).codigo;
  }
};

describe('validarCofrinho (RF-030)', () => {
  it('aceita nome, meta, prazo opcional, ícone e cor', () => {
    expect(validarCofrinho(viagem, [], HOJE).nome).toBe('Viagem');
    expect(() => validarCofrinho({ ...viagem, prazo: null }, [], HOJE)).not.toThrow();
  });

  it('recusa meta zero, prazo passado ou de hoje e ícone/cor desconhecidos', () => {
    expect(codigo(() => validarCofrinho({ ...viagem, meta: brl(0) }, [], HOJE))).toBe(
      'meta-invalida',
    );
    expect(codigo(() => validarCofrinho({ ...viagem, prazo: HOJE }, [], HOJE))).toBe(
      'prazo-passado',
    );
    expect(codigo(() => validarCofrinho({ ...viagem, prazo: '2026-02-30' }, [], HOJE))).toBe(
      'prazo-invalido',
    );
    expect(codigo(() => validarCofrinho({ ...viagem, icone: 'foguete' as never }, [], HOJE))).toBe(
      'icone-invalido',
    );
    expect(codigo(() => validarCofrinho({ ...viagem, cor: 'dourado' as never }, [], HOJE))).toBe(
      'cor-invalida',
    );
  });

  it('nome não pode repetir entre cofrinhos em andamento; encerrados liberam o nome', () => {
    const existente = umCofrinho({ id: 'a', nome: 'Viagem' });
    expect(codigo(() => validarCofrinho(viagem, [existente], HOJE))).toBe('nome-repetido');
    expect(() =>
      validarCofrinho(viagem, [{ ...existente, encerradoEm: '2026-10-01T00:00:00.000Z' }], HOJE),
    ).not.toThrow();
    expect(() => validarCofrinho(viagem, [existente], HOJE, 'a')).not.toThrow();
  });
});

describe('progresso (RF-032) e planejamento (RF-033) — US-005', () => {
  const novo = umCofrinho({ meta: brl(600_000), prazo: '2027-11-08' });

  it('cofrinho de R$ 6.000,00 com prazo de 12 meses: 0% e R$ 500,00 por mês', () => {
    expect(progresso(novo)).toEqual({
      saldo: brl(0),
      percentual: 0,
      restante: brl(600_000),
      metaAtingida: false,
    });
    expect(planejamento(novo, HOJE)).toEqual({
      situacao: 'no-prazo',
      meses: 12,
      porMes: brl(50_000),
    });
  });

  it('depositando R$ 600,00, o progresso passa a 10%', () => {
    const com600 = { ...novo, movimentacoes: [umaMovimentacao({ valor: brl(60_000) })] };
    expect(progresso(com600)).toMatchObject({
      saldo: brl(60_000),
      percentual: 10,
      restante: brl(540_000),
    });
    expect(planejamento(com600, HOJE)).toMatchObject({ porMes: brl(45_000) });
  });

  it('saldo considera retiradas', () => {
    const c = umCofrinho({
      movimentacoes: [
        umaMovimentacao({ id: '1', valor: brl(10_000) }),
        umaMovimentacao({ id: '2', tipo: 'retirada', valor: brl(2_500) }),
      ],
    });
    expect(saldoCofrinho(c)).toEqual(brl(7_500));
  });

  it('arredonda o valor mensal para cima ao centavo', () => {
    const c = umCofrinho({ meta: brl(100_000), prazo: '2027-02-08' }); // R$ 1.000 em 3 meses
    expect(planejamento(c, HOJE)).toEqual({ situacao: 'no-prazo', meses: 3, porMes: brl(33_334) });
  });

  it('prazo no mesmo mês conta como 1 mês', () => {
    expect(
      planejamento(umCofrinho({ meta: brl(100_000), prazo: '2026-11-30' }), HOJE),
    ).toMatchObject({ meses: 1, porMes: brl(100_000) });
  });

  it('sem prazo, prazo vencido e meta atingida', () => {
    expect(planejamento(umCofrinho({ prazo: null }), HOJE)).toEqual({ situacao: 'sem-prazo' });
    expect(planejamento(umCofrinho({ prazo: '2026-10-01', meta: brl(1_000) }), HOJE)).toEqual({
      situacao: 'prazo-vencido',
      restante: brl(1_000),
    });
    const cheio = umCofrinho({
      meta: brl(1_000),
      prazo: '2027-01-01',
      movimentacoes: [umaMovimentacao({ valor: brl(1_500) })],
    });
    expect(planejamento(cheio, HOJE)).toEqual({ situacao: 'meta-atingida' });
    expect(progresso(cheio)).toMatchObject({
      percentual: 150,
      restante: brl(0),
      metaAtingida: true,
    });
  });
});

describe('validarMovimentacao (RF-031)', () => {
  const contas = [umaConta({ id: 'cc' })];
  const comSaldo = umCofrinho({
    movimentacoes: [umaMovimentacao({ valor: brl(10_000), contaId: 'cc' })],
  });
  const mov = { tipo: 'deposito' as const, valor: brl(5_000), data: HOJE, contaId: 'cc' };

  it('aceita depósito e retirada até o saldo', () => {
    expect(() => validarMovimentacao(comSaldo, mov, contas, HOJE)).not.toThrow();
    expect(() =>
      validarMovimentacao(comSaldo, { ...mov, tipo: 'retirada', valor: brl(10_000) }, contas, HOJE),
    ).not.toThrow();
  });

  it('recusa retirada maior que o saldo, valor zero, data futura e conta inexistente', () => {
    expect(
      codigo(() =>
        validarMovimentacao(
          comSaldo,
          { ...mov, tipo: 'retirada', valor: brl(10_001) },
          contas,
          HOJE,
        ),
      ),
    ).toBe('saldo-insuficiente');
    expect(
      codigo(() => validarMovimentacao(comSaldo, { ...mov, valor: brl(0) }, contas, HOJE)),
    ).toBe('valor-invalido');
    expect(
      codigo(() => validarMovimentacao(comSaldo, { ...mov, data: '2026-11-09' }, contas, HOJE)),
    ).toBe('data-futura');
    expect(
      codigo(() => validarMovimentacao(comSaldo, { ...mov, contaId: 'x' }, contas, HOJE)),
    ).toBe('conta-inexistente');
  });

  it('não movimenta cofrinho encerrado', () => {
    const encerrado = { ...comSaldo, encerradoEm: '2026-11-01T00:00:00.000Z' };
    expect(codigo(() => validarMovimentacao(encerrado, mov, contas, HOJE))).toBe(
      'cofrinho-encerrado',
    );
  });
});

describe('efeitoNasContas', () => {
  it('depósito sai da conta, retirada volta; só até a data', () => {
    const c = umCofrinho({
      movimentacoes: [
        umaMovimentacao({ id: '1', valor: brl(10_000), contaId: 'cc', data: '2026-10-01' }),
        umaMovimentacao({
          id: '2',
          tipo: 'retirada',
          valor: brl(3_000),
          contaId: 'carteira',
          data: '2026-10-05',
        }),
        umaMovimentacao({ id: '3', valor: brl(1_000), contaId: 'cc', data: '2026-12-01' }),
      ],
    });
    expect(efeitoNasContas([c, umCofrinho({ id: 'vazio' })], '2026-11-08')).toEqual(
      new Map([
        ['cc', -10_000],
        ['carteira', 3_000],
      ]),
    );
  });
});
