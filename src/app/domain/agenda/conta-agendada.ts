import type { Categoria } from '../categorias/categoria';
import type { ContaFinanceira } from '../contas/conta';
import {
  dataDaOcorrencia,
  type Frequencia,
  FREQUENCIAS,
  MAXIMO_OCORRENCIAS_POR_VEZ,
} from '../recorrencias/recorrencia';
import { type DataISO, ehDataISO } from '../shared/data';
import { type Dinheiro, ehPositivo } from '../shared/dinheiro';
import { ativos, type Entidade } from '../shared/entidade';
import { ErroDominio } from '../shared/erro-dominio';

/**
 * Contas a pagar e a receber (RF-020 a RF-023).
 *
 * Uma conta agendada pode ser única ou recorrente. Cada data de vencimento é uma
 * **ocorrência**. Marcar uma ocorrência como paga/recebida cria uma transação e guarda o
 * vínculo em `pagamentos`. A situação é **derivada** dessa transação: se ela for excluída,
 * a ocorrência volta a ficar pendente; se for restaurada, volta a ficar paga.
 */
export type TipoContaAgendada = 'pagar' | 'receber';

export const TIPOS_CONTA_AGENDADA: Readonly<Record<TipoContaAgendada, string>> = {
  pagar: 'A pagar',
  receber: 'A receber',
};

export interface RecorrenciaConta {
  readonly frequencia: Frequencia;
  /** Último vencimento possível (inclusive), ou `null` para sem fim. */
  readonly fim: DataISO | null;
}

export interface DadosContaAgendada {
  readonly tipo: TipoContaAgendada;
  readonly descricao: string;
  readonly valor: Dinheiro;
  /** Primeiro (ou único) vencimento. */
  readonly vencimento: DataISO;
  /** Categoria de despesa (a pagar) ou de receita (a receber). */
  readonly categoriaId: string;
  /** Conta financeira sugerida para o pagamento; pode ser escolhida na hora. */
  readonly contaId: string | null;
  readonly recorrencia: RecorrenciaConta | null;
}

export interface Pagamento {
  /** Ocorrência paga (data de vencimento). */
  readonly vencimento: DataISO;
  /** Transação gerada ao pagar/receber (RF-023). */
  readonly transacaoId: string;
}

export interface ContaAgendada extends Entidade, DadosContaAgendada {
  readonly pagamentos: readonly Pagamento[];
}

export type SituacaoOcorrencia = 'pendente' | 'paga' | 'vencida';

export interface Ocorrencia {
  readonly conta: ContaAgendada;
  readonly vencimento: DataISO;
  readonly situacao: SituacaoOcorrencia;
  /** Transação que quitou a ocorrência, se houver. */
  readonly transacaoId: string | null;
}

export const TAMANHO_MAXIMO_DESCRICAO_CONTA = 120;

export function validarContaAgendada(
  dados: DadosContaAgendada,
  categorias: readonly Categoria[],
  contas: readonly ContaFinanceira[],
): DadosContaAgendada {
  if (dados.tipo !== 'pagar' && dados.tipo !== 'receber') {
    throw new ErroDominio('tipo-invalido', 'Escolha se a conta é a pagar ou a receber.', 'tipo');
  }
  const descricao = dados.descricao.trim();
  if (!descricao) {
    throw new ErroDominio('descricao-obrigatoria', 'Informe a descrição da conta.', 'descricao');
  }
  if (descricao.length > TAMANHO_MAXIMO_DESCRICAO_CONTA) {
    throw new ErroDominio(
      'descricao-longa',
      `A descrição pode ter até ${TAMANHO_MAXIMO_DESCRICAO_CONTA} caracteres.`,
      'descricao',
    );
  }
  if (!ehPositivo(dados.valor)) {
    throw new ErroDominio('valor-invalido', 'Informe um valor maior que zero.', 'valor');
  }
  if (!ehDataISO(dados.vencimento)) {
    throw new ErroDominio('vencimento-invalido', 'Informe a data de vencimento.', 'vencimento');
  }
  const categoria = ativos(categorias).find((c) => c.id === dados.categoriaId);
  if (!categoria) {
    throw new ErroDominio('categoria-inexistente', 'Escolha uma categoria.', 'categoriaId');
  }
  const tipoCategoria = dados.tipo === 'pagar' ? 'despesa' : 'receita';
  if (categoria.tipo !== tipoCategoria) {
    throw new ErroDominio(
      'categoria-tipo',
      `Escolha uma categoria de ${tipoCategoria}.`,
      'categoriaId',
    );
  }
  if (dados.contaId !== null && !ativos(contas).some((c) => c.id === dados.contaId)) {
    throw new ErroDominio('conta-inexistente', 'A conta escolhida não existe.', 'contaId');
  }
  if (dados.recorrencia) {
    if (!(dados.recorrencia.frequencia in FREQUENCIAS)) {
      throw new ErroDominio('frequencia-invalida', 'Escolha a frequência.', 'frequencia');
    }
    const { fim } = dados.recorrencia;
    if (fim !== null && (!ehDataISO(fim) || fim < dados.vencimento)) {
      throw new ErroDominio(
        'fim-invalido',
        'A data final precisa ser igual ou posterior ao primeiro vencimento.',
        'fim',
      );
    }
  }
  return { ...dados, descricao };
}

