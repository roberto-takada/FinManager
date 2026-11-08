import {
  type ContaAgendada,
  type DadosContaAgendada,
  vencimentosNoPeriodo,
} from '../agenda/conta-agendada';
import { type Categoria, montarCategoriasPadrao } from '../categorias/categoria';
import type {
  Cofrinho,
  CorCofrinho,
  IconeCofrinho,
  MovimentacaoCofrinho,
} from '../cofrinhos/cofrinho';
import type { ContaFinanceira, TipoConta } from '../contas/conta';
import type { Perfil } from '../perfil/perfil';
import type { Recorrencia } from '../recorrencias/recorrencia';
import { type DataISO, somarDias, somarMeses } from '../shared/data';
import { dinheiro } from '../shared/dinheiro';
import type { DadosTransacao, Transacao } from '../transacoes/transacao';

/**
 * Dados de demonstração (RNF-061): um usuário **fictício** com cerca de 12 meses de uso,
 * para que os relatórios trimestral, semestral e anual tenham com o que comparar.
 * Determinístico para uma mesma semente e data, o que permite testá-lo.
 * Nenhum nome de banco, loja ou pessoa real é usado.
 */
export interface DadosDemonstracao {
  readonly contas: ContaFinanceira[];
  readonly categorias: Categoria[];
  readonly transacoes: Transacao[];
  readonly recorrencias: Recorrencia[];
  readonly contasAgendadas: ContaAgendada[];
  readonly cofrinhos: Cofrinho[];
  readonly perfil: Perfil[];
}

