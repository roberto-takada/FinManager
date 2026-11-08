import { formatarDinheiro } from '../shared/dinheiro';
import { ativos } from '../shared/entidade';
import { type ContaAgendada, TIPOS_CONTA_AGENDADA } from './conta-agendada';

/**
 * Exportação do calendário em iCalendar (.ics, RFC 5545) — RF-025.
 * Cada conta vira um evento de dia inteiro; contas recorrentes usam RRULE.
 * O arquivo NÃO é cifrado: a interface deve avisar antes de exportar.
 */

const FREQ = { semanal: 'WEEKLY', mensal: 'MONTHLY', anual: 'YEARLY' } as const;

/** Escapa texto conforme a RFC 5545 (barra, ponto e vírgula, vírgula e quebras de linha). */
export function escaparTexto(texto: string): string {
  return texto
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** Quebra linhas com mais de 75 bytes (UTF-8), sem partir caracteres acentuados. */
export function dobrarLinha(linha: string): string {
  const codificador = new TextEncoder();
  const partes: string[] = [];
  let atual = '';
  let bytes = 0;
  for (const caractere of linha) {
    const tamanho = codificador.encode(caractere).length;
    const limite = partes.length === 0 ? 75 : 74; // linhas de continuação começam com espaço
    if (bytes + tamanho > limite) {
      partes.push(atual);
      atual = '';
      bytes = 0;
    }
    atual += caractere;
    bytes += tamanho;
  }
  partes.push(atual);
  return partes.join('\r\n ');
}

const dataIcs = (data: string) => data.replace(/-/g, '');

/**
 * Regra de repetição equivalente à do app, que ajusta dias inexistentes para o fim do
 * mês (31/01 → 28/02). Na RFC 5545, BYMONTHDAY=31 pularia os meses curtos; por isso, para
 * dias 29 a 31, usa-se "o maior dia até N" com BYSETPOS=-1.
 */
export function regraDeRepeticao(conta: ContaAgendada): string | null {
  if (!conta.recorrencia) return null;
  const partes = [`FREQ=${FREQ[conta.recorrencia.frequencia]}`];
  const [, mes, dia] = conta.vencimento.split('-').map(Number) as [number, number, number];
  const diasAte = (n: number) => Array.from({ length: n - 27 }, (_, i) => 28 + i).join(',');
  if (conta.recorrencia.frequencia === 'mensal' && dia > 28) {
    partes.push(`BYMONTHDAY=${diasAte(dia)}`, 'BYSETPOS=-1');
  }
  if (conta.recorrencia.frequencia === 'anual' && mes === 2 && dia === 29) {
    partes.push('BYMONTH=2', 'BYMONTHDAY=28,29', 'BYSETPOS=-1');
  }
  if (conta.recorrencia.fim) partes.push(`UNTIL=${dataIcs(conta.recorrencia.fim)}`);
  return partes.join(';');
}

export function gerarIcs(contas: readonly ContaAgendada[], agora: Date): string {
  const carimbo = agora
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
  const eventos = ativos(contas).flatMap((conta) => {
    const regra = regraDeRepeticao(conta);
    const resumo = `${TIPOS_CONTA_AGENDADA[conta.tipo]}: ${conta.descricao} (${formatarDinheiro(conta.valor)})`;
    return [
      'BEGIN:VEVENT',
      `UID:${conta.id}@finmanager`,
      `DTSTAMP:${carimbo}`,
      `DTSTART;VALUE=DATE:${dataIcs(conta.vencimento)}`,
      ...(regra ? [`RRULE:${regra}`] : []),
      `SUMMARY:${escaparTexto(resumo)}`,
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    ];
  });
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//FinManager//Calendario de contas//PT-BR',
    'CALSCALE:GREGORIAN',
    ...eventos,
    'END:VCALENDAR',
  ]
    .map(dobrarLinha)
    .join('\r\n')
    .concat('\r\n');
}
