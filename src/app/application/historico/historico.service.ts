import { computed, inject, Injectable } from '@angular/core';
import {
  diasAteExclusaoDefinitiva,
  type EventoHistorico,
  quantidadeItens,
  type TipoEntidade,
} from '../../domain/historico/historico';
import { ativo, type Entidade, normalizarTexto } from '../../domain/shared/entidade';
import { ErroDominio } from '../../domain/shared/erro-dominio';
import { substituir } from '../dados/colecoes';
import { type Colecoes, DadosService } from '../dados/dados.service';
import {
  resumoCategoria,
  resumoCofrinho,
  resumoConta,
  resumoContaAgendada,
  resumoRecorrencia,
  resumoTransacao,
} from '../../domain/historico/resumos';

export interface ItemLixeira {
  readonly entidade: TipoEntidade;
  readonly id: string;
  readonly resumo: string;
  readonly excluidoEm: string;
  readonly diasRestantes: number;
}

type NomeColecao =
  'transacoes' | 'contas' | 'categorias' | 'recorrencias' | 'contasAgendadas' | 'cofrinhos';

const COLECAO: Record<TipoEntidade, NomeColecao> = {
  transacao: 'transacoes',
  conta: 'contas',
  categoria: 'categorias',
  recorrencia: 'recorrencias',
  contaAgendada: 'contasAgendadas',
  cofrinho: 'cofrinhos',
};

/** Ordem em que os tipos aparecem nos eventos de exclusão definitiva. */
const TIPOS: readonly TipoEntidade[] = [
  'transacao',
  'conta',
  'categoria',
  'recorrencia',
  'contaAgendada',
  'cofrinho',
];

/** Histórico de ações e lixeira (RN-004, RF-075 a RF-079). */
@Injectable({ providedIn: 'root' })
export class HistoricoService {
  private readonly dados = inject(DadosService);

  /** Eventos do mais recente para o mais antigo (no empate, o registrado por último vem antes). */
  readonly eventos = computed(() =>
    [...this.dados.historico()].reverse().sort((a, b) => b.ocorridoEm.localeCompare(a.ocorridoEm)),
  );

  readonly lixeira = computed<ItemLixeira[]>(() =>
    itensDaLixeira(this.dados.colecoes(), this.dados.agora()),
  );

  /** Restaura um item da lixeira (RN-004), registrando a restauração no histórico. */
  restaurar(entidade: TipoEntidade, id: string): Promise<void> {
    return this.dados.alterar((atual) => ({
      mudancas: this.restaurarEm(atual, entidade, id),
      resultado: undefined,
    }));
  }

  /** Evento da exclusão mais recente, para oferecer "Desfazer" logo depois dela (RF-077). */
  ultimaExclusao(): EventoHistorico | null {
    const eventos = this.dados.historico();
    for (let i = eventos.length - 1; i >= 0; i--) {
      if (eventos[i]!.acao === 'exclusao') return eventos[i]!;
    }
    return null;
  }

  /**
   * RF-077: desfaz a exclusão registrada no evento, restaurando o item (ou todos os itens
   * do mesmo lote) numa única gravação. Devolve quantos itens voltaram.
   */
  desfazerExclusao(eventoId: string): Promise<number> {
    return this.dados.alterar((atual) => {
      const evento = atual.historico.find((e) => e.id === eventoId && e.acao === 'exclusao');
      if (!evento) throw new ErroDominio('nao-encontrado', 'Não há o que desfazer.');
      const doLote = evento.loteId
        ? atual.historico.filter((e) => e.acao === 'exclusao' && e.loteId === evento.loteId)
        : [evento];
      let colecoes = atual;
      let restaurados = 0;
      for (const e of doLote) {
        const item = (colecoes[COLECAO[e.entidade]] as readonly Entidade[]).find(
          (i) => i.id === e.entidadeId,
        );
        if (!item || ativo(item)) continue;
        colecoes = { ...colecoes, ...this.restaurarEm(colecoes, e.entidade, e.entidadeId) };
        restaurados++;
      }
      if (restaurados === 0) {
        throw new ErroDominio('nao-encontrado', 'O item já não está na lixeira.');
      }
      return { mudancas: diferencas(atual, colecoes), resultado: restaurados };
    });
  }

  /**
   * Itens da lixeira que dependem deste (ex.: transações excluídas de uma conta excluída).
   * Apagar o item definitivamente apaga também esses, que não poderiam mais ser restaurados.
   */
  dependentesNaLixeira(entidade: TipoEntidade, id: string): ItemLixeira[] {
    const alvos = coletarComDependentes(this.dados.colecoes(), [{ entidade, id }]);
    return this.lixeira().filter(
      (i) => alvos.has(chave(i.entidade, i.id)) && !(i.entidade === entidade && i.id === id),
    );
  }

