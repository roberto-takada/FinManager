import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import {
  PARAMETROS_KDF_TESTE,
  RepositorioCofreEmMemoria,
  SENHA_TESTE,
} from '../../../testing/cofre';
import { CofreService } from '../../application/cofre/cofre.service';
import { CRIPTOGRAFIA_COFRE, REPOSITORIO_COFRE } from '../../application/ports/cofre.ports';
import { CriptografiaCofreWebCrypto } from '../../infrastructure/crypto/criptografia-cofre.webcrypto';
import {
  exigirCofreBloqueado,
  exigirCofreDesbloqueado,
  exigirCofreExistente,
  exigirSemCofre,
} from './cofre.guards';

@Component({ template: '' })
class Vazio {}

describe('guards do cofre', () => {
  let cofre: CofreService;
  let router: Router;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: CRIPTOGRAFIA_COFRE,
          useValue: new CriptografiaCofreWebCrypto(PARAMETROS_KDF_TESTE),
        },
        { provide: REPOSITORIO_COFRE, useValue: new RepositorioCofreEmMemoria() },
        provideRouter([
          { path: '', component: Vazio, canActivate: [exigirCofreDesbloqueado] },
          { path: 'cofre/criar', component: Vazio, canActivate: [exigirSemCofre] },
          { path: 'cofre/desbloquear', component: Vazio, canActivate: [exigirCofreBloqueado] },
          { path: 'cofre/apagar', component: Vazio, canActivate: [exigirCofreExistente] },
        ]),
      ],
    });
    cofre = TestBed.inject(CofreService);
    router = TestBed.inject(Router);
    await RouterTestingHarness.create();
  });

  const navegar = async (url: string) => {
    await router.navigateByUrl(url);
    return router.url;
  };

  it('sem cofre: qualquer tela leva à criação', async () => {
    expect(await navegar('/')).toBe('/cofre/criar');
    expect(await navegar('/cofre/desbloquear')).toBe('/cofre/criar');
    expect(await navegar('/cofre/apagar')).toBe('/cofre/criar');
  });

  it('cofre bloqueado: telas de dados levam ao desbloqueio; criar não é permitido', async () => {
    await cofre.criar(SENHA_TESTE, cofre.gerarChaveRecuperacao(), true);
    cofre.bloquear();

    expect(await navegar('/')).toBe('/cofre/desbloquear');
    expect(await navegar('/cofre/criar')).toBe('/cofre/desbloquear');
    expect(await navegar('/cofre/apagar')).toBe('/cofre/apagar');
  });

  it('cofre desbloqueado: acessa o início; desbloquear e criar levam ao início', async () => {
    await cofre.criar(SENHA_TESTE, cofre.gerarChaveRecuperacao(), true);

    expect(await navegar('/cofre/desbloquear')).toBe('/');
    expect(await navegar('/cofre/criar')).toBe('/');
    expect(await navegar('/')).toBe('/');
  });
});
