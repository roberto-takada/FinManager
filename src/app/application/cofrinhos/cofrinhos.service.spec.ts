import { TestBed } from '@angular/core/testing';
import { brl } from '../../../testing/fabricas';
import { type AmbienteDados, prepararAmbienteDados } from '../../../testing/dados';
import { type DadosCofrinho, planejamento, progresso } from '../../domain/cofrinhos/cofrinho';
import { ContasService } from '../contas/contas.service';
import { HistoricoService } from '../historico/historico.service';
import { CofrinhosService } from './cofrinhos.service';

/** Hoje nos testes: 08/11/2026. */
describe('CofrinhosService (RF-030 a RF-034, RN-005)', () => {
  let amb: AmbienteDados;
  let cofrinhos: CofrinhosService;
  let contas: ContasService;
  let contaId: string;
  const viagem: DadosCofrinho = {
    nome: 'Viagem',
    meta: brl(600_000),
    prazo: '2027-11-08',
    icone: 'viagem',
    cor: 'azul',
  };

  beforeEach(async () => {
    amb = await prepararAmbienteDados();
    cofrinhos = TestBed.inject(CofrinhosService);
    contas = TestBed.inject(ContasService);
    contaId = (
      await contas.criar({ nome: 'Banco', tipo: 'corrente', saldoInicial: brl(1_000_000) })
    ).id;
  });

  const deposito = (valor: number) => ({ valor: brl(valor), data: '2026-11-08', contaId });

  it('US-005: cria com 0% e sugestão de R$ 500/mês; depositar R$ 600 leva a 10%', async () => {
    const c = await cofrinhos.criar(viagem);
    expect(progresso(c).percentual).toBe(0);
    expect(planejamento(c, '2026-11-08')).toMatchObject({ porMes: brl(50_000) });

    await cofrinhos.depositar(c.id, deposito(60_000));
    expect(progresso(cofrinhos.buscar(c.id)!).percentual).toBe(10);
    expect(amb.armazenamento.colecoes.get('cofrinhos')).toHaveLength(1);
  });

  it('depósito sai da conta e retirada volta: o patrimônio não muda (RF-031)', async () => {
    const c = await cofrinhos.criar(viagem);
    await cofrinhos.depositar(c.id, deposito(100_000));
    expect(contas.saldos().get(contaId)).toEqual(brl(900_000));

    await cofrinhos.retirar(c.id, deposito(30_000));
    expect(contas.saldos().get(contaId)).toEqual(brl(930_000));
    expect(progresso(cofrinhos.buscar(c.id)!).saldo).toEqual(brl(70_000));
    expect(
      cofrinhos.buscar(c.id)!.movimentacoes.map((m) => [m.tipo, m.valor.unidades, m.origem]),
    ).toEqual([
      ['deposito', 100_000, 'manual'],
      ['retirada', 30_000, 'manual'],
    ]);
  });

  it('recusa retirada maior que o saldo, sem gravar nada', async () => {
    const c = await cofrinhos.criar(viagem);
    await cofrinhos.depositar(c.id, deposito(10_000));
    const gravacoes = amb.armazenamento.gravacoes;
    await expect(cofrinhos.retirar(c.id, deposito(10_001))).rejects.toThrow('saldo suficiente');
    expect(amb.armazenamento.gravacoes).toBe(gravacoes);
  });

  describe('zerar e encerrar (RN-005 d, RF-034)', () => {
    it('zerar devolve todo o saldo, mantém o cofrinho e entra no histórico', async () => {
      const c = await cofrinhos.criar(viagem);
      await cofrinhos.depositar(c.id, deposito(25_000));
      await cofrinhos.zerar(c.id, { contaId, data: '2026-11-08' });

      const zerado = cofrinhos.buscar(c.id)!;
      expect(progresso(zerado).saldo).toEqual(brl(0));
      expect(zerado.movimentacoes.at(-1)).toMatchObject({
        tipo: 'retirada',
        origem: 'zeramento',
        valor: brl(25_000),
      });
      expect(cofrinhos.emAndamento()).toHaveLength(1);
      expect(contas.saldos().get(contaId)).toEqual(brl(1_000_000));
      expect(amb.dados.historico()[0]).toMatchObject({
        acao: 'zeramento',
        entidade: 'cofrinho',
        estadoAnterior: expect.objectContaining({
          movimentacoes: [expect.objectContaining({ valor: brl(25_000) })],
        }),
      });
    });

    it('não zera cofrinho vazio', async () => {
      const c = await cofrinhos.criar(viagem);
      await expect(cofrinhos.zerar(c.id, { contaId, data: '2026-11-08' })).rejects.toThrow(
        'já está zerado',
      );
    });

    it('encerrar devolve o saldo, arquiva e bloqueia novas movimentações', async () => {
      const c = await cofrinhos.criar(viagem);
      await cofrinhos.depositar(c.id, deposito(40_000));
      await cofrinhos.encerrar(c.id, { contaId, data: '2026-11-08' });

      expect(cofrinhos.emAndamento()).toEqual([]);
      expect(cofrinhos.encerrados().map((x) => x.id)).toEqual([c.id]);
      expect(contas.saldos().get(contaId)).toEqual(brl(1_000_000));
      expect(amb.dados.historico()[0]).toMatchObject({
        acao: 'encerramento',
        entidade: 'cofrinho',
      });
      await expect(cofrinhos.depositar(c.id, deposito(1))).rejects.toThrow('encerrado');
    });

    it('o nome de um cofrinho encerrado pode ser reutilizado', async () => {
      const c = await cofrinhos.criar(viagem);
      await cofrinhos.encerrar(c.id, { contaId, data: '2026-11-08' });
      await expect(cofrinhos.criar(viagem)).resolves.toBeTruthy();
    });
  });

  describe('excluir (RN-005 a)', () => {
    it('cofrinho sem movimentações vai para a lixeira e pode ser restaurado', async () => {
      const c = await cofrinhos.criar(viagem);
      await cofrinhos.excluir(c.id);
      expect(cofrinhos.emAndamento()).toEqual([]);
      expect(amb.dados.historico()[0]).toMatchObject({ acao: 'exclusao', entidade: 'cofrinho' });

      const historico = TestBed.inject(HistoricoService);
      expect(historico.lixeira()[0]).toMatchObject({ entidade: 'cofrinho', diasRestantes: 180 });
      await historico.restaurar('cofrinho', c.id);
      expect(cofrinhos.emAndamento()).toHaveLength(1);
    });

    it('cofrinho com movimentações não pode ser excluído (deve ser encerrado)', async () => {
      const c = await cofrinhos.criar(viagem);
      await cofrinhos.depositar(c.id, deposito(100));
      await expect(cofrinhos.excluir(c.id)).rejects.toThrow('Encerre-o em vez de excluir');
    });
  });

  it('editar mantém um prazo já vencido, mas não aceita um novo prazo passado', async () => {
    const c = await cofrinhos.criar({ ...viagem, prazo: '2026-12-01' });
    amb.definirAgora('2027-01-10T12:00:00.000Z');
    await expect(
      cofrinhos.editar(c.id, { ...viagem, prazo: '2026-12-01', nome: 'Viagem 2' }),
    ).resolves.toMatchObject({ nome: 'Viagem 2' });
    await expect(cofrinhos.editar(c.id, { ...viagem, prazo: '2026-12-31' })).rejects.toThrow(
      'data futura',
    );
  });

  it('conta usada por movimentações de cofrinho não pode ser excluída', async () => {
    const c = await cofrinhos.criar(viagem);
    await cofrinhos.depositar(c.id, deposito(100));
    await cofrinhos.encerrar(c.id, { contaId, data: '2026-11-08' });
    await expect(contas.excluir(contaId)).rejects.toThrow(/é usada em 2 itens/);
  });
});
