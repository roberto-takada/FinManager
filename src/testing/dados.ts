import { TestBed } from '@angular/core/testing';
import { CofreService } from '../app/application/cofre/cofre.service';
import { DadosService } from '../app/application/dados/dados.service';
import type { ChaveDeDados } from '../app/application/ports/cofre.ports';
import { CRIPTOGRAFIA_COFRE, REPOSITORIO_COFRE } from '../app/application/ports/cofre.ports';
import {
  ARMAZENAMENTO_DADOS,
  type ArmazenamentoDados,
  type Colecao,
  GERADOR_ID,
  RELOGIO,
} from '../app/application/ports/dados.ports';
import { CriptografiaCofreWebCrypto } from '../app/infrastructure/crypto/criptografia-cofre.webcrypto';
import { PARAMETROS_KDF_TESTE, RepositorioCofreEmMemoria, SENHA_TESTE } from './cofre';

/** Armazenamento em memória que permite inspecionar o que foi gravado e simular falhas. */
export class ArmazenamentoEmMemoria implements ArmazenamentoDados {
  readonly colecoes = new Map<Colecao, unknown[]>();
  gravacoes = 0;
  falharProxima = false;

  async ler(_dek: ChaveDeDados, colecao: Colecao) {
    const itens = this.colecoes.get(colecao);
    return itens ? structuredClone(itens) : null;
  }

  async gravar(_dek: ChaveDeDados, alteracoes: Partial<Record<Colecao, readonly unknown[]>>) {
    if (this.falharProxima) {
      this.falharProxima = false;
      throw new Error('Falha simulada de gravação');
    }
    this.gravacoes++;
    for (const [colecao, itens] of Object.entries(alteracoes)) {
      this.colecoes.set(colecao as Colecao, structuredClone([...itens]));
    }
  }
}

export interface AmbienteDados {
  readonly cofre: CofreService;
  readonly dados: DadosService;
  readonly armazenamento: ArmazenamentoEmMemoria;
  /** Muda o "agora" do app. */
  definirAgora(instante: string): void;
  /** Bloqueia e desbloqueia o cofre (como ao reabrir o app), esperando os dados carregarem. */
  reabrir(): Promise<void>;
}

/** Configura o TestBed com cofre criado e desbloqueado e dados carregados. */
export async function prepararAmbienteDados(
  agoraInicial = '2026-11-08T12:00:00.000Z',
  armazenamento = new ArmazenamentoEmMemoria(),
): Promise<AmbienteDados> {
  let agora = new Date(agoraInicial);
  let id = 0;
  TestBed.configureTestingModule({
    providers: [
      {
        provide: CRIPTOGRAFIA_COFRE,
        useValue: new CriptografiaCofreWebCrypto(PARAMETROS_KDF_TESTE),
      },
      { provide: REPOSITORIO_COFRE, useValue: new RepositorioCofreEmMemoria() },
      { provide: ARMAZENAMENTO_DADOS, useValue: armazenamento },
      { provide: RELOGIO, useValue: () => agora },
      { provide: GERADOR_ID, useValue: () => `id-${++id}` },
    ],
  });
  const cofre = TestBed.inject(CofreService);
  const dados = TestBed.inject(DadosService);
  await cofre.criar(SENHA_TESTE, cofre.gerarChaveRecuperacao(), true);
  TestBed.tick();
  await dados.carregar();

  return {
    cofre,
    dados,
    armazenamento,
    definirAgora: (instante) => {
      agora = new Date(instante);
    },
    reabrir: async () => {
      cofre.bloquear();
      TestBed.tick();
      await cofre.desbloquear(SENHA_TESTE);
      TestBed.tick();
      await dados.carregar();
    },
  };
}
