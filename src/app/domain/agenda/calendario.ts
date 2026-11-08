import {
  addDays,
  addMonths,
  addWeeks,
  endOfMonth,
  endOfWeek,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import type { DataISO } from '../shared/data';

/**
 * Grade do calendário (RF-021). A semana começa no domingo, como nos calendários
 * brasileiros; a preferência de primeiro dia da semana (RF-083) virá depois.
 */
const FORMATO = 'yyyy-MM-dd';
const OPCOES = { weekStartsOn: 0 as const };

export type VisaoCalendario = 'mes' | 'semana';

export const DIAS_DA_SEMANA = [
  'Domingo',
  'Segunda',
  'Terça',
  'Quarta',
  'Quinta',
  'Sexta',
  'Sábado',
];

/** Semanas (7 datas cada) que cobrem o mês da data de referência. */
export function semanasDoMes(referencia: DataISO): DataISO[][] {
  const inicio = startOfWeek(startOfMonth(parseISO(referencia)), OPCOES);
  const fim = endOfWeek(endOfMonth(parseISO(referencia)), OPCOES);
  const semanas: DataISO[][] = [];
  for (let dia = inicio; dia <= fim; dia = addDays(dia, 7)) {
    semanas.push(Array.from({ length: 7 }, (_, i) => format(addDays(dia, i), FORMATO)));
  }
  return semanas;
}

/** Os 7 dias da semana que contém a data de referência. */
export function diasDaSemana(referencia: DataISO): DataISO[] {
  const inicio = startOfWeek(parseISO(referencia), OPCOES);
  return Array.from({ length: 7 }, (_, i) => format(addDays(inicio, i), FORMATO));
}

/** Primeiro e último dia exibidos na visão. */
export function intervaloDaVisao(visao: VisaoCalendario, referencia: DataISO): [DataISO, DataISO] {
  const dias = visao === 'mes' ? semanasDoMes(referencia).flat() : diasDaSemana(referencia);
  return [dias[0]!, dias.at(-1)!];
}

/** Avança ou volta um mês/semana. */
export function navegar(visao: VisaoCalendario, referencia: DataISO, passos: number): DataISO {
  const data = parseISO(referencia);
  return format(visao === 'mes' ? addMonths(data, passos) : addWeeks(data, passos), FORMATO);
}

export function mesmoMes(a: DataISO, b: DataISO): boolean {
  return a.slice(0, 7) === b.slice(0, 7);
}

/** Título da visão, ex.: "novembro de 2026" ou "08/11/2026 a 14/11/2026". */
export function tituloDaVisao(visao: VisaoCalendario, referencia: DataISO): string {
  if (visao === 'mes') {
    return parseISO(referencia).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  }
  const dias = diasDaSemana(referencia);
  const br = (d: DataISO) => parseISO(d).toLocaleDateString('pt-BR');
  return `${br(dias[0]!)} a ${br(dias[6]!)}`;
}
