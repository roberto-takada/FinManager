/** Campos comuns às entidades persistidas. */
export interface Entidade {
  readonly id: string;
  /** Instantes em ISO 8601 (com horário). */
  readonly criadoEm: string;
  readonly atualizadoEm: string;
  /** Exclusão lógica (RN-004): preenchido quando o item vai para a lixeira. */
  readonly excluidoEm: string | null;
}

export const ativo = <T extends Entidade>(item: T): boolean => item.excluidoEm === null;
export const ativos = <T extends Entidade>(itens: readonly T[]): T[] => itens.filter(ativo);

/** Remove acentos e caixa para comparações e buscas ("Água" ≈ "agua"). */
export function normalizarTexto(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('pt-BR')
    .trim();
}
