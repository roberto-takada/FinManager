import { computed, inject, Injectable } from '@angular/core';
import { type DadosPerfil, PERFIL_PADRAO, validarPerfil } from '../../domain/perfil/perfil';
import { DadosService } from '../dados/dados.service';

/** Perfil do usuário (RF-080), cifrado no cofre (RN-001). */
@Injectable({ providedIn: 'root' })
export class PerfilService {
  private readonly dados = inject(DadosService);

  /** Dados do perfil; sem nada salvo, o perfil vazio. */
  readonly perfil = computed<DadosPerfil>(() => this.dados.perfil() ?? PERFIL_PADRAO);
  readonly preenchido = computed(() => this.dados.perfil() !== null);

  salvar(dados: DadosPerfil): Promise<void> {
    const validado = validarPerfil(dados);
    return this.dados.alterar(() => ({
      mudancas: {
        perfil: [{ ...validado, atualizadoEm: this.dados.agora().toISOString() }],
      },
      resultado: undefined,
    }));
  }
}
