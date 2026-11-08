import type { Dinheiro } from '../shared/dinheiro';
import { ativos, type Entidade, normalizarTexto } from '../shared/entidade';
import { ErroDominio } from '../shared/erro-dominio';

/** Contas financeiras (RF-016). */
export type TipoConta = 'corrente' | 'carteira' | 'cartao' | 'investimento';

export const TIPOS_CONTA: Readonly<Record<TipoConta, string>> = {
  corrente: 'Conta corrente',
  carteira: 'Carteira',
  cartao: 'Cartão de crédito',
  investimento: 'Investimento',
};

export interface DadosConta {
  readonly nome: string;
  readonly tipo: TipoConta;
  /** Saldo no momento do cadastro. Em cartões, uma dívida é um valor negativo. */
  readonly saldoInicial: Dinheiro;
}

export interface ContaFinanceira extends Entidade, DadosConta {}

export const TAMANHO_MAXIMO_NOME_CONTA = 60;

/** Valida e normaliza os dados de uma conta. `idAtual` é usado na edição. */
export function validarConta(
  dados: DadosConta,
  contas: readonly ContaFinanceira[],
  idAtual?: string,
): DadosConta {
  const nome = dados.nome.trim();
  if (!nome) throw new ErroDominio('nome-obrigatorio', 'Informe o nome da conta.', 'nome');
  if (nome.length > TAMANHO_MAXIMO_NOME_CONTA) {
    throw new ErroDominio(
      'nome-longo',
      `O nome pode ter até ${TAMANHO_MAXIMO_NOME_CONTA} caracteres.`,
      'nome',
    );
  }
  if (!(dados.tipo in TIPOS_CONTA)) {
    throw new ErroDominio('tipo-invalido', 'Escolha o tipo da conta.', 'tipo');
  }
  const repetida = ativos(contas).some(
    (c) => c.id !== idAtual && normalizarTexto(c.nome) === normalizarTexto(nome),
  );
  if (repetida) {
    throw new ErroDominio('nome-repetido', 'Já existe uma conta com esse nome.', 'nome');
  }
  return { ...dados, nome };
}
