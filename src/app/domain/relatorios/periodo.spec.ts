import {
  criarPeriodo,
  deslocarPeriodo,
  lerPeriodo,
  periodoContendo,
  periodosDisponiveis,
} from './periodo';

describe('períodos dos relatórios (RF-050)', () => {
  it('cria os quatro tipos com intervalo, id e nome', () => {
    expect(criarPeriodo('mensal', 2026, 2)).toMatchObject({
      id: '2026-02',
      de: '2026-02-01',
      ate: '2026-02-28',
      nome: 'fevereiro de 2026',
    });
    expect(criarPeriodo('trimestral', 2026, 3)).toMatchObject({
      id: '2026-T3',
      de: '2026-07-01',
      ate: '2026-09-30',
      nome: '3º trimestre de 2026',
    });
    expect(criarPeriodo('semestral', 2026, 2)).toMatchObject({
      id: '2026-S2',
      de: '2026-07-01',
      ate: '2026-12-31',
      nome: '2º semestre de 2026',
    });
    expect(criarPeriodo('anual', 2028, 1)).toMatchObject({
      id: '2028',
      de: '2028-01-01',
      ate: '2028-12-31',
      nome: '2028',
    });
    expect(criarPeriodo('mensal', 2028, 2).ate).toBe('2028-02-29');
  });

  it('recusa índices fora do tipo', () => {
    expect(() => criarPeriodo('trimestral', 2026, 5)).toThrow(RangeError);
    expect(() => criarPeriodo('mensal', 2026, 0)).toThrow(RangeError);
  });

  it('acha o período que contém uma data', () => {
    expect(periodoContendo('trimestral', '2026-11-08').id).toBe('2026-T4');
    expect(periodoContendo('semestral', '2026-06-30').id).toBe('2026-S1');
    expect(periodoContendo('mensal', '2026-11-08').id).toBe('2026-11');
  });

  it('o anterior equivalente atravessa a virada do ano (RF-052)', () => {
    expect(deslocarPeriodo(criarPeriodo('trimestral', 2026, 1), -1).id).toBe('2025-T4');
    expect(deslocarPeriodo(criarPeriodo('mensal', 2026, 1), -1).id).toBe('2025-12');
    expect(deslocarPeriodo(criarPeriodo('semestral', 2026, 2), 1).id).toBe('2027-S1');
    expect(deslocarPeriodo(criarPeriodo('anual', 2026, 1), -1).id).toBe('2025');
  });

  it('lê o id da URL e ignora ids inválidos ou de outro tipo', () => {
    expect(lerPeriodo('trimestral', '2026-T3')?.de).toBe('2026-07-01');
    expect(lerPeriodo('anual', '2026')?.id).toBe('2026');
    expect(lerPeriodo('trimestral', '2026-T9')).toBeNull();
    expect(lerPeriodo('mensal', '2026-T3')).toBeNull();
    expect(lerPeriodo('mensal', null)).toBeNull();
  });

  it('lista do período atual até o do primeiro registro, sem futuros', () => {
    expect(periodosDisponiveis('trimestral', '2025-11-20', '2026-11-08').map((p) => p.id)).toEqual([
      '2026-T4',
      '2026-T3',
      '2026-T2',
      '2026-T1',
      '2025-T4',
    ]);
    expect(periodosDisponiveis('anual', '2026-03-01', '2026-11-08').map((p) => p.id)).toEqual([
      '2026',
    ]);
  });
});
