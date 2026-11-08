import { brl, umaContaAgendada } from '../../../testing/fabricas';
import { calcularAlertas, descricaoDoAlerta, resumoDiscreto, textoDaNotificacao } from './alertas';
import { diasDaSemana, intervaloDaVisao, navegar, semanasDoMes, tituloDaVisao } from './calendario';
import { dobrarLinha, escaparTexto, gerarIcs, regraDeRepeticao } from './ical';

describe('calendário (RF-021)', () => {
  it('mês completo em semanas de domingo a sábado', () => {
    const semanas = semanasDoMes('2026-11-15');
    expect(semanas).toHaveLength(5);
    expect(semanas[0]![0]).toBe('2026-11-01'); // 01/11/2026 é domingo
    expect(semanas.at(-1)!.at(-1)).toBe('2026-12-05');
    expect(semanas.every((s) => s.length === 7)).toBe(true);
  });

  it('inclui dias do mês anterior na primeira semana', () => {
    expect(semanasDoMes('2026-02-10')[0]![0]).toBe('2026-02-01');
    expect(semanasDoMes('2026-12-10')[0]![0]).toBe('2026-11-29');
  });

  it('semana que contém a data', () => {
    expect(diasDaSemana('2026-11-11')).toEqual([
      '2026-11-08',
      '2026-11-09',
      '2026-11-10',
      '2026-11-11',
      '2026-11-12',
      '2026-11-13',
      '2026-11-14',
    ]);
    expect(intervaloDaVisao('semana', '2026-11-11')).toEqual(['2026-11-08', '2026-11-14']);
  });

  it('navega por mês e por semana, inclusive na virada de ano', () => {
    expect(navegar('mes', '2026-12-31', 1)).toBe('2027-01-31');
    expect(navegar('semana', '2026-12-28', 1)).toBe('2027-01-04');
    expect(navegar('mes', '2026-03-31', -1)).toBe('2026-02-28');
  });

  it('títulos legíveis', () => {
    expect(tituloDaVisao('mes', '2026-11-08')).toBe('novembro de 2026');
    expect(tituloDaVisao('semana', '2026-11-11')).toBe('08/11/2026 a 14/11/2026');
  });
});

describe('alertas de vencimento (RF-024, RF-026)', () => {
  const hoje = '2026-11-08';
  const contas = [
    umaContaAgendada({ id: 'vencida', descricao: 'Internet', vencimento: '2026-11-05' }),
    umaContaAgendada({ id: 'hoje', descricao: 'Água', vencimento: '2026-11-08' }),
    umaContaAgendada({ id: 'amanha1', descricao: 'Luz', vencimento: '2026-11-09' }),
    umaContaAgendada({
      id: 'amanha2',
      descricao: 'Gás',
      vencimento: '2026-11-09',
      tipo: 'receber',
    }),
    umaContaAgendada({ id: 'breve', descricao: 'Escola', vencimento: '2026-11-11' }),
    umaContaAgendada({ id: 'longe', descricao: 'IPVA', vencimento: '2026-11-20' }),
    umaContaAgendada({
      id: 'paga',
      descricao: 'Celular',
      vencimento: '2026-11-09',
      pagamentos: [{ vencimento: '2026-11-09', transacaoId: 't1' }],
    }),
  ];
  const ativas = new Set(['t1']);

  it('inclui vencidas e as que vencem até hoje + antecedência, exceto as pagas', () => {
    const ids = calcularAlertas(contas, ativas, hoje, 3).map((a) => a.ocorrencia.conta.id);
    expect(ids).toEqual(['vencida', 'hoje', 'amanha2', 'amanha1', 'breve']); // mesmo dia: ordem alfabética
    expect(calcularAlertas(contas, ativas, hoje, 0).map((a) => a.proximidade)).toEqual([
      'vencida',
      'hoje',
    ]);
  });

  it('resumo discreto, sem valores nem descrições (padrão do RF-024)', () => {
    const texto = resumoDiscreto(calcularAlertas(contas, ativas, hoje, 3));
    expect(texto).toBe(
      '1 conta vencida, 1 conta vence hoje, 2 contas vencem amanhã e 1 conta vence nos próximos dias.',
    );
    for (const proibido of ['Internet', 'Água', 'Luz', 'R$', '180'])
      expect(texto).not.toContain(proibido);
  });

  it('exemplo do requisito: "2 contas vencem amanhã"', () => {
    const alertas = calcularAlertas(contas, ativas, hoje, 1).filter(
      (a) => a.proximidade === 'amanha',
    );
    expect(resumoDiscreto(alertas)).toBe('2 contas vencem amanhã.');
  });

  it('com detalhes ativados pelo usuário, mostra descrição, valor e data', () => {
    const alertas = calcularAlertas(contas, ativas, hoje, 0);
    expect(descricaoDoAlerta(alertas[0]!).replace(/\s/g, ' ')).toBe(
      'Internet — R$ 180,00 — vencida (05/11/2026)',
    );
    expect(textoDaNotificacao(alertas, false).corpo).not.toContain('Internet');
    expect(textoDaNotificacao(alertas, true).corpo).toContain('Internet');
  });

  it('sem alertas, o resumo é vazio', () => {
    expect(resumoDiscreto([])).toBe('');
  });
});

