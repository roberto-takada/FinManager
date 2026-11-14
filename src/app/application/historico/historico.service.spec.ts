import { TestBed } from '@angular/core/testing';
import { type AmbienteDados, prepararAmbienteDados } from '../../../testing/dados';
import { umaCategoria, umaConta, umaTransacao } from '../../../testing/fabricas';
import { ativo } from '../../domain/shared/entidade';
import { CategoriasService } from '../categorias/categorias.service';
import { ContasService } from '../contas/contas.service';
import { TransacoesService } from '../transacoes/transacoes.service';
import { HistoricoService } from './historico.service';

describe('HistoricoService: desfazer e exclusão definitiva (RF-077, RF-079)', () => {
  let amb: AmbienteDados;
  let historico: HistoricoService;
  let transacoes: TransacoesService;

  beforeEach(async () => {
    amb = await prepararAmbienteDados();
    historico = TestBed.inject(HistoricoService);
    transacoes = TestBed.inject(TransacoesService);
    await amb.dados.alterar((atual) => ({
      mudancas: {
        contas: [umaConta(), umaConta({ id: 'conta-2', nome: 'Poupança fictícia' })],
        categorias: [
          ...atual.categorias,
          umaCategoria(),
          umaCategoria({ id: 'cat-filha', nome: 'Feira', paiId: 'cat-1' }),
          umaCategoria({ id: 'cat-2', nome: 'Diversos fictícios' }),
        ],
        transacoes: [
          umaTransacao({ id: 't-1', descricao: 'Mercado do mês' }),
          umaTransacao({ id: 't-2', descricao: 'Feira de sábado', categoriaId: 'cat-filha' }),
          umaTransacao({
            id: 't-3',
            descricao: 'Outra conta',
            contaId: 'conta-2',
            categoriaId: 'cat-2',
          }),
        ],
      },
      resultado: null,
    }));
  });

  const transacao = (id: string) => amb.dados.transacoes().find((t) => t.id === id);

  describe('Desfazer (RF-077)', () => {
    it('restaura o item da última exclusão e registra a restauração', async () => {
      await transacoes.excluir('t-1');
      const evento = historico.ultimaExclusao()!;
      expect(evento.entidadeId).toBe('t-1');

      expect(await historico.desfazerExclusao(evento.id)).toBe(1);
      expect(ativo(transacao('t-1')!)).toBe(true);
      expect(amb.dados.historico().map((e) => e.acao)).toEqual(['exclusao', 'restauracao']);
    });

    it('desfaz um lote inteiro numa única gravação', async () => {
      await amb.dados.alterar((atual) => ({
        mudancas: {
          transacoes: atual.transacoes.map((t) =>
            t.id === 't-3'
              ? t
              : { ...t, parcela: { grupoId: 'g', numero: 1, total: 2, dataCompra: t.data } },
          ),
        },
        resultado: null,
      }));
      await transacoes.excluirParcelas('g');
      const gravacoes = amb.armazenamento.gravacoes;
      expect(await historico.desfazerExclusao(historico.ultimaExclusao()!.id)).toBe(2);
      expect(amb.armazenamento.gravacoes).toBe(gravacoes + 1);
      expect(historico.lixeira()).toEqual([]);
    });

    it('não desfaz o que já saiu da lixeira', async () => {
      await transacoes.excluir('t-1');
      const evento = historico.ultimaExclusao()!;
      await historico.restaurar('transacao', 't-1');
      await expect(historico.desfazerExclusao(evento.id)).rejects.toThrow(
        'O item já não está na lixeira.',
      );
    });
  });

  describe('Excluir definitivamente e esvaziar a lixeira (RF-079)', () => {
    it('apaga o item e os registros que guardam cópias dele, deixando só a contagem', async () => {
      await transacoes.excluir('t-1');
      expect(await historico.excluirDefinitivamente('transacao', 't-1')).toBe(1);

      expect(transacao('t-1')).toBeUndefined();
      expect(historico.lixeira()).toEqual([]);
      const eventos = amb.dados.historico();
      expect(eventos).toHaveLength(1);
      expect(eventos[0]).toMatchObject({
        acao: 'exclusaoDefinitiva',
        entidade: 'transacao',
        resumo: '1 item',
        estadoAnterior: null,
      });
      expect(JSON.stringify(amb.armazenamento.colecoes.get('historico'))).not.toContain('Mercado');
    });

    it('apagar uma categoria leva junto subcategorias e transações da lixeira que dependem dela', async () => {
      await transacoes.excluir('t-1');
      await transacoes.excluir('t-2');
      const categorias = TestBed.inject(CategoriasService);
      await categorias.excluir('cat-filha');
      await categorias.excluir('cat-1');

      expect(
        historico
          .dependentesNaLixeira('categoria', 'cat-1')
          .map((i) => i.id)
          .sort(),
      ).toEqual(['cat-filha', 't-1', 't-2']);
      expect(await historico.excluirDefinitivamente('categoria', 'cat-1')).toBe(4);
      expect(historico.lixeira()).toEqual([]);
      expect(transacao('t-3')).toBeDefined();
      expect(amb.dados.historico().map((e) => [e.entidade, e.resumo])).toEqual([
        ['transacao', '2 itens'],
        ['categoria', '2 itens'],
      ]);
    });

    it('apagar uma conta não toca em itens ativos de outras contas', async () => {
      await transacoes.excluir('t-3');
      await TestBed.inject(ContasService).excluir('conta-2');
      expect(await historico.excluirDefinitivamente('conta', 'conta-2')).toBe(2);
      expect(amb.dados.transacoes().map((t) => t.id)).toEqual(['t-1', 't-2']);
    });

    it('só apaga o que está na lixeira', async () => {
      await expect(historico.excluirDefinitivamente('transacao', 't-1')).rejects.toThrow(
        'Este item não está na lixeira.',
      );
    });

    it('esvaziar apaga tudo da lixeira de uma vez, e recusa se já estiver vazia', async () => {
      await transacoes.excluir('t-1');
      await transacoes.excluir('t-3');
      await TestBed.inject(ContasService).excluir('conta-2');
      const gravacoes = amb.armazenamento.gravacoes;

      expect(await historico.esvaziarLixeira()).toBe(3);
      expect(amb.armazenamento.gravacoes).toBe(gravacoes + 1);
      expect(historico.lixeira()).toEqual([]);
      expect(amb.dados.transacoes().map((t) => t.id)).toEqual(['t-2']);
      await expect(historico.esvaziarLixeira()).rejects.toThrow('A lixeira já está vazia.');
    });

    it('mantém o histórico de itens que continuam existindo', async () => {
      await transacoes.excluir('t-1');
      await transacoes.excluir('t-2');
      await historico.restaurar('transacao', 't-2');
      await historico.excluirDefinitivamente('transacao', 't-1');
      expect(amb.dados.historico().map((e) => `${e.acao}:${e.entidadeId}`)).toEqual([
        'exclusao:t-2',
        'restauracao:t-2',
        'exclusaoDefinitiva:',
      ]);
    });
  });
});
