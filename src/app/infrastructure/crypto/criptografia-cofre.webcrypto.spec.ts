import {
  OUTRA_SENHA_TESTE as NOVA_SENHA,
  PARAMETROS_KDF_TESTE,
  SENHA_TESTE as SENHA,
} from '../../../testing/cofre';
import type { ChavesCofre } from '../../application/ports/cofre.ports';
import { CriptografiaCofreWebCrypto, PARAMETROS_KDF_PADRAO } from './criptografia-cofre.webcrypto';

describe('CriptografiaCofreWebCrypto (envelope encryption, §5.6)', () => {
  let cripto: CriptografiaCofreWebCrypto;
  let chaveRecuperacao: Uint8Array<ArrayBuffer>;

  beforeEach(() => {
    cripto = new CriptografiaCofreWebCrypto(PARAMETROS_KDF_TESTE);
    chaveRecuperacao = cripto.bytesAleatorios(20);
  });

  it('cria chaves que abrem com a senha e com a chave de recuperação', async () => {
    const { chaves, dek } = await cripto.criarChaves(SENHA, chaveRecuperacao);

    expect(dek).toBeTruthy();
    expect(await cripto.abrirComSenha(chaves, SENHA)).toBeTruthy();
    expect(await cripto.abrirComChaveRecuperacao(chaves, chaveRecuperacao)).toBeTruthy();
  });

  it('devolve null com senha errada, sem lançar erro (RF-002)', async () => {
    const { chaves } = await cripto.criarChaves(SENHA, chaveRecuperacao);
    expect(await cripto.abrirComSenha(chaves, 'senha errada qualquer')).toBeNull();
  });

  it('devolve null com chave de recuperação errada', async () => {
    const { chaves } = await cripto.criarChaves(SENHA, chaveRecuperacao);
    expect(await cripto.abrirComChaveRecuperacao(chaves, cripto.bytesAleatorios(20))).toBeNull();
  });

  it('a DEK em memória não é extraível (RNF-004)', async () => {
    const { dek } = await cripto.criarChaves(SENHA, chaveRecuperacao);
    const chave = dek as unknown as CryptoKey;

    expect(chave.extractable).toBe(false);
    await expect(crypto.subtle.exportKey('raw', chave)).rejects.toThrow();
  });

  it('as duas cópias da DEK abrem a mesma chave', async () => {
    const { chaves } = await cripto.criarChaves(SENHA, chaveRecuperacao);
    const pelaSenha = (await cripto.abrirComSenha(chaves, SENHA)) as unknown as CryptoKey;
    const pelaChave = (await cripto.abrirComChaveRecuperacao(
      chaves,
      chaveRecuperacao,
    )) as unknown as CryptoKey;

    const iv = new Uint8Array(12);
    const texto = new TextEncoder().encode('dado fictício');
    const cifrado = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, pelaSenha, texto);
    const decifrado = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, pelaChave, cifrado);
    expect(new TextDecoder().decode(decifrado)).toBe('dado fictício');
  });

  it('metadados não contêm a senha nem a chave em texto claro', async () => {
    const { chaves } = await cripto.criarChaves(SENHA, chaveRecuperacao);
    const json = JSON.stringify(chaves);

    expect(json).not.toContain(SENHA);
    expect(json).not.toContain(btoa(String.fromCharCode(...chaveRecuperacao)));
  });

  it('usa salt e IV diferentes em cada envelope e em cada cofre', async () => {
    const a = (await cripto.criarChaves(SENHA, chaveRecuperacao)).chaves;
    const b = (await cripto.criarChaves(SENHA, chaveRecuperacao)).chaves;
    const valores = [a.senha, a.recuperacao, b.senha, b.recuperacao].flatMap((e) => [e.salt, e.iv]);

    expect(new Set(valores).size).toBe(valores.length);
  });

  it('grava os parâmetros da KDF em cada envelope', async () => {
    const { chaves } = await cripto.criarChaves(SENHA, chaveRecuperacao);
    expect(chaves.senha.kdf).toEqual(PARAMETROS_KDF_TESTE);
    expect(chaves.recuperacao.kdf).toEqual(PARAMETROS_KDF_TESTE);
  });

  it('usa os parâmetros gravados no envelope ao abrir, mesmo que o padrão mude', async () => {
    const { chaves } = await cripto.criarChaves(SENHA, chaveRecuperacao);
    const outra = new CriptografiaCofreWebCrypto({ ...PARAMETROS_KDF_TESTE, iteracoes: 2 });
    expect(await outra.abrirComSenha(chaves, SENHA)).toBeTruthy();
  });

  it('não aceita um envelope no lugar do outro (AAD por finalidade)', async () => {
    const { chaves } = await cripto.criarChaves(SENHA, chaveRecuperacao);
    // Envelope de recuperação disfarçado de envelope de senha: mesma DEK, finalidade errada.
    const trocadas: ChavesCofre = { senha: chaves.recuperacao, recuperacao: chaves.senha };
    expect(await cripto.abrirComChaveRecuperacao(trocadas, chaveRecuperacao)).toBeNull();
  });

  it('detecta adulteração da DEK cifrada', async () => {
    const { chaves } = await cripto.criarChaves(SENHA, chaveRecuperacao);
    const bytes = Uint8Array.from(atob(chaves.senha.dekCifrada), (c) => c.charCodeAt(0));
    bytes[0]! ^= 0xff;
    const adulteradas: ChavesCofre = {
      ...chaves,
      senha: { ...chaves.senha, dekCifrada: btoa(String.fromCharCode(...bytes)) },
    };
    expect(await cripto.abrirComSenha(adulteradas, SENHA)).toBeNull();
  });

  it('trata senhas com acentos de forma equivalente em NFC e NFD', async () => {
    const nfc = 'Pão de queijo é ótimo'.normalize('NFC');
    const nfd = nfc.normalize('NFD');
    const { chaves } = await cripto.criarChaves(nfc, chaveRecuperacao);
    expect(await cripto.abrirComSenha(chaves, nfd)).toBeTruthy();
  });

  describe('trocarSenha (RF-004)', () => {
    it('a nova senha abre, a antiga deixa de abrir e a chave de recuperação continua valendo', async () => {
      const { chaves } = await cripto.criarChaves(SENHA, chaveRecuperacao);
      const novas = await cripto.trocarSenha(chaves, SENHA, NOVA_SENHA);

      expect(novas).not.toBeNull();
      expect(await cripto.abrirComSenha(novas!, NOVA_SENHA)).toBeTruthy();
      expect(await cripto.abrirComSenha(novas!, SENHA)).toBeNull();
      expect(await cripto.abrirComChaveRecuperacao(novas!, chaveRecuperacao)).toBeTruthy();
    });

    it('exige a senha atual correta', async () => {
      const { chaves } = await cripto.criarChaves(SENHA, chaveRecuperacao);
      expect(await cripto.trocarSenha(chaves, 'senha errada', NOVA_SENHA)).toBeNull();
    });
  });

  describe('redefinirSenhaComRecuperacao (RF-003)', () => {
    it('define nova senha usando a chave de recuperação e devolve a DEK', async () => {
      const { chaves } = await cripto.criarChaves(SENHA, chaveRecuperacao);
      const resultado = await cripto.redefinirSenhaComRecuperacao(
        chaves,
        chaveRecuperacao,
        NOVA_SENHA,
      );

      expect(resultado?.dek).toBeTruthy();
      expect(await cripto.abrirComSenha(resultado!.chaves, NOVA_SENHA)).toBeTruthy();
      expect(await cripto.abrirComSenha(resultado!.chaves, SENHA)).toBeNull();
    });

    it('devolve null com chave de recuperação errada', async () => {
      const { chaves } = await cripto.criarChaves(SENHA, chaveRecuperacao);
      expect(
        await cripto.redefinirSenhaComRecuperacao(chaves, cripto.bytesAleatorios(20), NOVA_SENHA),
      ).toBeNull();
    });
  });

  describe('trocarChaveRecuperacao (RF-007)', () => {
    it('a nova chave abre e a anterior é invalidada; a senha continua valendo', async () => {
      const { chaves } = await cripto.criarChaves(SENHA, chaveRecuperacao);
      const novaChave = cripto.bytesAleatorios(20);
      const novas = await cripto.trocarChaveRecuperacao(chaves, SENHA, novaChave);

      expect(await cripto.abrirComChaveRecuperacao(novas!, novaChave)).toBeTruthy();
      expect(await cripto.abrirComChaveRecuperacao(novas!, chaveRecuperacao)).toBeNull();
      expect(await cripto.abrirComSenha(novas!, SENHA)).toBeTruthy();
    });

    it('exige a senha mestra correta', async () => {
      const { chaves } = await cripto.criarChaves(SENHA, chaveRecuperacao);
      expect(
        await cripto.trocarChaveRecuperacao(chaves, 'senha errada', cripto.bytesAleatorios(20)),
      ).toBeNull();
    });
  });

  it('parâmetros de produção ficam acima do mínimo da OWASP (19 MiB, t=2)', () => {
    expect(
      PARAMETROS_KDF_PADRAO.memoriaKiB * PARAMETROS_KDF_PADRAO.iteracoes,
    ).toBeGreaterThanOrEqual(19_456 * 2);
  });
});
