import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { type Categoria, montarCategoriasPadrao } from '../../domain/categorias/categoria';
import type { ContaFinanceira } from '../../domain/contas/conta';
import {
  criarEvento,
  type EventoHistorico,
  expurgar,
  expurgarEventos,
} from '../../domain/historico/historico';
import type { Recorrencia } from '../../domain/recorrencias/recorrencia';
import { type DataISO, dataLocal } from '../../domain/shared/data';
import { ErroDominio } from '../../domain/shared/erro-dominio';
import type { Transacao } from '../../domain/transacoes/transacao';
import { CofreService } from '../cofre/cofre.service';
import {
  ARMAZENAMENTO_DADOS,
  type Colecao,
  COLECOES,
  GERADOR_ID,
  RELOGIO,
} from '../ports/dados.ports';
import { gerarOcorrencias } from '../recorrencias/gerar-ocorrencias';

export interface Colecoes {
  readonly contas: readonly ContaFinanceira[];
  readonly categorias: readonly Categoria[];
  readonly transacoes: readonly Transacao[];
  readonly recorrencias: readonly Recorrencia[];
  readonly historico: readonly EventoHistorico[];
}

export type EstadoDados = 'bloqueado' | 'carregando' | 'pronto' | 'erro';

const VAZIO: Colecoes = {
  contas: [],
  categorias: [],
  transacoes: [],
  recorrencias: [],
  historico: [],
};

/**
 * Dados do usuário em memória (ENGENHARIA_DE_SOFTWARE §5.6).
 *
 * - Carregados e decifrados ao desbloquear o cofre; descartados ao bloquear (RNF-004).
 * - Toda alteração é gravada cifrada **antes** de aparecer na tela; se a gravação falhar,
 *   nada muda. As gravações são serializadas para não se atropelarem.
 * - Ao carregar: expurgo de itens com mais de 180 dias na lixeira (RF-078) e geração das
 *   ocorrências pendentes das recorrências (RF-012).
 */
@Injectable({ providedIn: 'root' })
export class DadosService {
  private readonly cofre = inject(CofreService);
  private readonly armazenamento = inject(ARMAZENAMENTO_DADOS);
  private readonly relogio = inject(RELOGIO);
  private readonly gerarId = inject(GERADOR_ID);

  private readonly _estado = signal<EstadoDados>('bloqueado');
  private readonly _colecoes = signal<Colecoes>(VAZIO);

  readonly estado = this._estado.asReadonly();
  readonly colecoes = this._colecoes.asReadonly();
  readonly contas = computed(() => this._colecoes().contas);
  readonly categorias = computed(() => this._colecoes().categorias);
  readonly transacoes = computed(() => this._colecoes().transacoes);
  readonly recorrencias = computed(() => this._colecoes().recorrencias);
  readonly historico = computed(() => this._colecoes().historico);

  private carregamento: Promise<void> | null = null;
  private fila: Promise<unknown> = Promise.resolve();
  /** Muda a cada bloqueio, para descartar carregamentos e gravações de uma sessão anterior. */
  private sessao = 0;

  constructor() {
    effect(() => {
      const desbloqueado = this.cofre.desbloqueado();
      untracked(() => {
        if (desbloqueado) void this.carregar().catch(() => undefined);
        else this.limpar();
      });
    });
  }

  agora(): Date {
    return this.relogio();
  }

  hoje(): DataISO {
    return dataLocal(this.relogio());
  }

  novoId(): string {
    return this.gerarId();
  }

  /**
   * Carrega os dados da sessão atual. Idempotente: pode ser aguardado por vários guards.
   * Com o cofre bloqueado não há o que carregar (os guards rodam em paralelo e podem
   * chamar isto antes do redirecionamento para o desbloqueio).
   */
  carregar(): Promise<void> {
    if (!this.cofre.desbloqueado()) return Promise.resolve();
    this.carregamento ??= this.executarCarregamento();
    return this.carregamento;
  }

  /**
   * Aplica uma alteração: calcula as novas coleções a partir do estado mais recente,
   * grava de forma atômica e só então atualiza a memória.
   */
  alterar<R>(
    calcular: (atual: Colecoes) => { mudancas: Partial<Colecoes>; resultado: R },
  ): Promise<R> {
    const sessao = this.sessao;
    const execucao = this.fila.then(async () => {
      if (sessao !== this.sessao || this._estado() !== 'pronto') {
        throw new ErroDominio(
          'cofre-bloqueado',
          'O cofre foi bloqueado. Desbloqueie e tente de novo.',
        );
      }
      const { mudancas, resultado } = calcular(this._colecoes());
      await this.gravar(mudancas);
      if (sessao === this.sessao) this._colecoes.update((atual) => ({ ...atual, ...mudancas }));
      return resultado;
    });
    this.fila = execucao.catch(() => undefined);
    return execucao;
  }