/** Datas de vencimento da conta dentro de [de, ate]. */
export function vencimentosNoPeriodo(
  conta: DadosContaAgendada,
  de: DataISO,
  ate: DataISO,
): DataISO[] {
  if (!conta.recorrencia) {
    return conta.vencimento >= de && conta.vencimento <= ate ? [conta.vencimento] : [];
  }
  const serie = { frequencia: conta.recorrencia.frequencia, inicio: conta.vencimento };
  const limite =
    conta.recorrencia.fim !== null && conta.recorrencia.fim < ate ? conta.recorrencia.fim : ate;
  const datas: DataISO[] = [];
  for (
    let i = 0;
    i < MAXIMO_OCORRENCIAS_POR_VEZ * 10 && datas.length < MAXIMO_OCORRENCIAS_POR_VEZ;
    i++
  ) {
    const data = dataDaOcorrencia(serie, i);
    if (data > limite) break;
    if (data >= de) datas.push(data);
  }
  return datas;
}

/** A ocorrência existe na série da conta? */
export function ehVencimentoDaConta(conta: DadosContaAgendada, data: DataISO): boolean {
  return vencimentosNoPeriodo(conta, data, data).length === 1;
}

/** Transação ativa que quitou a ocorrência, se houver. */
export function transacaoDoPagamento(
  conta: ContaAgendada,
  vencimento: DataISO,
  transacoesAtivas: ReadonlySet<string>,
): string | null {
  return (
    conta.pagamentos.find((p) => p.vencimento === vencimento && transacoesAtivas.has(p.transacaoId))
      ?.transacaoId ?? null
  );
}

export function situacaoDaOcorrencia(
  conta: ContaAgendada,
  vencimento: DataISO,
  transacoesAtivas: ReadonlySet<string>,
  hoje: DataISO,
): SituacaoOcorrencia {
  if (transacaoDoPagamento(conta, vencimento, transacoesAtivas)) return 'paga';
  return vencimento < hoje ? 'vencida' : 'pendente';
}

/** Todas as ocorrências das contas ativas em [de, ate], ordenadas por data. */
export function ocorrenciasNoPeriodo(
  contas: readonly ContaAgendada[],
  de: DataISO,
  ate: DataISO,
  transacoesAtivas: ReadonlySet<string>,
  hoje: DataISO,
): Ocorrencia[] {
  return ativos(contas)
    .flatMap((conta) =>
      vencimentosNoPeriodo(conta, de, ate).map((vencimento) => ({
        conta,
        vencimento,
        situacao: situacaoDaOcorrencia(conta, vencimento, transacoesAtivas, hoje),
        transacaoId: transacaoDoPagamento(conta, vencimento, transacoesAtivas),
      })),
    )
    .sort(
      (a, b) =>
        a.vencimento.localeCompare(b.vencimento) ||
        a.conta.descricao.localeCompare(b.conta.descricao, 'pt-BR'),
    );
}

/**
 * Situação em texto, sem depender de cor (RF-022, RNF-024).
 * Contas a receber quitadas aparecem como "Recebida".
 */
export function rotuloSituacao(tipo: TipoContaAgendada, situacao: SituacaoOcorrencia): string {
  if (situacao === 'paga') return tipo === 'pagar' ? 'Paga' : 'Recebida';
  return situacao === 'vencida' ? 'Vencida' : 'Pendente';
}

/** Símbolo que acompanha o texto da situação (redundância visual, RF-022). */
export const SIMBOLO_SITUACAO: Readonly<Record<SituacaoOcorrencia, string>> = {
  pendente: '○',
  paga: '✓',
  vencida: '!',
};

/**
 * Edições que mudam quanto ou quando se paga exigem confirmação e entram no histórico
 * (RN-003, RN-004), como a edição de valor ou data de uma transação (RN-005 b).
 */
export function ehAlteracaoSignificativaConta(
  antes: DadosContaAgendada,
  depois: DadosContaAgendada,
): boolean {
  return (
    antes.valor.unidades !== depois.valor.unidades ||
    antes.vencimento !== depois.vencimento ||
    antes.tipo !== depois.tipo ||
    antes.recorrencia?.frequencia !== depois.recorrencia?.frequencia ||
    (antes.recorrencia?.fim ?? null) !== (depois.recorrencia?.fim ?? null)
  );
}
