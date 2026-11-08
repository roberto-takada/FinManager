/**
 * Atraso progressivo após senhas erradas no desbloqueio (RNF-006).
 *
 * É uma proteção de interface: a defesa real contra força bruta é o custo do Argon2id
 * (RNF-003), já que quem copia os dados do navegador pode testar senhas fora do app.
 */

export const FALHAS_SEM_ATRASO = 2;
export const ATRASO_MAXIMO_MS = 60_000;

/** Tempo de espera após `falhas` tentativas erradas consecutivas. */
export function atrasoAposFalhas(falhas: number): number {
  if (falhas <= FALHAS_SEM_ATRASO) return 0;
  return Math.min(1000 * 2 ** (falhas - FALHAS_SEM_ATRASO), ATRASO_MAXIMO_MS);
}
