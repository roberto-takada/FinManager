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

  it('cobre cerca de 6 meses até hoje, sem lançamentos futuros', () => {
    const datas = dados.transacoes.map((t) => t.data).sort();
    expect(datas[0]! >= '2026-05-08').toBe(true);
    expect(datas[0]! <= '2026-05-15').toBe(true);
    expect(datas.at(-1)! <= '2026-11-08').toBe(true);
    expect(dados.transacoes.length).toBeGreaterThan(100);
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
});
