import type { Categoria } from '../categorias/categoria';
import { type Cofrinho, progresso } from '../cofrinhos/cofrinho';
import type { ContaFinanceira } from '../contas/conta';
import { despesasPorCategoria, patrimonioEm } from '../dashboard/indicadores';
import {
  type DataISO,
  intervaloDoMes,
  somarDias,
  somarMeses,
  variacaoPercentual,
} from '../shared/data';
import { type Dinheiro, dinheiro, subtrair } from '../shared/dinheiro';
import { totalizar, type Transacao } from '../transacoes/transacao';
import { deslocarPeriodo, type Periodo } from './periodo';

/**
 * Relatório de um período (RF-050 a RF-052): totais, despesas por categoria, evolução
 * patrimonial e cofrinhos, comparados com o período anterior equivalente. Tudo em unidades
 * mínimas inteiras (RN-006); percentuais são só para exibição.
 */

export interface EntradaRelatorio {
  readonly contas: readonly ContaFinanceira[];
  readonly categorias: readonly Categoria[];
  readonly transacoes: readonly Transacao[];
  readonly cofrinhos: readonly Cofrinho[];
}

export interface Totais {
  readonly receitas: Dinheiro;
  readonly despesas: Dinheiro;
  /** Receitas − despesas. Transferências não entram (RF-017). */
  readonly saldo: Dinheiro;
}

export interface Variacoes {
  /** Variação em % contra o período anterior; `null` sem base de comparação. */
  readonly receitas: number | null;
  readonly despesas: number | null;
  readonly saldo: number | null;
}

export interface LinhaCategoria {
  readonly categoriaId: string | null;
  readonly nome: string;
  readonly valor: Dinheiro;
  /** Parte das despesas do período (inteiro; a soma é 100). */
  readonly percentual: number;
  readonly valorAnterior: Dinheiro;
  readonly variacao: number | null;
}

export interface PontoPatrimonio {
  readonly data: DataISO;
  readonly valor: Dinheiro;
}

export interface PatrimonioPeriodo {
  /** Patrimônio no fim do dia anterior ao início do período. */
  readonly inicial: Dinheiro;
  /** Patrimônio no fim do período (ou hoje, se ainda está em andamento). */
  readonly final: Dinheiro;
  readonly variacao: Dinheiro;
  /** Do inicial ao final: semanas no relatório mensal; fim de cada mês nos demais. */
  readonly pontos: readonly PontoPatrimonio[];
}

export type SituacaoCofrinho = 'andamento' | 'meta-atingida' | 'encerrado';

export const SITUACOES_COFRINHO: Readonly<Record<SituacaoCofrinho, string>> = {
  andamento: 'Em andamento',
  'meta-atingida': 'Meta atingida',
  encerrado: 'Encerrado',
};

export interface LinhaCofrinho {
  readonly id: string;
  readonly nome: string;
  readonly depositos: Dinheiro;
  readonly retiradas: Dinheiro;
  readonly saldoFinal: Dinheiro;
  readonly meta: Dinheiro;
  /** Progresso no fim do período, inteiro (pode passar de 100). */
  readonly percentual: number;
  readonly situacao: SituacaoCofrinho;
}

export interface Relatorio {
  readonly periodo: Periodo;
  readonly anterior: Periodo;
  /** Último dia considerado: o fim do período ou hoje, se ele ainda está em andamento. */
  readonly ate: DataISO;
  readonly emAndamento: boolean;
  readonly totais: Totais;
  readonly totaisAnteriores: Totais;
  readonly variacoes: Variacoes;
  readonly categorias: readonly LinhaCategoria[];
  readonly patrimonio: PatrimonioPeriodo;
  readonly cofrinhos: readonly LinhaCofrinho[];
}

function totaisNoIntervalo(transacoes: readonly Transacao[], de: DataISO, ate: DataISO): Totais {
  const t = totalizar(transacoes.filter((x) => x.data >= de && x.data <= ate));
  return { receitas: t.receitas, despesas: t.despesas, saldo: t.resultado };
}

/** Datas de corte da evolução patrimonial dentro do período. */
function cortes(periodo: Periodo, ate: DataISO): DataISO[] {
  const datas: DataISO[] = [somarDias(periodo.de, -1)];
  if (periodo.tipo === 'mensal') {
    for (let d = somarDias(periodo.de, 6); d < ate; d = somarDias(d, 7)) datas.push(d);
  } else {
    for (let m = periodo.de; m <= ate; m = somarMeses(m, 1)) {
      const [, fim] = intervaloDoMes(m);
      if (fim < ate) datas.push(fim);
    }
  }
  datas.push(ate);
  return datas;
}

function situacao(c: Cofrinho, ate: DataISO): SituacaoCofrinho {
  if (c.encerradoEm !== null && c.encerradoEm.slice(0, 10) <= ate) return 'encerrado';
  return 'andamento';
}

