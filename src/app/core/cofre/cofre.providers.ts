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
import { ArmazenamentoDadosIdb } from '../../infrastructure/storage/armazenamento-dados.idb';
import { BancoIdb } from '../../infrastructure/storage/banco-idb';
import { DadosService } from '../../application/dados/dados.service';
import { ARMAZENAMENTO_DADOS } from '../../application/ports/dados.ports';
import { NotificacoesService } from '../../application/agenda/notificacoes.service';
import { NOTIFICADOR_NAVEGADOR } from '../../application/ports/notificacoes.ports';
import { NotificadorNavegadorWeb } from '../../infrastructure/notificacoes/notificador-navegador';
import { CIFRADOR_BACKUP } from '../../application/ports/backup.ports';
import { CifradorBackupWebCrypto } from '../../infrastructure/backup/cifrador-backup.webcrypto';
import { rotaPorEstado } from './cofre.guards';

/** Liga as portas do cofre aos adaptadores reais e ativa os comportamentos globais. */
export function provideCofre(): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: CRIPTOGRAFIA_COFRE, useFactory: () => new CriptografiaCofreWebCrypto() },
    // Um único banco IndexedDB, compartilhado pelos metadados do cofre e pelos dados cifrados.
    { provide: BancoIdb, useFactory: () => new BancoIdb() },
    { provide: REPOSITORIO_COFRE, useFactory: () => new RepositorioCofreIdb(inject(BancoIdb)) },
    { provide: ARMAZENAMENTO_DADOS, useFactory: () => new ArmazenamentoDadosIdb(inject(BancoIdb)) },
    { provide: CIFRADOR_BACKUP, useFactory: () => new CifradorBackupWebCrypto() },
    provideEnvironmentInitializer(() => inject(BloqueioAutomaticoService)),
    // Carrega os dados ao desbloquear e os descarta ao bloquear.
    provideEnvironmentInitializer(() => inject(DadosService)),
    { provide: NOTIFICADOR_NAVEGADOR, useFactory: () => new NotificadorNavegadorWeb() },
    // Verifica vencimentos enquanto o cofre estiver desbloqueado (RF-024).
    provideEnvironmentInitializer(() => inject(NotificacoesService)),
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
