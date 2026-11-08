import type { Categoria } from '../categorias/categoria';
import { type Cofrinho, efeitoNasContas } from '../cofrinhos/cofrinho';
import type { ContaFinanceira } from '../contas/conta';
import { type DataISO, intervaloDoMes, somarMeses } from '../shared/data';
import { type Dinheiro, dinheiro, MOEDA_PADRAO, somarTodos, subtrair } from '../shared/dinheiro';
import { ativos } from '../shared/entidade';
import { calcularSaldos, totalizar, type Transacao } from '../transacoes/transacao';

/**
 * Cálculos dos gráficos da dashboard (RF-041, RF-042). Tudo em unidades mínimas inteiras
 * (RN-006); percentuais são só para exibição.
 */

/** Mês de uma série: "AAAA-MM" e a data de corte usada no cálculo. */
export interface PontoMes {
  readonly mes: string;
  readonly ate: DataISO;
}

/**
 * Os `quantidade` meses que terminam no mês de `hoje`, do mais antigo para o mais novo.
 * O corte é o último dia de cada mês; no mês atual, é hoje (o futuro ainda não aconteceu).
 */
export function mesesAte(hoje: DataISO, quantidade: number): PontoMes[] {
  const meses: PontoMes[] = [];
  for (let i = quantidade - 1; i >= 0; i--) {
    const [, fim] = intervaloDoMes(somarMeses(hoje, -i));
    meses.push({ mes: fim.slice(0, 7), ate: i === 0 ? hoje : fim });
  }
  return meses;
}

/**
 * Patrimônio em uma data (glossário: contas + cofrinhos). Usa as mesmas regras do saldo
 * das contas ativas: saldo inicial, transações até a data e o efeito dos cofrinhos.
 */
export function patrimonioEm(
  contas: readonly ContaFinanceira[],
  transacoes: readonly Transacao[],
  cofrinhos: readonly Cofrinho[],
  ate: DataISO,
): Dinheiro {
  const contasAtivas = ativos(contas);
  const moeda = contasAtivas[0]?.saldoInicial.moeda ?? MOEDA_PADRAO;
  const saldos = calcularSaldos(contasAtivas, transacoes, ate);
  let unidades = somarTodos([...saldos.values()], moeda).unidades;
  for (const [contaId, efeito] of efeitoNasContas(cofrinhos, ate)) {
    if (saldos.has(contaId)) unidades += efeito;
  }
  for (const c of cofrinhos) {
    if (c.excluidoEm !== null) continue;
    for (const m of c.movimentacoes) {
      if (m.data <= ate) unidades += (m.tipo === 'deposito' ? 1 : -1) * m.valor.unidades;
    }
  }
  return dinheiro(unidades, moeda);
}

export interface PontoPatrimonio extends PontoMes {
  readonly valor: Dinheiro;
}

export interface EvolucaoPatrimonio {
  readonly pontos: readonly PontoPatrimonio[];
  /** Último ponto menos o primeiro. */
  readonly variacao: Dinheiro;
}

/**
 * Evolução do patrimônio (RF-041): um ponto por mês, dos últimos `maximoMeses` meses.
 * A série começa no mês da transação ou movimentação mais antiga, para não desenhar meses
 * vazios antes de o usuário começar a usar o app. Sem nenhum registro, só o mês atual.
 */
export function evolucaoPatrimonio(
  contas: readonly ContaFinanceira[],
  transacoes: readonly Transacao[],
  cofrinhos: readonly Cofrinho[],
  hoje: DataISO,
  maximoMeses = 12,
): EvolucaoPatrimonio {
  const datas = [
    ...ativos(transacoes).map((t) => t.data),
    ...cofrinhos.flatMap((c) => c.movimentacoes.map((m) => m.data)),
  ].filter((d) => d <= hoje);
  const maisAntiga = datas.reduce((a, b) => (b < a ? b : a), hoje);
  const quantidade = Math.min(maximoMeses, mesesEntre(maisAntiga, hoje) + 1);
  const pontos = mesesAte(hoje, quantidade).map((p) => ({
    ...p,
    valor: patrimonioEm(contas, transacoes, cofrinhos, p.ate),
  }));
  const primeiro = pontos[0]?.valor ?? dinheiro(0);
  return { pontos, variacao: subtrair(pontos.at(-1)?.valor ?? primeiro, primeiro) };
}