  /**
   * RF-079 (RN-005 a): apaga definitivamente um item da lixeira antes do prazo, junto com
   * os itens da lixeira que dependem dele. Devolve quantos itens foram apagados.
   */
  excluirDefinitivamente(entidade: TipoEntidade, id: string): Promise<number> {
    return this.dados.alterar((atual) => {
      const lista = atual[COLECAO[entidade]] as readonly Entidade[];
      const item = lista.find((i) => i.id === id);
      if (!item || ativo(item)) {
        throw new ErroDominio('nao-encontrado', 'Este item não está na lixeira.');
      }
      return this.apagar(atual, coletarComDependentes(atual, [{ entidade, id }]));
    });
  }

  /** RF-079 (RN-005 c): esvazia a lixeira de uma vez. Devolve quantos itens foram apagados. */
  esvaziarLixeira(): Promise<number> {
    return this.dados.alterar((atual) => {
      const itens = itensDaLixeira(atual, this.dados.agora());
      if (itens.length === 0) throw new ErroDominio('lixeira-vazia', 'A lixeira já está vazia.');
      return this.apagar(atual, new Set(itens.map((i) => chave(i.entidade, i.id))));
    });
  }

  // ---------------------------------------------------------------------------

  /**
   * Remove os itens de vez, com os eventos que guardam cópias deles (o estado anterior
   * também é dado do usuário: "apagar definitivamente" não pode deixá-lo no histórico).
   * Fica só um evento por tipo, sem conteúdo, contando quantos itens foram apagados.
   */
  private apagar(
    atual: Colecoes,
    alvos: ReadonlySet<string>,
  ): { mudancas: Partial<Colecoes>; resultado: number } {
    const loteId = this.dados.novoId();
    const ids = new Set([...alvos].map((a) => a.slice(a.indexOf(':') + 1)));
    const mudancas: Record<string, readonly Entidade[]> = {};
    const eventos: EventoHistorico[] = [];
    for (const tipo of TIPOS) {
      const nome = COLECAO[tipo];
      const lista = atual[nome] as readonly Entidade[];
      const restantes = lista.filter((i) => !alvos.has(chave(tipo, i.id)));
      const apagados = lista.length - restantes.length;
      if (apagados === 0) continue;
      mudancas[nome] = restantes;
      eventos.push(
        this.dados.evento({
          acao: 'exclusaoDefinitiva',
          entidade: tipo,
          entidadeId: '',
          resumo: quantidadeItens(apagados),
          estadoAnterior: null,
          loteId,
        }),
      );
    }
    return {
      mudancas: {
        ...(mudancas as Partial<Colecoes>),
        historico: [...atual.historico.filter((e) => !ids.has(e.entidadeId)), ...eventos],
      },
      resultado: alvos.size,
    };
  }

  private restaurarEm(atual: Colecoes, entidade: TipoEntidade, id: string): Partial<Colecoes> {
    const nome = COLECAO[entidade];
    const lista = atual[nome] as readonly Entidade[];
    const item = lista.find((i) => i.id === id);
    if (!item || ativo(item)) {
      throw new ErroDominio('nao-encontrado', 'Este item não está na lixeira.');
    }
    verificarDependencias(entidade, item, atual);

    let restaurado: Entidade = {
      ...item,
      excluidoEm: null,
      atualizadoEm: this.dados.agora().toISOString(),
    };
    if (entidade === 'conta' || entidade === 'categoria') {
      restaurado = evitarNomeRepetido(restaurado as Entidade & { nome: string }, lista, entidade);
    }
    const evento = this.dados.evento({
      acao: 'restauracao',
      entidade,
      entidadeId: id,
      resumo: resumoDe(entidade, item, atual),
      estadoAnterior: item,
    });
    return {
      [nome]: substituir(lista, restaurado),
      historico: [...atual.historico, evento],
    };
  }
}

function chave(entidade: TipoEntidade, id: string): string {
  return `${entidade}:${id}`;
}

function resumoDe(entidade: TipoEntidade, e: Entidade, c: Colecoes): string {
  switch (entidade) {
    case 'transacao':
      return resumoTransacao(e as Colecoes['transacoes'][number]);
    case 'conta':
      return resumoConta(e as Colecoes['contas'][number]);
    case 'categoria':
      return resumoCategoria(e as Colecoes['categorias'][number], c.categorias);
    case 'recorrencia':
      return resumoRecorrencia(e as Colecoes['recorrencias'][number]);
    case 'contaAgendada':
      return resumoContaAgendada(e as Colecoes['contasAgendadas'][number]);
    case 'cofrinho':
      return resumoCofrinho(e as Colecoes['cofrinhos'][number]);
  }
}

function itensDaLixeira(c: Colecoes, agora: Date): ItemLixeira[] {
  return TIPOS.flatMap((entidade) =>
    (c[COLECAO[entidade]] as readonly Entidade[])
      .filter((e) => !ativo(e))
      .map((e): ItemLixeira => ({
        entidade,
        id: e.id,
        resumo: resumoDe(entidade, e, c),
        excluidoEm: e.excluidoEm!,
        diasRestantes: diasAteExclusaoDefinitiva(e.excluidoEm!, agora),
      })),
  ).sort((a, b) => b.excluidoEm.localeCompare(a.excluidoEm));
}

