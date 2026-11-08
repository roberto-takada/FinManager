import type {
  ChaveDeDados,
  ChavesCofre,
  CriptografiaCofre,
  EnvelopeChave,
  ParametrosKdf,
} from '../../application/ports/cofre.ports';
import { deBase64, paraBase64 } from './base64';

/**
 * Criptografia em envelope do cofre (ENGENHARIA_DE_SOFTWARE §5.6, ADR-0002).
 *
 * - DEK: 32 bytes aleatórios; em memória, vira uma CryptoKey AES-256-GCM **não extraível**.
 * - KEK: derivada do segredo (senha ou chave de recuperação) com Argon2id + salt aleatório.
 * - A DEK é cifrada pela KEK com AES-GCM; o "dado adicional autenticado" (AAD) amarra cada
 *   envelope à sua finalidade, impedindo trocar um envelope pelo outro.
 * - Senha errada = falha de autenticação do GCM. Nenhum hash de senha é armazenado.
 *
 * Os bytes brutos de chaves são zerados após o uso. Em JavaScript isso é uma redução de
 * exposição, não uma garantia (o motor pode ter feito cópias internas).
 */

/**
 * Calibrado para o desbloqueio levar entre 0,5 s e 3 s (RNF-033), bem acima do mínimo
 * da OWASP para Argon2id (19 MiB, 2 iterações). Medido nos testes E2E (2026-11-06):
 * com 3 iterações o desbloqueio levava ~0,2 s; com 10, ~0,55 s em um desktop atual.
 * A memória fica em 64 MiB para não pesar em celulares.
 */
export const PARAMETROS_KDF_PADRAO: ParametrosKdf = {
  algoritmo: 'argon2id',
  memoriaKiB: 65_536,
  iteracoes: 10,
  paralelismo: 1,
};

const TAMANHO_DEK = 32;
const TAMANHO_SALT = 16;
const TAMANHO_IV = 12;

type Finalidade = 'senha' | 'recuperacao';

export class CriptografiaCofreWebCrypto implements CriptografiaCofre {
  constructor(
    private readonly parametros: ParametrosKdf = PARAMETROS_KDF_PADRAO,
    private readonly cripto: Crypto = globalThis.crypto,
  ) {}

  bytesAleatorios(quantidade: number): Uint8Array<ArrayBuffer> {
    return this.cripto.getRandomValues(new Uint8Array(quantidade));
  }

  async criarChaves(senha: string, chaveRecuperacao: Uint8Array) {
    const dekBruta = this.bytesAleatorios(TAMANHO_DEK);
    try {
      const chaves: ChavesCofre = {
        senha: await this.embrulhar(dekBruta, senha, 'senha'),
        recuperacao: await this.embrulhar(dekBruta, chaveRecuperacao, 'recuperacao'),
      };
      return { chaves, dek: await this.importarDek(dekBruta) };
    } finally {
      dekBruta.fill(0);
    }
  }

  async abrirComSenha(chaves: ChavesCofre, senha: string) {
    const bruta = await this.desembrulhar(chaves.senha, senha, 'senha');
    return bruta ? this.importarDek(bruta) : null;
  }

  async abrirComChaveRecuperacao(chaves: ChavesCofre, chaveRecuperacao: Uint8Array) {
    const bruta = await this.desembrulhar(chaves.recuperacao, chaveRecuperacao, 'recuperacao');
    return bruta ? this.importarDek(bruta) : null;
  }

  async trocarSenha(chaves: ChavesCofre, senhaAtual: string, novaSenha: string) {
    const bruta = await this.desembrulhar(chaves.senha, senhaAtual, 'senha');
    if (!bruta) return null;
    try {
      return { ...chaves, senha: await this.embrulhar(bruta, novaSenha, 'senha') };
    } finally {
      bruta.fill(0);
    }
  }

