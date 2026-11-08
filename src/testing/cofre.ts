import type { ParametrosKdf } from '../app/application/ports/cofre.ports';
import type { MetadadosCofre, RepositorioCofre } from '../app/application/ports/cofre.ports';

/** Utilitários de teste do cofre. Fora do build do app (ver tsconfig.app.json). */

/** Argon2id com custo baixo: só para os testes ficarem rápidos. */
export const PARAMETROS_KDF_TESTE: ParametrosKdf = {
  algoritmo: 'argon2id',
  memoriaKiB: 1024,
  iteracoes: 1,
  paralelismo: 1,
};

/** Senhas fictícias que atendem à força mínima. */
export const SENHA_TESTE = 'cavalo azul come bateria';
export const OUTRA_SENHA_TESTE = 'outra frase bem comprida 42';

export class RepositorioCofreEmMemoria implements RepositorioCofre {
  metadados: MetadadosCofre | null = null;
  apagado = false;

  async ler() {
    return this.metadados;
  }
  async salvar(metadados: MetadadosCofre) {
    this.metadados = structuredClone(metadados);
  }
  async apagarTudo() {
    this.metadados = null;
    this.apagado = true;
  }
}