/**
 * Os alvos mais os itens **da lixeira** que dependem deles, de forma transitiva
 * (categoria → subcategorias → transações...). Itens ativos nunca dependem de itens da
 * lixeira: contas e categorias em uso não podem ser excluídas.
 */
function coletarComDependentes(
  c: Colecoes,
  iniciais: readonly { entidade: TipoEntidade; id: string }[],
): Set<string> {
  const alvos = new Set(iniciais.map((i) => chave(i.entidade, i.id)));
  const fila = [...iniciais];
  const incluir = (entidade: TipoEntidade, e: Entidade) => {
    if (ativo(e) || alvos.has(chave(entidade, e.id))) return;
    alvos.add(chave(entidade, e.id));
    fila.push({ entidade, id: e.id });
  };
  while (fila.length > 0) {
    const { entidade, id } = fila.shift()!;
    if (entidade !== 'conta' && entidade !== 'categoria') continue;
    const campo = entidade === 'conta' ? 'conta' : 'categoria';
    const usa = (d: {
      contaId?: string | null;
      contaDestinoId?: string | null;
      categoriaId?: string | null;
    }) => (campo === 'conta' ? d.contaId === id || d.contaDestinoId === id : d.categoriaId === id);
    c.transacoes.filter(usa).forEach((t) => incluir('transacao', t));
    c.recorrencias.filter((r) => usa(r.modelo)).forEach((r) => incluir('recorrencia', r));
    c.contasAgendadas.filter(usa).forEach((a) => incluir('contaAgendada', a));
    if (entidade === 'categoria') {
      c.categorias.filter((s) => s.paiId === id).forEach((s) => incluir('categoria', s));
    }
  }
  return alvos;
}

/** Só as coleções que mudaram, para gravar o mínimo. */
function diferencas(antes: Colecoes, depois: Colecoes): Partial<Colecoes> {
  return Object.fromEntries(
    (Object.keys(depois) as (keyof Colecoes)[])
      .filter((k) => depois[k] !== antes[k])
      .map((k) => [k, depois[k]]),
  ) as Partial<Colecoes>;
}

/** Não restaura algo que dependa de um item ainda excluído (ex.: transação de conta excluída). */
function verificarDependencias(entidade: TipoEntidade, item: Entidade, atual: Colecoes): void {
  const contaAtiva = (id: string | null) =>
    !id || atual.contas.some((c) => c.id === id && ativo(c));
  const categoriaAtiva = (id: string | null) =>
    !id || atual.categorias.some((c) => c.id === id && ativo(c));
  const exigir = (ok: boolean, mensagem: string) => {
    if (!ok) throw new ErroDominio('dependencia-excluida', mensagem);
  };

  if (entidade === 'transacao' || entidade === 'recorrencia') {
    const d =
      entidade === 'transacao'
        ? (item as Colecoes['transacoes'][number])
        : (item as Colecoes['recorrencias'][number]).modelo;
    exigir(
      contaAtiva(d.contaId) && contaAtiva(d.contaDestinoId),
      'A conta deste item está na lixeira. Restaure a conta primeiro.',
    );
    exigir(
      categoriaAtiva(d.categoriaId),
      'A categoria deste item está na lixeira. Restaure a categoria primeiro.',
    );
  }
  if (entidade === 'contaAgendada') {
    const conta = item as Colecoes['contasAgendadas'][number];
    exigir(
      contaAtiva(conta.contaId),
      'A conta financeira deste item está na lixeira. Restaure-a primeiro.',
    );
    exigir(
      categoriaAtiva(conta.categoriaId),
      'A categoria deste item está na lixeira. Restaure a categoria primeiro.',
    );
  }
  if (entidade === 'categoria') {
    exigir(
      categoriaAtiva((item as Colecoes['categorias'][number]).paiId),
      'A categoria-pai está na lixeira. Restaure-a primeiro.',
    );
  }
}

/** Se já existe um item ativo com o mesmo nome, acrescenta "(restaurada)" ao nome. */
function evitarNomeRepetido<
  T extends Entidade & { nome: string; paiId?: string | null; tipo?: string },
>(item: T, lista: readonly Entidade[], entidade: TipoEntidade): T {
  const iguais = (outro: Entidade & { nome?: string; paiId?: string | null; tipo?: string }) =>
    ativo(outro) &&
    outro.id !== item.id &&
    normalizarTexto(outro.nome ?? '') === normalizarTexto(item.nome) &&
    (entidade === 'conta' || (outro.paiId === item.paiId && outro.tipo === item.tipo));
  return lista.some(iguais) ? { ...item, nome: `${item.nome} (restaurada)` } : item;
}
