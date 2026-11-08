import { computed, inject, Injectable } from '@angular/core';
import {
  type Categoria,
  type DadosCategoria,
  ordenarComoArvore,
  validarCategoria,
} from '../../domain/categorias/categoria';
import { ativo } from '../../domain/shared/entidade';
import { ErroDominio } from '../../domain/shared/erro-dominio';
import { buscarAtivo, marcarExcluido, substituir } from '../dados/colecoes';
import { DadosService } from '../dados/dados.service';
import { resumoCategoria } from '../historico/resumos';

/** Categorias e subcategorias personalizadas (RF-015). */
@Injectable({ providedIn: 'root' })
export class CategoriasService {
  private readonly dados = inject(DadosService);

  /** Categorias ativas em ordem de árvore (pai seguido das subcategorias). */
  readonly arvore = computed(() => ordenarComoArvore(this.dados.categorias()));

  criar(dados: DadosCategoria): Promise<Categoria> {
    return this.dados.alterar((atual) => {
      const instante = this.dados.agora().toISOString();
      const categoria: Categoria = {
        ...validarCategoria(dados, atual.categorias),
        id: this.dados.novoId(),
        criadoEm: instante,
        atualizadoEm: instante,
        excluidoEm: null,
      };
      return { mudancas: { categorias: [...atual.categorias, categoria] }, resultado: categoria };
    });
  }

  /** Edita nome e categoria-pai. O tipo (receita/despesa) não muda depois de criado. */
  editar(id: string, dados: { nome: string; paiId: string | null }): Promise<Categoria> {
    return this.dados.alterar((atual) => {
      const anterior = buscarAtivo(atual.categorias, id, 'Categoria');
      const categoria: Categoria = {
        ...anterior,
        ...validarCategoria({ ...dados, tipo: anterior.tipo }, atual.categorias, id),
        atualizadoEm: this.dados.agora().toISOString(),
      };
      return {
        mudancas: { categorias: substituir(atual.categorias, categoria) },
        resultado: categoria,
      };
    });
  }

  /** Exclusão (RN-005 a): vai para a lixeira e entra no histórico. */
  excluir(id: string): Promise<void> {
    return this.dados.alterar((atual) => {
      const categoria = buscarAtivo(atual.categorias, id, 'Categoria');
      if (atual.categorias.some((c) => ativo(c) && c.paiId === id)) {
        throw new ErroDominio(
          'categoria-com-subcategorias',
          `"${categoria.nome}" tem subcategorias. Exclua-as antes.`,
        );
      }
      const emUso =
        atual.transacoes.filter((t) => ativo(t) && t.categoriaId === id).length +
        atual.recorrencias.filter((r) => ativo(r) && r.modelo.categoriaId === id).length +
        atual.contasAgendadas.filter((c) => ativo(c) && c.categoriaId === id).length;
      if (emUso > 0) {
        throw new ErroDominio(
          'categoria-em-uso',
          `"${categoria.nome}" é usada em ${emUso} ${emUso === 1 ? 'item' : 'itens'} (transações, recorrências ou contas a pagar/receber). Troque a categoria deles antes.`,
        );
      }
      const instante = this.dados.agora().toISOString();
      const evento = this.dados.evento({
        acao: 'exclusao',
        entidade: 'categoria',
        entidadeId: id,
        resumo: resumoCategoria(categoria, atual.categorias),
        estadoAnterior: categoria,
      });
      return {
        mudancas: {
          categorias: substituir(atual.categorias, marcarExcluido(categoria, instante)),
          historico: [...atual.historico, evento],
        },
        resultado: undefined,
      };
    });
  }
}
