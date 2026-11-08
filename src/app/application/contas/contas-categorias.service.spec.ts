import { TestBed } from '@angular/core/testing';
import { brl } from '../../../testing/fabricas';
import { type AmbienteDados, prepararAmbienteDados } from '../../../testing/dados';
import { CategoriasService } from '../categorias/categorias.service';
import { HistoricoService } from '../historico/historico.service';
import { TransacoesService } from '../transacoes/transacoes.service';
import { ContasService } from './contas.service';

describe('ContasService e CategoriasService (RF-015, RF-016, RN-004)', () => {
  let amb: AmbienteDados;
  let contas: ContasService;
  let categorias: CategoriasService;
  let historico: HistoricoService;

  beforeEach(async () => {
    amb = await prepararAmbienteDados();
    contas = TestBed.inject(ContasService);
    categorias = TestBed.inject(CategoriasService);
    historico = TestBed.inject(HistoricoService);
  });

  const usar = async (contaId: string, categoriaId: string) =>
    TestBed.inject(TransacoesService).criar({
      tipo: 'despesa',
      valor: brl(100),
      data: '2026-11-01',
      descricao: '',
      categoriaId,
      contaId,
      contaDestinoId: null,
    });

  describe('contas', () => {
    it('cria, edita e lista em ordem alfabética', async () => {
      await contas.criar({ nome: 'Zeta', tipo: 'corrente', saldoInicial: brl(0) });
      const alfa = await contas.criar({ nome: 'Alfa', tipo: 'carteira', saldoInicial: brl(0) });
      await contas.editar(alfa.id, { nome: 'Beta', tipo: 'carteira', saldoInicial: brl(500) });

      expect(contas.ativas().map((c) => c.nome)).toEqual(['Beta', 'Zeta']);
      expect(contas.saldos().get(alfa.id)).toEqual(brl(500));
    });

    it('não exclui conta com transações ativas', async () => {
      const conta = await contas.criar({ nome: 'Banco', tipo: 'corrente', saldoInicial: brl(0) });
      await usar(conta.id, amb.dados.categorias().find((c) => c.nome === 'Saúde')!.id);
      await expect(contas.excluir(conta.id)).rejects.toThrow(/é usada em 1 item/);
    });

    it('excluir e restaurar; nome repetido ganha "(restaurada)"', async () => {
      const conta = await contas.criar({ nome: 'Banco', tipo: 'corrente', saldoInicial: brl(0) });
      await contas.excluir(conta.id);
      await contas.criar({ nome: 'Banco', tipo: 'corrente', saldoInicial: brl(0) });
      await historico.restaurar('conta', conta.id);

      expect(contas.ativas().map((c) => c.nome)).toEqual(['Banco', 'Banco (restaurada)']);
    });
  });

  describe('categorias', () => {
    it('cria subcategoria e edita o nome', async () => {
      const pai = await categorias.criar({ nome: 'Pets', tipo: 'despesa', paiId: null });
      const filha = await categorias.criar({ nome: 'Ração', tipo: 'despesa', paiId: pai.id });
      await categorias.editar(filha.id, { nome: 'Veterinário', paiId: pai.id });

      const nomes = categorias.arvore().map((c) => c.nome);
      expect(nomes.indexOf('Veterinário')).toBe(nomes.indexOf('Pets') + 1);
    });

    it('não exclui categoria com subcategorias ativas', async () => {
      const alimentacao = amb.dados.categorias().find((c) => c.nome === 'Alimentação')!;
      await expect(categorias.excluir(alimentacao.id)).rejects.toThrow(/subcategorias/);
    });

    it('não exclui categoria em uso', async () => {
      const conta = await contas.criar({ nome: 'Banco', tipo: 'corrente', saldoInicial: brl(0) });
      const saude = amb.dados.categorias().find((c) => c.nome === 'Saúde')!;
      await usar(conta.id, saude.id);
      await expect(categorias.excluir(saude.id)).rejects.toThrow(/é usada em 1 item/);
    });

    it('exclusão entra na lixeira e no histórico', async () => {
      const saude = amb.dados.categorias().find((c) => c.nome === 'Saúde')!;
      await categorias.excluir(saude.id);

      expect(categorias.arvore().some((c) => c.id === saude.id)).toBe(false);
      expect(historico.lixeira()[0]).toMatchObject({ entidade: 'categoria', resumo: 'Saúde' });
    });

    it('não restaura subcategoria se a categoria-pai estiver na lixeira', async () => {
      const pai = await categorias.criar({ nome: 'Pets', tipo: 'despesa', paiId: null });
      const filha = await categorias.criar({ nome: 'Ração', tipo: 'despesa', paiId: pai.id });
      await categorias.excluir(filha.id);
      await categorias.excluir(pai.id);
      await expect(historico.restaurar('categoria', filha.id)).rejects.toThrow(/categoria-pai/);
    });
  });
});
