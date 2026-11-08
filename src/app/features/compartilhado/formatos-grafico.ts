import { nomeDoMes } from '../../domain/shared/data';
import {
  type Dinheiro,
  dinheiro,
  formatarDinheiro,
  formatarDinheiroCompacto,
} from '../../domain/shared/dinheiro';

/** "2026-11" → "nov/26" (eixo dos gráficos). */
export function mesCurto(mes: string): string {
  const nome = new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)) - 1, 1)
    .toLocaleDateString('pt-BR', { month: 'short' })
    .replace('.', '');
  return `${nome}/${mes.slice(2, 4)}`;
}

/** "2026-11" → "novembro de 2026" (tabelas e textos). */
export const mesLongo = (mes: string) => nomeDoMes(`${mes}-01`);

/**
 * Formatadores para os gráficos: o Chart.js recebe unidades mínimas inteiras (RN-006) e o
 * texto é sempre gerado pelo `Dinheiro` da moeda do app.
 */
export function formatadores(moeda: string) {
  return {
    formatar: (unidades: number) => formatarDinheiro(dinheiro(unidades, moeda)),
    formatarEixo: (unidades: number) => formatarDinheiroCompacto(dinheiro(unidades, moeda)),
  };
}

/** Sinal em texto, não só cor (RNF-024): "+ R$ 10,00" / "− R$ 10,00". */
export function comSinal(valor: Dinheiro): string {
  const sinal = valor.unidades > 0 ? '+ ' : valor.unidades < 0 ? '− ' : '';
  return sinal + formatarDinheiro(dinheiro(Math.abs(valor.unidades), valor.moeda));
}
