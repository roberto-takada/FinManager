import type { MetadadosCofre, RepositorioCofre } from '../../application/ports/cofre.ports';
import { BancoIdb } from './banco-idb';

/**
 * Metadados do cofre no IndexedDB (ADR-0003): DEKs cifradas + parâmetros, sem nenhum
 * dado financeiro.
 */

const CHAVE_METADADOS = 'metadados';

export class FormatoCofreDesconhecidoError extends Error {
  constructor() {
    super('Os dados do cofre neste navegador estão em um formato desconhecido.');
    this.name = 'FormatoCofreDesconhecidoError';
  }
}

export class RepositorioCofreIdb implements RepositorioCofre {
  constructor(private readonly banco = new BancoIdb()) {}

  async ler(): Promise<MetadadosCofre | null> {
    const banco = await this.banco.abrir();
    const metadados = await banco.get('cofre', CHAVE_METADADOS);
    if (metadados === undefined) return null;
    if (metadados.versao !== 1) throw new FormatoCofreDesconhecidoError();
    return metadados;
  }

  async salvar(metadados: MetadadosCofre): Promise<void> {
    const banco = await this.banco.abrir();
    await banco.put('cofre', metadados, CHAVE_METADADOS);
  }

  /** Apaga o banco inteiro: metadados e todos os dados cifrados. */
  apagarTudo(): Promise<void> {
    return this.banco.apagar();
  }
}
