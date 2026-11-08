/** Variação formatada com sinal em texto (RNF-024): "+7,0%" / "−6,1%". */
export function percentual(valor: number): string {
  const texto = Math.abs(valor).toLocaleString('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  return `${valor >= 0 ? '+' : '−'}${texto}%`;
}
