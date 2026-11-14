import { type ContaAgendada, TIPOS_CONTA_AGENDADA } from '../agenda/conta-agendada';
import { type Categoria, rotuloCategoria } from '../categorias/categoria';
import { type Cofrinho, saldoCofrinho } from '../cofrinhos/cofrinho';
import { type ContaFinanceira, TIPOS_CONTA } from '../contas/conta';
import { FREQUENCIAS, type Recorrencia } from '../recorrencias/recorrencia';
import { formatarData } from '../shared/data';
import { formatarDinheiro } from '../shared/dinheiro';
import { descricaoExibida, type Transacao } from '../transacoes/transacao';

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
