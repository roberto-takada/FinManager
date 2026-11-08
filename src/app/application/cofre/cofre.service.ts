import { computed, inject, Injectable, signal } from '@angular/core';
import {
  BYTES_CHAVE_RECUPERACAO,
  ChaveRecuperacaoInvalidaError,
  formatarChaveRecuperacao,
  lerChaveRecuperacao,
} from '../../domain/cofre/chave-recuperacao';
import { avaliarForcaSenha } from '../../domain/cofre/forca-senha';
import { atrasoAposFalhas } from '../../domain/cofre/tentativas';
import {
  type ChaveDeDados,
  type ChavesCofre,
  CRIPTOGRAFIA_COFRE,
  type MetadadosCofre,
  REPOSITORIO_COFRE,
} from '../ports/cofre.ports';

export type EstadoCofre = 'carregando' | 'inexistente' | 'bloqueado' | 'desbloqueado';
export type MotivoBloqueio = 'manual' | 'inatividade';

export type CodigoErroCofre =
  | 'cofre-existente'
  | 'cofre-inexistente'
  | 'cofre-bloqueado'
  | 'senha-fraca'
  | 'aviso-nao-aceito'
  | 'chave-invalida'
  | 'frase-incorreta';

export class ErroCofre extends Error {
  constructor(readonly codigo: CodigoErroCofre) {
    super(`Operação do cofre recusada: ${codigo}`);
    this.name = 'ErroCofre';
  }
}

export type ResultadoDesbloqueio =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly motivo: 'senha-incorreta' | 'aguarde';
      readonly aguardarMs: number;
    };

export type ResultadoOperacao<M extends string> =
  { readonly ok: true } | { readonly ok: false; readonly motivo: M };

/** Frase que o usuário precisa digitar para apagar o cofre (confirmação reforçada, RF-006). */
export const FRASE_APAGAR_COFRE = 'APAGAR TUDO';

export const BLOQUEIO_AUTOMATICO_PADRAO_MINUTOS = 5;
export const OPCOES_BLOQUEIO_AUTOMATICO_MINUTOS = [1, 5, 15, 30, 60] as const;

/**
 * Casos de uso do cofre: criar, desbloquear, bloquear, recuperar acesso, trocar senha,
 * trocar chave de recuperação, configurar bloqueio automático e apagar (RF-001 a RF-007).
 *
 * A DEK só existe neste serviço, em memória, enquanto o cofre está desbloqueado (RNF-004).
 * As confirmações de ações significativas (RN-003) são responsabilidade da interface;
 * aqui ficam as validações que não podem ser contornadas.
 */
@Injectable({ providedIn: 'root' })
export class CofreService {
  private readonly cripto = inject(CRIPTOGRAFIA_COFRE);
  private readonly repositorio = inject(REPOSITORIO_COFRE);

  private readonly _estado = signal<EstadoCofre>('carregando');
  private readonly _motivoBloqueio = signal<MotivoBloqueio | null>(null);
  private readonly _metadados = signal<MetadadosCofre | null>(null);

  readonly estado = this._estado.asReadonly();
  readonly motivoUltimoBloqueio = this._motivoBloqueio.asReadonly();
  readonly desbloqueado = computed(() => this._estado() === 'desbloqueado');
  readonly bloqueioAutomaticoMinutos = computed(
    () =>
      this._metadados()?.configuracao.bloqueioAutomaticoMinutos ??
      BLOQUEIO_AUTOMATICO_PADRAO_MINUTOS,
  );

  private dek: ChaveDeDados | null = null;
  private falhasConsecutivas = 0;
  private bloqueadoAte = 0;
  private inicializacao: Promise<void> | null = null;

  /** Lê os metadados do navegador. Idempotente: pode ser chamado por vários guards. */
  inicializar(): Promise<void> {
    this.inicializacao ??= this.repositorio.ler().then((metadados) => {
      this._metadados.set(metadados);
      this._estado.set(metadados ? 'bloqueado' : 'inexistente');
    });
    return this.inicializacao;
  }

