import { type DataISO, formatarData } from '../shared/data';

/** Períodos dos relatórios (RF-050). O período personalizado (RF-054) fica para depois da 1.0. */
export type TipoPeriodo = 'mensal' | 'trimestral' | 'semestral' | 'anual';

export const TIPOS_PERIODO: Readonly<Record<TipoPeriodo, string>> = {
  mensal: 'Mensal',
  trimestral: 'Trimestral',
  semestral: 'Semestral',
  anual: 'Anual',
};

/** Quantos meses cada tipo de período cobre. */
const MESES: Record<TipoPeriodo, number> = { mensal: 1, trimestral: 3, semestral: 6, anual: 12 };

export interface Periodo {
  readonly tipo: TipoPeriodo;
  readonly ano: number;
  /** Mês (1–12), trimestre (1–4), semestre (1–2) ou 1 no anual. */
  readonly indice: number;
  /** Identificador estável, usado na URL: "2026-11", "2026-T3", "2026-S2", "2026". */
  readonly id: string;
  readonly de: DataISO;
  readonly ate: DataISO;
  /** Ex.: "novembro de 2026", "3º trimestre de 2026", "2º semestre de 2026", "2026". */
  readonly nome: string;
}

const doisDigitos = (n: number) => String(n).padStart(2, '0');

function ultimoDia(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

export function criarPeriodo(tipo: TipoPeriodo, ano: number, indice: number): Periodo {
  const quantidade = 12 / MESES[tipo];
  if (!Number.isInteger(ano) || !Number.isInteger(indice) || indice < 1 || indice > quantidade) {
    throw new RangeError(`Período inválido: ${tipo} ${ano}/${indice}`);
  }
  const mesInicial = (indice - 1) * MESES[tipo] + 1;
  const mesFinal = mesInicial + MESES[tipo] - 1;
  const de = `${ano}-${doisDigitos(mesInicial)}-01`;
  const ate = `${ano}-${doisDigitos(mesFinal)}-${doisDigitos(ultimoDia(ano, mesFinal))}`;
  const id =
    tipo === 'mensal'
      ? `${ano}-${doisDigitos(indice)}`
      : tipo === 'trimestral'
        ? `${ano}-T${indice}`
        : tipo === 'semestral'
          ? `${ano}-S${indice}`
          : `${ano}`;
  const nome =
    tipo === 'mensal'
      ? new Date(ano, indice - 1, 1).toLocaleDateString('pt-BR', {
          month: 'long',
          year: 'numeric',
        })
      : tipo === 'trimestral'
        ? `${indice}º trimestre de ${ano}`
        : tipo === 'semestral'
          ? `${indice}º semestre de ${ano}`
          : String(ano);
  return { tipo, ano, indice, id, de, ate, nome };
}

/** O período do tipo que contém a data. */
export function periodoContendo(tipo: TipoPeriodo, data: DataISO): Periodo {
  const ano = Number(data.slice(0, 4));
  const mes = Number(data.slice(5, 7));
  return criarPeriodo(tipo, ano, Math.floor((mes - 1) / MESES[tipo]) + 1);
}

/** Período deslocado `passo` posições (−1 = anterior equivalente, RF-052). */
export function deslocarPeriodo(periodo: Periodo, passo: number): Periodo {
  const quantidade = 12 / MESES[periodo.tipo];
  const posicao = periodo.ano * quantidade + (periodo.indice - 1) + passo;
  return criarPeriodo(
    periodo.tipo,
    Math.floor(posicao / quantidade),
    (((posicao % quantidade) + quantidade) % quantidade) + 1,
  );
}

/** Lê o identificador da URL; `null` se não for válido para o tipo. */
export function lerPeriodo(tipo: TipoPeriodo, id: string | null | undefined): Periodo | null {
  if (!id) return null;
  const padroes: Record<TipoPeriodo, RegExp> = {
    mensal: /^(\d{4})-(\d{2})$/,
    trimestral: /^(\d{4})-T(\d)$/,
    semestral: /^(\d{4})-S(\d)$/,
    anual: /^(\d{4})()$/,
  };
  const partes = padroes[tipo].exec(id);
  if (!partes) return null;
  try {
    return criarPeriodo(tipo, Number(partes[1]), partes[2] ? Number(partes[2]) : 1);
  } catch {
    return null;
  }
}

/**
 * Períodos que podem ser escolhidos: do que contém o primeiro registro até o atual, do mais
 * novo para o mais antigo. Períodos futuros não entram.
 */
export function periodosDisponiveis(
  tipo: TipoPeriodo,
  primeiroRegistro: DataISO,
  hoje: DataISO,
): Periodo[] {
  const lista: Periodo[] = [];
  const primeiro = periodoContendo(tipo, primeiroRegistro < hoje ? primeiroRegistro : hoje);
  for (let p = periodoContendo(tipo, hoje); p.de >= primeiro.de; p = deslocarPeriodo(p, -1)) {
    lista.push(p);
  }
  return lista;
}

/** "01/07/2026 a 30/09/2026". */
export function intervaloPorExtenso(de: DataISO, ate: DataISO): string {
  return `${formatarData(de)} a ${formatarData(ate)}`;
}
