import { formatarData } from '../shared/data';
import { type Dinheiro, paraTextoEditavel } from '../shared/dinheiro';
import { intervaloPorExtenso } from './periodo';
import { type Relatorio, SITUACOES_COFRINHO } from './relatorio';

/**
 * Relatório em CSV (RF-053), no formato que planilhas em português abrem direto:
 * separador ";", vírgula decimal, UTF-8 com BOM e quebras de linha CRLF.
 */

type Celula = string | number | Dinheiro | null;

/**
 * Texto que começa com = + − @ (ou tab/CR) vira fórmula na planilha: prefixamos com
 * apóstrofo para que nomes digitados pelo usuário nunca sejam executados (injeção de CSV).
 */
function texto(valor: string): string {
  const seguro = /^[=+\-@\t\r]/.test(valor) ? `'${valor}` : valor;
  return /[;"\r\n]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro;
}

function celula(valor: Celula): string {
  if (valor === null) return '';
  if (typeof valor === 'number') return valor.toLocaleString('pt-BR', { useGrouping: false });
  if (typeof valor === 'object') return paraTextoEditavel(valor);
  return texto(valor);
}

const linha = (...celulas: Celula[]) => celulas.map(celula).join(';');

export function relatorioParaCsv(r: Relatorio): string {
  const moeda = r.totais.receitas.moeda;
  const linhas = [
    linha('Relatório', r.periodo.nome),
    linha('Período', intervaloPorExtenso(r.periodo.de, r.ate)),
    linha('Comparado com', r.anterior.nome),
    linha('Moeda', moeda),
    '',
    linha('Resumo', 'Período', 'Período anterior', 'Variação (%)'),
    linha('Receitas', r.totais.receitas, r.totaisAnteriores.receitas, r.variacoes.receitas),
    linha('Despesas', r.totais.despesas, r.totaisAnteriores.despesas, r.variacoes.despesas),
    linha('Saldo', r.totais.saldo, r.totaisAnteriores.saldo, r.variacoes.saldo),
    '',
    linha(
      'Despesas por categoria',
      'Valor',
      'Parte das despesas (%)',
      'Período anterior',
      'Variação (%)',
    ),
    ...r.categorias.map((c) => linha(c.nome, c.valor, c.percentual, c.valorAnterior, c.variacao)),
    '',
    linha('Evolução patrimonial', 'Patrimônio'),
    ...r.patrimonio.pontos.map((p) => linha(formatarData(p.data), p.valor)),
    linha('Variação no período', r.patrimonio.variacao),
    '',
    linha(
      'Cofrinho',
      'Depósitos',
      'Retiradas',
      'Saldo no fim',
      'Meta',
      'Progresso (%)',
      'Situação',
    ),
    ...r.cofrinhos.map((c) =>
      linha(
        c.nome,
        c.depositos,
        c.retiradas,
        c.saldoFinal,
        c.meta,
        c.percentual,
        SITUACOES_COFRINHO[c.situacao],
      ),
    ),
  ];
  return '\uFEFF' + linhas.join('\r\n') + '\r\n';
}

/** Nome sugerido para o arquivo: "finmanager-relatorio-2026-T3.csv". */
export const nomeArquivoCsv = (r: Relatorio) => `finmanager-relatorio-${r.periodo.id}.csv`;
