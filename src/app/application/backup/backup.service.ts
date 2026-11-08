import { inject, Injectable } from '@angular/core';
import { CofreService } from '../cofre/cofre.service';
import { DadosService } from '../dados/dados.service';
import { CIFRADOR_BACKUP } from '../ports/backup.ports';
import type { EnvelopeChave } from '../ports/cofre.ports';
import { COLECOES } from '../ports/dados.ports';

export const VERSAO_FORMATO_BACKUP = 1;
/** Versão do conteúdo decifrado (as coleções), independente da versão do cabeçalho. */
export const VERSAO_DADOS_BACKUP = 1;

/**
 * Arquivo de backup (ENGENHARIA_DE_SOFTWARE §5.7). O cabeçalho só tem o necessário para
 * decifrar; nada sobre os dados (nem quantidade de registros). As duas cópias da DEK são
 * as do cofre, então o arquivo abre com a senha mestra vigente na exportação ou com a
 * chave de recuperação (QA-010).
 */
export interface ArquivoBackup {
  readonly app: 'FinManager';
  readonly formatVersion: typeof VERSAO_FORMATO_BACKUP;
  readonly exportedAt: string;
  readonly keys: { readonly password: EnvelopeChave; readonly recovery: EnvelopeChave };
  readonly cipher: { readonly algorithm: 'AES-256-GCM'; readonly iv: string };
  readonly payload: string;
}

/**
 * Exportação de todos os dados (RF-084, RF-090, RN-010, RN-012). A importação (RF-091 a
 * RF-099) vem numa próxima versão.
 */
@Injectable({ providedIn: 'root' })
export class BackupService {
  private readonly cofre = inject(CofreService);
  private readonly dados = inject(DadosService);
  private readonly cifrador = inject(CIFRADOR_BACKUP);

  async exportar(): Promise<{ nome: string; conteudo: string }> {
    const chaves = this.cofre.chavesParaBackup();
    const colecoes = this.dados.colecoes();
    const conteudo = JSON.stringify({
      versao: VERSAO_DADOS_BACKUP,
      colecoes: Object.fromEntries(COLECOES.map((c) => [c, colecoes[c]])),
    });
    const cifrado = await this.cifrador.cifrar(this.cofre.chaveDeDados(), conteudo);
    const agora = this.dados.agora();
    const arquivo: ArquivoBackup = {
      app: 'FinManager',
      formatVersion: VERSAO_FORMATO_BACKUP,
      exportedAt: agora.toISOString(),
      keys: { password: chaves.senha, recovery: chaves.recuperacao },
      cipher: { algorithm: 'AES-256-GCM', iv: cifrado.iv },
      payload: cifrado.dados,
    };
    return {
      nome: `finmanager-backup-${this.dados.hoje()}.json`,
      conteudo: JSON.stringify(arquivo, null, 2),
    };
  }
}
