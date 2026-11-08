import { TestBed } from '@angular/core/testing';
import { LAYOUT_PADRAO, moverWidget, removerWidget } from '../../domain/dashboard/layout';
import { brl } from '../../../testing/fabricas';
import { type AmbienteDados, prepararAmbienteDados } from '../../../testing/dados';
import { CofrinhosService } from '../cofrinhos/cofrinhos.service';
import { ContasService } from '../contas/contas.service';
import { PreferenciasService } from '../preferencias/preferencias.service';
import { ResumoService } from '../resumo/resumo.service';
import { TransacoesService } from '../transacoes/transacoes.service';
import { DashboardService } from './dashboard.service';

/** Hoje nos testes: 08/11/2026. */
describe('DashboardService (RF-041 a RF-044)', () => {
  let amb: AmbienteDados;
  let dashboard: DashboardService;
  let contaId: string;

  beforeEach(async () => {
    amb = await prepararAmbienteDados();
    dashboard = TestBed.inject(DashboardService);
    contaId = (
      await TestBed.inject(ContasService).criar({
        nome: 'Banco',
        tipo: 'corrente',
        saldoInicial: brl(100_000),
      })
    ).id;
  });

  const lancar = (tipo: 'receita' | 'despesa', valor: number, data: string, categoria: string) =>
    TestBed.inject(TransacoesService).criar({
      tipo,
      valor: brl(valor),
      data,
      descricao: `${tipo} ${data}`,
      categoriaId: amb.dados.categorias().find((c) => c.nome === categoria)!.id,
      contaId,
      contaDestinoId: null,
    });

  it('sem layout guardado, vale o padrão', () => {
    expect(dashboard.layout()).toEqual(LAYOUT_PADRAO);
  });

  it('o layout fica cifrado nas preferências e vale de novo ao reabrir, sem perder o tema', async () => {
    await TestBed.inject(PreferenciasService).definirTema('escuro');
    const layout = moverWidget(removerWidget(LAYOUT_PADRAO, 'metas'), 'patrimonio', -1);
    await dashboard.salvarLayout(layout);
    expect(amb.armazenamento.colecoes.get('preferencias')).toEqual([
      expect.objectContaining({ tema: 'escuro', dashboard: layout }),
    ]);

    await amb.reabrir();
    expect(dashboard.layout()).toEqual(layout);
    expect(TestBed.inject(PreferenciasService).tema()).toBe('escuro');
  });

  it('o último ponto do patrimônio é igual ao patrimônio do resumo', async () => {
    await lancar('receita', 50_000, '2026-10-05', 'Salário');
    await lancar('despesa', 20_000, '2026-11-02', 'Mercado');
    const cofrinhos = TestBed.inject(CofrinhosService);
    const c = await cofrinhos.criar({
      nome: 'Viagem',
      meta: brl(90_000),
      prazo: null,
      icone: 'viagem',
      cor: 'azul',
    });
    await cofrinhos.depositar(c.id, { valor: brl(30_000), data: '2026-11-08', contaId });

    const pontos = dashboard.patrimonio().pontos;
    expect(pontos.map((p) => p.valor.unidades)).toEqual([150_000, 130_000]);
    expect(pontos.at(-1)!.valor).toEqual(TestBed.inject(ResumoService).patrimonio());
    expect(dashboard.patrimonio().variacao).toEqual(brl(-20_000));
  });

  it('despesas por categoria do mês e receitas x despesas dos últimos 6 meses', async () => {
    await lancar('despesa', 30_000, '2026-11-02', 'Mercado');
    await lancar('despesa', 10_000, '2026-11-03', 'Mercado');
    await lancar('despesa', 99_000, '2026-10-20', 'Mercado');
    await lancar('receita', 70_000, '2026-11-05', 'Salário');

    expect(dashboard.despesasPorCategoria()).toEqual([
      // Mercado é subcategoria: soma na principal.
      expect.objectContaining({ nome: 'Alimentação', valor: brl(40_000), percentual: 100 }),
    ]);
    const meses = dashboard.receitasDespesas();
    expect(meses.map((m) => m.mes)).toEqual([
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
      '2026-11',
    ]);
    expect(meses.at(-1)).toEqual(
      expect.objectContaining({ receitas: brl(70_000), despesas: brl(40_000) }),
    );
  });
});
