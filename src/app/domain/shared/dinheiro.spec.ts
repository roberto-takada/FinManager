import {
  dinheiro,
  dividirEmParcelas,
  formatarDinheiro,
  lerDinheiro,
  paraTextoEditavel,
  somar,
  somarTodos,
  subtrair,
} from './dinheiro';
import { ErroDominio } from './erro-dominio';

const brl = (unidades: number) => dinheiro(unidades, 'BRL');

describe('Dinheiro (RN-006)', () => {
  it('só aceita unidades inteiras', () => {
    expect(() => dinheiro(10.5)).toThrow(ErroDominio);
    expect(() => dinheiro(Number.MAX_SAFE_INTEGER + 2)).toThrow(ErroDominio);
  });

  it('soma e subtrai sem erro de ponto flutuante', () => {
    // 0,1 + 0,2 em float dá 0,30000000000000004
    expect(somar(brl(10), brl(20))).toEqual(brl(30));
    expect(subtrair(brl(10), brl(25))).toEqual(brl(-15));
    expect(somarTodos([brl(1), brl(2), brl(3)])).toEqual(brl(6));
  });

  it('não combina moedas diferentes', () => {
    expect(() => somar(brl(1), dinheiro(1, 'USD'))).toThrow(/combinar BRL com USD/);
  });

  describe('dividirEmParcelas', () => {
    it('coloca o resto dos centavos na 1ª parcela: R$ 100,00 em 3x', () => {
      expect(dividirEmParcelas(brl(10_000), 3)).toEqual([brl(3_334), brl(3_333), brl(3_333)]);
    });

    it('nunca perde nem cria centavos', () => {
      for (const [valor, partes] of [
        [1, 3],
        [999_99, 7],
        [10, 10],
        [5, 12],
      ] as const) {
        const parcelas = dividirEmParcelas(brl(valor), partes);
        expect(parcelas).toHaveLength(partes);
        expect(somarTodos(parcelas)).toEqual(brl(valor));
      }
    });

    it('recusa quantidade de parcelas inválida', () => {
      expect(() => dividirEmParcelas(brl(100), 0)).toThrow(ErroDominio);
      expect(() => dividirEmParcelas(brl(100), 1.5)).toThrow(ErroDominio);
    });
  });

  describe('lerDinheiro', () => {
    it.each([
      ['1234,56', 123_456],
      ['1.234,56', 123_456],
      ['1.234.567,8', 123_456_780],
      ['10', 1_000],
      ['0,5', 50],
      ['R$ 25,90', 2_590],
      ['-3,00', -300],
    ])('lê "%s" como %i centavos', (texto, unidades) => {
      expect(lerDinheiro(texto)).toEqual(brl(unidades));
    });

    it.each(['', 'abc', '1,234', '1.23', '12,,3', '1.2345,00', '1e3'])('recusa "%s"', (texto) => {
      expect(lerDinheiro(texto)).toBeNull();
    });

    it('respeita moedas sem casas decimais', () => {
      expect(lerDinheiro('1.500', 'JPY')).toEqual(dinheiro(1_500, 'JPY'));
      expect(lerDinheiro('15,5', 'JPY')).toBeNull();
    });
  });

  it('formata no padrão brasileiro', () => {
    expect(formatarDinheiro(brl(123_456)).replace(/\s/g, ' ')).toBe('R$ 1.234,56');
    expect(formatarDinheiro(brl(-5)).replace(/\s/g, ' ')).toBe('-R$ 0,05');
  });

  it('gera texto editável que pode ser lido de volta', () => {
    for (const unidades of [0, 5, 50, 123_456, -300]) {
      expect(lerDinheiro(paraTextoEditavel(brl(unidades)))).toEqual(brl(unidades));
    }
  });
});
