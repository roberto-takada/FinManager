import type { ContaAgendada } from '../app/domain/agenda/conta-agendada';
import type { Categoria } from '../app/domain/categorias/categoria';
import type { Cofrinho, MovimentacaoCofrinho } from '../app/domain/cofrinhos/cofrinho';
import type { ContaFinanceira } from '../app/domain/contas/conta';
import type { Recorrencia } from '../app/domain/recorrencias/recorrencia';
import { dinheiro } from '../app/domain/shared/dinheiro';
import type { Transacao } from '../app/domain/transacoes/transacao';

/** Fábricas de entidades fictícias para testes. */

const INSTANTE = '2026-01-01T12:00:00.000Z';
const base = (id: string) => ({ id, criadoEm: INSTANTE, atualizadoEm: INSTANTE, excluidoEm: null });

export const brl = (unidades: number) => dinheiro(unidades, 'BRL');

export function umaConta(dados: Partial<ContaFinanceira> = {}): ContaFinanceira {
  return {
    ...base('conta-1'),
    nome: 'Conta Exemplo',
    tipo: 'corrente',
    saldoInicial: brl(0),
    ...dados,
  };
}

export function umaCategoria(dados: Partial<Categoria> = {}): Categoria {
  return { ...base('cat-1'), nome: 'Mercado', tipo: 'despesa', paiId: null, ...dados };
}

export function umaTransacao(dados: Partial<Transacao> = {}): Transacao {
  return {
    ...base('t-1'),
    tipo: 'despesa',
    valor: brl(1000),
    data: '2026-01-10',
    descricao: 'Compra fictícia',
    categoriaId: 'cat-1',
    contaId: 'conta-1',
    contaDestinoId: null,
    recorrenciaId: null,
    parcela: null,
    ...dados,
  };
}

export function umaRecorrencia(dados: Partial<Recorrencia> = {}): Recorrencia {
  return {
    ...base('rec-1'),
    modelo: {
      tipo: 'despesa',
      valor: brl(5000),
      descricao: 'Assinatura fictícia',
      categoriaId: 'cat-1',
      contaId: 'conta-1',
      contaDestinoId: null,
    },
    frequencia: 'mensal',
    inicio: '2026-01-31',
    fim: null,
    geradaAte: null,
    ...dados,
  };
}

export function umaContaAgendada(dados: Partial<ContaAgendada> = {}): ContaAgendada {
  return {
    ...base('agendada-1'),
    tipo: 'pagar',
    descricao: 'Conta de luz fictícia',
    valor: brl(18_000),
    vencimento: '2026-11-10',
    categoriaId: 'cat-1',
    contaId: null,
    recorrencia: null,
    pagamentos: [],
    ...dados,
  };
}

export function umCofrinho(dados: Partial<Cofrinho> = {}): Cofrinho {
  return {
    ...base('cofrinho-1'),
    nome: 'Viagem fictícia',
    meta: brl(600_000),
    prazo: null,
    icone: 'viagem',
    cor: 'azul',
    movimentacoes: [],
    encerradoEm: null,
    ...dados,
  };
}

export function umaMovimentacao(dados: Partial<MovimentacaoCofrinho> = {}): MovimentacaoCofrinho {
  return {
    id: 'mov-1',
    tipo: 'deposito',
    valor: brl(10_000),
    data: '2026-11-01',
    contaId: 'conta-1',
    origem: 'manual',
    registradoEm: INSTANTE,
    ...dados,
  };
}
