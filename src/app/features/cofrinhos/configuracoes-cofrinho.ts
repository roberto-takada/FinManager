import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  type OnInit,
  signal,
} from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CofrinhosService } from '../../application/cofrinhos/cofrinhos.service';
import { ContasService } from '../../application/contas/contas.service';
import { DadosService } from '../../application/dados/dados.service';
import { emAndamento, progresso } from '../../domain/cofrinhos/cofrinho';
import { formatarDinheiro, lerDinheiro, paraTextoEditavel } from '../../domain/shared/dinheiro';
import { DialogoConfirmacao } from '../../ui/dialogo-confirmacao/dialogo-confirmacao';
import { mensagemDeErro } from '../cofre/compartilhado/mensagens';
import { AvisoNavegacao } from '../compartilhado/aviso-navegacao';
import { CamposCofrinho, criarFormCofrinho } from './formulario-cofrinho';

type Acao = 'zerar' | 'encerrar' | 'excluir';

/**
 * Configurações do cofrinho (`/cofrinhos/:id/configuracoes`): editar (RF-030) e zerar,
 * encerrar ou excluir com confirmação (RF-034, RN-005 a/d).
 */
@Component({
  selector: 'app-configuracoes-cofrinho',
  imports: [ReactiveFormsModule, RouterLink, DialogoConfirmacao, CamposCofrinho],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="max-w-2xl space-y-6">
      <a class="botao-secundario" [routerLink]="['/cofrinhos', id()]"
        ><span aria-hidden="true">←</span> Voltar para o cofrinho</a
      >

      @if (cofrinho(); as c) {
        <div>
          <h1 tabindex="-1" class="text-3xl font-bold">Configurações do cofrinho</h1>
          <p class="mt-1 text-muted">{{ c.nome }} · saldo {{ saldo() }}</p>
        </div>

        @if (mensagem(); as m) {
          <p class="alerta-erro" role="alert">{{ m }}</p>
        }

        <form
          class="space-y-4 cartao"
          [formGroup]="form"
          (ngSubmit)="salvar()"
          novalidate
          aria-labelledby="titulo-editar"
        >
          <h2 id="titulo-editar" class="text-lg font-semibold">Editar cofrinho</h2>
          <app-campos-cofrinho [form]="form" [mostrarErros]="tentou()" />
          <button type="submit" class="botao-primario" [disabled]="processando()">
            Salvar alterações
          </button>
        </form>

        <section class="space-y-4 cartao" aria-labelledby="titulo-encerrar">
          <h2 id="titulo-encerrar" class="text-lg font-semibold">Zerar, encerrar ou excluir</h2>
          <div>
            <label class="rotulo" for="destino-conta">Conta que recebe o saldo</label>
            <select
              id="destino-conta"
              class="campo"
              [value]="contaDestino()"
              (change)="contaDestino.set($any($event.target).value)"
            >
              <option value="">Escolha…</option>
              @for (conta of contas.ativas(); track conta.id) {
                <option [value]="conta.id">{{ conta.nome }}</option>
              }
            </select>
          </div>
          <div class="flex flex-wrap gap-3">
            <button type="button" class="botao-secundario" (click)="pedir('zerar')">
              Zerar cofrinho…
            </button>
            <button type="button" class="botao-perigo" (click)="pedir('encerrar')">
              Encerrar cofrinho…
            </button>
            @if (c.movimentacoes.length === 0) {
              <button type="button" class="botao-perigo" (click)="confirmando.set('excluir')">
                Excluir cofrinho…
              </button>
            }
          </div>
          <p class="ajuda">
            Zerar devolve todo o saldo e mantém o cofrinho. Encerrar devolve o saldo e arquiva o
            cofrinho. Só cofrinhos sem movimentações podem ser excluídos.
          </p>
        </section>
      } @else {
        <h1 tabindex="-1" class="text-3xl font-bold">Cofrinho não disponível</h1>
        <p class="aviso">Este cofrinho não existe ou está encerrado.</p>
      }
    </div>

    <app-dialogo-confirmacao
      [titulo]="titulos[confirmando() ?? 'zerar']"
      [mensagem]="mensagemConfirmacao()"
      [rotuloConfirmar]="rotulos[confirmando() ?? 'zerar']"
      [perigoso]="true"
      [aberto]="confirmando() !== null"
      (confirmado)="executarConfirmado()"
      (cancelado)="confirmando.set(null)"
    >
      <p>A ação fica registrada no histórico.</p>
    </app-dialogo-confirmacao>
  `,
})
export class ConfiguracoesCofrinho implements OnInit {
  readonly id = input.required<string>();

  private readonly cofrinhos = inject(CofrinhosService);
  protected readonly contas = inject(ContasService);
  private readonly dados = inject(DadosService);
  private readonly router = inject(Router);
  private readonly aviso = inject(AvisoNavegacao);

  protected readonly titulos: Record<Acao, string> = {
    zerar: 'Zerar o cofrinho?',
    encerrar: 'Encerrar o cofrinho?',
    excluir: 'Excluir o cofrinho?',
  };
  protected readonly rotulos: Record<Acao, string> = {
    zerar: 'Zerar cofrinho',
    encerrar: 'Encerrar cofrinho',
    excluir: 'Excluir cofrinho',
  };

  protected readonly form = criarFormCofrinho(inject(NonNullableFormBuilder));
  protected readonly tentou = signal(false);
  protected readonly processando = signal(false);
  protected readonly contaDestino = signal('');
  protected readonly confirmando = signal<Acao | null>(null);
  protected readonly mensagem = signal<string | null>(null);

  protected readonly cofrinho = computed(() => {
    const c = this.dados.cofrinhos().find((x) => x.id === this.id() && x.excluidoEm === null);
    return c && emAndamento(c) ? c : null;
  });
  protected readonly saldo = computed(() => {
    const c = this.cofrinho();
    return c ? formatarDinheiro(progresso(c).saldo) : '';
  });
  protected readonly mensagemConfirmacao = computed(() => {
    const c = this.cofrinho();
    const acao = this.confirmando();
    if (!c || !acao) return '';
    const conta = this.dados.contas().find((x) => x.id === this.contaDestino())?.nome ?? '—';
    if (acao === 'zerar')
      return `${this.saldo()} voltarão para "${conta}". O cofrinho continua aberto, com saldo zero.`;
    if (acao === 'encerrar')
      return `${this.saldo()} voltarão para "${conta}" e "${c.nome}" será arquivado; não será possível movimentá-lo de novo.`;
    return `"${c.nome}" vai para a lixeira e pode ser restaurado por 180 dias.`;
  });

  ngOnInit(): void {
    const c = this.cofrinho();
    if (!c) return;
    this.form.setValue({
      nome: c.nome,
      meta: paraTextoEditavel(c.meta),
      prazo: c.prazo ?? '',
      icone: c.icone,
      cor: c.cor,
    });
  }

  protected async salvar(): Promise<void> {
    this.tentou.set(true);
    this.mensagem.set(null);
    const v = this.form.getRawValue();
    const meta = lerDinheiro(v.meta);
    if (this.form.invalid || !meta) return;
    await this.executar(
      () =>
        this.cofrinhos.editar(this.id(), {
          nome: v.nome,
          meta,
          prazo: v.prazo || null,
          icone: v.icone,
          cor: v.cor,
        }),
      'Cofrinho atualizado.',
      ['/cofrinhos', this.id()],
    );
  }

  /** RN-005 d: zerar/encerrar só depois de escolher a conta e confirmar. */
  protected pedir(acao: 'zerar' | 'encerrar'): void {
    if (!this.contaDestino()) {
      this.mensagem.set('Escolha a conta que recebe o saldo.');
      return;
    }
    this.mensagem.set(null);
    this.confirmando.set(acao);
  }

  protected async executarConfirmado(): Promise<void> {
    const acao = this.confirmando();
    this.confirmando.set(null);
    const destino = { contaId: this.contaDestino(), data: this.dados.hoje() };
    if (acao === 'zerar')
      await this.executar(() => this.cofrinhos.zerar(this.id(), destino), 'Cofrinho zerado.', [
        '/cofrinhos',
        this.id(),
      ]);
    if (acao === 'encerrar')
      await this.executar(
        () => this.cofrinhos.encerrar(this.id(), destino),
        'Cofrinho encerrado.',
        ['/cofrinhos', this.id()],
      );
    if (acao === 'excluir')
      await this.executar(
        () => this.cofrinhos.excluir(this.id()),
        'Cofrinho excluído. Ele está na lixeira.',
        ['/cofrinhos'],
      );
  }

  private async executar(
    acao: () => Promise<unknown>,
    sucesso: string,
    destino: string[],
  ): Promise<void> {
    this.processando.set(true);
    try {
      await acao();
      this.aviso.definir(sucesso);
      await this.router.navigate(destino);
    } catch (e) {
      this.mensagem.set(mensagemDeErro(e));
    } finally {
      this.processando.set(false);
    }
  }
}
