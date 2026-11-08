import {
  type Cofrinho,
  CORES_COFRINHO,
  type CorCofrinho,
  ICONES_COFRINHO,
  type IconeCofrinho,
  planejamento,
  progresso,
} from '../../domain/cofrinhos/cofrinho';
import { type DataISO, formatarData } from '../../domain/shared/data';
import { formatarDinheiro } from '../../domain/shared/dinheiro';

/** RF-032: "R$ 600,00 de R$ 6.000,00 (10%) · faltam R$ 5.400,00". */
export function textoProgresso(cofrinho: Cofrinho): string {
  const p = progresso(cofrinho);
  const base = `${formatarDinheiro(p.saldo)} de ${formatarDinheiro(cofrinho.meta)} (${p.percentual}%)`;
  return p.metaAtingida
    ? `${base} · meta atingida`
    : `${base} · faltam ${formatarDinheiro(p.restante)}`;
}

/** RF-033: quanto guardar por mês, ou a situação do prazo. */
export function textoPlanejamento(cofrinho: Cofrinho, hoje: DataISO): string {
  const p = planejamento(cofrinho, hoje);
  switch (p.situacao) {
    case 'meta-atingida':
      return 'Meta atingida!';
    case 'sem-prazo':
      return 'Sem prazo definido.';
    case 'prazo-vencido':
      return `O prazo (${formatarData(cofrinho.prazo!)}) já passou; faltam ${formatarDinheiro(p.restante)}.`;
    case 'no-prazo':
      return `Guarde ${formatarDinheiro(p.porMes)} por mês, durante ${p.meses} ${p.meses === 1 ? 'mês' : 'meses'}, para atingir a meta até ${formatarData(cofrinho.prazo!)}.`;
  }
}

/** Cor da barra de progresso conforme a cor do cofrinho (paleta de séries da marca). */
export function classeProgresso(cofrinho: Pick<Cofrinho, 'cor'>): string {
  switch (cofrinho.cor) {
    case 'verde':
      return 'progresso-aqua';
    case 'rosa':
    case 'laranja':
      return 'progresso-rosa';
    case 'cinza':
      return 'progresso-cinza';
    default:
      return '';
  }
}

export const LISTA_ICONES = (Object.keys(ICONES_COFRINHO) as IconeCofrinho[]).map((valor) => ({
  valor,
  rotulo: `${ICONES_COFRINHO[valor].simbolo} ${ICONES_COFRINHO[valor].rotulo}`,
}));

export const LISTA_CORES = (Object.keys(CORES_COFRINHO) as CorCofrinho[]).map((valor) => ({
  valor,
  rotulo: CORES_COFRINHO[valor],
}));
