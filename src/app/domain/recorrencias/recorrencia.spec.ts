import { umaRecorrencia } from '../../../testing/fabricas';
import { ErroDominio } from '../shared/erro-dominio';
import { ocorrenciasPendentes, proximaOcorrencia, validarDadosRecorrencia } from './recorrencia';

describe('recorrências (RF-012)', () => {
  it('mensal a partir do dia 31 respeita o fim de cada mês, sem acumular ajustes', () => {
    const rec = umaRecorrencia({ frequencia: 'mensal', inicio: '2026-01-31' });
    expect(ocorrenciasPendentes(rec, '2026-04-30')).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ]);
  });

  it('semanal e anual', () => {
    expect(
      ocorrenciasPendentes(
        umaRecorrencia({ frequencia: 'semanal', inicio: '2026-12-21' }),
        '2027-01-05',
      ),
    ).toEqual(['2026-12-21', '2026-12-28', '2027-01-04']);
    expect(
      ocorrenciasPendentes(
        umaRecorrencia({ frequencia: 'anual', inicio: '2024-02-29' }),
        '2026-12-31',
      ),
    ).toEqual(['2024-02-29', '2025-02-28', '2026-02-28']);
  });

  it('não gera de novo o que já foi gerado (mesmo que tenha sido excluído)', () => {
    const rec = umaRecorrencia({ inicio: '2026-01-10', geradaAte: '2026-02-10' });
    expect(ocorrenciasPendentes(rec, '2026-04-10')).toEqual(['2026-03-10', '2026-04-10']);
  });

  it('para na data final da série', () => {
    const rec = umaRecorrencia({ inicio: '2026-01-10', fim: '2026-02-20' });
    expect(ocorrenciasPendentes(rec, '2026-12-31')).toEqual(['2026-01-10', '2026-02-10']);
  });

  it('não gera ocorrências futuras', () => {
    expect(ocorrenciasPendentes(umaRecorrencia({ inicio: '2027-01-01' }), '2026-11-08')).toEqual(
      [],
    );
  });

  it('valida frequência e data final', () => {
    const { modelo } = umaRecorrencia();
    expect(() =>
      validarDadosRecorrencia({
        modelo,
        frequencia: 'diaria' as never,
        inicio: '2026-01-01',
        fim: null,
      }),
    ).toThrow(ErroDominio);
    expect(() =>
      validarDadosRecorrencia({
        modelo,
        frequencia: 'mensal',
        inicio: '2026-03-01',
        fim: '2026-02-01',
      }),
    ).toThrow(/posterior/);
  });
});

describe('proximaOcorrencia', () => {
  it('devolve a próxima data após a referência, ou null se a série acabou', () => {
    const rec = umaRecorrencia({ inicio: '2026-01-31' });
    expect(proximaOcorrencia(rec, '2026-02-28')).toBe('2026-03-31');
    expect(proximaOcorrencia({ ...rec, fim: '2026-02-28' }, '2026-02-28')).toBeNull();
  });
});
