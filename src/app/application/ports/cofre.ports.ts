import { InjectionToken } from '@angular/core';

/**
 * Portas do cofre (ENGENHARIA_DE_SOFTWARE §4.2 e §5.6).
 * A aplicação conhece apenas estas interfaces; as implementações ficam em infrastructure/.
 */

/** Parâmetros do Argon2id, gravados junto de cada envelope para permitir aumentá-los no futuro. */
export interface ParametrosKdf {
  readonly algoritmo: 'argon2id';
  readonly memoriaKiB: number;
  readonly iteracoes: number;
  readonly paralelismo: number;
}

/** A chave de dados (DEK) cifrada por uma chave derivada de um segredo (senha ou chave de recuperação). */
export interface EnvelopeChave {
  readonly kdf: ParametrosKdf;
  /** Base64. */
  readonly salt: string;
  /** Base64. */
  readonly iv: string;
  /** Base64: DEK cifrada com AES-256-GCM. */
  readonly dekCifrada: string;
}

/** As duas cópias cifradas da DEK (envelope encryption). */
export interface ChavesCofre {
  readonly senha: EnvelopeChave;
  readonly recuperacao: EnvelopeChave;
}

export interface ConfiguracaoCofre {
  /** Minutos de inatividade até o bloqueio automático (RF-005). */
  readonly bloqueioAutomaticoMinutos: number;
}

/**
 * Metadados do cofre: a única parte não cifrada do armazenamento.
 * Não contém nada sobre os dados financeiros do usuário.
 */
export interface MetadadosCofre {
  readonly versao: 1;
  readonly criadoEm: string;
  readonly chaves: ChavesCofre;
  readonly configuracao: ConfiguracaoCofre;
}

declare const marcaChaveDeDados: unique symbol;

/**
 * A DEK em memória. É opaca para a aplicação: só a infraestrutura sabe usá-la.
 * Nunca é extraível nem persistida (RNF-004).
 */
export interface ChaveDeDados {
  readonly [marcaChaveDeDados]: true;
}

export interface CriptografiaCofre {
  /** Gera a DEK e a protege com a senha e com a chave de recuperação. */
  criarChaves(
    senha: string,
    chaveRecuperacao: Uint8Array,
  ): Promise<{
    chaves: ChavesCofre;
    dek: ChaveDeDados;
  }>;
  /** Devolve a DEK, ou `null` se a senha estiver errada. */
  abrirComSenha(chaves: ChavesCofre, senha: string): Promise<ChaveDeDados | null>;
  /** Devolve a DEK, ou `null` se a chave de recuperação estiver errada. */
  abrirComChaveRecuperacao(
    chaves: ChavesCofre,
    chaveRecuperacao: Uint8Array,
  ): Promise<ChaveDeDados | null>;
  /** Recifra a DEK com a nova senha. `null` se a senha atual estiver errada. */
  trocarSenha(
    chaves: ChavesCofre,
    senhaAtual: string,
    novaSenha: string,
  ): Promise<ChavesCofre | null>;
  /** Usa a chave de recuperação para definir nova senha. `null` se a chave estiver errada. */
  redefinirSenhaComRecuperacao(
    chaves: ChavesCofre,
    chaveRecuperacao: Uint8Array,
    novaSenha: string,
  ): Promise<{ chaves: ChavesCofre; dek: ChaveDeDados } | null>;
  /** Substitui a chave de recuperação. `null` se a senha estiver errada. */
  trocarChaveRecuperacao(
    chaves: ChavesCofre,
    senha: string,
    novaChaveRecuperacao: Uint8Array,
  ): Promise<ChavesCofre | null>;
  /** Bytes aleatórios criptograficamente seguros. */
  bytesAleatorios(quantidade: number): Uint8Array<ArrayBuffer>;
}

export interface RepositorioCofre {
  ler(): Promise<MetadadosCofre | null>;
  salvar(metadados: MetadadosCofre): Promise<void>;
  /** Apaga definitivamente todos os dados do app neste navegador (RF-006). */
  apagarTudo(): Promise<void>;
}

export const CRIPTOGRAFIA_COFRE = new InjectionToken<CriptografiaCofre>('CRIPTOGRAFIA_COFRE');
export const REPOSITORIO_COFRE = new InjectionToken<RepositorioCofre>('REPOSITORIO_COFRE');
