/** Data e hora de um instante ISO, ex.: "09/11/2026, 14:32". */
export function formatarDataHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

/** Só a hora de um instante ISO, ex.: "14:32". */
export function formatarHora(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