  /** Gera uma nova chave de recuperação, ainda não associada ao cofre. */
  gerarChaveRecuperacao(): string {
    const bytes = this.cripto.bytesAleatorios(BYTES_CHAVE_RECUPERACAO);
    try {
      return formatarChaveRecuperacao(bytes);
    } finally {
      bytes.fill(0);
    }
  }

  /**
   * RF-001 + RF-003: cria o cofre. Só deve ser chamado depois que o usuário aceitou o
   * aviso de irrecuperabilidade (RN-013) e confirmou ter guardado a chave de recuperação.
   */
  async criar(senha: string, chaveRecuperacao: string, avisoAceito: boolean): Promise<void> {
    await this.inicializar();
    if (this._estado() !== 'inexistente') throw new ErroCofre('cofre-existente');
    if (!avisoAceito) throw new ErroCofre('aviso-nao-aceito');
    this.exigirSenhaForte(senha);
    const bytesChave = this.lerChave(chaveRecuperacao);

    try {
      const { chaves, dek } = await this.cripto.criarChaves(senha, bytesChave);
      const metadados: MetadadosCofre = {
        versao: 1,
        criadoEm: new Date().toISOString(),
        chaves,
        configuracao: { bloqueioAutomaticoMinutos: BLOQUEIO_AUTOMATICO_PADRAO_MINUTOS },
      };
      await this.repositorio.salvar(metadados);
      this._metadados.set(metadados);
      this.abrirSessao(dek);
    } finally {
      bytesChave.fill(0);
    }
  }

  /** RF-002 + RNF-006: desbloqueia com a senha mestra, com atraso progressivo após erros. */
  async desbloquear(senha: string): Promise<ResultadoDesbloqueio> {
    const chaves = await this.chavesAtuais();
    const espera = this.bloqueadoAte - Date.now();
    if (espera > 0) return { ok: false, motivo: 'aguarde', aguardarMs: espera };

    const dek = await this.cripto.abrirComSenha(chaves, senha);
    if (!dek) {
      this.falhasConsecutivas++;
      const aguardarMs = atrasoAposFalhas(this.falhasConsecutivas);
      this.bloqueadoAte = Date.now() + aguardarMs;
      return { ok: false, motivo: 'senha-incorreta', aguardarMs };
    }
    this.abrirSessao(dek);
    return { ok: true };
  }

  /** RF-002 / RF-005: descarta a chave da memória. */
  bloquear(motivo: MotivoBloqueio = 'manual'): void {
    if (this._estado() !== 'desbloqueado') return;
    this.dek = null;
    this._motivoBloqueio.set(motivo);
    this._estado.set('bloqueado');
  }

  /** RF-003: usa a chave de recuperação para definir uma nova senha mestra e desbloquear. */
  async recuperarAcesso(
    chaveRecuperacao: string,
    novaSenha: string,
  ): Promise<ResultadoOperacao<'chave-incorreta'>> {
    const chaves = await this.chavesAtuais();
    this.exigirSenhaForte(novaSenha);
    const bytesChave = this.lerChave(chaveRecuperacao);
    try {
      const resultado = await this.cripto.redefinirSenhaComRecuperacao(
        chaves,
        bytesChave,
        novaSenha,
      );
      if (!resultado) return { ok: false, motivo: 'chave-incorreta' };
      await this.salvarChaves(resultado.chaves);
      this.abrirSessao(resultado.dek);
      return { ok: true };
    } finally {
      bytesChave.fill(0);
    }
  }

  /** RF-004: troca a senha mestra, exigindo a atual. */
  async trocarSenha(
    senhaAtual: string,
    novaSenha: string,
  ): Promise<ResultadoOperacao<'senha-incorreta' | 'senha-igual'>> {
    const chaves = this.chavesDesbloqueadas();
    this.exigirSenhaForte(novaSenha);
    if (senhaAtual.normalize('NFC') === novaSenha.normalize('NFC')) {
      return { ok: false, motivo: 'senha-igual' };
    }
    const novas = await this.cripto.trocarSenha(chaves, senhaAtual, novaSenha);
    if (!novas) return { ok: false, motivo: 'senha-incorreta' };
    await this.salvarChaves(novas);
    return { ok: true };
  }

