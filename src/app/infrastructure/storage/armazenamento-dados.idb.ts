import type { ChaveDeDados } from '../../application/ports/cofre.ports';
import type { ArmazenamentoDados, Colecao } from '../../application/ports/dados.ports';
import { deBase64, paraBase64 } from '../crypto/base64';
import { BancoIdb, type BlocoCifrado } from './banco-idb';

/**
 * Dados do usuário cifrados no IndexedDB (RN-001, ENGENHARIA_DE_SOFTWARE §5.6).
 *
 * Cada coleção é um único bloco cifrado com AES-256-GCM, IV aleatório a cada gravação e
 * a coleção como dado adicional autenticado (um bloco não pode ser trocado por outro).
 * Assim não existe nenhum campo em texto claro que possa ser indexado ou lido; o que
 * fica visível é só o tamanho aproximado de cada coleção.
 */

const VERSAO_CONTEUDO = 1;

interface Conteudo {
  readonly versao: number;
  readonly itens: unknown[];
}

export class DadosCorrompidosError extends Error {
  constructor(colecao: Colecao) {
    super(`Os dados de "${colecao}" não puderam ser decifrados ou estão corrompidos.`);
    this.name = 'DadosCorrompidosError';
  }
}

export class ArmazenamentoDadosIdb implements ArmazenamentoDados {
  constructor(
    private readonly banco = new BancoIdb(),
    private readonly cripto: Crypto = globalThis.crypto,
  ) {}

  async ler(dek: ChaveDeDados, colecao: Colecao): Promise<unknown[] | null> {
    const bloco = await (await this.banco.abrir()).get('dados', colecao);
    if (!bloco) return null;
    try {
      const claro = await this.cripto.subtle.decrypt(
        { name: 'AES-GCM', iv: deBase64(bloco.iv), additionalData: aad(colecao) },
        dek as unknown as CryptoKey,
        deBase64(bloco.cifrado),
      );
      const conteudo = JSON.parse(new TextDecoder().decode(claro)) as Conteudo;
      if (conteudo.versao !== VERSAO_CONTEUDO || !Array.isArray(conteudo.itens)) {
        throw new DadosCorrompidosError(colecao);
      }
      return conteudo.itens;
    } catch (erro) {
      if ((erro as { name?: unknown } | null)?.name === 'OperationError') {
        throw new DadosCorrompidosError(colecao);
      }
      throw erro;
    }
  }

  async gravar(
    dek: ChaveDeDados,
    alteracoes: Partial<Record<Colecao, readonly unknown[]>>,
  ): Promise<void> {
    // Cifra tudo antes de abrir a transação: o IndexedDB fecha transações ociosas
    // enquanto se espera por operações assíncronas que não são do próprio banco.
    const blocos = await Promise.all(
      Object.entries(alteracoes).map(async ([colecao, itens]) => ({
        colecao,
        bloco: await this.cifrar(dek, colecao as Colecao, itens),
      })),
    );
    const transacao = (await this.banco.abrir()).transaction('dados', 'readwrite');
    await Promise.all([
      ...blocos.map(({ colecao, bloco }) => transacao.store.put(bloco, colecao)),
      transacao.done,
    ]);
  }

  private async cifrar(
    dek: ChaveDeDados,
    colecao: Colecao,
    itens: readonly unknown[],
  ): Promise<BlocoCifrado> {
    const iv = this.cripto.getRandomValues(new Uint8Array(12));
    const conteudo: Conteudo = { versao: VERSAO_CONTEUDO, itens: [...itens] };
    const cifrado = await this.cripto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: aad(colecao) },
      dek as unknown as CryptoKey,
      new TextEncoder().encode(JSON.stringify(conteudo)),
    );
    return { versao: 1, iv: paraBase64(iv), cifrado: paraBase64(new Uint8Array(cifrado)) };
  }
}

function aad(colecao: Colecao): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(`finmanager:dados:v1:${colecao}`);
}