  /** Cria um evento de histórico (RN-004, RF-075) com data/hora e expiração. */
  evento(dados: Parameters<typeof criarEvento>[0]): EventoHistorico {
    return criarEvento(dados, this.agora(), this.novoId());
  }

  /**
   * Preenche um cofre recém-criado com o usuário fictício de demonstração (RNF-061).
   * Recusa se já houver contas ou transações, para nunca misturar com dados reais.
   */
  async popularDemonstracao(): Promise<void> {
    await this.carregar();
    // Carregado sob demanda: só é usado uma vez, ao criar um cofre de demonstração.
    const { gerarDadosDemonstracao } = await import('../../domain/demonstracao/dados-demonstracao');
    await this.alterar((atual) => {
      if (atual.contas.length > 0 || atual.transacoes.length > 0) {
        throw new ErroDominio(
          'cofre-com-dados',
          'O cofre já tem dados; a demonstração não foi aplicada.',
        );
      }
      const demo = gerarDadosDemonstracao({
        hoje: this.hoje(),
        agora: this.agora(),
        gerarId: this.gerarId,
      });
      const ocorrencias = gerarOcorrencias(demo, this.hoje(), this.agora(), this.gerarId);
      return {
        mudancas: {
          ...demo,
          transacoes: ocorrencias.transacoes,
          recorrencias: ocorrencias.recorrencias,
        },
        resultado: undefined,
      };
    });
  }

  // ---------------------------------------------------------------------------

  private async executarCarregamento(): Promise<void> {
    const sessao = this.sessao;
    this._estado.set('carregando');
    try {
      const dek = this.cofre.chaveDeDados();
      const lidas = await Promise.all(COLECOES.map((c) => this.armazenamento.ler(dek, c)));
      if (sessao !== this.sessao) return;
      const [contas, categorias, transacoes, recorrencias, historico] = lidas;

      let colecoes: Colecoes = {
        contas: (contas ?? []) as ContaFinanceira[],
        categorias: (categorias ?? []) as Categoria[],
        transacoes: (transacoes ?? []) as Transacao[],
        recorrencias: (recorrencias ?? []) as Recorrencia[],
        historico: (historico ?? []) as EventoHistorico[],
      };
      const mudancas: Partial<Record<Colecao, readonly unknown[]>> = {};

      // Primeiro acesso: categorias padrão (RF-015).
      if (categorias === null) {
        colecoes = {
          ...colecoes,
          categorias: montarCategoriasPadrao(this.gerarId, this.agora().toISOString()),
        };
        mudancas.categorias = colecoes.categorias;
      }

      // RF-078: expurgo de itens e eventos com mais de 180 dias.
      const agora = this.agora();
      const expurgadas = {
        contas: expurgar(colecoes.contas, agora),
        categorias: expurgar(colecoes.categorias, agora),
        transacoes: expurgar(colecoes.transacoes, agora),
        recorrencias: expurgar(colecoes.recorrencias, agora),
      };
      for (const nome of ['contas', 'categorias', 'transacoes', 'recorrencias'] as const) {
        if (expurgadas[nome].length !== colecoes[nome].length) mudancas[nome] = expurgadas[nome];
      }
      colecoes = { ...colecoes, ...expurgadas };
      const eventos = expurgarEventos(colecoes.historico, agora);
      if (eventos.length !== colecoes.historico.length) {
        colecoes = { ...colecoes, historico: eventos };
        mudancas.historico = eventos;
      }

      // RF-012: ocorrências das recorrências até hoje.
      const ocorrencias = gerarOcorrencias(colecoes, this.hoje(), agora, this.gerarId);
      if (ocorrencias.mudou) {
        colecoes = {
          ...colecoes,
          transacoes: ocorrencias.transacoes,
          recorrencias: ocorrencias.recorrencias,
        };
        mudancas.transacoes = ocorrencias.transacoes;
        mudancas.recorrencias = ocorrencias.recorrencias;
      }

      if (Object.keys(mudancas).length > 0) await this.armazenamento.gravar(dek, mudancas);
      if (sessao !== this.sessao) return;
      this._colecoes.set(colecoes);
      this._estado.set('pronto');
    } catch (erro) {
      if (sessao === this.sessao) {
        this._estado.set('erro');
        this.carregamento = null;
      }
      throw erro;
    }
  }

  private async gravar(mudancas: Partial<Colecoes>): Promise<void> {
    if (Object.keys(mudancas).length === 0) return;
    await this.armazenamento.gravar(this.cofre.chaveDeDados(), mudancas);
  }

  private limpar(): void {
    this.sessao++;
    this.carregamento = null;
    this._colecoes.set(VAZIO);
    this._estado.set('bloqueado');
  }
}