export const MESES_DEMONSTRACAO = 12;

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

  // ---- Contas a pagar e a receber (RF-020 a RF-023) ------------------------
  // Mensais: as ocorrências passadas foram pagas, exceto a mais recente da conta de luz,
  // que fica vencida. Únicas: uma vence amanhã e outras nas próximas semanas, para que o
  // calendário e os alertas (RF-024) tenham o que mostrar.
  const primeiroVencimento = (dia: number) => {
    const data = `${inicio.slice(0, 8)}${String(dia).padStart(2, '0')}`;
    return data < inicio ? somarMeses(data, 1) : data;
  };
  const agendada = (
    dados: Omit<DadosContaAgendada, 'categoriaId'> & { categoria: string },
  ): ContaAgendada => {
    const { categoria, ...resto } = dados;
    return { ...base(), ...resto, categoriaId: cat(categoria), pagamentos: [] };
  };
  const mensal = { frequencia: 'mensal' as const, fim: null };
  const contasAgendadas: ContaAgendada[] = [
    agendada({
      tipo: 'pagar',
      descricao: 'Conta de luz',
      valor: dinheiro(180_00),
      vencimento: primeiroVencimento(12),
      categoria: 'Contas da casa',
      contaId: corrente.id,
      recorrencia: mensal,
    }),
    agendada({
      tipo: 'pagar',
      descricao: 'Condomínio',
      valor: dinheiro(550_00),
      vencimento: primeiroVencimento(8),
      categoria: 'Moradia',
      contaId: corrente.id,
      recorrencia: mensal,
    }),
    agendada({
      tipo: 'pagar',
      descricao: 'Plano de saúde',
      valor: dinheiro(320_00),
      vencimento: primeiroVencimento(25),
      categoria: 'Saúde',
      contaId: corrente.id,
      recorrencia: mensal,
    }),
    agendada({
      tipo: 'receber',
      descricao: 'Aluguel da vaga de garagem',
      valor: dinheiro(150_00),
      vencimento: primeiroVencimento(15),
      categoria: 'Outras receitas',
      contaId: corrente.id,
      recorrencia: mensal,
    }),
    agendada({
      tipo: 'pagar',
      descricao: 'Seguro do celular',
      valor: dinheiro(89_90),
      vencimento: somarDias(hoje, 1),
      categoria: 'Outras despesas',
      contaId: null,
      recorrencia: null,
    }),
    agendada({
      tipo: 'receber',
      descricao: 'Reembolso de viagem',
      valor: dinheiro(420_00),
      vencimento: somarDias(hoje, 5),
      categoria: 'Outras receitas',
      contaId: corrente.id,
      recorrencia: null,
    }),
    agendada({
      tipo: 'pagar',
      descricao: 'IPVA',
      valor: dinheiro(1_250_00),
      vencimento: somarDias(hoje, 20),
      categoria: 'Transporte',
      contaId: corrente.id,
      recorrencia: null,
    }),
  ];

  const pagas = contasAgendadas.map((conta) => {
    const passadas = vencimentosNoPeriodo(conta, conta.vencimento, somarDias(hoje, -1));
    const aPagar = conta.descricao === 'Conta de luz' ? passadas.slice(0, -1) : passadas;
    const pagamentos = aPagar.map((vencimento) => {
      const valor =
        conta.descricao === 'Conta de luz' ? dinheiro(sorte.entre(150_00, 230_00)) : conta.valor;
      const transacao: Transacao = {
        ...base(),
        tipo: conta.tipo === 'pagar' ? 'despesa' : 'receita',
        valor,
        data: vencimento,
        descricao: conta.descricao,
        categoriaId: conta.categoriaId,
        contaId: conta.contaId ?? corrente.id,
        contaDestinoId: null,
        recorrenciaId: null,
        parcela: null,
      };
      transacoes.push(transacao);
      return { vencimento, transacaoId: transacao.id };
    });
    return { ...conta, pagamentos };
  });

  // ---- Cofrinhos (RF-030 a RF-034) ----------------------------------------
  // Um de cada situação: em andamento com depósitos mensais, com retirada, meta atingida,
  // sem prazo e encerrado. Os depósitos saem da conta corrente.
  const mov = (
    tipo: MovimentacaoCofrinho['tipo'],
    valor: number,
    data: DataISO,
    origem: MovimentacaoCofrinho['origem'] = 'manual',
  ): MovimentacaoCofrinho => ({
    id: gerarId(),
    tipo,
    valor: dinheiro(valor),
    data,
    contaId: corrente.id,
    origem,
    registradoEm: instante,
  });
  const cofrinho = (
    nome: string,
    meta: number,
    prazo: DataISO | null,
    icone: IconeCofrinho,
    cor: CorCofrinho,
    movimentacoes: MovimentacaoCofrinho[],
    encerradoEm: string | null = null,
  ): Cofrinho => ({
    ...base(),
    nome,
    meta: dinheiro(meta),
    prazo,
    icone,
    cor,
    movimentacoes,
    encerradoEm,
  });
  const diaDoMes = (mesesAtras: number, dia: number) => {
    const data = `${somarMeses(hoje, -mesesAtras).slice(0, 8)}${String(dia).padStart(2, '0')}`;
    return data > hoje ? somarDias(hoje, -1) : data;
  };

  const encerramento = diaDoMes(2, 10);
  const cofrinhos: Cofrinho[] = [
    cofrinho(
      'Viagem de férias',
      6_000_00,
      somarMeses(hoje, 8),
      'viagem',
      'azul',
      [5, 4, 3, 2, 1, 0].map((m) => mov('deposito', 400_00, diaDoMes(m, 7))),
    ),
    cofrinho('Troca de celular', 3_500_00, somarMeses(hoje, 4), 'tecnologia', 'roxo', [
      mov('deposito', 500_00, diaDoMes(3, 20)),
      mov('deposito', 500_00, diaDoMes(2, 20)),
      mov('deposito', 500_00, diaDoMes(1, 20)),
      mov('retirada', 200_00, diaDoMes(1, 25)),
    ]),
    cofrinho('Curso de inglês', 1_200_00, somarMeses(hoje, 2), 'estudos', 'verde', [
      mov('deposito', 600_00, diaDoMes(4, 5)),
      mov('deposito', 600_00, diaDoMes(2, 5)),
    ]),
    cofrinho('Fundo para o carro', 20_000_00, null, 'carro', 'laranja', [
      mov('deposito', 1_000_00, diaDoMes(1, 15)),
    ]),
    cofrinho(
      'Presente de aniversário',
      300_00,
      null,
      'presente',
      'rosa',
      [
        mov('deposito', 300_00, diaDoMes(3, 1)),
        mov('retirada', 300_00, encerramento, 'encerramento'),
      ],
      `${encerramento}T12:00:00.000Z`,
    ),
  ];

  // ---- Perfil (RF-080): pessoa inventada; e-mail no domínio reservado example.com.
  const perfil: Perfil[] = [
    {
      nome: 'Ana Exemplo',
      email: 'ana@example.com',
      avatar: { tipo: 'iniciais', cor: 'roxo' },
      atualizadoEm: instante,
    },
  ];

  return {
    contas,
    categorias,
    transacoes,
    recorrencias,
    contasAgendadas: pagas,
    cofrinhos,
    perfil,
  };
}
