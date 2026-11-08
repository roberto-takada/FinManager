import {
  effect,
  type EnvironmentProviders,
  inject,
  makeEnvironmentProviders,
  provideEnvironmentInitializer,
  untracked,
} from '@angular/core';
import { Router } from '@angular/router';
import { BloqueioAutomaticoService } from '../../application/cofre/bloqueio-automatico.service';
import { CofreService, type EstadoCofre } from '../../application/cofre/cofre.service';
import { CRIPTOGRAFIA_COFRE, REPOSITORIO_COFRE } from '../../application/ports/cofre.ports';
import { CriptografiaCofreWebCrypto } from '../../infrastructure/crypto/criptografia-cofre.webcrypto';
import { RepositorioCofreIdb } from '../../infrastructure/storage/repositorio-cofre.idb';
import { rotaPorEstado } from './cofre.guards';

/** Liga as portas do cofre aos adaptadores reais e ativa os comportamentos globais. */
export function provideCofre(): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: CRIPTOGRAFIA_COFRE, useFactory: () => new CriptografiaCofreWebCrypto() },
    { provide: REPOSITORIO_COFRE, useFactory: () => new RepositorioCofreIdb() },
    provideEnvironmentInitializer(() => inject(BloqueioAutomaticoService)),
    provideEnvironmentInitializer(redirecionarAoPerderAcesso),
  ]);
}

/**
 * Quando o cofre deixa de estar desbloqueado (bloqueio manual, por inatividade ou
 * apagamento), sai da tela atual para não exibir nada que dependa dos dados.
 */
function redirecionarAoPerderAcesso(): void {
  const cofre = inject(CofreService);
  const router = inject(Router);
  let anterior: EstadoCofre = cofre.estado();

  effect(() => {
    const atual = cofre.estado();
    untracked(() => {
      if (anterior === 'desbloqueado' && atual !== 'desbloqueado') {
        void router.navigateByUrl(rotaPorEstado(atual));
      }
      anterior = atual;
    });
  });
}
