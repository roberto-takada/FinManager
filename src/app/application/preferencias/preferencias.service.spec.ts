import { TestBed } from '@angular/core/testing';
import { type AmbienteDados, prepararAmbienteDados } from '../../../testing/dados';
import { PreferenciasService } from './preferencias.service';

describe('PreferenciasService: tema (RF-081)', () => {
  let amb: AmbienteDados;
  let preferencias: PreferenciasService;

  beforeEach(async () => {
    amb = await prepararAmbienteDados();
    preferencias = TestBed.inject(PreferenciasService);
  });

  it('o padrão é seguir o sistema', () => {
    expect(preferencias.tema()).toBe('sistema');
  });

  it('a escolha fica cifrada no cofre e vale de novo após reabrir', async () => {
    await preferencias.definirTema('escuro');
    expect(preferencias.tema()).toBe('escuro');
    expect(amb.armazenamento.colecoes.get('preferencias')).toEqual([
      expect.objectContaining({ tema: 'escuro' }),
    ]);

    await amb.reabrir();
    expect(preferencias.tema()).toBe('escuro');
  });

  it('com o cofre bloqueado a preferência não é legível: volta a seguir o sistema', async () => {
    await preferencias.definirTema('claro');
    amb.cofre.bloquear();
    TestBed.tick();
    expect(preferencias.tema()).toBe('sistema');
  });

  it('recusa tema desconhecido', () => {
    expect(() => preferencias.definirTema('sepia' as never)).toThrow(RangeError);
  });
});

describe('PreferenciasService: acessibilidade (RF-082)', () => {
  let amb: AmbienteDados;
  let preferencias: PreferenciasService;

  beforeEach(async () => {
    amb = await prepararAmbienteDados();
    preferencias = TestBed.inject(PreferenciasService);
  });

  it('o padrão é fonte padrão, contraste padrão e animações do sistema', () => {
    expect(preferencias.acessibilidade()).toEqual({
      tamanhoFonte: 'padrao',
      contraste: 'padrao',
      animacoes: 'sistema',
    });
  });

  it('altera um ajuste por vez, mantém os demais e o tema, e vale após reabrir', async () => {
    await preferencias.definirTema('escuro');
    await preferencias.definirAcessibilidade({ tamanhoFonte: 'maior' });
    await preferencias.definirAcessibilidade({ contraste: 'alto' });
    await amb.reabrir();
    expect(preferencias.acessibilidade()).toEqual({
      tamanhoFonte: 'maior',
      contraste: 'alto',
      animacoes: 'sistema',
    });
    expect(preferencias.tema()).toBe('escuro');
  });

  it('ajustes em sequência rápida não se sobrescrevem', async () => {
    await Promise.all([
      preferencias.definirAcessibilidade({ tamanhoFonte: 'grande' }),
      preferencias.definirAcessibilidade({ contraste: 'alto' }),
      preferencias.definirAcessibilidade({ animacoes: 'reduzidas' }),
    ]);
    expect(preferencias.acessibilidade()).toEqual({
      tamanhoFonte: 'grande',
      contraste: 'alto',
      animacoes: 'reduzidas',
    });
  });

  it('bloqueado, volta ao padrão; valores desconhecidos são recusados', async () => {
    await preferencias.definirAcessibilidade({ animacoes: 'reduzidas' });
    expect(() => preferencias.definirAcessibilidade({ contraste: 'neon' as never })).toThrow(
      RangeError,
    );
    amb.cofre.bloquear();
    TestBed.tick();
    expect(preferencias.acessibilidade().animacoes).toBe('sistema');
  });
});
