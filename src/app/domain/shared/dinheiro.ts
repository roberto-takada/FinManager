import { ErroDominio } from './erro-dominio';

/**
 * Objeto de valor monetário (RN-006, RN-007, ENGENHARIA_DE_SOFTWARE §5.1).
 * O valor fica em **unidades mínimas inteiras** da moeda (centavos para BRL) e nunca em
 * ponto flutuante. A moeda é um código ISO 4217.
 */
export interface Dinheiro {
  readonly unidades: number;
  readonly moeda: string;
}

/** Moeda do app enquanto a escolha de moeda (RF-110) não existe. */
export const MOEDA_PADRAO = 'BRL';

export function dinheiro(unidades: number, moeda = MOEDA_PADRAO): Dinheiro {
  if (!Number.isSafeInteger(unidades)) {
    throw new ErroDominio('valor-invalido', 'O valor precisa ser um número inteiro de centavos.');
  }
  return { unidades, moeda };
}

export const zero = (moeda = MOEDA_PADRAO): Dinheiro => dinheiro(0, moeda);

function mesmaMoeda(a: Dinheiro, b: Dinheiro): void {
  if (a.moeda !== b.moeda) {
    throw new ErroDominio(
      'moedas-diferentes',
      `Não é possível combinar ${a.moeda} com ${b.moeda}.`,
    );
  }
}

export function somar(a: Dinheiro, b: Dinheiro): Dinheiro {
  mesmaMoeda(a, b);
  return dinheiro(a.unidades + b.unidades, a.moeda);
}

export function subtrair(a: Dinheiro, b: Dinheiro): Dinheiro {
  mesmaMoeda(a, b);
  return dinheiro(a.unidades - b.unidades, a.moeda);
}

export function somarTodos(valores: readonly Dinheiro[], moeda = MOEDA_PADRAO): Dinheiro {
  return valores.reduce(somar, zero(moeda));
}

export const ehPositivo = (valor: Dinheiro) => valor.unidades > 0;

/**
 * Divide um valor em `partes` sem perder nem criar centavos.
 * O resto vai para a **primeira** parcela: R$ 100,00 em 3x → 33,34 + 33,33 + 33,33.
 */
export function dividirEmParcelas(valor: Dinheiro, partes: number): Dinheiro[] {
  if (!Number.isInteger(partes) || partes < 1) {
    throw new ErroDominio('parcelas-invalidas', 'A quantidade de parcelas precisa ser 1 ou mais.');
  }
  const base = Math.trunc(valor.unidades / partes);
  const resto = valor.unidades - base * partes;
  return Array.from({ length: partes }, (_, i) =>
    dinheiro(i === 0 ? base + resto : base, valor.moeda),
  );
}

/** Casas decimais da moeda (2 para BRL/USD, 0 para JPY...). */
export function casasDecimais(moeda: string): number {
  return (
    new Intl.NumberFormat('en', { style: 'currency', currency: moeda }).resolvedOptions()
      .maximumFractionDigits ?? 2
  );
}

/** Formata para exibição, ex.: "R$ 1.234,56". */
export function formatarDinheiro(valor: Dinheiro, localidade = 'pt-BR'): string {
  const casas = casasDecimais(valor.moeda);
  return new Intl.NumberFormat(localidade, { style: 'currency', currency: valor.moeda }).format(
    valor.unidades / 10 ** casas,
  );
}

/** Valor para preencher um campo de edição, ex.: "1234,56". */
export function paraTextoEditavel(valor: Dinheiro): string {
  const casas = casasDecimais(valor.moeda);
  const negativo = valor.unidades < 0;
  const absoluto = Math.abs(valor.unidades)
    .toString()
    .padStart(casas + 1, '0');
  const inteiro = casas > 0 ? absoluto.slice(0, -casas) : absoluto;
  const fracao = casas > 0 ? `,${absoluto.slice(-casas)}` : '';
  return `${negativo ? '-' : ''}${inteiro}${fracao}`;
}

/**
 * Lê um valor digitado no formato brasileiro ("1.234,56", "1234,5", "R$ 10") sem passar
 * por ponto flutuante. Devolve `null` se o texto não for um valor válido.
 */
export function lerDinheiro(texto: string, moeda = MOEDA_PADRAO): Dinheiro | null {
  const limpo = texto.replace(/\s/g, '').replace(/^R\$/i, '');
  const correspondencia = /^(-?)(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d+))?$/.exec(limpo);
  if (!correspondencia) return null;
  const [, sinal, inteiroComPontos, fracaoDigitada = ''] = correspondencia;
  const casas = casasDecimais(moeda);
  if (fracaoDigitada.length > casas) return null;
  const inteiro = inteiroComPontos!.replace(/\./g, '');
  const unidades = Number(inteiro + fracaoDigitada.padEnd(casas, '0'));
  if (!Number.isSafeInteger(unidades)) return null;
  return dinheiro(sinal === '-' ? -unidades : unidades, moeda);
}
