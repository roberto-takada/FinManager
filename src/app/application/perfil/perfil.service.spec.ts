import { TestBed } from '@angular/core/testing';
import { type AmbienteDados, prepararAmbienteDados } from '../../../testing/dados';
import { PERFIL_PADRAO } from '../../domain/perfil/perfil';
import { ErroDominio } from '../../domain/shared/erro-dominio';
import { PerfilService } from './perfil.service';

describe('PerfilService (RF-080)', () => {
  let amb: AmbienteDados;
  let perfil: PerfilService;

  beforeEach(async () => {
    amb = await prepararAmbienteDados();
    perfil = TestBed.inject(PerfilService);
  });

  it('começa vazio', () => {
    expect(perfil.perfil()).toEqual(PERFIL_PADRAO);
    expect(perfil.preenchido()).toBe(false);
  });

  it('salva cifrado no cofre e vale de novo ao reabrir', async () => {
    await perfil.salvar({
      nome: ' Ana Exemplo ',
      email: 'ana@example.com',
      avatar: { tipo: 'iniciais', cor: 'rosa' },
    });
    expect(amb.armazenamento.colecoes.get('perfil')).toEqual([
      {
        nome: 'Ana Exemplo',
        email: 'ana@example.com',
        avatar: { tipo: 'iniciais', cor: 'rosa' },
        atualizadoEm: '2026-11-08T12:00:00.000Z',
      },
    ]);
    await amb.reabrir();
    expect(perfil.perfil().nome).toBe('Ana Exemplo');
    expect(perfil.preenchido()).toBe(true);
  });

  it('dados inválidos não são gravados', async () => {
    expect(() => perfil.salvar({ ...PERFIL_PADRAO, email: 'sem-arroba' })).toThrow(ErroDominio);
    expect(amb.armazenamento.colecoes.get('perfil')).toBeUndefined();
  });
});
