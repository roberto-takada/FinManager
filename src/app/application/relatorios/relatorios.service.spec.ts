import { TestBed } from '@angular/core/testing';
import { prepararAmbienteDados } from '../../../testing/dados';
import { brl } from '../../../testing/fabricas';
import { criarPeriodo } from '../../domain/relatorios/periodo';
import { ContasService } from '../contas/contas.service';
import { DadosService } from '../dados/dados.service';
import { TransacoesService } from '../transacoes/transacoes.service';
import { RelatoriosService } from './relatorios.service';

describe('RelatoriosService (RF-050 a RF-052)', () => {
  it('gera o relatório sobre os dados em memória e lista só períodos com dados até hoje', async () => {
    const amb = await prepararAmbienteDados();
    const dados = TestBed.inject(DadosService);
    const conta = await TestBed.inject(ContasService).criar({
      nome: 'Banco',
      tipo: 'corrente',
      saldoInicial: brl(0),
    });
    await TestBed.inject(TransacoesService).criar({
      tipo: 'despesa',
      valor: brl(5_000),
      data: '2026-08-15',
      descricao: 'Mercado',
      categoriaId: dados.categorias().find((c) => c.nome === 'Mercado')!.id,
      contaId: conta.id,
      contaDestinoId: null,
    });
    const relatorios = TestBed.inject(RelatoriosService);

    expect(relatorios.periodos('trimestral').map((p) => p.id)).toEqual(['2026-T4', '2026-T3']);
    const r = relatorios.gerar(criarPeriodo('trimestral', 2026, 3));
    expect(r.totais.despesas).toEqual(brl(5_000));
    expect(r.categorias[0]).toMatchObject({ nome: 'Alimentação', percentual: 100 });
    expect(amb.dados.estado()).toBe('pronto');
  });
});
