import { computed, inject, Injectable } from '@angular/core';
import { diasAteExclusaoDefinitiva, type TipoEntidade } from '../../domain/historico/historico';
import { ativo, type Entidade, normalizarTexto } from '../../domain/shared/entidade';
import { ErroDominio } from '../../domain/shared/erro-dominio';
import { substituir } from '../dados/colecoes';
import { type Colecoes, DadosService } from '../dados/dados.service';
import { resumoCategoria, resumoConta, resumoRecorrencia, resumoTransacao } from './resumos';

export interface ItemLixeira {
  readonly entidade: TipoEntidade;
  readonly id: string;
  readonly resumo: string;
  readonly excluidoEm: string;
  readonly diasRestantes: number;
}

const COLECAO: Record<TipoEntidade, 'transacoes' | 'contas' | 'categorias' | 'recorrencias'> = {
  transacao: 'transacoes',
  conta: 'contas',
  categoria: 'categorias',
  recorrencia: 'recorrencias',
};

/** Histórico de ações e lixeira (RN-004, RF-075, RF-076). */
@Injectable({ providedIn: 'root' })
export class HistoricoService {
  private readonly dados = inject(DadosService);

  /** Eventos do mais recente para o mais antigo (no empate, o registrado por último vem antes). */
  readonly eventos = computed(() =>
    [...this.dados.historico()].reverse().sort((a, b) => b.ocorridoEm.localeCompare(a.ocorridoEm)),
  );

  readonly lixeira = computed<ItemLixeira[]>(() => {
    const c = this.dados.colecoes();
    const agora = this.dados.agora();
    const item = (entidade: TipoEntidade, e: Entidade, resumo: string): ItemLixeira => ({
      entidade,
      id: e.id,
      resumo,
      excluidoEm: e.excluidoEm!,
      diasRestantes: diasAteExclusaoDefinitiva(e.excluidoEm!, agora),
    });
    return [
      ...c.transacoes.filter((e) => !ativo(e)).map((e) => item('transacao', e, resumoTransacao(e))),
      ...c.contas.filter((e) => !ativo(e)).map((e) => item('conta', e, resumoConta(e))),
      ...c.categorias
        .filter((e) => !ativo(e))
        .map((e) => item('categoria', e, resumoCategoria(e, c.categorias))),
      ...c.recorrencias
        .filter((e) => !ativo(e))
        .map((e) => item('recorrencia', e, resumoRecorrencia(e))),
    ].sort((a, b) => b.excluidoEm.localeCompare(a.excluidoEm));
  });

  /** Restaura um item da lixeira (RN-004), registrando a restauração no histórico. */
  restaurar(entidade: TipoEntidade, id: string): Promise<void> {
    return this.dados.alterar((atual) => {
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
        resumo: this.lixeira().find((i) => i.id === id)?.resumo ?? id,
        estadoAnterior: item,
      });
      return {
        mudancas: {
          [nome]: substituir(lista, restaurado),
          historico: [...atual.historico, evento],
        },
        resultado: undefined,
      };
    });
  }
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
