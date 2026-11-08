import { calcularAlertas } from '../agenda/alertas';
import { planejamento, progresso, saldoCofrinho } from '../cofrinhos/cofrinho';
import { validarPerfil } from '../perfil/perfil';
import { lerPeriodo } from '../relatorios/periodo';
import { gerarRelatorio } from '../relatorios/relatorio';
import { ativos } from '../shared/entidade';
import { totalizar } from '../transacoes/transacao';
import { gerarDadosDemonstracao } from './dados-demonstracao';

const gerar = (semente = 2026) => {
  let n = 0;
  return gerarDadosDemonstracao({
    hoje: '2026-11-08',
    agora: new Date('2026-11-08T12:00:00.000Z'),
    gerarId: () => `id-${++n}`,
    semente,
  });
};

describe('dados de demonstração (RNF-061)', () => {
  const dados = gerar();

  it('é determinístico para a mesma semente', () => {
    expect(gerar()).toEqual(dados);
    expect(gerar(7).transacoes).not.toEqual(dados.transacoes);
  });

  it('cobre cerca de 12 meses até hoje, sem lançamentos futuros', () => {
    const datas = dados.transacoes.map((t) => t.data).sort();
    expect(datas[0]! >= '2025-11-08').toBe(true);
    expect(datas[0]! <= '2025-11-15').toBe(true);
    expect(datas.at(-1)! <= '2026-11-08').toBe(true);
    expect(dados.transacoes.length).toBeGreaterThan(200);
  });

  it('tem os quatro tipos de conta e as categorias padrão', () => {
    expect(new Set(dados.contas.map((c) => c.tipo))).toEqual(
      new Set(['corrente', 'carteira', 'cartao', 'investimento']),
    );
    expect(dados.categorias.some((c) => c.nome === 'Mercado' && c.paiId !== null)).toBe(true);
  });

  it('referencia só contas e categorias existentes', () => {
    const contas = new Set(dados.contas.map((c) => c.id));
    const categorias = new Set(dados.categorias.map((c) => c.id));
    for (const t of dados.transacoes) {
      expect(contas.has(t.contaId)).toBe(true);
      if (t.categoriaId) expect(categorias.has(t.categoriaId)).toBe(true);
    }
  });

  it('inclui recorrências mensais e nenhuma compra parcelada (RF-013 suspenso)', () => {
    expect(dados.recorrencias.map((r) => r.modelo.descricao)).toContain('Salário');
    expect(dados.recorrencias.every((r) => r.frequencia === 'mensal' && r.geradaAte === null)).toBe(
      true,
    );
    expect(dados.transacoes.filter((t) => t.parcela)).toEqual([]);
  });

  it('valores sempre em centavos inteiros e positivos', () => {
    for (const t of ativos(dados.transacoes)) {
      expect(Number.isInteger(t.valor.unidades)).toBe(true);
      expect(t.valor.unidades).toBeGreaterThan(0);
    }
    expect(totalizar(dados.transacoes).despesas.unidades).toBeGreaterThan(0);
  });

  describe('contas a pagar e a receber (RF-020 a RF-024)', () => {
    const ativasIds = new Set(dados.transacoes.map((t) => t.id));

    it('inclui contas mensais e únicas, a pagar e a receber', () => {
      const tipos = new Set(dados.contasAgendadas.map((c) => c.tipo));
      expect(tipos).toEqual(new Set(['pagar', 'receber']));
      expect(dados.contasAgendadas.some((c) => c.recorrencia === null)).toBe(true);
      expect(dados.contasAgendadas.some((c) => c.recorrencia?.frequencia === 'mensal')).toBe(true);
    });

    it('cada pagamento aponta para uma transação existente, do tipo certo', () => {
      for (const conta of dados.contasAgendadas) {
        for (const p of conta.pagamentos) {
          const t = dados.transacoes.find((x) => x.id === p.transacaoId)!;
          expect(t.tipo).toBe(conta.tipo === 'pagar' ? 'despesa' : 'receita');
          expect(t.categoriaId).toBe(conta.categoriaId);
        }
      }
    });

    it('tem uma conta vencida e uma que vence amanhã, para os alertas', () => {
      const alertas = calcularAlertas(dados.contasAgendadas, ativasIds, '2026-11-08', 3);
      expect(
        alertas.some(
          (a) => a.proximidade === 'vencida' && a.ocorrencia.conta.descricao === 'Conta de luz',
        ),
      ).toBe(true);
      expect(alertas.some((a) => a.proximidade === 'amanha')).toBe(true);
    });
  });

  describe('cofrinhos (RF-030 a RF-034)', () => {
    it('um cofrinho de cada situação, com movimentações só até hoje', () => {
      const porNome = new Map(dados.cofrinhos.map((c) => [c.nome, c]));
      expect(progresso(porNome.get('Curso de inglês')!).metaAtingida).toBe(true);
      expect(porNome.get('Fundo para o carro')!.prazo).toBeNull();
      expect(
        porNome.get('Troca de celular')!.movimentacoes.some((m) => m.tipo === 'retirada'),
      ).toBe(true);
      expect(porNome.get('Presente de aniversário')!.encerradoEm).not.toBeNull();
      expect(saldoCofrinho(porNome.get('Presente de aniversário')!).unidades).toBe(0);
      expect(planejamento(porNome.get('Viagem de férias')!, '2026-11-08')).toMatchObject({
        situacao: 'no-prazo',
      });
      for (const c of dados.cofrinhos) {
        expect(c.movimentacoes.every((m) => m.data <= '2026-11-08')).toBe(true);
        expect(saldoCofrinho(c).unidades).toBeGreaterThanOrEqual(0);
      }
    });

    it('as movimentações saem de uma conta que existe', () => {
      const contas = new Set(dados.contas.map((c) => c.id));
      for (const m of dados.cofrinhos.flatMap((c) => c.movimentacoes))
        expect(contas.has(m.contaId)).toBe(true);
    });
  });

  it('tem um perfil fictício (RF-080), com e-mail em domínio reservado', () => {
    expect(dados.perfil).toEqual([
      expect.objectContaining({ nome: 'Ana Exemplo', email: 'ana@example.com' }),
    ]);
    expect(() => validarPerfil(dados.perfil[0]!)).not.toThrow();
  });

  it('cobre os quatro últimos trimestres, para os relatórios terem comparação (RF-052)', () => {
    for (const trimestre of ['2025-T4', '2026-T1', '2026-T2', '2026-T3']) {
      const periodo = lerPeriodo('trimestral', trimestre)!;
      const r = gerarRelatorio(dados, periodo, '2026-11-08');
      expect(r.totais.receitas.unidades, trimestre).toBeGreaterThan(0);
      expect(r.totais.despesas.unidades, trimestre).toBeGreaterThan(0);
    }
    const t3 = gerarRelatorio(dados, lerPeriodo('trimestral', '2026-T3')!, '2026-11-08');
    expect(t3.cofrinhos.length).toBeGreaterThan(0);
  });
});
