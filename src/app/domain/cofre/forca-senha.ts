/**
 * Avaliação da força da senha mestra (RF-001).
 *
 * Estimativa simples de entropia: tamanho efetivo × log2(tamanho do alfabeto usado),
 * descontando repetições, sequências e palavras comuns. Não substitui um avaliador
 * completo, mas barra as senhas fracas mais frequentes sem adicionar dependências.
 */

export type NivelForca = 0 | 1 | 2 | 3 | 4;

export interface AvaliacaoSenha {
  readonly nivel: NivelForca;
  readonly rotulo: string;
  /** Se a senha atende à força mínima exigida para a senha mestra. */
  readonly aceitavel: boolean;
  readonly sugestoes: readonly string[];
}

export const TAMANHO_MINIMO_SENHA = 12;
export const NIVEL_MINIMO_SENHA: NivelForca = 3;

const ROTULOS: Record<NivelForca, string> = {
  0: 'Muito fraca',
  1: 'Fraca',
  2: 'Razoável',
  3: 'Forte',
  4: 'Muito forte',
};

/** Limites de entropia estimada (bits) para cada nível. */
const LIMITES_NIVEL: readonly [number, NivelForca][] = [
  [80, 4],
  [60, 3],
  [36, 2],
  [28, 1],
];

const PALAVRAS_COMUNS = [
  'senha',
  'password',
  'qwerty',
  'asdf',
  'abc123',
  'admin',
  'brasil',
  'iloveyou',
  'teamo',
  'amor',
  'deus',
  'jesus',
  'futebol',
  'flamengo',
  'corinthians',
  'palmeiras',
  'santos',
  'gremio',
  'internacional',
  'vasco',
  'cruzeiro',
  'botafogo',
  'saopaulo',
  'master',
  'dragon',
  'monkey',
  'letmein',
  'welcome',
  'finmanager',
  'mudar',
];

function tamanhoDoAlfabeto(caracteres: readonly string[]): number {
  let total = 0;
  if (caracteres.some((c) => /[a-z]/.test(c))) total += 26;
  if (caracteres.some((c) => /[A-Z]/.test(c))) total += 26;
  if (caracteres.some((c) => /[0-9]/.test(c))) total += 10;
  if (caracteres.some((c) => /[\x20-\x2f\x3a-\x40\x5b-\x60\x7b-\x7e]/.test(c))) total += 33;
  if (caracteres.some((c) => c.codePointAt(0)! > 0x7e)) total += 100;
  return total;
}

/** Conta caracteres "previsíveis": repetição do anterior ou continuação de sequência. */
function contarPrevisiveis(caracteres: readonly string[]): number {
  let previsiveis = 0;
  for (let i = 1; i < caracteres.length; i++) {
    const atual = caracteres[i]!.toLowerCase().codePointAt(0)!;
    const anterior = caracteres[i - 1]!.toLowerCase().codePointAt(0)!;
    if (Math.abs(atual - anterior) <= 1) previsiveis++;
  }
  return previsiveis;
}

function palavrasComunsEncontradas(senha: string): string[] {
  const minuscula = senha.toLowerCase();
  return PALAVRAS_COMUNS.filter((p) => minuscula.includes(p));
}

export function avaliarForcaSenha(senha: string): AvaliacaoSenha {
  const caracteres = [...senha];
  const sugestoes: string[] = [];

  if (caracteres.length < TAMANHO_MINIMO_SENHA) {
    sugestoes.push(`Use pelo menos ${TAMANHO_MINIMO_SENHA} caracteres.`);
  }

  const previsiveis = contarPrevisiveis(caracteres);
  if (previsiveis >= 3) {
    sugestoes.push('Evite repetições e sequências, como "aaa" ou "1234".');
  }

  const comuns = palavrasComunsEncontradas(senha);
  if (comuns.length > 0) {
    sugestoes.push('Evite palavras muito comuns em senhas, como "senha" ou nomes de times.');
  }

  const descontoPalavras = comuns.reduce((total, p) => total + p.length - 1, 0);
  const tamanhoEfetivo = Math.max(0, caracteres.length - previsiveis - descontoPalavras);
  const alfabeto = tamanhoDoAlfabeto(caracteres);
  const entropia = alfabeto > 0 ? tamanhoEfetivo * Math.log2(alfabeto) : 0;

  const nivel = LIMITES_NIVEL.find(([limite]) => entropia >= limite)?.[1] ?? 0;
  const aceitavel = caracteres.length >= TAMANHO_MINIMO_SENHA && nivel >= NIVEL_MINIMO_SENHA;

  if (!aceitavel && alfabeto <= 36) {
    sugestoes.push(
      'Misture letras maiúsculas, minúsculas, números e símbolos, ou use uma frase longa com várias palavras.',
    );
  }

  return { nivel, rotulo: ROTULOS[nivel], aceitavel, sugestoes };
}
