import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import type { ChaveDeDados } from '../../application/ports/cofre.ports';
import { ArmazenamentoDadosIdb, DadosCorrompidosError } from './armazenamento-dados.idb';
import { BancoIdb } from './banco-idb';
import { RepositorioCofreIdb } from './repositorio-cofre.idb';

const novaDek = async () =>
  (await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ])) as unknown as ChaveDeDados;

describe('ArmazenamentoDadosIdb (RN-001, RNF-013)', () => {
  let banco: BancoIdb;
  let armazenamento: ArmazenamentoDadosIdb;
  let dek: ChaveDeDados;

  beforeEach(async () => {
    banco = new BancoIdb(`finmanager-teste-${crypto.randomUUID()}`);
    armazenamento = new ArmazenamentoDadosIdb(banco);
    dek = await novaDek();
  });

  afterEach(() => banco.apagar());

  const blocoBruto = async (colecao: string) =>
    JSON.stringify(await (await banco.abrir()).get('dados', colecao));

  it('coleção nunca gravada retorna null', async () => {
    expect(await armazenamento.ler(dek, 'transacoes')).toBeNull();
  });

  it('grava e lê de volta os itens', async () => {
    const itens = [
      { id: '1', descricao: 'Padaria fictícia', valor: { unidades: 1250, moeda: 'BRL' } },
    ];
    await armazenamento.gravar(dek, { transacoes: itens });
    expect(await armazenamento.ler(dek, 'transacoes')).toEqual(itens);
  });

  it('o que fica no IndexedDB é ilegível', async () => {
    await armazenamento.gravar(dek, { transacoes: [{ descricao: 'Padaria fictícia' }] });
    expect(await blocoBruto('transacoes')).not.toContain('Padaria');
  });

  it('grava várias coleções juntas', async () => {
    await armazenamento.gravar(dek, { contas: [{ id: 'c' }], historico: [{ id: 'e' }] });
    expect(await armazenamento.ler(dek, 'contas')).toEqual([{ id: 'c' }]);
    expect(await armazenamento.ler(dek, 'historico')).toEqual([{ id: 'e' }]);
  });

  it('usa um IV novo a cada gravação', async () => {
    await armazenamento.gravar(dek, { contas: [] });
    const primeiro = await blocoBruto('contas');
    await armazenamento.gravar(dek, { contas: [] });
    expect(await blocoBruto('contas')).not.toBe(primeiro);
  });

  it('com outra chave, recusa os dados em vez de devolver lixo', async () => {
    await armazenamento.gravar(dek, { contas: [{ id: 'c' }] });
    await expect(armazenamento.ler(await novaDek(), 'contas')).rejects.toThrow(
      DadosCorrompidosError,
    );
  });

  it('um bloco não pode ser trocado por outro (AAD por coleção)', async () => {
    await armazenamento.gravar(dek, { contas: [{ id: 'c' }] });
    const bd = await banco.abrir();
    await bd.put('dados', (await bd.get('dados', 'contas'))!, 'transacoes');
    await expect(armazenamento.ler(dek, 'transacoes')).rejects.toThrow(DadosCorrompidosError);
  });
});

describe('BancoIdb: migração da versão 1 para a 2', () => {
  it('mantém o cofre existente e cria a store de dados', async () => {
    const nome = `finmanager-migracao-${crypto.randomUUID()}`;
    const v1 = await openDB(nome, 1, { upgrade: (bd) => bd.createObjectStore('cofre') });
    await v1.put('cofre', { versao: 1, marcador: 'cofre antigo' }, 'metadados');
    v1.close();

    const banco = new BancoIdb(nome);
    const metadados = await new RepositorioCofreIdb(banco).ler();
    expect(metadados).toMatchObject({ marcador: 'cofre antigo' });
    expect((await banco.abrir()).objectStoreNames.contains('dados')).toBe(true);
    await banco.apagar();
  });
});
