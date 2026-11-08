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
    canActivate: comDados,
    loadComponent: () => import('./features/inicio/inicio').then((m) => m.Inicio),
  },
  {
    path: 'inicio/personalizar',
    title: titulo('Personalizar o Início'),
    canActivate: comDados,
    loadComponent: () =>
      import('./features/inicio/personalizar-inicio').then((m) => m.PersonalizarInicio),
  },
  {
    path: 'relatorios',
    title: titulo('Relatórios'),
    canActivate: comDados,
    loadComponent: () => import('./features/relatorios/relatorios').then((m) => m.Relatorios),
  },
  {
    path: 'perfil',
    title: titulo('Perfil'),
    canActivate: comDados,
    loadComponent: () => import('./features/perfil/perfil').then((m) => m.Perfil),
  },
  {
    path: 'perfil/editar',
    title: titulo('Editar perfil'),
    canActivate: comDados,
    loadComponent: () => import('./features/perfil/editar-perfil').then((m) => m.EditarPerfil),
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
    path: 'contas/nova',
    title: titulo('Nova conta'),
    canActivate: comDados,
    loadComponent: () =>
      import('./features/contas/formulario-conta').then((m) => m.FormularioConta),
  },
  {
    path: 'contas/:id/editar',
    title: titulo('Editar conta'),
    canActivate: comDados,
    loadComponent: () =>
      import('./features/contas/formulario-conta').then((m) => m.FormularioConta),
  },
  {
    path: 'categorias',
    title: titulo('Categorias'),
    canActivate: comDados,
    loadComponent: () => import('./features/categorias/categorias').then((m) => m.Categorias),
  },
  {
    path: 'categorias/nova',
    title: titulo('Nova categoria'),
    canActivate: comDados,
    loadComponent: () =>
      import('./features/categorias/formulario-categoria').then((m) => m.FormularioCategoria),
  },
  {
    path: 'categorias/:id/editar',
    title: titulo('Editar categoria'),
    canActivate: comDados,
    loadComponent: () =>
      import('./features/categorias/formulario-categoria').then((m) => m.FormularioCategoria),
  },
  {
    path: 'recorrencias',
    title: titulo('Recorrências'),
    canActivate: comDados,
    loadComponent: () => import('./features/recorrencias/recorrencias').then((m) => m.Recorrencias),
  },
  {
    path: 'agenda',
    title: titulo('Contas a pagar e a receber'),
    canActivate: comDados,
    loadComponent: () =>
      import('./features/agenda/contas-agendadas').then((m) => m.ContasAgendadas),
  },
  {
    path: 'agenda/nova',
    title: titulo('Nova conta a pagar ou a receber'),
    canActivate: comDados,
    loadComponent: () =>
      import('./features/agenda/formulario-conta-agendada').then((m) => m.FormularioContaAgendada),
  },
  {
    path: 'agenda/:id/editar',
    title: titulo('Editar conta a pagar ou a receber'),
    canActivate: comDados,
    loadComponent: () =>
      import('./features/agenda/formulario-conta-agendada').then((m) => m.FormularioContaAgendada),
  },
  {
    path: 'calendario',
    title: titulo('Calendário'),
    canActivate: comDados,
    loadComponent: () => import('./features/agenda/calendario').then((m) => m.Calendario),
  },
  {
    path: 'cofrinhos',
    title: titulo('Cofrinhos'),
    canActivate: comDados,
    loadComponent: () =>
      import('./features/cofrinhos/lista-cofrinhos').then((m) => m.ListaCofrinhos),
  },
  {
    path: 'cofrinhos/novo',
    title: titulo('Novo cofrinho'),
    canActivate: comDados,
    loadComponent: () =>
      import('./features/cofrinhos/formulario-cofrinho').then((m) => m.NovoCofrinho),
  },
  {
    path: 'cofrinhos/:id',
    title: titulo('Cofrinho'),
    canActivate: comDados,
    loadComponent: () =>
      import('./features/cofrinhos/detalhe-cofrinho').then((m) => m.DetalheCofrinho),
  },
  {
    path: 'cofrinhos/:id/configuracoes',
    title: titulo('Configurações do cofrinho'),
    canActivate: comDados,
    loadComponent: () =>
      import('./features/cofrinhos/configuracoes-cofrinho').then((m) => m.ConfiguracoesCofrinho),
  },
  {
    path: 'cofrinhos/:id/movimentar',
    title: titulo('Depositar ou retirar'),
    canActivate: comDados,
    loadComponent: () =>
      import('./features/cofrinhos/movimentar-cofrinho').then((m) => m.MovimentarCofrinho),
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
