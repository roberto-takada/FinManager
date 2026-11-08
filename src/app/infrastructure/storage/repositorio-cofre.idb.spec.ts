import 'fake-indexeddb/auto';
import type { MetadadosCofre } from '../../application/ports/cofre.ports';
import { BancoIdb } from './banco-idb';
import { FormatoCofreDesconhecidoError, RepositorioCofreIdb } from './repositorio-cofre.idb';

const envelope = {
  kdf: { algoritmo: 'argon2id', memoriaKiB: 1024, iteracoes: 1, paralelismo: 1 },
  salt: 'c2FsdA==',
  iv: 'aXY=',
  dekCifrada: 'ZGVr',
} as const;

const metadados: MetadadosCofre = {
  versao: 1,
  criadoEm: '2026-11-06T12:00:00.000Z',
  chaves: { senha: envelope, recuperacao: envelope },
  configuracao: { bloqueioAutomaticoMinutos: 5 },
};

describe('RepositorioCofreIdb', () => {
  let nome: string;
  let repositorio: RepositorioCofreIdb;

  beforeEach(() => {
    nome = `finmanager-teste-${crypto.randomUUID()}`;
    repositorio = new RepositorioCofreIdb(new BancoIdb(nome));
  });

  afterEach(async () => {
    await repositorio.apagarTudo();
  });

  it('retorna null quando ainda não existe cofre', async () => {
    expect(await repositorio.ler()).toBeNull();
  });

  it('salva e lê os metadados', async () => {
    await repositorio.salvar(metadados);
    expect(await repositorio.ler()).toEqual(metadados);
  });

  it('persiste entre instâncias (como ao recarregar a página)', async () => {
    await repositorio.salvar(metadados);
    expect(await new RepositorioCofreIdb(new BancoIdb(nome)).ler()).toEqual(metadados);
  });

  it('apagarTudo remove o banco inteiro (RF-006)', async () => {
    await repositorio.salvar(metadados);
    await repositorio.apagarTudo();

    expect(await repositorio.ler()).toBeNull();
    const bancos = await indexedDB.databases();
    expect(bancos.some((b) => b.name === nome)).toBe(true); // recriado vazio pelo ler()
  });

  it('apagarTudo não fica bloqueado por outra conexão aberta (outra aba)', async () => {
    const outraAba = new RepositorioCofreIdb(new BancoIdb(nome));
    await outraAba.salvar(metadados);

    await repositorio.apagarTudo();
    expect(await repositorio.ler()).toBeNull();
  });

  it('recusa metadados de versão desconhecida', async () => {
    await repositorio.salvar({ ...metadados, versao: 99 } as unknown as MetadadosCofre);
    await expect(repositorio.ler()).rejects.toThrow(FormatoCofreDesconhecidoError);
  });
});
