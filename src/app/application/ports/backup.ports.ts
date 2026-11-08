import { InjectionToken } from '@angular/core';
import type { ChaveDeDados } from './cofre.ports';

/** Bloco cifrado do backup (base64). */
export interface ConteudoCifrado {
  readonly iv: string;
  readonly dados: string;
}

/**
 * Cifra o conteúdo do arquivo de backup com a DEK (RN-012, ENGENHARIA_DE_SOFTWARE §5.7).
 * Só a infraestrutura sabe usar a DEK.
 */
export interface CifradorBackup {
  cifrar(dek: ChaveDeDados, texto: string): Promise<ConteudoCifrado>;
  /** Lança erro se o conteúdo foi alterado ou a chave não for a dele. */
  decifrar(dek: ChaveDeDados, conteudo: ConteudoCifrado): Promise<string>;
}

export const CIFRADOR_BACKUP = new InjectionToken<CifradorBackup>('CIFRADOR_BACKUP');
