import type { CifradorBackup, ConteudoCifrado } from '../../application/ports/backup.ports';
import type { ChaveDeDados } from '../../application/ports/cofre.ports';
import { deBase64, paraBase64 } from '../crypto/base64';

/** Amarra o bloco à finalidade "backup": ele não pode ser trocado por outro bloco cifrado. */
const AAD = new TextEncoder().encode('finmanager:backup:v1');
const TAMANHO_IV = 12;

/** AES-256-GCM com IV aleatório a cada exportação (RNF-002). */
export class CifradorBackupWebCrypto implements CifradorBackup {
  constructor(private readonly cripto: Crypto = globalThis.crypto) {}

  async cifrar(dek: ChaveDeDados, texto: string): Promise<ConteudoCifrado> {
    const iv = this.cripto.getRandomValues(new Uint8Array(TAMANHO_IV));
    const cifrado = await this.cripto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: AAD },
      dek as unknown as CryptoKey,
      new TextEncoder().encode(texto),
    );
    return { iv: paraBase64(iv), dados: paraBase64(new Uint8Array(cifrado)) };
  }

  async decifrar(dek: ChaveDeDados, conteudo: ConteudoCifrado): Promise<string> {
    const claro = await this.cripto.subtle.decrypt(
      { name: 'AES-GCM', iv: deBase64(conteudo.iv), additionalData: AAD },
      dek as unknown as CryptoKey,
      deBase64(conteudo.dados),
    );
    return new TextDecoder().decode(claro);
  }
}
