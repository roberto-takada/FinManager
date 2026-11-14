import { TestBed } from '@angular/core/testing';
import { type AmbienteDados, prepararAmbienteDados } from '../../../testing/dados';
import { brl, umaConta } from '../../../testing/fabricas';
import { BackupService } from '../backup/backup.service';
import { TransacoesService } from '../transacoes/transacoes.service';
import { RascunhosService } from './rascunhos.service';

describe('RascunhosService (RN-002, RF-070, RF-071)', () => {
  let amb: AmbienteDados;
  let rascunhos: RascunhosService;

  const salvarRascunho = (valor = '12,50') =>
    rascunhos.salvar({
      id: 'transacao:nova',
      titulo: 'Nova transação',
      url: '/transacoes/nova',
      valores: { valor, descricao: 'Feira' },
    });

  beforeEach(async () => {
    amb = await prepararAmbienteDados();
    rascunhos = TestBed.inject(RascunhosService);
  });

  it('grava o rascunho na coleção cifrada e o substitui a cada alteração', async () => {
    await salvarRascunho('1');
    amb.definirAgora('2026-11-08T12:00:05.000Z');
    await salvarRascunho('12');
    expect(amb.armazenamento.colecoes.get('rascunhos')).toEqual([
      {
        id: 'transacao:nova',
        titulo: 'Nova transação',
        url: '/transacoes/nova',
        valores: { valor: '12', descricao: 'Feira' },
        atualizadoEm: '2026-11-08T12:00:05.000Z',
      },
    ]);
  });

  it('US-002: o rascunho sobrevive a fechar e reabrir o app e é oferecido depois', async () => {
    await salvarRascunho();
    await amb.reabrir();
    expect(rascunhos.pendentes().map((r) => r.titulo)).toEqual(['Nova transação']);
    expect(rascunhos.buscar('transacao:nova')?.valores).toEqual({
      valor: '12,50',
      descricao: 'Feira',
    });
  });

  it('US-002: "Descartar" remove o rascunho do armazenamento', async () => {
    await salvarRascunho();
    await rascunhos.descartar('transacao:nova');
    expect(amb.armazenamento.colecoes.get('rascunhos')).toEqual([]);
    expect(rascunhos.pendentes()).toEqual([]);
  });

  it('rascunhos com mais de 7 dias são apagados ao desbloquear', async () => {
    await salvarRascunho();
    amb.definirAgora('2026-11-15T11:59:00.000Z');
    await amb.reabrir();
    expect(rascunhos.pendentes()).toHaveLength(1);
    amb.definirAgora('2026-11-15T12:00:00.000Z');
    await amb.reabrir();
    expect(rascunhos.pendentes()).toEqual([]);
    expect(amb.armazenamento.colecoes.get('rascunhos')).toEqual([]);
  });

  it('salvar o formulário grava o registro e remove o rascunho na MESMA gravação (RNF-013)', async () => {
    await amb.dados.alterar(() => ({ mudancas: { contas: [umaConta()] }, resultado: null }));
    await salvarRascunho();
    const gravacoes = amb.armazenamento.gravacoes;
    await rascunhos.concluir('transacao:nova', () =>
      TestBed.inject(TransacoesService).criar({
        tipo: 'receita',
        valor: brl(1250),
        data: '2026-11-08',
        descricao: 'Feira',
        categoriaId: amb.dados.categorias().find((c) => c.tipo === 'receita')!.id,
        contaId: 'conta-1',
        contaDestinoId: null,
      }),
    );
    expect(amb.armazenamento.gravacoes).toBe(gravacoes + 1);
    expect(amb.armazenamento.colecoes.get('rascunhos')).toEqual([]);
    expect(amb.armazenamento.colecoes.get('transacoes')).toHaveLength(1);
  });

  it('se o salvamento falhar, o rascunho continua guardado', async () => {
    await salvarRascunho();
    amb.armazenamento.falharProxima = true;
    await expect(
      rascunhos.concluir('transacao:nova', () =>
        amb.dados.alterar(() => ({ mudancas: { contas: [umaConta()] }, resultado: null })),
      ),
    ).rejects.toThrow();
    expect(rascunhos.buscar('transacao:nova')).not.toBeNull();
  });

  it('ação que não grava logo de início: o rascunho é removido logo depois', async () => {
    await salvarRascunho();
    await rascunhos.concluir('transacao:nova', async () => {
      await Promise.resolve();
      return amb.dados.alterar(() => ({ mudancas: { contas: [umaConta()] }, resultado: null }));
    });
    expect(rascunhos.pendentes()).toEqual([]);
  });

  it('recusa endereço que não seja do próprio app', async () => {
    await expect(
      rascunhos.salvar({ id: 'x', titulo: 'X', url: 'https://exemplo.com', valores: {} }),
    ).rejects.toThrow('Endereço de formulário inválido.');
  });

  it('rascunhos não vão para o backup (são trabalho em andamento deste navegador)', async () => {
    await salvarRascunho();
    const { conteudo } = await TestBed.inject(BackupService).exportar();
    expect(conteudo).not.toContain('Feira');
  });
});
