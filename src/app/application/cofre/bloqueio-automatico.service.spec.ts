import { TestBed } from '@angular/core/testing';
import {
  PARAMETROS_KDF_TESTE,
  RepositorioCofreEmMemoria,
  SENHA_TESTE,
} from '../../../testing/cofre';
import { CriptografiaCofreWebCrypto } from '../../infrastructure/crypto/criptografia-cofre.webcrypto';
import { CRIPTOGRAFIA_COFRE, REPOSITORIO_COFRE } from '../ports/cofre.ports';
import { BloqueioAutomaticoService } from './bloqueio-automatico.service';
import { CofreService } from './cofre.service';

const MINUTO = 60_000;

describe('BloqueioAutomaticoService (RF-005)', () => {
  let cofre: CofreService;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: CRIPTOGRAFIA_COFRE,
          useValue: new CriptografiaCofreWebCrypto(PARAMETROS_KDF_TESTE),
        },
        { provide: REPOSITORIO_COFRE, useValue: new RepositorioCofreEmMemoria() },
      ],
    });
    cofre = TestBed.inject(CofreService);
    await cofre.criar(SENHA_TESTE, cofre.gerarChaveRecuperacao(), true);

    vi.useFakeTimers();
    TestBed.inject(BloqueioAutomaticoService);
    TestBed.tick(); // executa o effect que inicia o monitoramento
  });

  afterEach(() => vi.useRealTimers());

  it('bloqueia após o tempo configurado sem atividade (padrão: 5 min)', () => {
    vi.advanceTimersByTime(5 * MINUTO - 10_000);
    expect(cofre.estado()).toBe('desbloqueado');

    vi.advanceTimersByTime(15_000);
    expect(cofre.estado()).toBe('bloqueado');
    expect(cofre.motivoUltimoBloqueio()).toBe('inatividade');
    expect(() => cofre.chaveDeDados()).toThrow();
  });

  it('atividade do usuário reinicia a contagem', () => {
    vi.advanceTimersByTime(4 * MINUTO);
    document.dispatchEvent(new KeyboardEvent('keydown'));

    vi.advanceTimersByTime(4 * MINUTO);
    expect(cofre.estado()).toBe('desbloqueado');

    vi.advanceTimersByTime(1 * MINUTO + 5_000);
    expect(cofre.estado()).toBe('bloqueado');
  });

  it('respeita o tempo configurado pelo usuário', async () => {
    await cofre.definirBloqueioAutomatico(1);

    vi.advanceTimersByTime(1 * MINUTO + 5_000);
    expect(cofre.estado()).toBe('bloqueado');
  });

  it('para de monitorar quando o cofre é bloqueado', () => {
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    cofre.bloquear();
    TestBed.tick();

    expect(vi.getTimerCount()).toBe(0);
  });
});
