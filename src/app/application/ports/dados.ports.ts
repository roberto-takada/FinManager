import { InjectionToken } from '@angular/core';
import type { ChaveDeDados } from './cofre.ports';

/** Coleções de dados do usuário, cada uma guardada como um bloco cifrado. */
export type Colecao =
  | 'contas'
  | 'categorias'
  | 'transacoes'
  | 'recorrencias'
  | 'historico'
  | 'contasAgendadas'
  | 'cofrinhos'
  | 'preferencias'
  | 'perfil';

export const COLECOES: readonly Colecao[] = [
  'contas',
  'categorias',
  'transacoes',
  'recorrencias',
  'historico',
  'contasAgendadas',
  'cofrinhos',
  'preferencias',
  'perfil',
];

/**
 * Armazenamento cifrado dos dados do usuário (ENGENHARIA_DE_SOFTWARE §5.6).
 * Cifrar e decifrar acontece só na implementação; a aplicação trabalha com objetos.
 */
export interface ArmazenamentoDados {
  /** Itens da coleção, ou `null` se ela nunca foi gravada. */
  ler(dek: ChaveDeDados, colecao: Colecao): Promise<unknown[] | null>;
  /** Grava várias coleções de forma atômica: ou todas, ou nenhuma (RNF-013). */
  gravar(
    dek: ChaveDeDados,
    alteracoes: Partial<Record<Colecao, readonly unknown[]>>,
  ): Promise<void>;
}

export const ARMAZENAMENTO_DADOS = new InjectionToken<ArmazenamentoDados>('ARMAZENAMENTO_DADOS');

/** Relógio injetável, para testes com datas controladas. */
export const RELOGIO = new InjectionToken<() => Date>('RELOGIO', {
  providedIn: 'root',
  factory: () => () => new Date(),
});

/** Gerador de identificadores sem significado (não revelam ordem nem conteúdo). */
export const GERADOR_ID = new InjectionToken<() => string>('GERADOR_ID', {
  providedIn: 'root',
  factory: () => () => crypto.randomUUID(),
});
