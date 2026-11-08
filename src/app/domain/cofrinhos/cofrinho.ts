import { differenceInCalendarMonths, parseISO } from 'date-fns';
import type { ContaFinanceira } from '../contas/conta';
import { type DataISO, ehDataISO } from '../shared/data';
import { type Dinheiro, dinheiro, ehPositivo, subtrair, zero } from '../shared/dinheiro';
import { ativos, type Entidade, normalizarTexto } from '../shared/entidade';
import { ErroDominio } from '../shared/erro-dominio';

/**
 * Cofrinhos: reservas para objetivos (RF-030 a RF-034).
 *
 * O dinheiro de um cofrinho é separado das contas financeiras (patrimônio = contas +
 * cofrinhos): cada depósito sai de uma conta e cada retirada volta para uma conta. Assim
 * o saldo da conta diminui, o do cofrinho aumenta e o patrimônio não muda.
 *
 * As movimentações formam um livro-razão imutável (RF-031): não são editadas nem
 * excluídas; um engano se corrige com uma movimentação contrária.
 */

export const ICONES_COFRINHO = {
  geral: { simbolo: '🐷', rotulo: 'Cofrinho' },
  viagem: { simbolo: '✈️', rotulo: 'Viagem' },
  casa: { simbolo: '🏠', rotulo: 'Casa' },
  carro: { simbolo: '🚗', rotulo: 'Carro' },
  estudos: { simbolo: '🎓', rotulo: 'Estudos' },
  emergencia: { simbolo: '🛟', rotulo: 'Emergência' },
  presente: { simbolo: '🎁', rotulo: 'Presente' },
  tecnologia: { simbolo: '💻', rotulo: 'Tecnologia' },
} as const;
export type IconeCofrinho = keyof typeof ICONES_COFRINHO;

export const CORES_COFRINHO = {
  azul: 'Azul',
  verde: 'Verde',
  roxo: 'Roxo',
  laranja: 'Laranja',
  rosa: 'Rosa',
  cinza: 'Cinza',
} as const;
export type CorCofrinho = keyof typeof CORES_COFRINHO;

export interface DadosCofrinho {
  readonly nome: string;
  readonly meta: Dinheiro;
  /** Data até a qual o usuário quer atingir a meta (opcional). */
  readonly prazo: DataISO | null;
  readonly icone: IconeCofrinho;
  readonly cor: CorCofrinho;
}

export type TipoMovimentacao = 'deposito' | 'retirada';
/** De onde veio a movimentação: feita pelo usuário ou por zerar/encerrar (RN-005 d). */
export type OrigemMovimentacao = 'manual' | 'zeramento' | 'encerramento';

export interface MovimentacaoCofrinho {
  readonly id: string;
  readonly tipo: TipoMovimentacao;
  readonly valor: Dinheiro;
  readonly data: DataISO;
  /** Conta financeira de onde saiu (depósito) ou para onde voltou (retirada). */
  readonly contaId: string;
  readonly origem: OrigemMovimentacao;
  readonly registradoEm: string;
}

export interface Cofrinho extends Entidade, DadosCofrinho {
  readonly movimentacoes: readonly MovimentacaoCofrinho[];
  /** Encerrado (RN-005 d): saldo devolvido às contas e cofrinho arquivado. */
  readonly encerradoEm: string | null;
}

export const TAMANHO_MAXIMO_NOME_COFRINHO = 60;

export const emAndamento = (c: Cofrinho) => c.excluidoEm === null && c.encerradoEm === null;

/** RF-030: valida nome, meta, prazo, ícone e cor. O prazo, se informado, não pode ter passado. */
export function validarCofrinho(
  dados: DadosCofrinho,
  cofrinhos: readonly Cofrinho[],
  hoje: DataISO,
  idAtual?: string,
): DadosCofrinho {
  const nome = dados.nome.trim();
  if (!nome) throw new ErroDominio('nome-obrigatorio', 'Informe o nome do cofrinho.', 'nome');
  if (nome.length > TAMANHO_MAXIMO_NOME_COFRINHO) {
    throw new ErroDominio(
      'nome-longo',
      `O nome pode ter até ${TAMANHO_MAXIMO_NOME_COFRINHO} caracteres.`,
      'nome',
    );
  }
  if (
    ativos(cofrinhos).some(
      (c) =>
        c.id !== idAtual && emAndamento(c) && normalizarTexto(c.nome) === normalizarTexto(nome),
    )
  ) {
    throw new ErroDominio('nome-repetido', 'Já existe um cofrinho com esse nome.', 'nome');
  }
  if (!ehPositivo(dados.meta)) {
    throw new ErroDominio('meta-invalida', 'Informe uma meta maior que zero.', 'meta');
  }
  if (dados.prazo !== null) {
    if (!ehDataISO(dados.prazo))
      throw new ErroDominio('prazo-invalido', 'Informe um prazo válido.', 'prazo');
    if (dados.prazo <= hoje) {
      throw new ErroDominio('prazo-passado', 'O prazo precisa ser uma data futura.', 'prazo');
    }
  }
  if (!(dados.icone in ICONES_COFRINHO))
    throw new ErroDominio('icone-invalido', 'Escolha um ícone.', 'icone');
  if (!(dados.cor in CORES_COFRINHO))
    throw new ErroDominio('cor-invalida', 'Escolha uma cor.', 'cor');
  return { ...dados, nome };
}

