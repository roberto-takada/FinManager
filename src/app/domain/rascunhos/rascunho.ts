/**
 * Rascunhos de formulários (RN-002, RF-070, RF-071, ENGENHARIA_DE_SOFTWARE §5.2).
 *
 * Guardam o que o usuário digitou e ainda não salvou. Ficam cifrados como qualquer outro
 * dado (RN-001) e expiram em 7 dias, para não acumular trabalho esquecido.
 */
export const DIAS_VALIDADE_RASCUNHO = 7;
const MS_POR_DIA = 86_400_000;

export interface Rascunho {
  /** Identifica o formulário, ex.: "transacao:nova" ou "conta:editar:<id>". */
  readonly id: string;
  /** Nome do formulário para o usuário, ex.: "Nova transação". */
  readonly titulo: string;
  /** Endereço do formulário no app, para reabri-lo ao restaurar. */
  readonly url: string;
  /** Valores dos campos, como o formulário os entrega. */
  readonly valores: Readonly<Record<string, unknown>>;
  readonly atualizadoEm: string;
}

export function rascunhoExpirou(rascunho: Rascunho, agora: Date): boolean {
  return Date.parse(rascunho.atualizadoEm) + DIAS_VALIDADE_RASCUNHO * MS_POR_DIA <= agora.getTime();
}

/** Remove os rascunhos com mais de 7 dias (roda a cada desbloqueio, como o expurgo da lixeira). */
export function expurgarRascunhos(rascunhos: readonly Rascunho[], agora: Date): Rascunho[] {
  return rascunhos.filter((r) => !rascunhoExpirou(r, agora));
}

/** Insere ou substitui o rascunho do mesmo formulário. */
export function guardarRascunho(rascunhos: readonly Rascunho[], novo: Rascunho): Rascunho[] {
  return [...rascunhos.filter((r) => r.id !== novo.id), novo];
}

/** Só aceita endereços internos do app (nunca um endereço absoluto ou de outro site). */
export function urlInterna(url: string): boolean {
  return url.startsWith('/') && !url.startsWith('//') && !url.includes('\\');
}
