import type { Routes } from '@angular/router';
import {
  exigirCofreBloqueado,
  exigirCofreDesbloqueado,
  exigirCofreExistente,
  exigirDadosCarregados,
  exigirSemCofre,
} from './core/cofre/cofre.guards';

/** Telas com dados financeiros: cofre desbloqueado e dados decifrados. */
const comDados = [exigirCofreDesbloqueado, exigirDadosCarregados];

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
    path: 'transacoes',
    title: titulo('Transações'),
    canActivate: comDados,
    loadComponent: () =>
      import('./features/transacoes/lista-transacoes').then((m) => m.ListaTransacoes),
  },
  {
    path: 'transacoes/nova',
    title: titulo('Nova transação'),
    canActivate: comDados,
    loadComponent: () =>
      import('./features/transacoes/formulario-transacao').then((m) => m.FormularioTransacao),
  },
  {
    path: 'transacoes/:id',
    title: titulo('Editar transação'),
    canActivate: comDados,
    loadComponent: () =>
      import('./features/transacoes/formulario-transacao').then((m) => m.FormularioTransacao),
  },
  {
    path: 'contas',
    title: titulo('Contas'),
    canActivate: comDados,
    loadComponent: () => import('./features/contas/contas').then((m) => m.Contas),
  },
  {
    path: 'categorias',
    title: titulo('Categorias'),
    canActivate: comDados,
    loadComponent: () => import('./features/categorias/categorias').then((m) => m.Categorias),
  },
  {
    path: 'recorrencias',
    title: titulo('Recorrências'),
    canActivate: comDados,
    loadComponent: () => import('./features/recorrencias/recorrencias').then((m) => m.Recorrencias),
  },
  {
    path: 'historico',
    title: titulo('Histórico e lixeira'),
    canActivate: comDados,
    loadComponent: () => import('./features/historico/historico').then((m) => m.Historico),
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
