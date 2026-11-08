import { computed, inject, Injectable } from '@angular/core';
import {
  ACESSIBILIDADE_PADRAO,
  normalizarAcessibilidade,
  type PreferenciasAcessibilidade,
  type Tema,
  TEMAS,
} from '../../domain/shared/preferencias';
import { DadosService } from '../dados/dados.service';

/**
 * Preferências de aparência: tema (RF-081) e acessibilidade (RF-082). Ficam cifradas no
 * cofre, como as demais (RN-001); com o cofre bloqueado, valem os padrões.
 */
@Injectable({ providedIn: 'root' })
export class PreferenciasService {
  private readonly dados = inject(DadosService);

  /** Tema escolhido; com o cofre bloqueado as preferências não são legíveis: vale "sistema". */
  readonly tema = computed<Tema>(() =>
    this.dados.estado() === 'pronto' ? (this.dados.preferencias().tema ?? 'sistema') : 'sistema',
  );

  readonly acessibilidade = computed<PreferenciasAcessibilidade>(() =>
    this.dados.estado() === 'pronto'
      ? normalizarAcessibilidade(this.dados.preferencias().acessibilidade)
      : ACESSIBILIDADE_PADRAO,
  );

  /**
   * Altera um ou mais ajustes de acessibilidade; valores desconhecidos são recusados. O
   * ajuste é mesclado dentro de `alterar`, sobre o estado mais recente: vários ajustes em
   * sequência rápida não se sobrescrevem.
   */
  definirAcessibilidade(ajuste: Partial<PreferenciasAcessibilidade>): Promise<void> {
    const conferido = normalizarAcessibilidade({ ...ACESSIBILIDADE_PADRAO, ...ajuste });
    for (const [chave, valor] of Object.entries(ajuste)) {
      if (conferido[chave as keyof PreferenciasAcessibilidade] !== valor) {
        throw new RangeError(`Ajuste de acessibilidade inválido: ${chave}=${String(valor)}`);
      }
    }
    return this.dados.alterar((atual) => {
      const preferencias = atual.preferencias[0] ?? this.dados.preferencias();
      const acessibilidade = normalizarAcessibilidade({
        ...normalizarAcessibilidade(preferencias.acessibilidade),
        ...ajuste,
      });
      return {
        mudancas: { preferencias: [{ ...preferencias, acessibilidade }] },
        resultado: undefined,
      };
    });
  }

  definirTema(tema: Tema): Promise<void> {
    if (!(tema in TEMAS)) throw new RangeError(`Tema inválido: ${tema}`);
    return this.dados.alterar((atual) => {
      const preferencias = atual.preferencias[0] ?? this.dados.preferencias();
      return { mudancas: { preferencias: [{ ...preferencias, tema }] }, resultado: undefined };
    });
  }
}
