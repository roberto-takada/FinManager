import { TestBed } from '@angular/core/testing';
import { brl } from '../../../testing/fabricas';
import { type AmbienteDados, prepararAmbienteDados } from '../../../testing/dados';
import type { DadosContaAgendada } from '../../domain/agenda/conta-agendada';
import { CategoriasService } from '../categorias/categorias.service';
import { ContasService } from '../contas/contas.service';
import { HistoricoService } from '../historico/historico.service';
import { TransacoesService } from '../transacoes/transacoes.service';
import { AgendaService } from './agenda.service';

/** Hoje nos testes: 08/11/2026. */
describe('AgendaService (RF-020 a RF-025)', () => {
  let amb: AmbienteDados;
  let agenda: AgendaService;
  let contaId: string;
  let luz: DadosContaAgendada;
  let categoriaReceita: string;

  beforeEach(async () => {
    amb = await prepararAmbienteDados();
    agenda = TestBed.inject(AgendaService);
    contaId = (
      await TestBed.inject(ContasService).criar({
        nome: 'Banco',
        tipo: 'corrente',
        saldoInicial: brl(100_000),
      })
    ).id;
    const casa = amb.dados.categorias().find((c) => c.nome === 'Contas da casa')!;
    categoriaReceita = amb.dados.categorias().find((c) => c.nome === 'Outras receitas')!.id;
    luz = {
      tipo: 'pagar',
      descricao: 'Conta de luz',
      valor: brl(18_000),
      vencimento: '2026-09-12',
      categoriaId: casa.id,
      contaId,
      recorrencia: { frequencia: 'mensal', fim: null },
    };
  });

  const situacoes = () =>
    agenda.ocorrencias('2026-09-01', '2026-12-31').map((o) => [o.vencimento, o.situacao]);

  it('cadastra conta recorrente e mostra cada vencimento com a situação (RF-020, RF-022)', async () => {
    await agenda.criar(luz);
    expect(situacoes()).toEqual([
      ['2026-09-12', 'vencida'],
      ['2026-10-12', 'vencida'],
      ['2026-11-12', 'pendente'],
      ['2026-12-12', 'pendente'],
    ]);
    expect(amb.armazenamento.colecoes.get('contasAgendadas')).toHaveLength(1);
  });

  describe('pagar (RF-023, US-004)', () => {
    it('cria a despesa correspondente e a ocorrência passa a "paga"', async () => {
      const conta = await agenda.criar(luz);
      const transacao = await agenda.pagar({
        contaAgendadaId: conta.id,
        vencimento: '2026-10-12',
        contaId,
        data: '2026-10-11',
        valor: brl(19_550),
      });

      expect(transacao).toMatchObject({
        tipo: 'despesa',
        valor: brl(19_550),
        data: '2026-10-11',
        descricao: 'Conta de luz',
        categoriaId: luz.categoriaId,
        contaId,
      });
      expect(situacoes()[1]).toEqual(['2026-10-12', 'paga']);
      expect(TestBed.inject(TransacoesService).buscar(transacao.id)).toBeTruthy();
      expect(TestBed.inject(ContasService).saldos().get(contaId)).toEqual(brl(100_000 - 19_550));
    });

    it('conta a receber gera receita', async () => {
      const conta = await agenda.criar({
        ...luz,
        tipo: 'receber',
        descricao: 'Reembolso',
        categoriaId: categoriaReceita,
        recorrencia: null,
        vencimento: '2026-11-05',
      });
      const t = await agenda.pagar({
        contaAgendadaId: conta.id,
        vencimento: '2026-11-05',
        contaId,
        data: '2026-11-08',
        valor: brl(42_000),
      });
      expect(t.tipo).toBe('receita');
    });

    it('grava a transação e o vínculo juntos (RNF-013)', async () => {
      const conta = await agenda.criar(luz);
      amb.armazenamento.falharProxima = true;
      await expect(
        agenda.pagar({
          contaAgendadaId: conta.id,
          vencimento: '2026-10-12',
          contaId,
          data: '2026-10-12',
          valor: brl(18_000),
        }),
      ).rejects.toThrow('Falha simulada');
      expect(amb.dados.transacoes()).toEqual([]);
      expect(situacoes()[1]).toEqual(['2026-10-12', 'vencida']);
    });

    it('recusa pagar duas vezes ou uma data que não é vencimento', async () => {
      const conta = await agenda.criar(luz);
      const pagamento = {
        contaAgendadaId: conta.id,
        vencimento: '2026-10-12',
        contaId,
        data: '2026-10-12',
        valor: brl(18_000),
      };
      await agenda.pagar(pagamento);
      await expect(agenda.pagar(pagamento)).rejects.toThrow('já foi paga');
      await expect(agenda.pagar({ ...pagamento, vencimento: '2026-10-13' })).rejects.toThrow(
        'não é um vencimento',
      );
    });

    it('desfazer o pagamento manda a transação para a lixeira e reabre a ocorrência; restaurar quita de novo', async () => {
      const conta = await agenda.criar(luz);
      const t = await agenda.pagar({
        contaAgendadaId: conta.id,
        vencimento: '2026-10-12',
        contaId,
        data: '2026-10-12',
        valor: brl(18_000),
      });

      await agenda.desfazerPagamento(conta.id, '2026-10-12');
      expect(situacoes()[1]).toEqual(['2026-10-12', 'vencida']);
      expect(amb.dados.historico().at(-1)).toMatchObject({
        acao: 'exclusao',
        entidade: 'transacao',
        entidadeId: t.id,
      });

      await TestBed.inject(HistoricoService).restaurar('transacao', t.id);
      expect(situacoes()[1]).toEqual(['2026-10-12', 'paga']);
    });

    it('excluir a transação pela tela de transações também reabre a ocorrência', async () => {
      const conta = await agenda.criar(luz);
      const t = await agenda.pagar({
        contaAgendadaId: conta.id,
        vencimento: '2026-11-12',
        contaId,
        data: '2026-11-08',
        valor: brl(18_000),
      });
      await TestBed.inject(TransacoesService).excluir(t.id);
      expect(situacoes()[2]).toEqual(['2026-11-12', 'pendente']);
    });
  });

  describe('editar e excluir (RN-003, RN-004)', () => {
    it('editar o valor entra no histórico; editar a descrição não', async () => {
      const conta = await agenda.criar(luz);
      expect(await agenda.editar(conta.id, { ...luz, descricao: 'Energia' })).toEqual({
        significativa: false,
      });
      expect(amb.dados.historico()).toEqual([]);

      expect(
        await agenda.editar(conta.id, { ...luz, descricao: 'Energia', valor: brl(20_000) }),
      ).toEqual({ significativa: true });
      expect(amb.dados.historico()[0]).toMatchObject({
        acao: 'edicao',
        entidade: 'contaAgendada',
        estadoAnterior: expect.objectContaining({ descricao: 'Energia', valor: brl(18_000) }),
      });
    });

    it('excluir tira do calendário, mantém pagamentos feitos e pode ser restaurada', async () => {
      const conta = await agenda.criar(luz);
      await agenda.pagar({
        contaAgendadaId: conta.id,
        vencimento: '2026-09-12',
        contaId,
        data: '2026-09-12',
        valor: brl(18_000),
      });
      await agenda.excluir(conta.id);

      expect(situacoes()).toEqual([]);
      expect(TestBed.inject(TransacoesService).ativas()).toHaveLength(1);
      const historico = TestBed.inject(HistoricoService);
      expect(historico.lixeira()[0]).toMatchObject({ entidade: 'contaAgendada' });

      await historico.restaurar('contaAgendada', conta.id);
      expect(situacoes()[0]).toEqual(['2026-09-12', 'paga']);
    });

    it('categoria usada por uma conta agendada não pode ser excluída', async () => {
      await agenda.criar(luz);
      await expect(TestBed.inject(CategoriasService).excluir(luz.categoriaId)).rejects.toThrow(
        /é usada em 1 item/,
      );
    });
  });

  it('alertas respeitam a antecedência configurada (RF-024)', async () => {
    await agenda.criar({
      ...luz,
      recorrencia: null,
      vencimento: '2026-11-10',
      descricao: 'Em 2 dias',
    });
    await agenda.criar({
      ...luz,
      recorrencia: null,
      vencimento: '2026-11-15',
      descricao: 'Em 7 dias',
    });
    expect(agenda.alertas().map((a) => a.ocorrencia.conta.descricao)).toEqual(['Em 2 dias']); // padrão: 3 dias
  });

  it('exporta o calendário em iCal (RF-025)', async () => {
    await agenda.criar(luz);
    const ics = agenda.exportarIcs();
    expect(ics).toContain('SUMMARY:A pagar: Conta de luz');
    expect(ics).toContain('RRULE:FREQ=MONTHLY');
  });
});
