import { deleteDB, openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { MetadadosCofre } from '../../application/ports/cofre.ports';

/**
 * Banco IndexedDB do FinManager, compartilhado pelos repositórios (ADR-0003).
 *
 * - `cofre`: metadados do cofre (DEKs cifradas, parâmetros). Única parte não cifrada.
 * - `dados`: um bloco cifrado por coleção (contas, transações...). Ver ArmazenamentoDadosIdb.
 */
export const NOME_BANCO_PADRAO = 'finmanager';
export const VERSAO_BANCO = 2;

/** Um bloco de dados cifrado com AES-256-GCM. */
export interface BlocoCifrado {
  readonly versao: 1;
  /** Base64. */
  readonly iv: string;
  /** Base64. */
  readonly cifrado: string;
}

export interface EsquemaFinManager extends DBSchema {
  cofre: { key: string; value: MetadadosCofre };
  dados: { key: string; value: BlocoCifrado };
}

export class BancoIdb {
  private conexao: Promise<IDBPDatabase<EsquemaFinManager>> | null = null;

  constructor(readonly nome = NOME_BANCO_PADRAO) {}

  abrir(): Promise<IDBPDatabase<EsquemaFinManager>> {
    this.conexao ??= openDB<EsquemaFinManager>(this.nome, VERSAO_BANCO, {
      upgrade(banco, versaoAnterior) {
        // Migrações incrementais: cada versão só acrescenta o que falta.
        if (versaoAnterior < 1) banco.createObjectStore('cofre');
        if (versaoAnterior < 2) banco.createObjectStore('dados');
      },
      // Outra aba pediu para apagar/atualizar o banco: libera a conexão para não travá-la.
      blocking: () => void this.fechar(),
      terminated: () => {
        this.conexao = null;
      },
    });
    return this.conexao;
  }

  async fechar(): Promise<void> {
    const conexao = this.conexao;
    this.conexao = null;
    if (conexao) (await conexao).close();
  }

  /** Apaga definitivamente o banco inteiro (RF-006). */
  async apagar(): Promise<void> {
    await this.fechar();
    await deleteDB(this.nome);
  }
}
