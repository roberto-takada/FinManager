import { TestBed } from '@angular/core/testing';
import {
  OUTRA_SENHA_TESTE,
  PARAMETROS_KDF_TESTE,
  RepositorioCofreEmMemoria,
  SENHA_TESTE,
} from '../../../testing/cofre';
import { CriptografiaCofreWebCrypto } from '../../infrastructure/crypto/criptografia-cofre.webcrypto';
import { CRIPTOGRAFIA_COFRE, REPOSITORIO_COFRE } from '../ports/cofre.ports';
import { CofreService, ErroCofre, FRASE_APAGAR_COFRE } from './cofre.service';

describe('CofreService', () => {
  let repositorio: RepositorioCofreEmMemoria;
  let cofre: CofreService;

  /** Uma nova instância do serviço, como se a página tivesse sido recarregada. */
  const recarregar = () => TestBed.runInInjectionContext(() => new CofreService());

  const erro = (codigo: string) => expect.objectContaining({ name: 'ErroCofre', codigo });

  async function criarCofre(): Promise<string> {
    const chave = cofre.gerarChaveRecuperacao();
    await cofre.criar(SENHA_TESTE, chave, true);
    return chave;
  }

  beforeEach(() => {
    repositorio = new RepositorioCofreEmMemoria();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: CRIPTOGRAFIA_COFRE,
          useValue: new CriptografiaCofreWebCrypto(PARAMETROS_KDF_TESTE),
        },
        { provide: REPOSITORIO_COFRE, useValue: repositorio },
      ],
    });
    cofre = TestBed.inject(CofreService);
  });

  afterEach(() => vi.useRealTimers());

  describe('inicialização', () => {
    it('fica "inexistente" quando não há cofre no navegador', async () => {
      await cofre.inicializar();
      expect(cofre.estado()).toBe('inexistente');
    });

    it('fica "bloqueado" quando já existe cofre (ex.: ao recarregar a página)', async () => {
      await criarCofre();
      const recarregado = recarregar();
      await recarregado.inicializar();

      expect(recarregado.estado()).toBe('bloqueado');
      expect(() => recarregado.chaveDeDados()).toThrow(ErroCofre);
    });
  });

  describe('criar (RF-001, RF-003, RN-013)', () => {
    it('cria o cofre desbloqueado, com bloqueio automático padrão de 5 minutos', async () => {
      await criarCofre();

      expect(cofre.estado()).toBe('desbloqueado');
      expect(cofre.chaveDeDados()).toBeTruthy();
      expect(repositorio.metadados?.configuracao.bloqueioAutomaticoMinutos).toBe(5);
      expect(cofre.bloqueioAutomaticoMinutos()).toBe(5);
    });

    it('exige que o aviso de irrecuperabilidade tenha sido aceito', async () => {
      await expect(cofre.criar(SENHA_TESTE, cofre.gerarChaveRecuperacao(), false)).rejects.toEqual(
        erro('aviso-nao-aceito'),
      );
      expect(repositorio.metadados).toBeNull();
    });

    it('recusa senha fraca, mesmo que a interface seja contornada', async () => {
      await expect(cofre.criar('123456', cofre.gerarChaveRecuperacao(), true)).rejects.toEqual(
        erro('senha-fraca'),
      );
      expect(repositorio.metadados).toBeNull();
    });

    it('recusa chave de recuperação em formato inválido', async () => {
      await expect(cofre.criar(SENHA_TESTE, 'ABCD-1234', true)).rejects.toEqual(
        erro('chave-invalida'),
      );
    });

    it('não sobrescreve um cofre existente', async () => {
      await criarCofre();
      await expect(criarCofre()).rejects.toEqual(erro('cofre-existente'));
    });

    it('não guarda a senha nem a chave de recuperação nos metadados', async () => {
      const chave = await criarCofre();
      const json = JSON.stringify(repositorio.metadados);

      expect(json).not.toContain(SENHA_TESTE);
      expect(json).not.toContain(chave);
      expect(json).not.toContain(chave.replace(/-/g, ''));
    });
  });

  describe('gerarChaveRecuperacao', () => {
    it('gera chaves no formato de grupos e diferentes a cada chamada', () => {
      const a = cofre.gerarChaveRecuperacao();
      const b = cofre.gerarChaveRecuperacao();
      expect(a).toMatch(/^([0-9A-Z]{4}-){7}[0-9A-Z]{4}$/);
      expect(a).not.toBe(b);
    });
  });

  describe('desbloquear e bloquear (RF-002, RNF-006)', () => {
    let recarregado: CofreService;

    beforeEach(async () => {
      await criarCofre();
      recarregado = recarregar();
    });

    it('desbloqueia com a senha correta', async () => {
      expect(await recarregado.desbloquear(SENHA_TESTE)).toEqual({ ok: true });
      expect(recarregado.estado()).toBe('desbloqueado');
      expect(recarregado.chaveDeDados()).toBeTruthy();
    });

    it('com senha errada, continua bloqueado e não revela nada', async () => {
      const resultado = await recarregado.desbloquear('senha errada qualquer');

      expect(resultado).toEqual({ ok: false, motivo: 'senha-incorreta', aguardarMs: 0 });
      expect(recarregado.estado()).toBe('bloqueado');
      expect(() => recarregado.chaveDeDados()).toThrow(ErroCofre);
    });

    it('aplica atraso progressivo a partir da 3ª senha errada', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      await recarregado.desbloquear('errada 1');
      await recarregado.desbloquear('errada 2');
      const terceira = await recarregado.desbloquear('errada 3');
      expect(terceira).toEqual({ ok: false, motivo: 'senha-incorreta', aguardarMs: 2_000 });

      // Durante a espera, nem a senha correta é testada.
      const durante = await recarregado.desbloquear(SENHA_TESTE);
      expect(durante).toMatchObject({ ok: false, motivo: 'aguarde' });
      expect(recarregado.estado()).toBe('bloqueado');

      vi.advanceTimersByTime(2_000);
      expect(await recarregado.desbloquear(SENHA_TESTE)).toEqual({ ok: true });
    });

    it('zera o contador de falhas após desbloquear', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      await recarregado.desbloquear('errada 1');
      await recarregado.desbloquear('errada 2');
      await recarregado.desbloquear(SENHA_TESTE);
      recarregado.bloquear();

      const resultado = await recarregado.desbloquear('errada de novo');
      expect(resultado).toMatchObject({ aguardarMs: 0 });
    });

    it('bloquear descarta a chave da memória e registra o motivo', async () => {
      await recarregado.desbloquear(SENHA_TESTE);
      recarregado.bloquear();

      expect(recarregado.estado()).toBe('bloqueado');
      expect(recarregado.motivoUltimoBloqueio()).toBe('manual');
      expect(() => recarregado.chaveDeDados()).toThrow(ErroCofre);
    });
  });

  describe('recuperarAcesso (RF-003)', () => {
    let chave: string;
    let recarregado: CofreService;

    beforeEach(async () => {
      chave = await criarCofre();
      recarregado = recarregar();
    });

    it('define nova senha com a chave de recuperação e desbloqueia', async () => {
      expect(await recarregado.recuperarAcesso(chave, OUTRA_SENHA_TESTE)).toEqual({ ok: true });
      expect(recarregado.estado()).toBe('desbloqueado');

      const depois = recarregar();
      expect(await depois.desbloquear(OUTRA_SENHA_TESTE)).toEqual({ ok: true });
      expect(await recarregar().desbloquear(SENHA_TESTE)).toMatchObject({ ok: false });
    });

    it('aceita a chave digitada em minúsculas e sem hífens', async () => {
      const digitada = chave.toLowerCase().replace(/-/g, ' ');
      expect(await recarregado.recuperarAcesso(digitada, OUTRA_SENHA_TESTE)).toEqual({ ok: true });
    });

    it('recusa chave de recuperação errada', async () => {
      const outra = recarregado.gerarChaveRecuperacao();
      expect(await recarregado.recuperarAcesso(outra, OUTRA_SENHA_TESTE)).toEqual({
        ok: false,
        motivo: 'chave-incorreta',
      });
      expect(recarregado.estado()).toBe('bloqueado');
    });

    it('exige nova senha forte', async () => {
      await expect(recarregado.recuperarAcesso(chave, 'fraca')).rejects.toEqual(
        erro('senha-fraca'),
      );
    });
  });

  describe('trocarSenha (RF-004)', () => {
    beforeEach(() => criarCofre());

    it('troca a senha: a nova passa a valer e a antiga não', async () => {
      expect(await cofre.trocarSenha(SENHA_TESTE, OUTRA_SENHA_TESTE)).toEqual({ ok: true });

      expect(await recarregar().desbloquear(OUTRA_SENHA_TESTE)).toEqual({ ok: true });
      expect(await recarregar().desbloquear(SENHA_TESTE)).toMatchObject({ ok: false });
    });

    it('exige a senha atual correta', async () => {
      expect(await cofre.trocarSenha('senha atual errada', OUTRA_SENHA_TESTE)).toEqual({
        ok: false,
        motivo: 'senha-incorreta',
      });
    });

    it('recusa nova senha igual à atual', async () => {
      expect(await cofre.trocarSenha(SENHA_TESTE, SENHA_TESTE)).toEqual({
        ok: false,
        motivo: 'senha-igual',
      });
    });

    it('recusa nova senha fraca', async () => {
      await expect(cofre.trocarSenha(SENHA_TESTE, 'abc')).rejects.toEqual(erro('senha-fraca'));
    });

    it('só funciona com o cofre desbloqueado', async () => {
      cofre.bloquear();
      await expect(cofre.trocarSenha(SENHA_TESTE, OUTRA_SENHA_TESTE)).rejects.toEqual(
        erro('cofre-bloqueado'),
      );
    });
  });

  describe('trocarChaveRecuperacao (RF-007)', () => {
    let chaveAntiga: string;

    beforeEach(async () => {
      chaveAntiga = await criarCofre();
    });

    it('a nova chave passa a valer e a anterior é invalidada', async () => {
      const nova = cofre.gerarChaveRecuperacao();
      expect(await cofre.trocarChaveRecuperacao(SENHA_TESTE, nova)).toEqual({ ok: true });

      expect(await recarregar().recuperarAcesso(chaveAntiga, OUTRA_SENHA_TESTE)).toEqual({
        ok: false,
        motivo: 'chave-incorreta',
      });
      expect(await recarregar().recuperarAcesso(nova, OUTRA_SENHA_TESTE)).toEqual({ ok: true });
    });

    it('exige a senha mestra', async () => {
      const nova = cofre.gerarChaveRecuperacao();
      expect(await cofre.trocarChaveRecuperacao('senha errada', nova)).toEqual({
        ok: false,
        motivo: 'senha-incorreta',
      });
      expect(await recarregar().recuperarAcesso(chaveAntiga, OUTRA_SENHA_TESTE)).toEqual({
        ok: true,
      });
    });
  });

  describe('definirBloqueioAutomatico (RF-005)', () => {
    beforeEach(() => criarCofre());

    it('salva o tempo escolhido', async () => {
      await cofre.definirBloqueioAutomatico(15);
      expect(cofre.bloqueioAutomaticoMinutos()).toBe(15);
      expect(repositorio.metadados?.configuracao.bloqueioAutomaticoMinutos).toBe(15);
    });

    it('recusa valores fora das opções', async () => {
      await expect(cofre.definirBloqueioAutomatico(0)).rejects.toThrow(RangeError);
    });
  });

  describe('apagar (RF-006, RN-010)', () => {
    beforeEach(() => criarCofre());

    it('exige a frase de confirmação exata e não apaga nada se ela estiver errada', async () => {
      await expect(cofre.apagar('apagar')).rejects.toEqual(erro('frase-incorreta'));
      expect(repositorio.apagado).toBe(false);
      expect(cofre.estado()).toBe('desbloqueado');
    });

    it('apaga todos os dados e volta ao estado inicial', async () => {
      await cofre.apagar(FRASE_APAGAR_COFRE);

      expect(repositorio.apagado).toBe(true);
      expect(repositorio.metadados).toBeNull();
      expect(cofre.estado()).toBe('inexistente');
      expect(() => cofre.chaveDeDados()).toThrow(ErroCofre);
    });

    it('funciona com o cofre bloqueado (quem perdeu senha e chave pode recomeçar)', async () => {
      const recarregado = recarregar();
      await recarregado.inicializar();
      await recarregado.apagar(FRASE_APAGAR_COFRE);
      expect(recarregado.estado()).toBe('inexistente');
    });
  });
});
