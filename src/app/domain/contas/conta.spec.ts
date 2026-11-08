import { brl, umaConta } from '../../../testing/fabricas';
import { ErroDominio } from '../shared/erro-dominio';
import { validarConta } from './conta';

describe('validarConta (RF-016)', () => {
  const contas = [
    umaConta({ id: 'a', nome: 'Banco Exemplo' }),
    umaConta({ id: 'b', nome: 'Antiga', excluidoEm: '2026-01-02T00:00:00.000Z' }),
  ];

  it('aceita os quatro tipos e normaliza o nome', () => {
    for (const tipo of ['corrente', 'carteira', 'cartao', 'investimento'] as const) {
      expect(validarConta({ nome: ' Nova ', tipo, saldoInicial: brl(0) }, contas).nome).toBe(
        'Nova',
      );
    }
  });

  it('aceita saldo inicial negativo (ex.: dívida do cartão)', () => {
    expect(() =>
      validarConta({ nome: 'Cartão', tipo: 'cartao', saldoInicial: brl(-50_000) }, contas),
    ).not.toThrow();
  });

  it('recusa nome vazio ou repetido entre contas ativas', () => {
    expect(() =>
      validarConta({ nome: '', tipo: 'corrente', saldoInicial: brl(0) }, contas),
    ).toThrow(ErroDominio);
    expect(() =>
      validarConta({ nome: 'banco exemplo', tipo: 'corrente', saldoInicial: brl(0) }, contas),
    ).toThrow(/Já existe/);
    expect(() =>
      validarConta({ nome: 'Antiga', tipo: 'corrente', saldoInicial: brl(0) }, contas),
    ).not.toThrow();
  });

  it('recusa tipo desconhecido', () => {
    expect(() =>
      validarConta({ nome: 'X', tipo: 'poupanca' as never, saldoInicial: brl(0) }, contas),
    ).toThrow(/tipo/);
  });
});
