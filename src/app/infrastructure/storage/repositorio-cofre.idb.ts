import { deleteDB, openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { MetadadosCofre, RepositorioCofre } from '../../application/ports/cofre.ports';

/**
 * Armazenamento do cofre no IndexedDB (ADR-0003).
 * Nesta versão guarda só os metadados (DEKs cifradas + parâmetros), que não contêm
 * nenhum dado financeiro. Os registros cifrados virão em stores próprias.
 */

export const NOME_BANCO_PADRAO = 'finmanager';
const VERSAO_BANCO = 1;
const STORE_COFRE = 'cofre';
const CHAVE_METADADOS = 'metadados';

interface EsquemaFinManager extends DBSchema {
  [STORE_COFRE]: { key: string; value: MetadadosCofre };
}

export class FormatoCofreDesconhecidoError extends Error {
  constructor() {
    super('Os dados do cofre neste navegador estão em um formato desconhecido.');
    this.name = 'FormatoCofreDesconhecidoError';
  }
}

export class RepositorioCofreIdb implements RepositorioCofre {
  private conexao: Promise<IDBPDatabase<EsquemaFinManager>> | null = null;

  constructor(private readonly nomeBanco = NOME_BANCO_PADRAO) {}

  async ler(): Promise<MetadadosCofre | null> {
    const banco = await this.abrir();
    const metadados = await banco.get(STORE_COFRE, CHAVE_METADADOS);
    if (metadados === undefined) return null;
    if (metadados.versao !== 1) throw new FormatoCofreDesconhecidoError();
    return metadados;
  }

  async salvar(metadados: MetadadosCofre): Promise<void> {
    const banco = await this.abrir();
    await banco.put(STORE_COFRE, metadados, CHAVE_METADADOS);
  }

  async apagarTudo(): Promise<void> {
    await this.fechar();
    await deleteDB(this.nomeBanco);
  }

  private abrir(): Promise<IDBPDatabase<EsquemaFinManager>> {
    this.conexao ??= openDB<EsquemaFinManager>(this.nomeBanco, VERSAO_BANCO, {
      upgrade(banco) {
        banco.createObjectStore(STORE_COFRE);
      },
      // Outra aba pediu para apagar/atualizar o banco: libera a conexão para não travá-la.
      blocking: () => void this.fechar(),
      terminated: () => {
        this.conexao = null;
      },
    });
    return this.conexao;
  }

  private async fechar(): Promise<void> {
    const conexao = this.conexao;
    this.conexao = null;
    if (conexao) (await conexao).close();
  }
}