/**
 * Cofrinhos que existiam no período: criados (ou com movimentação) até o fim dele e não
 * encerrados antes do início. Os excluídos (que nunca tiveram movimentações) não entram.
 */
function cofrinhosDoPeriodo(
  cofrinhos: readonly Cofrinho[],
  periodo: Periodo,
  ate: DataISO,
): LinhaCofrinho[] {
  return cofrinhos
    .filter(
      (c) =>
        c.excluidoEm === null &&
        (c.criadoEm.slice(0, 10) <= ate || c.movimentacoes.some((m) => m.data <= ate)) &&
        (c.encerradoEm === null || c.encerradoEm.slice(0, 10) >= periodo.de),
    )
    .map((c) => {
      const moeda = c.meta.moeda;
      let depositos = 0;
      let retiradas = 0;
      const ateOFim = c.movimentacoes.filter((m) => m.data <= ate);
      for (const m of ateOFim) {
        if (m.data < periodo.de) continue;
        if (m.tipo === 'deposito') depositos += m.valor.unidades;
        else retiradas += m.valor.unidades;
      }
      const p = progresso({ meta: c.meta, movimentacoes: ateOFim });
      const s = situacao(c, ate);
      return {
        id: c.id,
        nome: c.nome,
        depositos: dinheiro(depositos, moeda),
        retiradas: dinheiro(retiradas, moeda),
        saldoFinal: p.saldo,
        meta: c.meta,
        percentual: p.percentual,
        situacao: s === 'andamento' && p.metaAtingida ? 'meta-atingida' : s,
      };
    })
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

export function gerarRelatorio(
  entrada: EntradaRelatorio,
  periodo: Periodo,
  hoje: DataISO,
): Relatorio {
  const anterior = deslocarPeriodo(periodo, -1);
  const ate = periodo.ate < hoje ? periodo.ate : hoje;
  const totais = totaisNoIntervalo(entrada.transacoes, periodo.de, ate);
  const totaisAnteriores = totaisNoIntervalo(entrada.transacoes, anterior.de, anterior.ate);

  const atuais = despesasPorCategoria(
    entrada.transacoes,
    entrada.categorias,
    periodo.de,
    ate,
    Infinity,
  );
  const antes = despesasPorCategoria(
    entrada.transacoes,
    entrada.categorias,
    anterior.de,
    anterior.ate,
    Infinity,
  );
  const moeda = totais.despesas.moeda;
  const porIdAntes = new Map(antes.map((f) => [f.categoriaId, f]));
  const categorias: LinhaCategoria[] = atuais.map((f) => {
    const valorAnterior = porIdAntes.get(f.categoriaId)?.valor ?? dinheiro(0, moeda);
    return {
      categoriaId: f.categoriaId,
      nome: f.nome,
      valor: f.valor,
      percentual: f.percentual,
      valorAnterior,
      variacao: variacaoPercentual(f.valor.unidades, valorAnterior.unidades),
    };
  });
  // Categorias com gasto só no período anterior também aparecem (com zero agora).
  for (const f of antes) {
    if (atuais.some((a) => a.categoriaId === f.categoriaId)) continue;
    categorias.push({
      categoriaId: f.categoriaId,
      nome: f.nome,
      valor: dinheiro(0, moeda),
      percentual: 0,
      valorAnterior: f.valor,
      variacao: -100,
    });
  }

  const pontos = cortes(periodo, ate).map((data) => ({
    data,
    valor: patrimonioEm(entrada.contas, entrada.transacoes, entrada.cofrinhos, data),
  }));
  const inicial = pontos[0]!.valor;
  const final = pontos.at(-1)!.valor;

  return {
    periodo,
    anterior,
    ate,
    emAndamento: ate < periodo.ate,
    totais,
    totaisAnteriores,
    variacoes: {
      receitas: variacaoPercentual(totais.receitas.unidades, totaisAnteriores.receitas.unidades),
      despesas: variacaoPercentual(totais.despesas.unidades, totaisAnteriores.despesas.unidades),
      saldo: variacaoPercentual(totais.saldo.unidades, totaisAnteriores.saldo.unidades),
    },
    categorias,
    patrimonio: { inicial, final, variacao: subtrair(final, inicial), pontos },
    cofrinhos: cofrinhosDoPeriodo(entrada.cofrinhos, periodo, ate),
  };
}

/** Data do registro mais antigo (transação ou movimentação), para limitar os períodos. */
export function primeiroRegistro(entrada: EntradaRelatorio, hoje: DataISO): DataISO {
  let primeiro = hoje;
  for (const t of entrada.transacoes)
    if (t.excluidoEm === null && t.data < primeiro) primeiro = t.data;
  for (const c of entrada.cofrinhos)
    for (const m of c.movimentacoes) if (m.data < primeiro) primeiro = m.data;
  return primeiro;
}
