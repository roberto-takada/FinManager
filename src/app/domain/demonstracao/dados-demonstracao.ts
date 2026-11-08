import { type Categoria, montarCategoriasPadrao } from '../categorias/categoria';
import type { ContaFinanceira, TipoConta } from '../contas/conta';
import type { Recorrencia } from '../recorrencias/recorrencia';
import { type DataISO, somarDias, somarMeses } from '../shared/data';
import { dinheiro } from '../shared/dinheiro';
import type { DadosTransacao, Transacao } from '../transacoes/transacao';

/**
 * Dados de demonstração (RNF-061): um usuário **fictício** com cerca de 6 meses de uso.
 * Determinístico para uma mesma semente e data, o que permite testá-lo.
 * Nenhum nome de banco, loja ou pessoa real é usado.
 */
export interface DadosDemonstracao {
  readonly contas: ContaFinanceira[];
  readonly categorias: Categoria[];
  readonly transacoes: Transacao[];
  readonly recorrencias: Recorrencia[];
}

export const MESES_DEMONSTRACAO = 6;

/** Gerador pseudoaleatório pequeno e determinístico (mulberry32). Não é para segredos. */
function sorteador(semente: number) {
  let estado = semente >>> 0;
  const proximo = () => {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let t = estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
  return {
    entre: (min: number, max: number) => min + Math.floor(proximo() * (max - min + 1)),
    chance: (probabilidade: number) => proximo() < probabilidade,
  };
}

export function gerarDadosDemonstracao(opcoes: {
  hoje: DataISO;
  agora: Date;
  gerarId: () => string;
  semente?: number;
}): DadosDemonstracao {
  const { hoje, gerarId } = opcoes;
  const instante = opcoes.agora.toISOString();
  const sorte = sorteador(opcoes.semente ?? 2026);
  const base = () => ({
    id: gerarId(),
    criadoEm: instante,
    atualizadoEm: instante,
    excluidoEm: null,
  });
  const inicio = somarMeses(hoje, -MESES_DEMONSTRACAO);

  // ---- Contas -------------------------------------------------------------
  const conta = (nome: string, tipo: TipoConta, saldo: number): ContaFinanceira => ({
    ...base(),
    nome,
    tipo,
    saldoInicial: dinheiro(saldo),
  });
  const corrente = conta('Banco Fictício', 'corrente', 2_500_00);
  const carteira = conta('Carteira', 'carteira', 150_00);
  const cartao = conta('Cartão Fictício', 'cartao', 0);
  const reserva = conta('Reserva de emergência', 'investimento', 5_000_00);
  const contas = [corrente, carteira, cartao, reserva];

  // ---- Categorias ---------------------------------------------------------
  const categorias = montarCategoriasPadrao(gerarId, instante);
  const cat = (nome: string) => {
    const encontrada = categorias.find((c) => c.nome === nome);
    if (!encontrada) throw new Error(`Categoria padrão ausente: ${nome}`);
    return encontrada.id;
  };

  // ---- Recorrências (geradas pelo próprio app ao carregar) -----------------
  const recorrencia = (
    descricao: string,
    dados: Omit<DadosTransacao, 'data' | 'descricao'>,
    diaDoMes: number,
  ): Recorrencia => {
    const primeiroDia = `${inicio.slice(0, 8)}${String(diaDoMes).padStart(2, '0')}`;
    return {
      ...base(),
      modelo: { ...dados, descricao },
      frequencia: 'mensal',
      inicio: primeiroDia < inicio ? somarMeses(primeiroDia, 1) : primeiroDia,
      fim: null,
      geradaAte: null,
    };
  };
  const despesaFixa = (valor: number, categoria: string, contaId = corrente.id) => ({
    tipo: 'despesa' as const,
    valor: dinheiro(valor),
    categoriaId: cat(categoria),
    contaId,
    contaDestinoId: null,
  });
  const recorrencias = [
    recorrencia(
      'Salário',
      {
        tipo: 'receita',
        valor: dinheiro(5_200_00),
        categoriaId: cat('Salário'),
        contaId: corrente.id,
        contaDestinoId: null,
      },
      5,
    ),
    recorrencia('Aluguel', despesaFixa(1_400_00, 'Aluguel'), 10),
    recorrencia('Internet e energia', despesaFixa(230_00, 'Contas da casa'), 20),
    recorrencia('Serviço de streaming', despesaFixa(39_90, 'Assinaturas', cartao.id), 15),
    recorrencia(
      'Aplicação na reserva',
      {
        tipo: 'transferencia',
        valor: dinheiro(500_00),
        categoriaId: null,
        contaId: corrente.id,
        contaDestinoId: reserva.id,
      },
      6,
    ),
    recorrencia(
      'Saque para a carteira',
      {
        tipo: 'transferencia',
        valor: dinheiro(200_00),
        categoriaId: null,
        contaId: corrente.id,
        contaDestinoId: carteira.id,
      },
      2,
    ),
  ];

  // ---- Transações variáveis ----------------------------------------------
  const transacoes: Transacao[] = [];
  const lancar = (dados: DadosTransacao) => {
    if (dados.data > hoje) return;
    transacoes.push({ ...base(), ...dados, recorrenciaId: null, parcela: null });
  };
  const despesa = (
    data: DataISO,
    descricao: string,
    valor: number,
    categoria: string,
    contaId: string,
  ) =>
    lancar({
      tipo: 'despesa',
      valor: dinheiro(valor),
      data,
      descricao,
      categoriaId: cat(categoria),
      contaId,
      contaDestinoId: null,
    });

  for (let dia = inicio; dia <= hoje; dia = somarDias(dia, 7)) {
    despesa(
      somarDias(dia, sorte.entre(0, 2)),
      'Supermercado',
      sorte.entre(150_00, 380_00),
      'Mercado',
      sorte.chance(0.6) ? cartao.id : corrente.id,
    );
    despesa(
      somarDias(dia, sorte.entre(0, 6)),
      'Padaria',
      sorte.entre(15_00, 45_00),
      'Alimentação',
      carteira.id,
    );
    for (let i = sorte.entre(1, 2); i > 0; i--) {
      despesa(
        somarDias(dia, sorte.entre(3, 6)),
        'Restaurante',
        sorte.entre(35_00, 140_00),
        'Restaurantes',
        cartao.id,
      );
    }
    for (let i = sorte.entre(1, 3); i > 0; i--) {
      despesa(
        somarDias(dia, sorte.entre(0, 6)),
        'Corrida por aplicativo',
        sorte.entre(12_00, 48_00),
        'Aplicativos',
        cartao.id,
      );
    }
    if (sorte.chance(0.5)) {
      despesa(
        somarDias(dia, sorte.entre(0, 6)),
        'Posto de combustível',
        sorte.entre(150_00, 260_00),
        'Combustível',
        corrente.id,
      );
    }
    if (sorte.chance(0.25)) {
      despesa(
        somarDias(dia, sorte.entre(0, 6)),
        'Farmácia',
        sorte.entre(25_00, 130_00),
        'Saúde',
        corrente.id,
      );
    }
    if (sorte.chance(0.2)) {
      despesa(
        somarDias(dia, sorte.entre(0, 6)),
        'Cinema',
        sorte.entre(40_00, 90_00),
        'Lazer',
        cartao.id,
      );
    }
  }

  for (let mes = 1; mes <= MESES_DEMONSTRACAO; mes++) {
    const fimDoMes = somarDias(somarMeses(`${inicio.slice(0, 8)}01`, mes), -1);
    lancar({
      tipo: 'receita',
      valor: dinheiro(sorte.entre(35_00, 70_00)),
      data: fimDoMes,
      descricao: 'Rendimento da reserva',
      categoriaId: cat('Rendimentos'),
      contaId: reserva.id,
      contaDestinoId: null,
    });
    if (mes % 2 === 0) {
      lancar({
        tipo: 'receita',
        valor: dinheiro(sorte.entre(600_00, 1_500_00)),
        data: somarDias(fimDoMes, -10),
        descricao: 'Projeto freelance',
        categoriaId: cat('Freelance'),
        contaId: corrente.id,
        contaDestinoId: null,
      });
    }
  }

  // Sem compras parceladas: RF-013 está suspenso até as faturas do cartão (RF-100).

  return { contas, categorias, transacoes, recorrencias };
}
