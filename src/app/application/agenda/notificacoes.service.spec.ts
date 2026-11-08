import { TestBed } from '@angular/core/testing';
import { brl } from '../../../testing/fabricas';
import { type AmbienteDados, prepararAmbienteDados } from '../../../testing/dados';
import { AgendaService } from './agenda.service';
import {
  INTERVALO_VERIFICACAO_NOTIFICACOES_MS,
  NotificacoesService,
  TAG_NOTIFICACAO,
} from './notificacoes.service';

/** Hoje nos testes: 08/11/2026. */
describe('NotificacoesService (RF-024, RF-026)', () => {
  let amb: AmbienteDados;
  let notificacoes: NotificacoesService;
  let agenda: AgendaService;

  const criarConta = async (descricao: string, vencimento: string) => {
    const categoriaId = amb.dados.categorias().find((c) => c.nome === 'Contas da casa')!.id;
    await agenda.criar({
      tipo: 'pagar',
      descricao,
      valor: brl(18_000),
      vencimento,
      categoriaId,
      contaId: null,
      recorrencia: null,
    });
  };

  beforeEach(async () => {
    amb = await prepararAmbienteDados();
    agenda = TestBed.inject(AgendaService);
    notificacoes = TestBed.inject(NotificacoesService);
    TestBed.tick();
    await criarConta('Conta de luz', '2026-11-09');
    await criarConta('Internet', '2026-11-09');
  });

  afterEach(() => vi.useRealTimers());

  describe('permissão só por ação explícita (RF-026)', () => {
    it('ao carregar e ao verificar, nunca pede permissão nem notifica', async () => {
      await notificacoes.verificar();
      await amb.reabrir();
      TestBed.tick();
      await notificacoes.verificar();

      expect(amb.notificador.pedidosDePermissao).toBe(0);
      expect(amb.notificador.enviadas).toEqual([]);
    });

    it('mesmo com a permissão já concedida no navegador, só notifica depois de ativar no app', async () => {
      amb.notificador.permissaoAtual = 'granted';
      await notificacoes.verificar();
      expect(amb.notificador.enviadas).toEqual([]);
    });

    it('ativar pede permissão uma vez e, se concedida, liga e já notifica', async () => {
      expect(await notificacoes.ativar()).toBe('granted');

      expect(amb.notificador.pedidosDePermissao).toBe(1);
      expect(notificacoes.preferencias().ativas).toBe(true);
      expect(notificacoes.entregando()).toBe(true);
      expect(amb.notificador.enviadas).toHaveLength(1);
    });

    it('se a permissão for negada, não ativa (os alertas ficam dentro do app)', async () => {
      amb.notificador.resposta = 'denied';
      expect(await notificacoes.ativar()).toBe('denied');

      expect(notificacoes.preferencias().ativas).toBe(false);
      expect(amb.notificador.enviadas).toEqual([]);
      expect(agenda.alertas()).toHaveLength(2);
    });
  });

  describe('conteúdo (RF-024)', () => {
    it('por padrão o texto é discreto: sem valores nem descrições', async () => {
      await notificacoes.ativar();
      const [n] = amb.notificador.enviadas;

      expect(n).toEqual({
        titulo: 'FinManager: contas a vencer',
        corpo: '2 contas vencem amanhã.',
        tag: TAG_NOTIFICACAO,
      });
    });

    it('detalhes só quando o usuário escolhe', async () => {
      await notificacoes.definirDetalhes(true);
      await notificacoes.ativar();
      expect(amb.notificador.enviadas[0]!.corpo).toContain('Conta de luz');
    });
  });

  describe('frequência e condições', () => {
    beforeEach(() => notificacoes.ativar());

    it('não repete a mesma ocorrência no mesmo dia, nem depois de reabrir o app', async () => {
      await notificacoes.verificar();
      await amb.reabrir();
      await notificacoes.verificar();
      expect(amb.notificador.enviadas).toHaveLength(1);
    });

    it('notifica de novo em outro dia', async () => {
      amb.definirAgora('2026-11-09T09:00:00.000Z');
      await notificacoes.verificar();
      expect(amb.notificador.enviadas).toHaveLength(2);
      expect(amb.notificador.enviadas[1]!.corpo).toBe('2 contas vencem hoje.');
    });

    it('com o cofre bloqueado não verifica nada', async () => {
      amb.cofre.bloquear();
      TestBed.tick();
      await criarConta('Nova', '2026-11-09').catch(() => undefined);
      await notificacoes.verificar();
      expect(amb.notificador.enviadas).toHaveLength(1);
    });

    it('se o usuário revogar a permissão no navegador, para de notificar', async () => {
      amb.notificador.permissaoAtual = 'denied';
      await criarConta('Água', '2026-11-09');
      await notificacoes.verificar();
      expect(amb.notificador.enviadas).toHaveLength(1);
      expect(notificacoes.entregando()).toBe(false);
    });

    it('verifica periodicamente (a cada hora) enquanto desbloqueado', async () => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
      amb.cofre.bloquear();
      TestBed.tick();
      await amb.reabrir();
      TestBed.tick();
      await criarConta('Água', '2026-11-09');

      vi.advanceTimersByTime(INTERVALO_VERIFICACAO_NOTIFICACOES_MS);
      await vi.waitFor(() => expect(amb.notificador.enviadas).toHaveLength(2));
      expect(amb.notificador.enviadas[1]!.corpo).toBe('3 contas vencem amanhã.');
    });
  });

  it('antecedência configurável', async () => {
    await notificacoes.definirAntecedencia(0);
    expect(agenda.alertas()).toEqual([]);
    expect(() => notificacoes.definirAntecedencia(4)).toThrow(RangeError);
  });
});