describe('exportação iCal (RF-025)', () => {
  it('escapa caracteres especiais e dobra linhas longas sem partir acentos', () => {
    expect(escaparTexto('Água; luz, gás\\x\nfim')).toBe('Água\\; luz\\, gás\\\\x\\nfim');
    const longa = `SUMMARY:${'ç'.repeat(60)}`;
    const dobrada = dobrarLinha(longa);
    expect(dobrada.split('\r\n ').every((l) => new TextEncoder().encode(l).length <= 75)).toBe(
      true,
    );
    expect(dobrada.replace(/\r\n /g, '')).toBe(longa);
  });

  it('regras de repetição equivalentes às do app (fim de mês e 29/02)', () => {
    expect(
      regraDeRepeticao(
        umaContaAgendada({
          vencimento: '2026-01-10',
          recorrencia: { frequencia: 'mensal', fim: null },
        }),
      ),
    ).toBe('FREQ=MONTHLY');
    expect(
      regraDeRepeticao(
        umaContaAgendada({
          vencimento: '2026-01-31',
          recorrencia: { frequencia: 'mensal', fim: '2026-12-31' },
        }),
      ),
    ).toBe('FREQ=MONTHLY;BYMONTHDAY=28,29,30,31;BYSETPOS=-1;UNTIL=20261231');
    expect(
      regraDeRepeticao(
        umaContaAgendada({
          vencimento: '2028-02-29',
          recorrencia: { frequencia: 'anual', fim: null },
        }),
      ),
    ).toBe('FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=28,29;BYSETPOS=-1');
    expect(regraDeRepeticao(umaContaAgendada())).toBeNull();
  });

  it('gera um VCALENDAR válido com eventos de dia inteiro e CRLF', () => {
    const ics = gerarIcs(
      [
        umaContaAgendada({
          id: 'a',
          descricao: 'Luz',
          valor: brl(18_000),
          vencimento: '2026-11-10',
        }),
        umaContaAgendada({ id: 'b', excluidoEm: '2026-11-01T00:00:00.000Z' }),
      ],
      new Date('2026-11-08T12:00:00.000Z'),
    );
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
    expect(ics).toContain('UID:a@finmanager');
    expect(ics).toContain('DTSTART;VALUE=DATE:20261110');
    expect(ics).toContain('DTSTAMP:20261108T120000Z');
    expect(ics.replace(/\s/g, ' ')).toContain('SUMMARY:A pagar: Luz (R$ 180\\,00)');
    expect(ics).not.toContain('b@finmanager');
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics.split('\r\n').every((l) => !l.includes('\n'))).toBe(true);
  });
});
