import { umaTransacao } from '../../../testing/fabricas';
import { criarEvento, diasAteExclusaoDefinitiva, expurgar, expurgarEventos } from './historico';

const agora = new Date('2026-11-08T12:00:00.000Z');
const diasAtras = (dias: number) => new Date(agora.getTime() - dias * 86_400_000).toISOString();

describe('histórico e lixeira (RN-004, RF-078)', () => {
  it('evento expira 180 dias depois de ocorrer', () => {
    const evento = criarEvento(
      { acao: 'exclusao', entidade: 'transacao', entidadeId: 't', resumo: 'x', estadoAnterior: {} },
      agora,
      'ev-1',
    );
    expect(evento.expiraEm).toBe('2027-05-07T12:00:00.000Z');
    expect(evento.loteId).toBeNull();
  });

  it('conta os dias restantes até a exclusão definitiva', () => {
    expect(diasAteExclusaoDefinitiva(agora.toISOString(), agora)).toBe(180);
    expect(diasAteExclusaoDefinitiva(diasAtras(179.5), agora)).toBe(1);
    expect(diasAteExclusaoDefinitiva(diasAtras(200), agora)).toBe(0);
  });

  it('expurga itens com 180 dias ou mais na lixeira e mantém os ativos', () => {
    const itens = [
      umaTransacao({ id: 'ativo' }),
      umaTransacao({ id: '179', excluidoEm: diasAtras(179) }),
      umaTransacao({ id: '180', excluidoEm: diasAtras(180) }),
      umaTransacao({ id: '400', excluidoEm: diasAtras(400) }),
    ];
    expect(expurgar(itens, agora).map((t) => t.id)).toEqual(['ativo', '179']);
  });

  it('expurga eventos vencidos', () => {
    const antigo = criarEvento(
      { acao: 'edicao', entidade: 'conta', entidadeId: 'c', resumo: '', estadoAnterior: null },
      new Date(diasAtras(181)),
      'antigo',
    );
    const recente = criarEvento(
      { acao: 'edicao', entidade: 'conta', entidadeId: 'c', resumo: '', estadoAnterior: null },
      new Date(diasAtras(10)),
      'recente',
    );
    expect(expurgarEventos([antigo, recente], agora).map((e) => e.id)).toEqual(['recente']);
  });
});
