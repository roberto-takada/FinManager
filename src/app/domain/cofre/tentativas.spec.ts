import { ATRASO_MAXIMO_MS, atrasoAposFalhas } from './tentativas';

describe('atrasoAposFalhas (RNF-006)', () => {
  it('não atrasa as duas primeiras tentativas erradas', () => {
    expect(atrasoAposFalhas(0)).toBe(0);
    expect(atrasoAposFalhas(1)).toBe(0);
    expect(atrasoAposFalhas(2)).toBe(0);
  });

  it('dobra o atraso a cada nova falha', () => {
    expect(atrasoAposFalhas(3)).toBe(2_000);
    expect(atrasoAposFalhas(4)).toBe(4_000);
    expect(atrasoAposFalhas(5)).toBe(8_000);
  });

  it(`limita o atraso a ${ATRASO_MAXIMO_MS / 1000} segundos`, () => {
    expect(atrasoAposFalhas(10)).toBe(ATRASO_MAXIMO_MS);
    expect(atrasoAposFalhas(1000)).toBe(ATRASO_MAXIMO_MS);
  });
});
