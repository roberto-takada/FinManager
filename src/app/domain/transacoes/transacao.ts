import { type Categoria, idsComSubcategorias } from '../categorias/categoria';
import type { ContaFinanceira } from '../contas/conta';
import { type DataISO, ehDataISO, somarMeses } from '../shared/data';
import {
  type Dinheiro,
  dividirEmParcelas,
  ehPositivo,
  somar,
  subtrair,
  somarTodos,
  zero,
} from '../shared/dinheiro';
import { ativos, type Entidade, normalizarTexto } from '../shared/entidade';
import { ErroDominio } from '../shared/erro-dominio';

/** Transações (RF-010 a RF-017). */
export type TipoTransacao = 'receita' | 'despesa' | 'transferencia';

export const TIPOS_TRANSACAO: Readonly<Record<TipoTransacao, string>> = {
  receita: 'Receita',
  despesa: 'Despesa',
  transferencia: 'Transferência',
};

export interface DadosTransacao {
  readonly tipo: TipoTransacao;
  /** Sempre positivo; o tipo define se entra ou sai. */
  readonly valor: Dinheiro;
  /** Data de competência: o mês em que a transação conta nos relatórios. */
  readonly data: DataISO;
  readonly descricao: string;
  /** Obrigatória em receitas e despesas; nula em transferências. */
  readonly categoriaId: string | null;
  /** Conta de origem (ou a conta da receita/despesa). */
  readonly contaId: string;
  /** Só em transferências (RF-017). */
  readonly contaDestinoId: string | null;
}

/** Parcela de uma compra parcelada (RF-013). */
export interface Parcela {
  readonly grupoId: string;
  readonly numero: number;
  readonly total: number;
  /** Data real da compra; a `data` da transação é o mês da parcela. */
  readonly dataCompra: DataISO;
}

export interface Transacao extends Entidade, DadosTransacao {
  readonly recorrenciaId: string | null;
  readonly parcela: Parcela | null;
}

export const TAMANHO_MAXIMO_DESCRICAO = 120;
export const MAXIMO_PARCELAS = 48;

/** Valida e normaliza os dados de uma transação contra as contas e categorias ativas. */
export function validarTransacao(
  dados: DadosTransacao,
  contas: readonly ContaFinanceira[],
  categorias: readonly Categoria[],
): DadosTransacao {
  if (!(dados.tipo in TIPOS_TRANSACAO)) {
    throw new ErroDominio('tipo-invalido', 'Escolha o tipo da transação.', 'tipo');
  }
  if (!ehPositivo(dados.valor)) {
    throw new ErroDominio('valor-invalido', 'Informe um valor maior que zero.', 'valor');
  }
  if (!ehDataISO(dados.data)) {
    throw new ErroDominio('data-invalida', 'Informe uma data válida.', 'data');
  }
  const descricao = dados.descricao.trim();
  if (descricao.length > TAMANHO_MAXIMO_DESCRICAO) {
    throw new ErroDominio(
      'descricao-longa',
      `A descrição pode ter até ${TAMANHO_MAXIMO_DESCRICAO} caracteres.`,
      'descricao',
    );
  }

  const contasAtivas = ativos(contas);
  if (!contasAtivas.some((c) => c.id === dados.contaId)) {
    throw new ErroDominio('conta-inexistente', 'Escolha uma conta.', 'contaId');
  }

  if (dados.tipo === 'transferencia') {
    if (!dados.contaDestinoId || !contasAtivas.some((c) => c.id === dados.contaDestinoId)) {
      throw new ErroDominio('destino-inexistente', 'Escolha a conta de destino.', 'contaDestinoId');
    }
    if (dados.contaDestinoId === dados.contaId) {
      throw new ErroDominio(
        'destino-igual',
        'A conta de destino precisa ser diferente da conta de origem.',
        'contaDestinoId',
      );
    }
    return { ...dados, descricao, categoriaId: null };
  }

  const categoria = ativos(categorias).find((c) => c.id === dados.categoriaId);
  if (!categoria) {
    throw new ErroDominio('categoria-inexistente', 'Escolha uma categoria.', 'categoriaId');
  }
  if (categoria.tipo !== dados.tipo) {
    throw new ErroDominio(
      'categoria-tipo',
      `A categoria escolhida não é de ${dados.tipo === 'receita' ? 'receita' : 'despesa'}.`,
      'categoriaId',
    );
  }
  return { ...dados, descricao, contaDestinoId: null };
}

/**
 * Edições significativas exigem confirmação e entram no histórico (RN-005 b).
 * Mudar o tipo também conta, porque inverte o efeito do valor no saldo.
 */
export function ehAlteracaoSignificativa(antes: DadosTransacao, depois: DadosTransacao): boolean {
  return (
    antes.valor.unidades !== depois.valor.unidades ||
    antes.valor.moeda !== depois.valor.moeda ||
    antes.data !== depois.data ||
    antes.tipo !== depois.tipo
  );
}

