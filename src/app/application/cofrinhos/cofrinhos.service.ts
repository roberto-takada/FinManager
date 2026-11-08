import { computed, inject, Injectable } from '@angular/core';
import {
  type Cofrinho,
  type DadosCofrinho,
  emAndamento,
  type MovimentacaoCofrinho,
  type OrigemMovimentacao,
  saldoCofrinho,
  type TipoMovimentacao,
  validarCofrinho,
  validarMovimentacao,
} from '../../domain/cofrinhos/cofrinho';
import type { DataISO } from '../../domain/shared/data';
import type { Dinheiro } from '../../domain/shared/dinheiro';
import { ErroDominio } from '../../domain/shared/erro-dominio';
import { buscarAtivo, marcarExcluido, substituir } from '../dados/colecoes';
import { type Colecoes, DadosService } from '../dados/dados.service';
import { resumoCofrinho } from '../historico/resumos';

export interface DadosMovimentacao {
  readonly valor: Dinheiro;
  readonly data: DataISO;
  /** Conta de onde sai o depósito ou para onde volta a retirada. */
  readonly contaId: string;
}

/** Para zerar ou encerrar: para onde vai o saldo e em que data. */
export interface DestinoSaldo {
  readonly contaId: string;
  readonly data: DataISO;
}

/** Cofrinhos e objetivos (RF-030 a RF-034, RN-005 a/d). */
@Injectable({ providedIn: 'root' })
export class CofrinhosService {
  private readonly dados = inject(DadosService);

  readonly emAndamento = computed(() =>
    this.dados
      .cofrinhos()
      .filter(emAndamento)
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
  );

  readonly encerrados = computed(() =>
    this.dados
      .cofrinhos()
      .filter((c) => c.excluidoEm === null && c.encerradoEm !== null)
      .sort((a, b) => b.encerradoEm!.localeCompare(a.encerradoEm!)),
  );

  buscar(id: string): Cofrinho | undefined {
    return this.dados.cofrinhos().find((c) => c.id === id && c.excluidoEm === null);
  }

  /** RF-030. */
  criar(dados: DadosCofrinho): Promise<Cofrinho> {
    return this.dados.alterar((atual) => {
      const instante = this.dados.agora().toISOString();
      const cofrinho: Cofrinho = {
        ...validarCofrinho(dados, atual.cofrinhos, this.dados.hoje()),
        id: this.dados.novoId(),
        criadoEm: instante,
        atualizadoEm: instante,
        excluidoEm: null,
        movimentacoes: [],
        encerradoEm: null,
      };
      return { mudancas: { cofrinhos: [...atual.cofrinhos, cofrinho] }, resultado: cofrinho };
    });
  }

  /** Edita nome, meta, prazo, ícone e cor. Manter o mesmo prazo é aceito, mesmo que já tenha passado. */
  editar(id: string, dados: DadosCofrinho): Promise<Cofrinho> {
    return this.dados.alterar((atual) => {
      const anterior = this.emAndamentoOuErro(atual, id);
      const prazoMantido = dados.prazo !== null && dados.prazo === anterior.prazo;
      const validos = validarCofrinho(
        prazoMantido ? { ...dados, prazo: null } : dados,
        atual.cofrinhos,
        this.dados.hoje(),
        id,
      );
      const cofrinho: Cofrinho = {
        ...anterior,
        ...validos,
        prazo: prazoMantido ? anterior.prazo : validos.prazo,
        atualizadoEm: this.dados.agora().toISOString(),
      };
      return {
        mudancas: { cofrinhos: substituir(atual.cofrinhos, cofrinho) },
        resultado: cofrinho,
      };
    });
  }

  /** RF-031: guarda dinheiro, tirando-o de uma conta. */
  depositar(id: string, mov: DadosMovimentacao): Promise<void> {
    return this.movimentar(id, 'deposito', mov, 'manual');
  }

  /** RF-031: tira dinheiro do cofrinho, devolvendo-o a uma conta. */
  retirar(id: string, mov: DadosMovimentacao): Promise<void> {
    return this.movimentar(id, 'retirada', mov, 'manual');
  }

  /**
   * RN-005 d: zera o cofrinho, devolvendo todo o saldo a uma conta. O cofrinho continua
   * em andamento. Exige confirmação na interface e entra no histórico.
   */
  zerar(id: string, destino: DestinoSaldo): Promise<void> {
    return this.dados.alterar((atual) => {
      const anterior = this.emAndamentoOuErro(atual, id);
      const saldo = saldoCofrinho(anterior);
      if (saldo.unidades <= 0)
        throw new ErroDominio('cofrinho-vazio', 'O cofrinho já está zerado.');
      const cofrinho = this.comMovimentacao(
        anterior,
        'retirada',
        { ...destino, valor: saldo },
        'zeramento',
        atual,
      );
      return {
        mudancas: {
          cofrinhos: substituir(atual.cofrinhos, cofrinho),
          historico: [...atual.historico, this.eventoDe('zeramento', anterior)],
        },
        resultado: undefined,
      };
    });
  }

