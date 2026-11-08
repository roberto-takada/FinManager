import { PREFERENCIAS_NOTIFICACAO_PADRAO, type PreferenciasNotificacao } from '../agenda/alertas';
import type { LayoutDashboard } from '../dashboard/layout';

/**
 * Preferências do usuário guardadas no cofre (cifradas). A coleção `preferencias` tem no
 * máximo um item. Por ora há as de notificação (RF-024), o tema (RF-081), o layout da
 * dashboard (RF-044) e os ajustes de acessibilidade (RF-082); as demais virão com RF-083.
 */

/** RF-081: claro, escuro ou seguir o sistema operacional. */
export type Tema = 'sistema' | 'claro' | 'escuro';

export const TEMAS: Readonly<Record<Tema, string>> = {
  sistema: 'Seguir o sistema',
  claro: 'Claro',
  escuro: 'Escuro',
};
/** RF-082: ajustes de leitura e movimento. */
export type TamanhoFonte = 'padrao' | 'grande' | 'maior';
export type Contraste = 'padrao' | 'alto';
/** "sistema" segue `prefers-reduced-motion`; "reduzidas" desliga animações sempre. */
export type Animacoes = 'sistema' | 'reduzidas';

export interface PreferenciasAcessibilidade {
  readonly tamanhoFonte: TamanhoFonte;
  readonly contraste: Contraste;
  readonly animacoes: Animacoes;
}

export const TAMANHOS_FONTE: Readonly<Record<TamanhoFonte, string>> = {
  padrao: 'Padrão (100%)',
  grande: 'Grande (112%)',
  maior: 'Maior (125%)',
};
export const CONTRASTES: Readonly<Record<Contraste, string>> = {
  padrao: 'Padrão',
  alto: 'Alto contraste',
};
export const OPCOES_ANIMACOES: Readonly<Record<Animacoes, string>> = {
  sistema: 'Seguir o sistema',
  reduzidas: 'Reduzir animações',
};

export const ACESSIBILIDADE_PADRAO: PreferenciasAcessibilidade = {
  tamanhoFonte: 'padrao',
  contraste: 'padrao',
  animacoes: 'sistema',
};

/** Lê o que foi guardado sem confiar: valores desconhecidos voltam ao padrão. */
export function normalizarAcessibilidade(guardado: unknown): PreferenciasAcessibilidade {
  const g = (guardado ?? {}) as Partial<Record<keyof PreferenciasAcessibilidade, unknown>>;
  const valido = <T extends string>(
    valor: unknown,
    opcoes: Readonly<Record<T, string>>,
    padrao: T,
  ) => (typeof valor === 'string' && valor in opcoes ? (valor as T) : padrao);
  return {
    tamanhoFonte: valido(g.tamanhoFonte, TAMANHOS_FONTE, ACESSIBILIDADE_PADRAO.tamanhoFonte),
    contraste: valido(g.contraste, CONTRASTES, ACESSIBILIDADE_PADRAO.contraste),
    animacoes: valido(g.animacoes, OPCOES_ANIMACOES, ACESSIBILIDADE_PADRAO.animacoes),
  };
}

export interface Preferencias {
  readonly notificacao: PreferenciasNotificacao;
  /**
   * Alertas já notificados, no formato "contaId|vencimento|dia", para não repetir a mesma
   * notificação no mesmo dia (ENGENHARIA_DE_SOFTWARE §5.10).
   */
  readonly notificadas: readonly string[];
  /** Opcional: cofres criados antes do RF-081 não têm o campo (vale "sistema"). */
  readonly tema?: Tema;
  /** Opcional: sem layout guardado vale `LAYOUT_PADRAO` (RF-044). */
  readonly dashboard?: LayoutDashboard;
  /** Opcional: sem escolha vale `ACESSIBILIDADE_PADRAO` (RF-082). */
  readonly acessibilidade?: PreferenciasAcessibilidade;
}

export const PREFERENCIAS_PADRAO: Preferencias = {
  notificacao: PREFERENCIAS_NOTIFICACAO_PADRAO,
  notificadas: [],
  tema: 'sistema',
};
