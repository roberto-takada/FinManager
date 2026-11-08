import { type ContaAgendada, TIPOS_CONTA_AGENDADA } from '../../domain/agenda/conta-agendada';
import { type Categoria, rotuloCategoria } from '../../domain/categorias/categoria';
import { type Cofrinho, saldoCofrinho } from '../../domain/cofrinhos/cofrinho';
import { type ContaFinanceira, TIPOS_CONTA } from '../../domain/contas/conta';
import { FREQUENCIAS, type Recorrencia } from '../../domain/recorrencias/recorrencia';
import { formatarData } from '../../domain/shared/data';
import { formatarDinheiro } from '../../domain/shared/dinheiro';
import { descricaoExibida, type Transacao } from '../../domain/transacoes/transacao';

/** Descrições curtas e legíveis para o histórico e a lixeira (RF-075, RF-076). */

export const resumoTransacao = (t: Transacao) =>
  `${descricaoExibida(t)} — ${formatarDinheiro(t.valor)} em ${formatarData(t.data)}`;

export const resumoConta = (c: ContaFinanceira) => `${c.nome} (${TIPOS_CONTA[c.tipo]})`;

export const resumoCategoria = (c: Categoria, todas: readonly Categoria[]) =>
  rotuloCategoria(c, todas);

export const resumoRecorrencia = (r: Recorrencia) =>
  `${r.modelo.descricao || 'Recorrência'} — ${formatarDinheiro(r.modelo.valor)}, ${FREQUENCIAS[r.frequencia].toLowerCase()}`;

export const resumoContaAgendada = (c: ContaAgendada) =>
  `${TIPOS_CONTA_AGENDADA[c.tipo]}: ${c.descricao} — ${formatarDinheiro(c.valor)}, vence em ${formatarData(c.vencimento)}${c.recorrencia ? ` (${FREQUENCIAS[c.recorrencia.frequencia].toLowerCase()})` : ''}`;

export const resumoCofrinho = (c: Cofrinho) =>
  `${c.nome} — ${formatarDinheiro(saldoCofrinho(c))} de ${formatarDinheiro(c.meta)}`;
