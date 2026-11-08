import {
  chaveRecuperacaoValida,
  ChaveRecuperacaoInvalidaError,
  conferirGrupos,
  escolherGruposParaConfirmacao,
  formatarChaveRecuperacao,
  lerChaveRecuperacao,
  QUANTIDADE_GRUPOS,
} from './chave-recuperacao';

const bytesDeExemplo = () => Uint8Array.from({ length: 20 }, (_, i) => (i * 37 + 11) % 256);

describe('formatarChaveRecuperacao', () => {
  it('gera 8 grupos de 4 caracteres separados por hífen', () => {
    const chave = formatarChaveRecuperacao(bytesDeExemplo());
    expect(chave).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){7}$/);
  });

  it('nunca usa as letras I, L, O e U', () => {
    const chave = formatarChaveRecuperacao(new Uint8Array(20).fill(0xff));
    expect(chave).not.toMatch(/[ILOU]/);
  });

  it('rejeita quantidade de bytes diferente de 20', () => {
    expect(() => formatarChaveRecuperacao(new Uint8Array(16))).toThrow(
      ChaveRecuperacaoInvalidaError,
    );
  });
});

describe('lerChaveRecuperacao', () => {
  it('é o inverso de formatarChaveRecuperacao', () => {
    const bytes = bytesDeExemplo();
    expect(lerChaveRecuperacao(formatarChaveRecuperacao(bytes))).toEqual(bytes);
  });

  it('aceita minúsculas, espaços e sem hífens', () => {
    const bytes = bytesDeExemplo();
    const digitada = formatarChaveRecuperacao(bytes).toLowerCase().replace(/-/g, ' ');
    expect(lerChaveRecuperacao(digitada)).toEqual(bytes);
  });

  it('corrige letras confundíveis: O→0, I/L→1', () => {
    const bytes = new Uint8Array(20); // tudo zero → "0000-0000-..."
    expect(lerChaveRecuperacao('OOOO-oooo-0000-0000-0000-0000-0000-0000')).toEqual(bytes);
  });

  it.each([
    '',
    'ABCD',
    'UUUU-UUUU-UUUU-UUUU-UUUU-UUUU-UUUU-UUUU',
    '0000-0000-0000-0000-0000-0000-0000',
  ])('rejeita "%s"', (texto) => {
    expect(() => lerChaveRecuperacao(texto)).toThrow(ChaveRecuperacaoInvalidaError);
    expect(chaveRecuperacaoValida(texto)).toBe(false);
  });
});

describe('confirmação de que a chave foi guardada (RF-003)', () => {
  const chave = formatarChaveRecuperacao(bytesDeExemplo());
  const grupos = chave.split('-');

  it('sorteia dois grupos distintos e ordenados, dentro do intervalo', () => {
    for (let a = 0; a < QUANTIDADE_GRUPOS; a++) {
      for (let b = 0; b < QUANTIDADE_GRUPOS - 1; b++) {
        const valores = [a, b];
        const [x, y] = escolherGruposParaConfirmacao(() => valores.shift()!);
        expect(x).toBeLessThan(y);
        expect(x).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThan(QUANTIDADE_GRUPOS);
      }
    }
  });

  it('aceita os grupos corretos, mesmo em minúsculas', () => {
    expect(
      conferirGrupos(chave, [
        { indice: 1, valor: grupos[1]!.toLowerCase() },
        { indice: 6, valor: grupos[6]! },
      ]),
    ).toBe(true);
  });

  it('recusa grupo errado ou índice fora da chave', () => {
    expect(conferirGrupos(chave, [{ indice: 1, valor: grupos[2]! }])).toBe(false);
    expect(conferirGrupos(chave, [{ indice: 9, valor: '0000' }])).toBe(false);
  });
});