/**
 * Divide uma despesa em parcelas mensais (RF-013): a 1ª no mês da compra e as demais nos
 * meses seguintes. O resto dos centavos fica na 1ª parcela.
 * A atribuição à fatura do cartão virá com RF-100 a RF-102.
 */
export function gerarParcelas(
  dados: DadosTransacao,
  quantidade: number,
  grupoId: string,
): { dados: DadosTransacao; parcela: Parcela }[] {
  if (dados.tipo !== 'despesa') {
    throw new ErroDominio('parcela-tipo', 'Só despesas podem ser parceladas.', 'parcelas');
  }
  if (!Number.isInteger(quantidade) || quantidade < 2 || quantidade > MAXIMO_PARCELAS) {
    throw new ErroDominio(
      'parcelas-invalidas',
      `O parcelamento precisa ter de 2 a ${MAXIMO_PARCELAS} parcelas.`,
      'parcelas',
    );
  }
  return dividirEmParcelas(dados.valor, quantidade).map((valor, i) => ({
    dados: { ...dados, valor, data: somarMeses(dados.data, i) },
    parcela: { grupoId, numero: i + 1, total: quantidade, dataCompra: dados.data },
  }));
}

/** Descrição com a indicação de parcela, ex.: "Geladeira (3/10)". */
export function descricaoExibida(transacao: Transacao): string {
  const base = transacao.descricao || TIPOS_TRANSACAO[transacao.tipo];
  return transacao.parcela
    ? `${base} (${transacao.parcela.numero}/${transacao.parcela.total})`
    : base;
}

/** Filtros da lista de transações (RF-014). Campos vazios não filtram. */
export interface FiltroTransacoes {
  readonly de?: DataISO | null;
  readonly ate?: DataISO | null;
  readonly tipo?: TipoTransacao | null;
  readonly contaId?: string | null;
  readonly categoriaId?: string | null;
  readonly texto?: string | null;
}

export function filtrarTransacoes(
  transacoes: readonly Transacao[],
  filtro: FiltroTransacoes,
  categorias: readonly Categoria[],
): Transacao[] {
  const categoriasAceitas = filtro.categoriaId
    ? idsComSubcategorias(categorias, filtro.categoriaId)
    : null;
  const texto = filtro.texto ? normalizarTexto(filtro.texto) : '';
  const nomesCategorias = new Map(categorias.map((c) => [c.id, normalizarTexto(c.nome)]));

  return ativos(transacoes)
    .filter((t) => !filtro.de || t.data >= filtro.de)
    .filter((t) => !filtro.ate || t.data <= filtro.ate)
    .filter((t) => !filtro.tipo || t.tipo === filtro.tipo)
    .filter(
      (t) => !filtro.contaId || t.contaId === filtro.contaId || t.contaDestinoId === filtro.contaId,
    )
    .filter(
      (t) => !categoriasAceitas || (t.categoriaId !== null && categoriasAceitas.has(t.categoriaId)),
    )
    .filter(
      (t) =>
        !texto ||
        normalizarTexto(t.descricao).includes(texto) ||
        (t.categoriaId !== null && (nomesCategorias.get(t.categoriaId) ?? '').includes(texto)),
    )
    .sort((a, b) =>
      a.data === b.data ? b.criadoEm.localeCompare(a.criadoEm) : b.data.localeCompare(a.data),
    );
}

/** Totais de receitas e despesas; transferências não entram (RF-017). */
export function totalizar(transacoes: readonly Transacao[]): {
  receitas: Dinheiro;
  despesas: Dinheiro;
  resultado: Dinheiro;
} {
  const ativas = ativos(transacoes);
  const receitas = somarTodos(ativas.filter((t) => t.tipo === 'receita').map((t) => t.valor));
  const despesas = somarTodos(ativas.filter((t) => t.tipo === 'despesa').map((t) => t.valor));
  return { receitas, despesas, resultado: subtrair(receitas, despesas) };
}

/**
 * Saldo de cada conta até uma data (inclusive): saldo inicial + receitas − despesas,
 * com transferências saindo da origem e entrando no destino. Parcelas e transações
 * futuras não entram no saldo atual.
 */
export function calcularSaldos(
  contas: readonly ContaFinanceira[],
  transacoes: readonly Transacao[],
  ate: DataISO,
): Map<string, Dinheiro> {
  const saldos = new Map(contas.map((c) => [c.id, c.saldoInicial]));
  const ajustar = (id: string | null, valor: Dinheiro, sinal: 1 | -1) => {
    if (!id || !saldos.has(id)) return;
    const atual = saldos.get(id) ?? zero(valor.moeda);
    saldos.set(id, sinal === 1 ? somar(atual, valor) : subtrair(atual, valor));
  };
  for (const t of ativos(transacoes)) {
    if (t.data > ate) continue;
    if (t.tipo === 'receita') ajustar(t.contaId, t.valor, 1);
    else if (t.tipo === 'despesa') ajustar(t.contaId, t.valor, -1);
    else {
      ajustar(t.contaId, t.valor, -1);
      ajustar(t.contaDestinoId, t.valor, 1);
    }
  }
  return saldos;
}
