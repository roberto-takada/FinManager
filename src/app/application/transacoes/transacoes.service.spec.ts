import { TestBed } from '@angular/core/testing';
import { brl, umaTransacao } from '../../../testing/fabricas';
import { type AmbienteDados, prepararAmbienteDados } from '../../../testing/dados';
import { ErroDominio } from '../../domain/shared/erro-dominio';
import { type DadosTransacao, totalizar } from '../../domain/transacoes/transacao';
import { ContasService } from '../contas/contas.service';
import { HistoricoService } from '../historico/historico.service';
import { RecorrenciasService } from '../recorrencias/recorrencias.service';
import { TransacoesService } from './transacoes.service';

describe('TransacoesService (RF-010 a RF-017, RN-004)', () => {
  let amb: AmbienteDados;
  let transacoes: TransacoesService;
  let contas: ContasService;
  let historico: HistoricoService;
  let despesa: DadosTransacao;
  let contaId: string;
  let carteiraId: string;

  beforeEach(async () => {
    amb = await prepararAmbienteDados();
    transacoes = TestBed.inject(TransacoesService);
    contas = TestBed.inject(ContasService);
    historico = TestBed.inject(HistoricoService);
    contaId = (await contas.criar({ nome: 'Banco', tipo: 'corrente', saldoInicial: brl(100_000) }))
      .id;
    carteiraId = (await contas.criar({ nome: 'Carteira', tipo: 'carteira', saldoInicial: brl(0) }))
      .id;
    const mercado = amb.dados.categorias().find((c) => c.nome === 'Mercado')!;
    despesa = {
      tipo: 'despesa',
      valor: brl(12_000),
      data: '2026-11-05',
      descricao: 'Supermercado',
      categoriaId: mercado.id,
      contaId,
      contaDestinoId: null,
    };
  });

  describe('criar (RF-010, US-001)', () => {
    it('registra a despesa, que aparece na lista e atualiza o saldo', async () => {
      const [criada] = await transacoes.criar(despesa);

      expect(transacoes.ativas().map((t) => t.id)).toEqual([criada!.id]);
      expect(contas.saldos().get(contaId)).toEqual(brl(100_000 - 12_000));
      expect(amb.armazenamento.colecoes.get('transacoes')).toHaveLength(1);
    });

    it.each([0, -1])('recusa valor %i sem gravar nada', async (unidades) => {
      const gravacoes = amb.armazenamento.gravacoes;
      await expect(transacoes.criar({ ...despesa, valor: brl(unidades) })).rejects.toMatchObject({
        campo: 'valor',
        message: 'Informe um valor maior que zero.',
      });
      expect(amb.armazenamento.gravacoes).toBe(gravacoes);
    });
  });

  it('parcelamento (RF-013) está suspenso até RF-100 e não grava nada', async () => {
    const gravacoes = amb.armazenamento.gravacoes;
    await expect(transacoes.criar(despesa, { parcelas: 3 })).rejects.toMatchObject({
      codigo: 'parcelamento-suspenso',
      campo: 'parcelas',
    });
    expect(transacoes.ativas()).toEqual([]);
    expect(amb.armazenamento.gravacoes).toBe(gravacoes);
  });

  it('recorrente (RF-012): cria as ocorrências até hoje e guarda a recorrência', async () => {
    const criadas = await transacoes.criar(
      { ...despesa, descricao: 'Academia', data: '2026-09-08' },
      { recorrencia: { frequencia: 'mensal', fim: null } },
    );
    expect(criadas.map((t) => t.data)).toEqual(['2026-09-08', '2026-10-08', '2026-11-08']);
    expect(TestBed.inject(RecorrenciasService).ativas()).toHaveLength(1);
  });

  it('pedido de parcelada e recorrente ao mesmo tempo é recusado', async () => {
    await expect(
      transacoes.criar(despesa, { parcelas: 2, recorrencia: { frequencia: 'mensal', fim: null } }),
    ).rejects.toThrow(ErroDominio);
  });

  /**
   * Parcelas já existentes (ex.: vindas de um backup, ou quando RF-013 for reativado)
   * continuam com as regras de edição e exclusão em lote. Carregadas direto do armazenamento.
   */
  async function carregarParcelas(total: number): Promise<string> {
    const existentes = amb.armazenamento.colecoes.get('transacoes') ?? [];
    const parcelas = Array.from({ length: total }, (_, i) =>
      umaTransacao({
        id: `parcela-${i + 1}`,
        valor: brl(1_000),
        data: '2026-11-01',
        categoriaId: despesa.categoriaId,
        contaId,
        parcela: { grupoId: 'compra-1', numero: i + 1, total, dataCompra: '2026-11-01' },
      }),
    );
    amb.armazenamento.colecoes.set('transacoes', [...existentes, ...parcelas]);
    await amb.reabrir();
    return 'compra-1';
  }

  it('transferência (RF-017) move saldo sem contar como receita ou despesa', async () => {
    await transacoes.criar({
      ...despesa,
      tipo: 'transferencia',
      categoriaId: null,
      contaDestinoId: carteiraId,
      valor: brl(20_000),
    });

    expect(contas.saldos().get(contaId)).toEqual(brl(80_000));
    expect(contas.saldos().get(carteiraId)).toEqual(brl(20_000));
    expect(totalizar(transacoes.ativas()).despesas).toEqual(brl(0));
  });

  describe('editar (RF-011, RN-004)', () => {
    it('edição não significativa (descrição) não entra no histórico', async () => {
      const [t] = await transacoes.criar(despesa);
      const { significativa } = await transacoes.editar(t!.id, { ...despesa, descricao: 'Feira' });

      expect(significativa).toBe(false);
      expect(transacoes.buscar(t!.id)?.descricao).toBe('Feira');
      expect(amb.dados.historico()).toEqual([]);
    });

    it('edição de valor ou data entra no histórico com o estado anterior', async () => {
      const [t] = await transacoes.criar(despesa);
      const { significativa } = await transacoes.editar(t!.id, { ...despesa, valor: brl(15_000) });

      expect(significativa).toBe(true);
      const [evento] = amb.dados.historico();
      expect(evento).toMatchObject({ acao: 'edicao', entidade: 'transacao', entidadeId: t!.id });
      expect((evento!.estadoAnterior as { valor: unknown }).valor).toEqual(brl(12_000));
      expect(evento!.ocorridoEm).toBe('2026-11-08T12:00:00.000Z');
    });

    it('uma parcela não pode virar receita', async () => {
      await carregarParcelas(2);
      const p = transacoes.buscar('parcela-1');
      const receita = amb.dados.categorias().find((c) => c.nome === 'Salário')!;
      await expect(
        transacoes.editar(p!.id, { ...despesa, tipo: 'receita', categoriaId: receita.id }),
      ).rejects.toThrow(/despesa/);
    });
  });

  describe('excluir (RF-011, RN-004)', () => {
    it('vai para a lixeira com 180 dias para restaurar e entra no histórico', async () => {
      const [t] = await transacoes.criar(despesa);
      await transacoes.excluir(t!.id);

      expect(transacoes.ativas()).toEqual([]);
      expect(contas.saldos().get(contaId)).toEqual(brl(100_000));
      expect(historico.lixeira()).toEqual([
        expect.objectContaining({ entidade: 'transacao', id: t!.id, diasRestantes: 180 }),
      ]);
      expect(amb.dados.historico()[0]).toMatchObject({
        acao: 'exclusao',
        estadoAnterior: expect.objectContaining({ id: t!.id }),
      });
    });

    it('restaurar devolve a transação e registra a restauração', async () => {
      const [t] = await transacoes.criar(despesa);
      await transacoes.excluir(t!.id);
      await historico.restaurar('transacao', t!.id);

      expect(transacoes.buscar(t!.id)).toBeTruthy();
      expect(historico.lixeira()).toEqual([]);
      expect(historico.eventos().map((e) => e.acao)).toEqual(['restauracao', 'exclusao']);
    });

    it('excluir todas as parcelas é um lote (RN-005 c)', async () => {
      const grupoId = await carregarParcelas(4);
      await transacoes.excluirParcelas(grupoId);

      expect(transacoes.ativas()).toEqual([]);
      const lotes = new Set(amb.dados.historico().map((e) => e.loteId));
      expect(amb.dados.historico()).toHaveLength(4);
      expect(lotes.size).toBe(1);
      expect([...lotes][0]).not.toBeNull();
    });

    it('não restaura transação cuja conta está na lixeira', async () => {
      const [t] = await transacoes.criar({ ...despesa, contaId: carteiraId });
      await transacoes.excluir(t!.id);
      await contas.excluir(carteiraId);

      await expect(historico.restaurar('transacao', t!.id)).rejects.toThrow(
        /Restaure a conta primeiro/,
      );
    });
  });

  it('excluir recorrência para novas ocorrências e mantém as já criadas', async () => {
    await transacoes.criar(
      { ...despesa, data: '2026-10-08' },
      { recorrencia: { frequencia: 'mensal', fim: null } },
    );
    const recorrencias = TestBed.inject(RecorrenciasService);
    await recorrencias.excluir(recorrencias.ativas()[0]!.id);

    amb.definirAgora('2027-02-01T12:00:00.000Z');
    await amb.reabrir();
    expect(transacoes.ativas()).toHaveLength(2);
  });
});
