import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PARAMETROS_KDF_TESTE, RepositorioCofreEmMemoria, SENHA_TESTE } from '../testing/cofre';
import { App } from './app';
import { CofreService } from './application/cofre/cofre.service';
import { CRIPTOGRAFIA_COFRE, REPOSITORIO_COFRE } from './application/ports/cofre.ports';
import { CriptografiaCofreWebCrypto } from './infrastructure/crypto/criptografia-cofre.webcrypto';

describe('App (shell)', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        {
          provide: CRIPTOGRAFIA_COFRE,
          useValue: new CriptografiaCofreWebCrypto(PARAMETROS_KDF_TESTE),
        },
        { provide: REPOSITORIO_COFRE, useValue: new RepositorioCofreEmMemoria() },
      ],
    });
  });

  it('exibe o nome da aplicação no cabeçalho', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const cabecalho = (fixture.nativeElement as HTMLElement).querySelector('header');
    expect(cabecalho?.textContent).toContain('FinManager');
  });

  it('só mostra a navegação e o botão "Bloquear cofre" com o cofre desbloqueado', async () => {
    const fixture = TestBed.createComponent(App);
    const raiz = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
    expect(raiz.querySelector('nav')).toBeNull();

    const cofre = TestBed.inject(CofreService);
    await cofre.criar(SENHA_TESTE, cofre.gerarChaveRecuperacao(), true);
    await fixture.whenStable();
    const botao = [...raiz.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Bloquear cofre'),
    );
    expect(botao).toBeTruthy();

    botao!.click();
    await fixture.whenStable();
    expect(cofre.estado()).toBe('bloqueado');
    expect(raiz.querySelector('nav')).toBeNull();
  });
});
