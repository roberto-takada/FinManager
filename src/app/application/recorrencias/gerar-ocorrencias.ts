import { ocorrenciasPendentes, type Recorrencia } from '../../domain/recorrencias/recorrencia';
import type { DataISO } from '../../domain/shared/data';
import { ativo } from '../../domain/shared/entidade';
import type { Transacao } from '../../domain/transacoes/transacao';

/**
 * Gera as transações das recorrências ativas até `hoje` (RF-012) e avança a marca
 * `geradaAte` de cada uma. Recorrências excluídas não geram nada.
 */
export function gerarOcorrencias(
  colecoes: {
    readonly transacoes: readonly Transacao[];
    readonly recorrencias: readonly Recorrencia[];
  },
  hoje: DataISO,
  agora: Date,
  gerarId: () => string,
): { transacoes: Transacao[]; recorrencias: Recorrencia[]; mudou: boolean } {
  const instante = agora.toISOString();
  const novas: Transacao[] = [];
  let mudou = false;

  const recorrencias = colecoes.recorrencias.map((rec) => {
    if (!ativo(rec)) return rec;
    const datas = ocorrenciasPendentes(rec, hoje);
    if (datas.length === 0) return rec;
    mudou = true;
    for (const data of datas) {
      novas.push({
        ...rec.modelo,
        id: gerarId(),
        data,
        recorrenciaId: rec.id,
        parcela: null,
        criadoEm: instante,
        atualizadoEm: instante,
        excluidoEm: null,
      });
    }
    return { ...rec, geradaAte: datas.at(-1)!, atualizadoEm: instante };
  });

  return { transacoes: [...colecoes.transacoes, ...novas], recorrencias, mudou };
}
