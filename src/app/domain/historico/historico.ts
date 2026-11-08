import type { Entidade } from '../shared/entidade';

/**
 * Trilha de auditoria e lixeira (RN-004, RF-075, RF-076, RF-078).
 * Os eventos são somente-adição: nunca são editados, só expurgados após o prazo.
 */
export const DIAS_RETENCAO = 180;
const MS_POR_DIA = 86_400_000;

export type AcaoHistorico = 'exclusao' | 'edicao' | 'restauracao' | 'zeramento' | 'encerramento';
export type TipoEntidade =
  'transacao' | 'conta' | 'categoria' | 'recorrencia' | 'contaAgendada' | 'cofrinho';

export const ACOES_HISTORICO: Readonly<Record<AcaoHistorico, string>> = {
  exclusao: 'Exclusão',
  edicao: 'Edição',
  restauracao: 'Restauração',
  zeramento: 'Zeramento',
  encerramento: 'Encerramento',
};

export const ENTIDADES: Readonly<Record<TipoEntidade, string>> = {
  transacao: 'Transação',
  conta: 'Conta',
  categoria: 'Categoria',
  recorrencia: 'Recorrência',
  contaAgendada: 'Conta a pagar/receber',
  cofrinho: 'Cofrinho',
};

export interface EventoHistorico {
  readonly id: string;
  readonly acao: AcaoHistorico;
  readonly entidade: TipoEntidade;
  readonly entidadeId: string;
  /** Descrição curta e legível do item, ex.: "Mercado — R$ 120,00 em 05/11/2026". */
  readonly resumo: string;
  /** Cópia do item antes da ação (para exclusões e edições). */
  readonly estadoAnterior: unknown;
  /** Agrupa eventos de uma mesma operação em lote (ex.: excluir todas as parcelas). */
  readonly loteId: string | null;
  readonly ocorridoEm: string;
  readonly expiraEm: string;
}

export function expiracao(instanteIso: string): string {
  return new Date(Date.parse(instanteIso) + DIAS_RETENCAO * MS_POR_DIA).toISOString();
}

export function criarEvento(
  dados: Omit<EventoHistorico, 'id' | 'ocorridoEm' | 'expiraEm' | 'loteId'> & {
    loteId?: string | null;
  },
  agora: Date,
  id: string,
): EventoHistorico {
  const ocorridoEm = agora.toISOString();
  return {
    ...dados,
    loteId: dados.loteId ?? null,
    id,
    ocorridoEm,
    expiraEm: expiracao(ocorridoEm),
  };
}

/** Dias inteiros até a exclusão definitiva de um item da lixeira (mínimo 0). */
export function diasAteExclusaoDefinitiva(excluidoEm: string, agora: Date): number {
  const restante = Date.parse(expiracao(excluidoEm)) - agora.getTime();
  return Math.max(0, Math.ceil(restante / MS_POR_DIA));
}

/** Itens da lixeira que já passaram do prazo de retenção. */
export function expirou(entidade: Entidade, agora: Date): boolean {
  return (
    entidade.excluidoEm !== null && Date.parse(expiracao(entidade.excluidoEm)) <= agora.getTime()
  );
}

/** RF-078: remove definitivamente itens e eventos com mais de 180 dias. */
export function expurgar<T extends Entidade>(itens: readonly T[], agora: Date): T[] {
  return itens.filter((item) => !expirou(item, agora));
}

export function expurgarEventos(
  eventos: readonly EventoHistorico[],
  agora: Date,
): EventoHistorico[] {
  return eventos.filter((e) => Date.parse(e.expiraEm) > agora.getTime());
}
