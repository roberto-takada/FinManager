import { TestBed } from '@angular/core/testing';
import { brl } from '../../../testing/fabricas';
import { type AmbienteDados, prepararAmbienteDados } from '../../../testing/dados';
import { CofrinhosService } from '../cofrinhos/cofrinhos.service';
import { ContasService } from '../contas/contas.service';
import { TransacoesService } from '../transacoes/transacoes.service';
import { ResumoService } from './resumo.service';

/** Hoje nos testes: 08/11/2026. */
describe('ResumoService (tela Início)', () => {
  let amb: AmbienteDados;
  let resumo: ResumoService;
  let contaId: string;
  let salario: string;
  let mercado: string;

  beforeEach(async () => {
    amb = await prepararAmbienteDados();
    resumo = TestBed.inject(ResumoService);
    contaId = (
      await TestBed.inject(ContasService).criar({
        nome: 'Banco',
        tipo: 'corrente',
        saldoInicial: brl(100_000),
      })
    ).id;
    salario = amb.dados.categorias().find((c) => c.nome === 'Salário')!.id;
    mercado = amb.dados.categorias().find((c) => c.nome === 'Mercado')!.id;
  });

  const lancar = (tipo: 'receita' | 'despesa', valor: number, data: string) =>
    TestBed.inject(TransacoesService).criar({
      tipo,
      valor: brl(valor),
      data,
      descricao: `${tipo} ${data}`,
      categoriaId: tipo === 'receita' ? salario : mercado,
      contaId,
      contaDestinoId: null,
    });

  it('compara o mês até hoje com o mesmo período do mês anterior', async () => {
    await lancar('receita', 10_000, '2026-10-05');
    await lancar('receita', 99_999, '2026-10-20'); // depois do dia 8: fora da comparação
    await lancar('despesa', 5_000, '2026-10-03');
    await lancar('receita', 10_700, '2026-11-05');
    await lancar('despesa', 4_000, '2026-11-02');
    await lancar('despesa', 9_000, '2026-11-20'); // futuro: fora

    expect(resumo.mes()).toEqual({
      nome: 'novembro de 2026',
      nomeAnterior: 'outubro',
      receitas: brl(10_700),
      despesas: brl(4_000),
      variacaoReceitas: 7,
      variacaoDespesas: -20,
    });
  });

  it('sem movimento no mês anterior, não há variação', () => {
    expect(resumo.mes().variacaoReceitas).toBeNull();
  });

  it('patrimônio soma contas e cofrinhos (depositar não muda o patrimônio)', async () => {
    const cofrinhos = TestBed.inject(CofrinhosService);
    const c = await cofrinhos.criar({
      nome: 'Viagem',
      meta: brl(50_000),
      prazo: null,
      icone: 'viagem',
      cor: 'azul',
    });
    await cofrinhos.depositar(c.id, { valor: brl(30_000), data: '2026-11-08', contaId });

    expect(resumo.saldoEmContas()).toEqual(brl(70_000));
    expect(resumo.guardadoEmCofrinhos()).toEqual(brl(30_000));
    expect(resumo.patrimonio()).toEqual(brl(100_000));
    expect(resumo.metas().map((m) => m.nome)).toEqual(['Viagem']);
  });

  it('recentes: até 5, só até hoje, da mais nova para a mais antiga', async () => {
    for (const dia of ['01', '02', '03', '04', '05', '06'])
      await lancar('despesa', 100, `2026-11-${dia}`);
    await lancar('despesa', 100, '2026-11-30');
    expect(resumo.recentes().map((t) => t.data)).toEqual([
      '2026-11-06',
      '2026-11-05',
      '2026-11-04',
      '2026-11-03',
      '2026-11-02',
    ]);
  });
});
