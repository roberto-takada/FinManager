import { TestBed } from '@angular/core/testing';
import { SENHA_TESTE } from '../../../testing/cofre';
import { type AmbienteDados, prepararAmbienteDados } from '../../../testing/dados';
import { brl } from '../../../testing/fabricas';
import { ContasService } from '../contas/contas.service';
import { PerfilService } from '../perfil/perfil.service';
import { CIFRADOR_BACKUP } from '../ports/backup.ports';
import { CRIPTOGRAFIA_COFRE } from '../ports/cofre.ports';
import { type ArquivoBackup, BackupService } from './backup.service';

describe('BackupService: exportar todos os dados (RF-084, RF-090)', () => {
  let amb: AmbienteDados;

  beforeEach(async () => {
    amb = await prepararAmbienteDados();
    await TestBed.inject(ContasService).criar({
      nome: 'Banco Secreto',
      tipo: 'corrente',
      saldoInicial: brl(123_456),
    });
    await TestBed.inject(PerfilService).salvar({
      nome: 'Ana Exemplo',
      email: 'ana@example.com',
      avatar: { tipo: 'iniciais', cor: 'aqua' },
    });
  });

  it('gera um .json cujo cabeçalho não revela nada dos dados', async () => {
    const { nome, conteudo } = await TestBed.inject(BackupService).exportar();
    expect(nome).toBe('finmanager-backup-2026-11-08.json');
    expect(conteudo).not.toContain('Banco Secreto');
    expect(conteudo).not.toContain('Ana Exemplo');
    expect(conteudo).not.toContain('123456');
    const arquivo = JSON.parse(conteudo) as ArquivoBackup;
    expect(Object.keys(arquivo)).toEqual([
      'app',
      'formatVersion',
      'exportedAt',
      'keys',
      'cipher',
      'payload',
    ]);
    expect(arquivo).toMatchObject({
      app: 'FinManager',
      formatVersion: 1,
      exportedAt: '2026-11-08T12:00:00.000Z',
      cipher: { algorithm: 'AES-256-GCM' },
    });
  });

  it('abre com a senha mestra vigente e contém todas as coleções (RN-012, QA-010)', async () => {
    const arquivo = JSON.parse(
      (await TestBed.inject(BackupService).exportar()).conteudo,
    ) as ArquivoBackup;
    const dek = await TestBed.inject(CRIPTOGRAFIA_COFRE).abrirComSenha(
      { senha: arquivo.keys.password, recuperacao: arquivo.keys.recovery },
      SENHA_TESTE,
    );
    expect(dek).not.toBeNull();
    const claro = JSON.parse(
      await TestBed.inject(CIFRADOR_BACKUP).decifrar(dek!, {
        iv: arquivo.cipher.iv,
        dados: arquivo.payload,
      }),
    ) as { versao: number; colecoes: Record<string, unknown[]> };
    expect(claro.versao).toBe(1);
    expect(Object.keys(claro.colecoes)).toEqual([
      'contas',
      'categorias',
      'transacoes',
      'recorrencias',
      'historico',
      'contasAgendadas',
      'cofrinhos',
      'preferencias',
      'perfil',
    ]);
    expect(claro.colecoes['contas']).toEqual(amb.dados.contas());
    expect(claro.colecoes['perfil']).toEqual([expect.objectContaining({ nome: 'Ana Exemplo' })]);
  });

  it('um arquivo adulterado não decifra (integridade, RF-093)', async () => {
    const arquivo = JSON.parse(
      (await TestBed.inject(BackupService).exportar()).conteudo,
    ) as ArquivoBackup;
    const bytes = atob(arquivo.payload).split('');
    bytes[10] = String.fromCharCode(bytes[10]!.charCodeAt(0) ^ 1);
    await expect(
      TestBed.inject(CIFRADOR_BACKUP).decifrar(amb.cofre.chaveDeDados(), {
        iv: arquivo.cipher.iv,
        dados: btoa(bytes.join('')),
      }),
    ).rejects.toThrow();
  });

  it('cada exportação usa um IV novo', async () => {
    const backup = TestBed.inject(BackupService);
    const a = JSON.parse((await backup.exportar()).conteudo) as ArquivoBackup;
    const b = JSON.parse((await backup.exportar()).conteudo) as ArquivoBackup;
    expect(a.cipher.iv).not.toBe(b.cipher.iv);
  });

  it('com o cofre bloqueado, não exporta', async () => {
    amb.cofre.bloquear();
    await expect(TestBed.inject(BackupService).exportar()).rejects.toThrow();
  });
});
