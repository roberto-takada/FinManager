import type { Routes } from '@angular/router';
import {
  exigirCofreBloqueado,
  exigirCofreDesbloqueado,
  exigirCofreExistente,
  exigirSemCofre,
} from './core/cofre/cofre.guards';

const titulo = (pagina: string) => `${pagina} — FinManager`;

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    title: titulo('Início'),
    canActivate: [exigirCofreDesbloqueado],
    loadComponent: () => import('./features/inicio/inicio').then((m) => m.Inicio),
  },
  {
    path: 'seguranca',
    title: titulo('Segurança'),
    canActivate: [exigirCofreDesbloqueado],
    loadComponent: () => import('./features/seguranca/seguranca').then((m) => m.Seguranca),
  },
  {
    path: 'cofre/criar',
    title: titulo('Criar cofre'),
    canActivate: [exigirSemCofre],
    loadComponent: () =>
      import('./features/cofre/criar-cofre/criar-cofre').then((m) => m.CriarCofre),
  },
  {
    path: 'cofre/desbloquear',
    title: titulo('Desbloquear cofre'),
    canActivate: [exigirCofreBloqueado],
    loadComponent: () =>
      import('./features/cofre/desbloquear-cofre/desbloquear-cofre').then(
        (m) => m.DesbloquearCofre,
      ),
  },
  {
    path: 'cofre/recuperar',
    title: titulo('Recuperar acesso'),
    canActivate: [exigirCofreBloqueado],
    loadComponent: () =>
      import('./features/cofre/recuperar-acesso/recuperar-acesso').then((m) => m.RecuperarAcesso),
  },
  {
    path: 'cofre/apagar',
    title: titulo('Apagar cofre'),
    canActivate: [exigirCofreExistente],
    loadComponent: () =>
      import('./features/cofre/apagar-cofre/apagar-cofre').then((m) => m.ApagarCofre),
  },
  { path: '**', redirectTo: '' },
];