/** Saldo atual: depósitos menos retiradas. */
export function saldoCofrinho(cofrinho: Pick<Cofrinho, 'movimentacoes' | 'meta'>): Dinheiro {
  return cofrinho.movimentacoes.reduce(
    (saldo, m) =>
      dinheiro(saldo.unidades + (m.tipo === 'deposito' ? 1 : -1) * m.valor.unidades, saldo.moeda),
    zero(cofrinho.meta.moeda),
  );
}

export interface Progresso {
  readonly saldo: Dinheiro;
  /** Percentual inteiro, arredondado para baixo; pode passar de 100. */
  readonly percentual: number;
  readonly restante: Dinheiro;
  readonly metaAtingida: boolean;
}

/** RF-032: valor atual, % da meta e valor restante. */
export function progresso(cofrinho: Pick<Cofrinho, 'movimentacoes' | 'meta'>): Progresso {
  const saldo = saldoCofrinho(cofrinho);
  const faltam = subtrair(cofrinho.meta, saldo);
  return {
    saldo,
    percentual: Math.floor((Math.max(0, saldo.unidades) * 100) / cofrinho.meta.unidades),
    restante: faltam.unidades > 0 ? faltam : zero(cofrinho.meta.moeda),
    metaAtingida: faltam.unidades <= 0,
  };
}

export type Planejamento =
  | { readonly situacao: 'sem-prazo' }
  | { readonly situacao: 'meta-atingida' }
  | { readonly situacao: 'prazo-vencido'; readonly restante: Dinheiro }
  | { readonly situacao: 'no-prazo'; readonly meses: number; readonly porMes: Dinheiro };

/**
 * RF-033: quanto guardar por mês para atingir a meta no prazo.
 * Meses = meses de calendário entre hoje e o prazo (mínimo 1): de 08/11/2026 a 08/11/2027
 * são 12. O valor é arredondado **para cima** ao centavo, para nunca guardar de menos.
 */
export function planejamento(
  cofrinho: Pick<Cofrinho, 'movimentacoes' | 'meta' | 'prazo'>,
  hoje: DataISO,
): Planejamento {
  const { restante, metaAtingida } = progresso(cofrinho);
  if (metaAtingida) return { situacao: 'meta-atingida' };
  if (cofrinho.prazo === null) return { situacao: 'sem-prazo' };
  if (cofrinho.prazo < hoje) return { situacao: 'prazo-vencido', restante };
  const meses = Math.max(1, differenceInCalendarMonths(parseISO(cofrinho.prazo), parseISO(hoje)));
  return {
    situacao: 'no-prazo',
    meses,
    porMes: dinheiro(Math.ceil(restante.unidades / meses), restante.moeda),
  };
}

/** RF-031: valida um depósito ou retirada antes de registrá-lo. */
export function validarMovimentacao(
  cofrinho: Cofrinho,
  mov: Pick<MovimentacaoCofrinho, 'tipo' | 'valor' | 'data' | 'contaId'>,
  contas: readonly ContaFinanceira[],
  hoje: DataISO,
): void {
  if (!emAndamento(cofrinho)) {
    throw new ErroDominio('cofrinho-encerrado', 'Este cofrinho está encerrado.');
  }
  if (!ehPositivo(mov.valor)) {
    throw new ErroDominio('valor-invalido', 'Informe um valor maior que zero.', 'valor');
  }
  if (mov.valor.moeda !== cofrinho.meta.moeda) {
    throw new ErroDominio(
      'moedas-diferentes',
      'O valor precisa estar na moeda do cofrinho.',
      'valor',
    );
  }
  if (!ehDataISO(mov.data))
    throw new ErroDominio('data-invalida', 'Informe uma data válida.', 'data');
  if (mov.data > hoje) {
    throw new ErroDominio('data-futura', 'A movimentação não pode ter data futura.', 'data');
  }
  if (!ativos(contas).some((c) => c.id === mov.contaId)) {
    throw new ErroDominio('conta-inexistente', 'Escolha uma conta.', 'contaId');
  }
  if (mov.tipo === 'retirada' && mov.valor.unidades > saldoCofrinho(cofrinho).unidades) {
    throw new ErroDominio(
      'saldo-insuficiente',
      'O cofrinho não tem saldo suficiente para essa retirada.',
      'valor',
    );
  }
}

/**
 * Efeito dos cofrinhos no saldo de cada conta até uma data: depósitos saem, retiradas
 * voltam. Considera todos os cofrinhos, inclusive encerrados (o dinheiro de fato se moveu).
 */
export function efeitoNasContas(cofrinhos: readonly Cofrinho[], ate: DataISO): Map<string, number> {
  const efeito = new Map<string, number>();
  for (const c of cofrinhos) {
    for (const m of c.movimentacoes) {
      if (m.data > ate) continue;
      const sinal = m.tipo === 'deposito' ? -1 : 1;
      efeito.set(m.contaId, (efeito.get(m.contaId) ?? 0) + sinal * m.valor.unidades);
    }
  }
  return efeito;
}
