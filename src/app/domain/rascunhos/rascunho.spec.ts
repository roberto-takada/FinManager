import {
  DIAS_VALIDADE_RASCUNHO,
  expurgarRascunhos,
  guardarRascunho,
  type Rascunho,
  rascunhoExpirou,
  urlInterna,
} from './rascunho';

const rascunho = (id: string, atualizadoEm: string): Rascunho => ({
  id,
  titulo: 'Nova transação',
  url: '/transacoes/nova',
  valores: { valor: '12,50' },
  atualizadoEm,
});

describe('rascunhos (RN-002, RF-070)', () => {
  it(`expiram ${DIAS_VALIDADE_RASCUNHO} dias depois da última alteração`, () => {
    const r = rascunho('a', '2026-11-01T12:00:00.000Z');
    expect(rascunhoExpirou(r, new Date('2026-11-08T11:59:59.999Z'))).toBe(false);
    expect(rascunhoExpirou(r, new Date('2026-11-08T12:00:00.000Z'))).toBe(true);
  });

  it('o expurgo remove só os expirados', () => {
    const lista = [
      rascunho('velho', '2026-10-01T00:00:00.000Z'),
      rascunho('novo', '2026-11-07T00:00:00.000Z'),
    ];
    expect(expurgarRascunhos(lista, new Date('2026-11-08T12:00:00.000Z')).map((r) => r.id)).toEqual(
      ['novo'],
    );
  });

  it('guardar substitui o rascunho do mesmo formulário, sem duplicar', () => {
    const lista = guardarRascunho([rascunho('a', '2026-11-01T00:00:00.000Z')], {
      ...rascunho('a', '2026-11-02T00:00:00.000Z'),
      valores: { valor: '99,00' },
    });
    expect(lista).toHaveLength(1);
    expect(lista[0]!.valores).toEqual({ valor: '99,00' });
  });

  it('só aceita endereços internos do app', () => {
    expect(urlInterna('/transacoes/nova')).toBe(true);
    expect(urlInterna('/cofrinhos/1/movimentar?tipo=retirada')).toBe(true);
    expect(urlInterna('https://exemplo.com')).toBe(false);
    expect(urlInterna('//exemplo.com')).toBe(false);
    expect(urlInterna('/\\exemplo.com')).toBe(false);
    expect(urlInterna('transacoes')).toBe(false);
  });
});