  async redefinirSenhaComRecuperacao(
    chaves: ChavesCofre,
    chaveRecuperacao: Uint8Array,
    novaSenha: string,
  ) {
    const bruta = await this.desembrulhar(chaves.recuperacao, chaveRecuperacao, 'recuperacao');
    if (!bruta) return null;
    try {
      const novas: ChavesCofre = {
        ...chaves,
        senha: await this.embrulhar(bruta, novaSenha, 'senha'),
      };
      return { chaves: novas, dek: await this.importarDek(bruta) };
    } finally {
      bruta.fill(0);
    }
  }

  async trocarChaveRecuperacao(chaves: ChavesCofre, senha: string, novaChave: Uint8Array) {
    const bruta = await this.desembrulhar(chaves.senha, senha, 'senha');
    if (!bruta) return null;
    try {
      return { ...chaves, recuperacao: await this.embrulhar(bruta, novaChave, 'recuperacao') };
    } finally {
      bruta.fill(0);
    }
  }

  // ---------------------------------------------------------------------------

  private async derivarKek(
    segredo: string | Uint8Array,
    salt: Uint8Array,
    kdf: ParametrosKdf,
  ): Promise<CryptoKey> {
    if (kdf.algoritmo !== 'argon2id') {
      throw new Error(`Algoritmo de derivação de chave não suportado: ${String(kdf.algoritmo)}`);
    }
    // Carregado sob demanda: o WASM do Argon2id não entra no pacote inicial.
    const { argon2id } = await import('hash-wasm');
    const derivada = await argon2id({
      // NFC: a mesma senha com acentos gera os mesmos bytes em qualquer sistema/teclado.
      password: typeof segredo === 'string' ? segredo.normalize('NFC') : segredo,
      salt,
      parallelism: kdf.paralelismo,
      iterations: kdf.iteracoes,
      memorySize: kdf.memoriaKiB,
      hashLength: 32,
      outputType: 'binary',
    });
    const bytes = new Uint8Array(derivada);
    derivada.fill(0);
    try {
      return await this.cripto.subtle.importKey('raw', bytes, 'AES-GCM', false, [
        'encrypt',
        'decrypt',
      ]);
    } finally {
      bytes.fill(0);
    }
  }

  private async embrulhar(
    dekBruta: Uint8Array<ArrayBuffer>,
    segredo: string | Uint8Array,
    finalidade: Finalidade,
  ): Promise<EnvelopeChave> {
    const salt = this.bytesAleatorios(TAMANHO_SALT);
    const iv = this.bytesAleatorios(TAMANHO_IV);
    const kek = await this.derivarKek(segredo, salt, this.parametros);
    const cifrada = await this.cripto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: aad(finalidade) },
      kek,
      dekBruta,
    );
    return {
      kdf: { ...this.parametros },
      salt: paraBase64(salt),
      iv: paraBase64(iv),
      dekCifrada: paraBase64(new Uint8Array(cifrada)),
    };
  }

  /** Devolve os bytes da DEK, ou `null` se o segredo estiver errado (falha do GCM). */
  private async desembrulhar(
    envelope: EnvelopeChave,
    segredo: string | Uint8Array,
    finalidade: Finalidade,
  ): Promise<Uint8Array<ArrayBuffer> | null> {
    const kek = await this.derivarKek(segredo, deBase64(envelope.salt), envelope.kdf);
    try {
      const bruta = await this.cripto.subtle.decrypt(
        { name: 'AES-GCM', iv: deBase64(envelope.iv), additionalData: aad(finalidade) },
        kek,
        deBase64(envelope.dekCifrada),
      );
      return new Uint8Array(bruta);
    } catch (erro) {
      // Pelo nome, não por instanceof: a DOMException pode vir de outro realm.
      if ((erro as { name?: unknown } | null)?.name === 'OperationError') return null;
      throw erro;
    }
  }

  private async importarDek(bruta: Uint8Array<ArrayBuffer>): Promise<ChaveDeDados> {
    try {
      const chave = await this.cripto.subtle.importKey('raw', bruta, 'AES-GCM', false, [
        'encrypt',
        'decrypt',
      ]);
      return chave as unknown as ChaveDeDados;
    } finally {
      bruta.fill(0);
    }
  }
}

function aad(finalidade: Finalidade): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(`finmanager:cofre:v1:${finalidade}`);
}
