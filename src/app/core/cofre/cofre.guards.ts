import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import { CofreService, type EstadoCofre } from '../../application/cofre/cofre.service';

export const ROTAS_COFRE = {
  inicio: '/',
  criar: '/cofre/criar',
  desbloquear: '/cofre/desbloquear',
  recuperar: '/cofre/recuperar',
  apagar: '/cofre/apagar',
  seguranca: '/seguranca',
} as const;

/** Para onde levar o usuário em cada estado do cofre. */
export function rotaPorEstado(estado: EstadoCofre): string {
  switch (estado) {
    case 'inexistente':
      return ROTAS_COFRE.criar;
    case 'desbloqueado':
      return ROTAS_COFRE.inicio;
    default:
      return ROTAS_COFRE.desbloquear;
  }
}

function exigirEstado(...permitidos: EstadoCofre[]): CanActivateFn {
  return async () => {
    const cofre = inject(CofreService);
    const router = inject(Router);
    await cofre.inicializar();
    const estado = cofre.estado();
    return permitidos.includes(estado) ? true : router.parseUrl(rotaPorEstado(estado));
  };
}

/** Telas que mostram ou alteram dados: só com o cofre desbloqueado. */
export const exigirCofreDesbloqueado = exigirEstado('desbloqueado');
/** Desbloquear e recuperar acesso: só com o cofre bloqueado. */
export const exigirCofreBloqueado = exigirEstado('bloqueado');
/** Criar cofre: só no primeiro acesso. */
export const exigirSemCofre = exigirEstado('inexistente');
/** Apagar cofre: com o cofre bloqueado ou desbloqueado. */
export const exigirCofreExistente = exigirEstado('bloqueado', 'desbloqueado');