  /** RF-007: substitui a chave de recuperação (a anterior deixa de funcionar), exigindo a senha. */
  async trocarChaveRecuperacao(
    senha: string,
    novaChaveRecuperacao: string,
  ): Promise<ResultadoOperacao<'senha-incorreta'>> {
    const chaves = this.chavesDesbloqueadas();
    const bytesChave = this.lerChave(novaChaveRecuperacao);
    try {
      const novas = await this.cripto.trocarChaveRecuperacao(chaves, senha, bytesChave);
      if (!novas) return { ok: false, motivo: 'senha-incorreta' };
      await this.salvarChaves(novas);
      return { ok: true };
    } finally {
      bytesChave.fill(0);
    }
  }

  /** RF-005: define o tempo de inatividade até o bloqueio automático. */
  async definirBloqueioAutomatico(minutos: number): Promise<void> {
    const metadados = this._metadados();
    if (!metadados || !this.desbloqueado()) throw new ErroCofre('cofre-bloqueado');
    if (!(OPCOES_BLOQUEIO_AUTOMATICO_MINUTOS as readonly number[]).includes(minutos)) {
      throw new RangeError(`Tempo de bloqueio automático inválido: ${minutos}`);
    }
    await this.persistir({ ...metadados, configuracao: { bloqueioAutomaticoMinutos: minutos } });
  }

  /**
   * RF-006 / RN-010: apaga definitivamente todos os dados do navegador.
   * Funciona com o cofre bloqueado, para quem perdeu a senha e a chave poder recomeçar.
   */
  async apagar(fraseDigitada: string): Promise<void> {
    await this.inicializar();
    if (this._estado() === 'inexistente') throw new ErroCofre('cofre-inexistente');
    if (fraseDigitada.trim() !== FRASE_APAGAR_COFRE) throw new ErroCofre('frase-incorreta');

    this.dek = null;
    await this.repositorio.apagarTudo();
    this._metadados.set(null);
    this._motivoBloqueio.set(null);
    this.falhasConsecutivas = 0;
    this.bloqueadoAte = 0;
    this._estado.set('inexistente');
  }

  /** A DEK, para os repositórios de dados cifrados. Lança erro se o cofre estiver bloqueado. */
  chaveDeDados(): ChaveDeDados {
    if (!this.dek) throw new ErroCofre('cofre-bloqueado');
    return this.dek;
  }

  // ---------------------------------------------------------------------------

  private abrirSessao(dek: ChaveDeDados): void {
    this.dek = dek;
    this.falhasConsecutivas = 0;
    this.bloqueadoAte = 0;
    this._motivoBloqueio.set(null);
    this._estado.set('desbloqueado');
  }

  private async chavesAtuais(): Promise<ChavesCofre> {
    await this.inicializar();
    const metadados = this._metadados();
    if (!metadados) throw new ErroCofre('cofre-inexistente');
    return metadados.chaves;
  }

  private chavesDesbloqueadas(): ChavesCofre {
    const metadados = this._metadados();
    if (!metadados || !this.desbloqueado()) throw new ErroCofre('cofre-bloqueado');
    return metadados.chaves;
  }

  private async salvarChaves(chaves: ChavesCofre): Promise<void> {
    const metadados = this._metadados();
    if (!metadados) throw new ErroCofre('cofre-inexistente');
    await this.persistir({ ...metadados, chaves });
  }

  private async persistir(metadados: MetadadosCofre): Promise<void> {
    await this.repositorio.salvar(metadados);
    this._metadados.set(metadados);
  }

  private exigirSenhaForte(senha: string): void {
    if (!avaliarForcaSenha(senha).aceitavel) throw new ErroCofre('senha-fraca');
  }

  private lerChave(texto: string): Uint8Array<ArrayBuffer> {
    try {
      return lerChaveRecuperacao(texto);
    } catch (erro) {
      if (erro instanceof ChaveRecuperacaoInvalidaError) throw new ErroCofre('chave-invalida');
      throw erro;
    }
  }
}
