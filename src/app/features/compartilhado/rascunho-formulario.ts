import { DestroyRef, DOCUMENT, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { FormGroup } from '@angular/forms';
import { ActivatedRoute, type CanDeactivateFn, Router } from '@angular/router';
import { CofreService } from '../../application/cofre/cofre.service';
import { RascunhosService } from '../../application/rascunhos/rascunhos.service';
import type { Rascunho } from '../../domain/rascunhos/rascunho';

/** Espera depois da última tecla antes de gravar o rascunho (RNF-011: no máximo 2 s). */
export const ATRASO_RASCUNHO_MS = 600;

export interface OpcoesRascunho {
  /** Identifica o formulário, ex.: "transacao:nova" ou `transacao:editar:${id}`. */
  readonly chave: string;
  /** Nome do formulário para o usuário, ex.: "Nova transação". */
  readonly titulo: string;
}

/**
 * Estado global da edição de formulários: quais estão abertos com alterações, o aviso ao
 * fechar a aba (RF-072), a pergunta "Sair sem salvar?" e o rascunho a restaurar quando o
 * usuário escolhe "Restaurar" no aviso de rascunhos pendentes (RF-071).
 */
@Injectable({ providedIn: 'root' })
export class EdicaoFormularios {
  private readonly abertos = new Set<RascunhoFormulario>();
  private restaurarAoAbrir: string | null = null;

  /** Pergunta "Sair sem salvar?" em aberto, respondida pelo diálogo do shell. */
  readonly pedidoSaida = signal<{ titulo: string; responder: (sair: boolean) => void } | null>(
    null,
  );

  constructor() {
    // RF-072: fechar ou recarregar a aba com alterações não salvas pede confirmação do
    // navegador. O que já foi digitado também está no rascunho cifrado (RF-070).
    inject(DOCUMENT).defaultView?.addEventListener('beforeunload', (evento) => {
      if (this.haAlteracoes()) evento.preventDefault();
    });
  }

  haAlteracoes(): boolean {
    return [...this.abertos].some((f) => f.temAlteracoesPendentes());
  }

  registrar(formulario: RascunhoFormulario): () => void {
    this.abertos.add(formulario);
    return () => this.abertos.delete(formulario);
  }

  /** O formulário `chave` deve restaurar o rascunho assim que abrir. */
  pedirRestauracao(chave: string): void {
    this.restaurarAoAbrir = chave;
  }

  consumirRestauracao(chave: string): boolean {
    const pedido = this.restaurarAoAbrir === chave;
    this.restaurarAoAbrir = null;
    return pedido;
  }

  perguntarSaida(titulo: string): Promise<boolean> {
    this.pedidoSaida()?.responder(false);
    return new Promise((resolver) =>
      this.pedidoSaida.set({
        titulo,
        responder: (sair) => {
          this.pedidoSaida.set(null);
          resolver(sair);
        },
      }),
    );
  }
}

/**
 * Rascunho automático de um formulário (RN-002, RF-070, RF-071, RF-072).
 *
 * Uso: crie com `rascunhoDoFormulario(this.form)` num campo do componente, chame
 * `iniciar()` no fim do `ngOnInit` (depois de preencher o formulário com os dados atuais),
 * salve com `concluir(() => servico.salvar(...))` e coloque `<app-aviso-rascunho>` no
 * template e `canDeactivate: [confirmarSaida]` na rota.
 */
export class RascunhoFormulario {
  /** O formulário difere do que foi carregado. */
  readonly alterado = signal(false);
  /** Hora da última gravação automática do rascunho. */
  readonly salvoEm = signal<string | null>(null);
  /** Rascunho anterior encontrado ao abrir, aguardando "Restaurar" ou "Descartar". */
  readonly oferta = signal<Rascunho | null>(null);
  /** Mensagem curta para leitores de tela (restaurado/descartado). */
  readonly anuncio = signal('');

  private opcoes: OpcoesRascunho | null = null;
  private url = '';
  private base = '';
  private ativo = false;
  private concluido = false;
  private temporizador: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly form: FormGroup,
    private readonly rascunhos: RascunhosService,
    private readonly edicao: EdicaoFormularios,
    private readonly router: Router,
    private readonly rota: ActivatedRoute,
    destroyRef: DestroyRef,
  ) {
    form.valueChanges.pipe(takeUntilDestroyed(destroyRef)).subscribe(() => this.aoAlterar());
    const desregistrar = edicao.registrar(this);
    destroyRef.onDestroy(() => {
      clearTimeout(this.temporizador);
      desregistrar();
    });
  }

  get titulo(): string {
    return this.opcoes?.titulo ?? 'formulário';
  }

  temAlteracoesPendentes(): boolean {
    return this.ativo && !this.concluido && this.alterado();
  }

  /** Começa a observar o formulário a partir dos valores atuais e procura um rascunho. */
  iniciar(opcoes: OpcoesRascunho): void {
    this.opcoes = opcoes;
    this.url = this.urlAtual();
    this.base = serializar(this.form.getRawValue());
    this.ativo = true;
    const existente = this.rascunhos.buscar(opcoes.chave);
    if (!existente) return;
    if (this.edicao.consumirRestauracao(opcoes.chave)) this.aplicar(existente);
    else this.oferta.set(existente);
  }

  restaurar(): void {
    const rascunho = this.oferta();
    this.oferta.set(null);
    if (rascunho) this.aplicar(rascunho);
  }

  /** "Descartar": apaga o rascunho guardado; o formulário continua como está. */
  async descartar(): Promise<void> {
    this.oferta.set(null);
    clearTimeout(this.temporizador);
    await this.apagar();
    this.anuncio.set('Rascunho descartado.');
    // O que for digitado a partir de agora volta a ser guardado.
    if (this.alterado()) this.agendar();
  }

  /** Saiu sem salvar (confirmado no diálogo): o rascunho deixa de existir. */
  async abandonar(): Promise<void> {
    this.ativo = false;
    clearTimeout(this.temporizador);
    await this.apagar();
  }

  /** Salva o formulário e remove o rascunho na mesma gravação (RNF-013). */
  async concluir<R>(acao: () => Promise<R>): Promise<R> {
    if (!this.opcoes) return acao();
    clearTimeout(this.temporizador);
    this.ativo = false;
    try {
      const resultado = await this.rascunhos.concluir(this.opcoes.chave, acao);
      this.concluido = true;
      this.alterado.set(false);
      return resultado;
    } catch (erro) {
      this.ativo = true;
      if (this.alterado()) this.agendar();
      throw erro;
    }
  }

  private aoAlterar(): void {
    if (!this.ativo) return;
    this.alterado.set(serializar(this.form.getRawValue()) !== this.base);
    // Com um rascunho antigo à espera de resposta, não o sobrescreve sem o usuário decidir.
    if (this.oferta()) return;
    this.agendar();
  }

  private agendar(): void {
    clearTimeout(this.temporizador);
    this.temporizador = setTimeout(() => void this.gravar(), ATRASO_RASCUNHO_MS);
  }

  private async gravar(): Promise<void> {
    const opcoes = this.opcoes;
    if (!this.ativo || !opcoes) return;
    try {
      if (this.alterado()) {
        const salvo = await this.rascunhos.salvar({
          id: opcoes.chave,
          titulo: opcoes.titulo,
          url: this.url,
          valores: this.form.getRawValue() as Record<string, unknown>,
        });
        this.salvoEm.set(salvo.atualizadoEm);
      } else {
        // Voltou ao que estava: não há o que guardar.
        await this.apagar();
      }
    } catch {
      // Cofre bloqueado no meio do caminho: o rascunho anterior continua valendo.
    }
  }

  private async apagar(): Promise<void> {
    this.salvoEm.set(null);
    if (!this.opcoes || !this.rascunhos.buscar(this.opcoes.chave)) return;
    await this.rascunhos.descartar(this.opcoes.chave).catch(() => undefined);
  }

  private aplicar(rascunho: Rascunho): void {
    this.form.patchValue(rascunho.valores);
    this.form.markAsDirty();
    this.salvoEm.set(rascunho.atualizadoEm);
    this.anuncio.set('Rascunho restaurado. Confira os campos e salve.');
  }

  /** Endereço do formulário (o `router.url` ainda é o anterior durante a navegação). */
  private urlAtual(): string {
    const snapshot = this.rota.snapshot;
    const segmentos = snapshot.pathFromRoot.flatMap((r) => r.url.map((s) => s.path));
    return this.router.serializeUrl(
      this.router.createUrlTree(['/', ...segmentos], { queryParams: snapshot.queryParams }),
    );
  }
}

/** Cria o rascunho automático de `form` (chamar no contexto de injeção do componente). */
export function rascunhoDoFormulario(form: FormGroup): RascunhoFormulario {
  return new RascunhoFormulario(
    form,
    inject(RascunhosService),
    inject(EdicaoFormularios),
    inject(Router),
    inject(ActivatedRoute),
    inject(DestroyRef),
  );
}

export interface ComRascunho {
  readonly rascunho: RascunhoFormulario;
}

/**
 * RF-072: sair de um formulário com alterações não salvas pede confirmação. Com o cofre
 * bloqueado (manual ou por inatividade), sai sem perguntar: o rascunho cifrado fica para
 * ser restaurado depois do desbloqueio.
 */
export const confirmarSaida: CanDeactivateFn<ComRascunho> = (componente) => {
  const rascunho = componente.rascunho;
  if (!inject(CofreService).desbloqueado() || !rascunho.temAlteracoesPendentes()) return true;
  return inject(EdicaoFormularios)
    .perguntarSaida(rascunho.titulo)
    .then(async (sair) => {
      if (sair) await rascunho.abandonar();
      return sair;
    });
};

function serializar(valor: unknown): string {
  return JSON.stringify(valor);
}
