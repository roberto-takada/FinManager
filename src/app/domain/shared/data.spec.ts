import {
  compararDatas,
  dataLocal,
  ehDataISO,
  intervaloDoMes,
  nomeDoMes,
  somarAnos,
  somarMeses,
  somarSemanas,
  variacaoPercentual,
} from './data';

describe('datas de calendário', () => {
  it('valida o formato AAAA-MM-DD e datas reais', () => {
    expect(ehDataISO('2026-02-28')).toBe(true);
    expect(ehDataISO('2028-02-29')).toBe(true); // ano bissexto
    expect(ehDataISO('2026-02-29')).toBe(false);
    expect(ehDataISO('2026-13-01')).toBe(false);
    expect(ehDataISO('01/02/2026')).toBe(false);
    expect(ehDataISO('')).toBe(false);
  });

  it('soma meses ajustando o fim do mês', () => {
    expect(somarMeses('2026-01-31', 1)).toBe('2026-02-28');
    expect(somarMeses('2028-01-31', 1)).toBe('2028-02-29');
    expect(somarMeses('2026-01-31', 2)).toBe('2026-03-31'); // a partir da original, não acumulado
    expect(somarMeses('2026-11-15', 3)).toBe('2027-02-15'); // virada de ano
  });

  it('soma semanas e anos', () => {
    expect(somarSemanas('2026-12-28', 1)).toBe('2027-01-04');
    expect(somarAnos('2028-02-29', 1)).toBe('2029-02-28');
  });

  it('compara datas como texto', () => {
    expect(compararDatas('2026-01-02', '2026-01-10')).toBe(-1);
    expect(compararDatas('2026-01-10', '2026-01-10')).toBe(0);
  });

  it('usa a data local do instante', () => {
    expect(dataLocal(new Date(2026, 10, 8, 23, 59))).toBe('2026-11-08');
  });

  it('intervalo e nome do mês, variação percentual', () => {
    expect(intervaloDoMes('2028-02-10')).toEqual(['2028-02-01', '2028-02-29']);
    expect(nomeDoMes('2026-11-08')).toBe('novembro de 2026');
    expect(nomeDoMes('2026-10-08', false)).toBe('outubro');
    expect(variacaoPercentual(10_700, 10_000)).toBe(7);
    expect(variacaoPercentual(9_390, 10_000)).toBe(-6.1);
    expect(variacaoPercentual(5, 0)).toBeNull();
  });
});
