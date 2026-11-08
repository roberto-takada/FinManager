import { TestBed } from '@angular/core/testing';
import { brl, umaRecorrencia, umaTransacao } from '../../../testing/fabricas';
import { type AmbienteDados, prepararAmbienteDados } from '../../../testing/dados';
import { ContasService } from '../contas/contas.service';

describe('DadosService', () => {
  let amb: AmbienteDados;

  beforeEach(async () => {
    amb = await prepararAmbienteDados();
  });

  it('no primeiro acesso cria e grava as categorias padrão', () => {
    expect(amb.dados.estado()).toBe('pronto');
    expect(amb.dados.categorias().map((c) => c.nome)).toContain('Mercado');
    expect(amb.armazenamento.colecoes.get('categorias')).toHaveLength(
      amb.dados.categorias().length,
    );
  });

  it('ao bloquear, descarta os dados da memória (RNF-004)', async () => {
    await TestBed.inject(ContasService).criar({
      nome: 'Conta',
      tipo: 'corrente',
      saldoInicial: brl(0),
    });
    amb.cofre.bloquear();
    TestBed.tick();

    expect(amb.dados.estado()).toBe('bloqueado');
    expect(amb.dados.contas()).toEqual([]);
    expect(amb.dados.categorias()).toEqual([]);
  });

  it('os dados voltam ao desbloquear de novo', async () => {
    await TestBed.inject(ContasService).criar({
      nome: 'Conta',
      tipo: 'corrente',
      saldoInicial: brl(0),
    });
    await amb.reabrir();
    expect(amb.dados.contas().map((c) => c.nome)).toEqual(['Conta']);
  });

  it('se a gravação falhar, nada muda na memória (RNF-013)', async () => {
    amb.armazenamento.falharProxima = true;
    await expect(
      TestBed.inject(ContasService).criar({
        nome: 'Conta',
        tipo: 'corrente',
        saldoInicial: brl(0),
      }),
    ).rejects.toThrow('Falha simulada');
    expect(amb.dados.contas()).toEqual([]);
  });

  it('carregar com o cofre bloqueado não deixa o serviço em erro (guards rodam em paralelo)', async () => {
    amb.cofre.bloquear();
    TestBed.tick();
    await amb.dados.carregar();
    expect(amb.dados.estado()).toBe('bloqueado');

    await amb.reabrir();
    expect(amb.dados.estado()).toBe('pronto');
    expect(amb.dados.categorias().length).toBeGreaterThan(0);
  });

  it('recusa alterações depois que o cofre foi bloqueado', async () => {
    amb.cofre.bloquear();
    TestBed.tick();
    await expect(
      TestBed.inject(ContasService).criar({
        nome: 'Conta',
        tipo: 'corrente',
        saldoInicial: brl(0),
      }),
    ).rejects.toThrow(/bloqueado/);
  });

  describe('manutenção ao desbloquear', () => {
    it('expurga itens e eventos com 180 dias ou mais (RF-078)', async () => {
      amb.armazenamento.colecoes.set('transacoes', [
        umaTransacao({ id: 'recente', excluidoEm: '2026-05-13T12:00:00.000Z' }), // 179 dias
        umaTransacao({ id: 'vencida', excluidoEm: '2026-05-11T12:00:00.000Z' }), // 181 dias
        umaTransacao({ id: 'ativa' }),
      ]);
      amb.armazenamento.colecoes.set('historico', [
        { id: 'ev-velho', expiraEm: '2026-11-01T00:00:00.000Z' },
        { id: 'ev-novo', expiraEm: '2027-01-01T00:00:00.000Z' },
      ]);

      await amb.reabrir();

      expect(amb.dados.transacoes().map((t) => t.id)).toEqual(['recente', 'ativa']);
      expect(amb.dados.historico().map((e) => e.id)).toEqual(['ev-novo']);
      expect((amb.armazenamento.colecoes.get('transacoes') ?? []).length).toBe(2);
    });

    it('gera as ocorrências pendentes das recorrências, sem duplicar (RF-012)', async () => {
      amb.armazenamento.colecoes.set('recorrencias', [
        umaRecorrencia({
          id: 'r',
          inicio: '2026-09-10',
          modelo: { ...umaRecorrencia().modelo, valor: brl(4_990) },
        }),
      ]);
      await amb.reabrir();
      const datas = () =>
        amb.dados
          .transacoes()
          .filter((t) => t.recorrenciaId === 'r')
          .map((t) => t.data);
      expect(datas()).toEqual(['2026-09-10', '2026-10-10']);

      await amb.reabrir();
      expect(datas()).toHaveLength(2);

      amb.definirAgora('2026-12-11T12:00:00.000Z');
      await amb.reabrir();
      expect(datas()).toEqual(['2026-09-10', '2026-10-10', '2026-11-10', '2026-12-10']);
    });
  });

  describe('dados de demonstração (RNF-061)', () => {
    it('preenche um cofre vazio com 12 meses de uso fictício e um perfil', async () => {
      await amb.dados.popularDemonstracao();

      expect(amb.dados.contas()).toHaveLength(4);
      const datas = amb.dados
        .transacoes()
        .map((t) => t.data)
        .sort();
      expect(datas[0]! <= '2025-11-15').toBe(true);
      // Recorrências geradas pelo mecanismo normal: 12 salários até hoje.
      expect(amb.dados.transacoes().filter((t) => t.descricao === 'Salário')).toHaveLength(12);
      expect(amb.dados.perfil()?.nome).toBe('Ana Exemplo');
      expect(amb.armazenamento.colecoes.get('transacoes')?.length).toBe(
        amb.dados.transacoes().length,
      );
    });

    it('não mistura com dados existentes', async () => {
      await TestBed.inject(ContasService).criar({
        nome: 'Real',
        tipo: 'corrente',
        saldoInicial: brl(0),
      });
      await expect(amb.dados.popularDemonstracao()).rejects.toThrow(/já tem dados/);
      expect(amb.dados.contas().map((c) => c.nome)).toEqual(['Real']);
    });
  });
});
