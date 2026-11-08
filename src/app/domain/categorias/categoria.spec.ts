import { umaCategoria } from '../../../testing/fabricas';
import { ErroDominio } from '../shared/erro-dominio';
import { ordenarComoArvore, rotuloCategoria, validarCategoria } from './categoria';

const categorias = [
  umaCategoria({ id: 'alim', nome: 'Alimentação' }),
  umaCategoria({ id: 'merc', nome: 'Mercado', paiId: 'alim' }),
  umaCategoria({ id: 'sal', nome: 'Salário', tipo: 'receita' }),
  umaCategoria({ id: 'lazer', nome: 'Lazer' }),
];

const codigo = (fn: () => unknown) => {
  try {
    fn();
    return null;
  } catch (e) {
    return (e as ErroDominio).codigo;
  }
};

describe('validarCategoria (RF-015)', () => {
  it('aceita categoria e subcategoria válidas', () => {
    expect(
      validarCategoria({ nome: ' Saúde ', tipo: 'despesa', paiId: null }, categorias).nome,
    ).toBe('Saúde');
    expect(
      validarCategoria({ nome: 'Padaria', tipo: 'despesa', paiId: 'alim' }, categorias).paiId,
    ).toBe('alim');
  });

  it('recusa nome vazio ou repetido no mesmo nível (ignorando acentos)', () => {
    expect(
      codigo(() => validarCategoria({ nome: ' ', tipo: 'despesa', paiId: null }, categorias)),
    ).toBe('nome-obrigatorio');
    expect(
      codigo(() =>
        validarCategoria({ nome: 'ALIMENTACAO', tipo: 'despesa', paiId: null }, categorias),
      ),
    ).toBe('nome-repetido');
  });

  it('permite o mesmo nome em outro nível ou tipo', () => {
    expect(() =>
      validarCategoria({ nome: 'Mercado', tipo: 'despesa', paiId: null }, categorias),
    ).not.toThrow();
    expect(() =>
      validarCategoria({ nome: 'Lazer', tipo: 'receita', paiId: null }, categorias),
    ).not.toThrow();
  });

  it('subcategoria: só um nível e mesmo tipo do pai', () => {
    expect(
      codigo(() => validarCategoria({ nome: 'X', tipo: 'despesa', paiId: 'merc' }, categorias)),
    ).toBe('pai-invalido');
    expect(
      codigo(() => validarCategoria({ nome: 'X', tipo: 'receita', paiId: 'alim' }, categorias)),
    ).toBe('pai-invalido');
    expect(
      codigo(() =>
        validarCategoria({ nome: 'X', tipo: 'despesa', paiId: 'nao-existe' }, categorias),
      ),
    ).toBe('pai-inexistente');
  });

  it('categoria com subcategorias não pode virar subcategoria', () => {
    expect(
      codigo(() =>
        validarCategoria(
          { nome: 'Alimentação', tipo: 'despesa', paiId: 'lazer' },
          categorias,
          'alim',
        ),
      ),
    ).toBe('pai-invalido');
  });

  it('na edição, o próprio nome não conta como repetido', () => {
    expect(() =>
      validarCategoria({ nome: 'Lazer', tipo: 'despesa', paiId: null }, categorias, 'lazer'),
    ).not.toThrow();
  });
});

describe('exibição', () => {
  it('mostra o caminho da subcategoria', () => {
    expect(rotuloCategoria(categorias[1]!, categorias)).toBe('Alimentação › Mercado');
  });

  it('ordena como árvore, pais em ordem alfabética seguidos das filhas', () => {
    expect(ordenarComoArvore(categorias).map((c) => c.id)).toEqual([
      'alim',
      'merc',
      'lazer',
      'sal',
    ]);
  });
});
