import type { Entidade } from '../../domain/shared/entidade';
import { ErroDominio } from '../../domain/shared/erro-dominio';

/** Utilitários para alterar coleções de forma imutável. */

export function buscarAtivo<T extends Entidade>(itens: readonly T[], id: string, nome: string): T {
  const item = itens.find((i) => i.id === id);
  if (!item || item.excluidoEm !== null) {
    throw new ErroDominio('nao-encontrado', `${nome} não encontrada.`);
  }
  return item;
}

export function substituir<T extends Entidade>(itens: readonly T[], novo: T): T[] {
  return itens.map((i) => (i.id === novo.id ? novo : i));
}

/** Exclusão lógica (RN-004): o item vai para a lixeira. */
export function marcarExcluido<T extends Entidade>(item: T, instante: string): T {
  return { ...item, excluidoEm: instante, atualizadoEm: instante };
}