function mesesEntre(de: DataISO, ate: DataISO): number {
  const indice = (d: DataISO) => Number(d.slice(0, 4)) * 12 + Number(d.slice(5, 7));
  return indice(ate) - indice(de);
}

export interface FatiaCategoria {
  /** Id da categoria principal; `null` para "Outras" (agrupadas). */
  readonly categoriaId: string | null;
  readonly nome: string;
  readonly valor: Dinheiro;
  /** Percentual inteiro; a soma das fatias é sempre 100. */
  readonly percentual: number;
}

/**
 * Despesas por categoria no intervalo (RF-042). Subcategorias somam na categoria principal;
 * além das `maximoFatias − 1` maiores, o resto vira "Outras". Ordem: maior valor primeiro.
 */
export function despesasPorCategoria(
  transacoes: readonly Transacao[],
  categorias: readonly Categoria[],
  de: DataISO,
  ate: DataISO,
  maximoFatias = 5,
): FatiaCategoria[] {
  const porId = new Map(categorias.map((c) => [c.id, c]));
  const totais = new Map<string, number>();
  let moeda = MOEDA_PADRAO;
  for (const t of ativos(transacoes)) {
    if (t.tipo !== 'despesa' || t.data < de || t.data > ate || !t.categoriaId) continue;
    const categoria = porId.get(t.categoriaId);
    const principal = categoria?.paiId ?? t.categoriaId;
    totais.set(principal, (totais.get(principal) ?? 0) + t.valor.unidades);
    moeda = t.valor.moeda;
  }
  const ordenadas = [...totais.entries()]
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1] || nome(a[0]).localeCompare(nome(b[0]), 'pt-BR'));

  function nome(id: string): string {
    return porId.get(id)?.nome ?? 'Sem categoria';
  }

  const fatias: { categoriaId: string | null; nome: string; unidades: number }[] =
    ordenadas.length > maximoFatias
      ? [
          ...ordenadas
            .slice(0, maximoFatias - 1)
            .map(([id, v]) => ({ categoriaId: id, nome: nome(id), unidades: v })),
          {
            categoriaId: null,
            nome: 'Outras',
            unidades: ordenadas.slice(maximoFatias - 1).reduce((s, [, v]) => s + v, 0),
          },
        ]
      : ordenadas.map(([id, v]) => ({ categoriaId: id, nome: nome(id), unidades: v }));

  const percentuais = percentuaisQueSomam100(fatias.map((f) => f.unidades));
  return fatias.map((f, i) => ({
    categoriaId: f.categoriaId,
    nome: f.nome,
    valor: dinheiro(f.unidades, moeda),
    percentual: percentuais[i] ?? 0,
  }));
}

/** Método do maior resto: arredonda para inteiros sem que a soma fuja de 100. */
export function percentuaisQueSomam100(valores: readonly number[]): number[] {
  const total = valores.reduce((s, v) => s + v, 0);
  if (total <= 0) return valores.map(() => 0);
  const exatos = valores.map((v) => (v * 100) / total);
  const inteiros = exatos.map(Math.floor);
  let falta = 100 - inteiros.reduce((s, v) => s + v, 0);
  const porResto = exatos
    .map((v, i) => ({ i, resto: v - Math.floor(v) }))
    .sort((a, b) => b.resto - a.resto || a.i - b.i);
  for (const { i } of porResto) {
    if (falta <= 0) break;
    inteiros[i] = (inteiros[i] ?? 0) + 1;
    falta--;
  }
  return inteiros;
}

export interface ReceitasDespesasMes extends PontoMes {
  readonly receitas: Dinheiro;
  readonly despesas: Dinheiro;
}

/** Receitas e despesas de cada um dos últimos `quantidade` meses (o atual, até hoje). */
export function receitasDespesasPorMes(
  transacoes: readonly Transacao[],
  hoje: DataISO,
  quantidade = 6,
): ReceitasDespesasMes[] {
  const ativas = ativos(transacoes);
  return mesesAte(hoje, quantidade).map((p) => {
    const inicio = `${p.mes}-01`;
    const { receitas, despesas } = totalizar(
      ativas.filter((t) => t.data >= inicio && t.data <= p.ate),
    );
    return { ...p, receitas, despesas };
  });
}
