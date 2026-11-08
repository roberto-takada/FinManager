import { computed, inject, Injectable } from '@angular/core';
import type { Periodo, TipoPeriodo } from '../../domain/relatorios/periodo';
import { periodosDisponiveis } from '../../domain/relatorios/periodo';
import {
  gerarRelatorio,
  primeiroRegistro,
  type Relatorio,
} from '../../domain/relatorios/relatorio';
import { DadosService } from '../dados/dados.service';

/** Relatórios sob demanda (RF-050 a RF-053), calculados sobre os dados em memória. */
@Injectable({ providedIn: 'root' })
export class RelatoriosService {
  private readonly dados = inject(DadosService);

  private readonly entrada = computed(() => ({
    contas: this.dados.contas(),
    categorias: this.dados.categorias(),
    transacoes: this.dados.transacoes(),
    cofrinhos: this.dados.cofrinhos(),
  }));

  private readonly primeiro = computed(() => primeiroRegistro(this.entrada(), this.dados.hoje()));

  /** Períodos que podem ser escolhidos, do mais novo ao mais antigo (sem futuros). */
  periodos(tipo: TipoPeriodo): Periodo[] {
    return periodosDisponiveis(tipo, this.primeiro(), this.dados.hoje());
  }

  gerar(periodo: Periodo): Relatorio {
    return gerarRelatorio(this.entrada(), periodo, this.dados.hoje());
  }
}
