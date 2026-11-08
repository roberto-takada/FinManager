/**
 * Chave de recuperação (RF-003, RF-007, RN-013).
 *
 * 20 bytes aleatórios (160 bits) codificados em Base32 de Crockford: 32 caracteres em
 * 8 grupos de 4 (ex.: "7K2M-9QXR-..."). O alfabeto não tem I, L, O e U, o que evita
 * confusão ao anotar à mão; na leitura, I/L viram 1 e O vira 0.
 *
 * A geração dos bytes aleatórios fica na infraestrutura (Web Crypto); aqui só há
 * formatação, leitura e conferência.
 */

export const BYTES_CHAVE_RECUPERACAO = 20;
export const CARACTERES_POR_GRUPO = 4;
export const QUANTIDADE_GRUPOS = 8;

const ALFABETO = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const TAMANHO_TEXTO = CARACTERES_POR_GRUPO * QUANTIDADE_GRUPOS;

export class ChaveRecuperacaoInvalidaError extends Error {
  constructor() {
    super('Chave de recuperação inválida.');
    this.name = 'ChaveRecuperacaoInvalidaError';
  }
}

/** Converte os bytes da chave para o formato legível com grupos. */
export function formatarChaveRecuperacao(bytes: Uint8Array): string {
  if (bytes.length !== BYTES_CHAVE_RECUPERACAO) {
    throw new ChaveRecuperacaoInvalidaError();
  }
  let bits = 0;
  let acumulado = 0;
  let texto = '';
  for (const byte of bytes) {
    acumulado = (acumulado << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      texto += ALFABETO[(acumulado >> bits) & 0x1f];
    }
  }
  return agruparTexto(texto);
}

function agruparTexto(texto: string): string {
  const grupos: string[] = [];
  for (let i = 0; i < texto.length; i += CARACTERES_POR_GRUPO) {
    grupos.push(texto.slice(i, i + CARACTERES_POR_GRUPO));
  }
  return grupos.join('-');
}

/** Normaliza o que o usuário digitou: maiúsculas, sem espaços/hífens, I/L→1, O→0. */
export function normalizarTextoChave(texto: string): string {
  return texto.toUpperCase().replace(/[\s-]/g, '').replace(/[IL]/g, '1').replace(/O/g, '0');
}

/** Lê uma chave digitada e devolve os bytes. Lança erro se o formato for inválido. */
export function lerChaveRecuperacao(texto: string): Uint8Array<ArrayBuffer> {
  const normalizado = normalizarTextoChave(texto);
  if (normalizado.length !== TAMANHO_TEXTO) {
    throw new ChaveRecuperacaoInvalidaError();
  }
  const bytes = new Uint8Array(BYTES_CHAVE_RECUPERACAO);
  let bits = 0;
  let acumulado = 0;
  let posicao = 0;
  for (const caractere of normalizado) {
    const valor = ALFABETO.indexOf(caractere);
    if (valor < 0) throw new ChaveRecuperacaoInvalidaError();
    acumulado = ((acumulado << 5) | valor) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes[posicao++] = (acumulado >> bits) & 0xff;
    }
  }
  return bytes;
}

export function chaveRecuperacaoValida(texto: string): boolean {
  try {
    lerChaveRecuperacao(texto);
    return true;
  } catch {
    return false;
  }
}

/**
 * Sorteia dois grupos distintos (índices a partir de 0) para o usuário redigitar,
 * confirmando que anotou a chave (RF-003). `sortear(n)` deve devolver um inteiro em [0, n).
 */
export function escolherGruposParaConfirmacao(sortear: (n: number) => number): [number, number] {
  const primeiro = sortear(QUANTIDADE_GRUPOS);
  const segundo = (primeiro + 1 + sortear(QUANTIDADE_GRUPOS - 1)) % QUANTIDADE_GRUPOS;
  return primeiro < segundo ? [primeiro, segundo] : [segundo, primeiro];
}

/** Confere se os grupos redigitados correspondem aos da chave. */
export function conferirGrupos(
  chaveFormatada: string,
  respostas: readonly { indice: number; valor: string }[],
): boolean {
  const normalizada = normalizarTextoChave(chaveFormatada);
  return respostas.every(({ indice, valor }) => {
    const inicio = indice * CARACTERES_POR_GRUPO;
    const esperado = normalizada.slice(inicio, inicio + CARACTERES_POR_GRUPO);
    return esperado.length === CARACTERES_POR_GRUPO && normalizarTextoChave(valor) === esperado;
  });
}
