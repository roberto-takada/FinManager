import { type DataISO, ehDataISO, somarAnos, somarMeses, somarSemanas } from '../shared/data';
import type { Entidade } from '../shared/entidade';
import { ErroDominio } from '../shared/erro-dominio';
import type { DadosTransacao } from '../transacoes/transacao';

/**
 * Transações recorrentes (RF-012). A recorrência guarda um modelo; as ocorrências até a
 * data atual viram transações normais, geradas ao desbloquear o cofre. Ocorrências
 * futuras não são criadas (serão usadas nas projeções, RF-060).
 */
export type Frequencia = 'semanal' | 'mensal' | 'anual';

export const FREQUENCIAS: Readonly<Record<Frequencia, string>> = {
  semanal: 'Toda semana',
  mensal: 'Todo mês',
  anual: 'Todo ano',
};

export interface DadosRecorrencia {
  /** Dados de cada ocorrência; a `data` do modelo é ignorada (vem da série). */
  readonly modelo: Omit<DadosTransacao, 'data'>;
  readonly frequencia: Frequencia;
  readonly inicio: DataISO;
  /** Última data possível (inclusive), ou `null` para sem fim. */
  readonly fim: DataISO | null;
}

export interface Recorrencia extends Entidade, DadosRecorrencia {
  /**
   * Até que data as ocorrências já foram geradas. Garante que uma ocorrência excluída
   * pelo usuário não seja recriada, mesmo depois de expurgada da lixeira.
   */
  readonly geradaAte: DataISO | null;
}

/** Limite de segurança contra séries absurdas (ex.: semanal desde o ano 1900). */
export const MAXIMO_OCORRENCIAS_POR_VEZ = 1000;

export function validarDadosRecorrencia(dados: DadosRecorrencia): DadosRecorrencia {
  if (!(dados.frequencia in FREQUENCIAS)) {
    throw new ErroDominio('frequencia-invalida', 'Escolha a frequência.', 'frequencia');
  }
  if (!ehDataISO(dados.inicio)) {
    throw new ErroDominio('data-invalida', 'Informe uma data válida.', 'data');
  }
  if (dados.fim !== null) {
    if (!ehDataISO(dados.fim)) {
      throw new ErroDominio('fim-invalido', 'Informe uma data final válida.', 'fim');
    }
    if (dados.fim < dados.inicio) {
      throw new ErroDominio(
        'fim-invalido',
        'A data final precisa ser igual ou posterior à primeira data.',
        'fim',
      );
    }
  }
  return dados;
}

/** A n-ésima data da série, sempre calculada a partir do início (não acumula ajustes). */
export function dataDaOcorrencia(recorrencia: DadosRecorrencia, indice: number): DataISO {
  switch (recorrencia.frequencia) {
    case 'semanal':
      return somarSemanas(recorrencia.inicio, indice);
    case 'mensal':
      return somarMeses(recorrencia.inicio, indice);
    case 'anual':
      return somarAnos(recorrencia.inicio, indice);
  }
}

/** Datas das ocorrências ainda não geradas, até `ate` (inclusive) e até o fim da série. */
export function ocorrenciasPendentes(recorrencia: Recorrencia, ate: DataISO): DataISO[] {
  const limite = recorrencia.fim !== null && recorrencia.fim < ate ? recorrencia.fim : ate;
  const datas: DataISO[] = [];
  for (let i = 0; datas.length < MAXIMO_OCORRENCIAS_POR_VEZ; i++) {
    const data = dataDaOcorrencia(recorrencia, i);
    if (data > limite) break;
    if (recorrencia.geradaAte === null || data > recorrencia.geradaAte) datas.push(data);
  }
  return datas;
}

/** Próxima data da série depois de `depoisDe`, ou `null` se a série já terminou. */
export function proximaOcorrencia(
  recorrencia: DadosRecorrencia,
  depoisDe: DataISO,
): DataISO | null {
  for (let i = 0; i < MAXIMO_OCORRENCIAS_POR_VEZ * 10; i++) {
    const data = dataDaOcorrencia(recorrencia, i);
    if (recorrencia.fim !== null && data > recorrencia.fim) return null;
    if (data > depoisDe) return data;
  }
  return null;
}
