import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  endOfMonth,
  format,
  isValid,
  parseISO,
  startOfMonth,
} from 'date-fns';

/**
 * Datas de calendário no formato "AAAA-MM-DD", sem horário nem fuso. Evitam que uma
 * transação "mude de dia" ao abrir o app em outro fuso horário.
 */
export type DataISO = string;

const FORMATO = 'yyyy-MM-dd';

export function ehDataISO(texto: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(texto) && isValid(parseISO(texto)) && paraData(texto) === texto;
}

function paraData(texto: string): string {
  return format(parseISO(texto), FORMATO);
}

/** Data local (do computador do usuário) de um instante. */
export function dataLocal(instante: Date): DataISO {
  return format(instante, FORMATO);
}

/**
 * Soma meses ajustando o fim do mês: 31/01 + 1 mês = 28/02 (ou 29/02).
 * Para séries (parcelas, recorrências), sempre some a partir da data original,
 * nunca de forma acumulada, para não "perder" o dia 31.
 */
export function somarMeses(data: DataISO, meses: number): DataISO {
  return format(addMonths(parseISO(data), meses), FORMATO);
}

export function somarSemanas(data: DataISO, semanas: number): DataISO {
  return format(addWeeks(parseISO(data), semanas), FORMATO);
}

export function somarAnos(data: DataISO, anos: number): DataISO {
  return format(addYears(parseISO(data), anos), FORMATO);
}

export function somarDias(data: DataISO, dias: number): DataISO {
  return format(addDays(parseISO(data), dias), FORMATO);
}

/** Datas ISO são comparáveis como texto. */
export const compararDatas = (a: DataISO, b: DataISO) => (a < b ? -1 : a > b ? 1 : 0);

export function formatarData(data: DataISO, localidade = 'pt-BR'): string {
  return parseISO(data).toLocaleDateString(localidade);
}

/** Primeiro e último dia do mês da data. */
export function intervaloDoMes(data: DataISO): [DataISO, DataISO] {
  const d = parseISO(data);
  return [format(startOfMonth(d), FORMATO), format(endOfMonth(d), FORMATO)];
}

/** Nome do mês por extenso, ex.: "novembro de 2026" ou só "outubro". */
export function nomeDoMes(data: DataISO, comAno = true): string {
  return parseISO(data).toLocaleDateString(
    'pt-BR',
    comAno ? { month: 'long', year: 'numeric' } : { month: 'long' },
  );
}

/** Variação percentual com uma casa decimal; `null` quando a base é zero. */
export function variacaoPercentual(atual: number, anterior: number): number | null {
  if (anterior === 0) return null;
  return Math.round(((atual - anterior) / Math.abs(anterior)) * 1000) / 10;
}
