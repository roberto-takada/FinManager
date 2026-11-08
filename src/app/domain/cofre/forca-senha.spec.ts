import { avaliarForcaSenha, TAMANHO_MINIMO_SENHA } from './forca-senha';

describe('avaliarForcaSenha', () => {
  it.each(['', '123456', 'senha', 'abc'])('classifica "%s" como muito fraca', (senha) => {
    const resultado = avaliarForcaSenha(senha);
    expect(resultado.nivel).toBe(0);
    expect(resultado.aceitavel).toBe(false);
  });

  it(`rejeita senhas com menos de ${TAMANHO_MINIMO_SENHA} caracteres, mesmo variadas`, () => {
    const resultado = avaliarForcaSenha('Xk9#mQ2!pL');
    expect(resultado.aceitavel).toBe(false);
    expect(resultado.sugestoes).toContain(`Use pelo menos ${TAMANHO_MINIMO_SENHA} caracteres.`);
  });

  it('rejeita senha longa só com letras minúsculas', () => {
    expect(avaliarForcaSenha('xkqmvbtrwzpj').aceitavel).toBe(false);
  });

  it('aceita senha de 12 caracteres variados', () => {
    const resultado = avaliarForcaSenha('Xk9#mQ2!pL7&');
    expect(resultado.aceitavel).toBe(true);
    expect(resultado.nivel).toBeGreaterThanOrEqual(3);
  });

  it('aceita frase longa com várias palavras', () => {
    const resultado = avaliarForcaSenha('cavalo azul come bateria no telhado');
    expect(resultado.nivel).toBe(4);
    expect(resultado.aceitavel).toBe(true);
  });

  it('penaliza repetições e sequências', () => {
    const resultado = avaliarForcaSenha('aaaaaaaa1234567');
    expect(resultado.aceitavel).toBe(false);
    expect(resultado.sugestoes.join(' ')).toMatch(/repetições e sequências/);
  });

  it('penaliza palavras comuns', () => {
    const resultado = avaliarForcaSenha('Senha@Flamengo');
    expect(resultado.aceitavel).toBe(false);
    expect(resultado.sugestoes.join(' ')).toMatch(/palavras muito comuns/);
  });

  it('conta caracteres acentuados e emojis como pontos de código', () => {
    expect(avaliarForcaSenha('ação'.repeat(1)).aceitavel).toBe(false);
    expect(avaliarForcaSenha('Pão de queijo é ótimo!').aceitavel).toBe(true);
  });

  it('fornece um rótulo legível para cada nível', () => {
    expect(avaliarForcaSenha('').rotulo).toBe('Muito fraca');
    expect(avaliarForcaSenha('cavalo azul come bateria no telhado').rotulo).toBe('Muito forte');
  });
});