  /**
   * RN-005 d: encerra o cofrinho. O saldo restante volta para a conta escolhida e o
   * cofrinho é arquivado (sai da lista, mas o histórico de movimentações fica guardado).
   */
  encerrar(id: string, destino: DestinoSaldo): Promise<void> {
    return this.dados.alterar((atual) => {
      const anterior = this.emAndamentoOuErro(atual, id);
      const saldo = saldoCofrinho(anterior);
      const comRetirada =
        saldo.unidades > 0
          ? this.comMovimentacao(
              anterior,
              'retirada',
              { ...destino, valor: saldo },
              'encerramento',
              atual,
            )
          : anterior;
      const instante = this.dados.agora().toISOString();
      const cofrinho: Cofrinho = { ...comRetirada, encerradoEm: instante, atualizadoEm: instante };
      return {
        mudancas: {
          cofrinhos: substituir(atual.cofrinhos, cofrinho),
          historico: [...atual.historico, this.eventoDe('encerramento', anterior)],
        },
        resultado: undefined,
      };
    });
  }

  /**
   * RN-005 a: exclui (vai para a lixeira). Só é possível para cofrinhos sem nenhuma
   * movimentação; os que têm histórico devem ser encerrados, para não alterar saldos
   * passados das contas quando a lixeira for esvaziada.
   */
  excluir(id: string): Promise<void> {
    return this.dados.alterar((atual) => {
      const cofrinho = buscarAtivo(atual.cofrinhos, id, 'Cofrinho');
      if (cofrinho.movimentacoes.length > 0) {
        throw new ErroDominio(
          'cofrinho-com-movimentacoes',
          'Este cofrinho já teve movimentações. Encerre-o em vez de excluir: o histórico fica guardado.',
        );
      }
      return {
        mudancas: {
          cofrinhos: substituir(
            atual.cofrinhos,
            marcarExcluido(cofrinho, this.dados.agora().toISOString()),
          ),
          historico: [...atual.historico, this.eventoDe('exclusao', cofrinho)],
        },
        resultado: undefined,
      };
    });
  }

  // ---------------------------------------------------------------------------

  private movimentar(
    id: string,
    tipo: TipoMovimentacao,
    mov: DadosMovimentacao,
    origem: OrigemMovimentacao,
  ): Promise<void> {
    return this.dados.alterar((atual) => {
      const anterior = buscarAtivo(atual.cofrinhos, id, 'Cofrinho');
      const cofrinho = this.comMovimentacao(anterior, tipo, mov, origem, atual);
      return {
        mudancas: { cofrinhos: substituir(atual.cofrinhos, cofrinho) },
        resultado: undefined,
      };
    });
  }

  private comMovimentacao(
    cofrinho: Cofrinho,
    tipo: TipoMovimentacao,
    mov: DadosMovimentacao,
    origem: OrigemMovimentacao,
    atual: Colecoes,
  ): Cofrinho {
    validarMovimentacao(cofrinho, { tipo, ...mov }, atual.contas, this.dados.hoje());
    const instante = this.dados.agora().toISOString();
    const movimentacao: MovimentacaoCofrinho = {
      id: this.dados.novoId(),
      tipo,
      valor: mov.valor,
      data: mov.data,
      contaId: mov.contaId,
      origem,
      registradoEm: instante,
    };
    return {
      ...cofrinho,
      movimentacoes: [...cofrinho.movimentacoes, movimentacao],
      atualizadoEm: instante,
    };
  }

  private emAndamentoOuErro(atual: Colecoes, id: string): Cofrinho {
    const cofrinho = buscarAtivo(atual.cofrinhos, id, 'Cofrinho');
    if (!emAndamento(cofrinho))
      throw new ErroDominio('cofrinho-encerrado', 'Este cofrinho está encerrado.');
    return cofrinho;
  }

  private eventoDe(acao: 'zeramento' | 'encerramento' | 'exclusao', anterior: Cofrinho) {
    return this.dados.evento({
      acao,
      entidade: 'cofrinho',
      entidadeId: anterior.id,
      resumo: resumoCofrinho(anterior),
      estadoAnterior: anterior,
    });
  }
}
