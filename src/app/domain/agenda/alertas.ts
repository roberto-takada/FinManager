import { type DataISO, somarDias } from '../shared/data';
import { formatarDinheiro } from '../shared/dinheiro';
import { type ContaAgendada, ocorrenciasNoPeriodo, type Ocorrencia } from './conta-agendada';

/**
 * Alertas de vencimento (RF-024, RF-026, ENGENHARIA_DE_SOFTWARE §5.10).
 * Os mesmos alertas alimentam as notificações do navegador e o aviso dentro do app.
 */

export interface PreferenciasNotificacao {
  /** O usuário ativou as notificações do navegador (RF-026: só por ação explícita). */
  readonly ativas: boolean;
  /** Com quantos dias de antecedência avisar (0 = só no dia). */
  readonly antecedenciaDias: number;
  /** Mostrar descrições e valores no texto da notificação (padrão: não). */
  readonly mostrarDetalhes: boolean;
}

export const PREFERENCIAS_NOTIFICACAO_PADRAO: PreferenciasNotificacao = {
  ativas: false,
  antecedenciaDias: 3,
  mostrarDetalhes: false,
};

export const OPCOES_ANTECEDENCIA_DIAS = [0, 1, 2, 3, 5, 7] as const;

export type Proximidade = 'vencida' | 'hoje' | 'amanha' | 'em-breve';

export interface Alerta {
  readonly ocorrencia: Ocorrencia;
  readonly proximidade: Proximidade;
  /** Chave estável da ocorrência, usada para não notificar duas vezes no mesmo dia. */
  readonly chave: string;
}

export const chaveDaOcorrencia = (o: Ocorrencia) => `${o.conta.id}|${o.vencimento}`;

/**
 * Ocorrências não quitadas que vencem até `hoje + antecedência`, incluindo as vencidas.
 */
export function calcularAlertas(
  contas: readonly ContaAgendada[],
  transacoesAtivas: ReadonlySet<string>,
  hoje: DataISO,
  antecedenciaDias: number,
): Alerta[] {
  const amanha = somarDias(hoje, 1);
  const limite = somarDias(hoje, Math.max(0, antecedenciaDias));
  const maisAntigo = contas.reduce<DataISO>((m, c) => (c.vencimento < m ? c.vencimento : m), hoje);
  return ocorrenciasNoPeriodo(contas, maisAntigo, limite, transacoesAtivas, hoje)
    .filter((o) => o.situacao !== 'paga')
    .map((ocorrencia) => ({
      ocorrencia,
      chave: chaveDaOcorrencia(ocorrencia),
      proximidade:
        ocorrencia.vencimento < hoje
          ? 'vencida'
          : ocorrencia.vencimento === hoje
            ? 'hoje'
            : ocorrencia.vencimento === amanha
              ? 'amanha'
              : 'em-breve',
    }));
}

const FRASES: Record<Proximidade, [singular: string, plural: string]> = {
  vencida: ['1 conta vencida', '{n} contas vencidas'],
  hoje: ['1 conta vence hoje', '{n} contas vencem hoje'],
  amanha: ['1 conta vence amanhã', '{n} contas vencem amanhã'],
  'em-breve': ['1 conta vence nos próximos dias', '{n} contas vencem nos próximos dias'],
};

function juntar(partes: string[]): string {
  if (partes.length <= 1) return partes.join('');
  return `${partes.slice(0, -1).join(', ')} e ${partes.at(-1)}`;
}

/** Resumo discreto, sem valores nem descrições (RF-024), ex.: "2 contas vencem amanhã." */
export function resumoDiscreto(alertas: readonly Alerta[]): string {
  const partes = (['vencida', 'hoje', 'amanha', 'em-breve'] as const)
    .map((p) => {
      const n = alertas.filter((a) => a.proximidade === p).length;
      if (n === 0) return null;
      const [um, varios] = FRASES[p];
      return n === 1 ? um : varios.replace('{n}', String(n));
    })
    .filter((p): p is string => p !== null);
  const texto = juntar(partes);
  return texto ? `${texto.charAt(0).toUpperCase()}${texto.slice(1)}.` : '';
}

const QUANDO: Record<Proximidade, string> = {
  vencida: 'vencida',
  hoje: 'vence hoje',
  amanha: 'vence amanhã',
  'em-breve': 'vence em breve',
};

/** Linha detalhada de um alerta (usada dentro do app e, se o usuário quiser, na notificação). */
export function descricaoDoAlerta(alerta: Alerta): string {
  const { conta, vencimento } = alerta.ocorrencia;
  const [ano, mes, dia] = vencimento.split('-');
  return `${conta.descricao} — ${formatarDinheiro(conta.valor)} — ${QUANDO[alerta.proximidade]} (${dia}/${mes}/${ano})`;
}

/** Título e corpo da notificação do navegador. */
export function textoDaNotificacao(
  alertas: readonly Alerta[],
  mostrarDetalhes: boolean,
): { titulo: string; corpo: string } {
  return {
    titulo: 'FinManager: contas a vencer',
    corpo: mostrarDetalhes ? alertas.map(descricaoDoAlerta).join('\n') : resumoDiscreto(alertas),
  };
}
