import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  type OnInit,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CofrinhosService } from '../../application/cofrinhos/cofrinhos.service';
import { ContasService } from '../../application/contas/contas.service';
import { DadosService } from '../../application/dados/dados.service';
import { emAndamento, progresso, type TipoMovimentacao } from '../../domain/cofrinhos/cofrinho';
import { formatarDinheiro, lerDinheiro } from '../../domain/shared/dinheiro';
import { mensagemDeErro } from '../cofre/compartilhado/mensagens';
import { AvisoNavegacao } from '../compartilhado/aviso-navegacao';
import { mensagemValor, valorMonetario } from '../compartilhado/validadores-financeiros';

/** Página para depositar ou retirar (`/cofrinhos/:id/movimentar?tipo=...`, RF-031). */
@Component({
  selector: 'app-movimentar-cofrinho',
  imports: [ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="max-w-2xl space-y-6">
      <a class="botao-secundario" [routerLink]="['/cofrinhos', id()]"
        ><span aria-hidden="true">←</span> Voltar para o cofrinho</a
      >
      @if (cofrinho(); as c) {
        <div>
          <h1 tabindex="-1" class="text-3xl font-bold">
            {{ tipoAtual() === 'deposito' ? 'Depositar' : 'Retirar' }}: {{ c.nome }}
          </h1>
          <p class="mt-1 text-muted">Saldo atual do cofrinho: {{ saldo() }}</p>
        </div>

        <form class="space-y-4 cartao" [formGroup]="form" (ngSubmit)="registrar()" novalidate>
          <fieldset>
            <legend class="rotulo">Operação</legend>
            <div class="mt-1 flex gap-4">
              <label class="flex items-center gap-2"
                ><input type="radio" formControlName="tipo" value="deposito" /> Depositar</label
              >
              <label class="flex items-center gap-2"
                ><input type="radio" formControlName="tipo" value="retirada" /> Retirar</label
              >
            </div>
          </fieldset>
          <div>
            <label class="rotulo" for="mov-valor">Valor (R$)</label>
            <input
              id="mov-valor"
              class="campo"
              formControlName="valor"
              inputmode="decimal"
              [attr.aria-invalid]="tentou() && form.controls.valor.invalid"
            />
            @if (tentou() && form.controls.valor.invalid) {
              <p class="erro">{{ mensagemValor(form.controls.valor.errors) }}</p>
            }
          </div>
          <div>
            <label class="rotulo" for="mov-data">Data</label>
            <input id="mov-data" class="campo w-auto" type="date" formControlName="data" />
          </div>
          <div>
            <label class="rotulo" for="mov-conta">{{
              tipoAtual() === 'deposito' ? 'Sai da conta' : 'Volta para a conta'
            }}</label>
            <select
              id="mov-conta"
              class="campo"
              formControlName="contaId"
              [attr.aria-invalid]="tentou() && form.controls.contaId.invalid"
            >
              <option value="">Escolha…</option>
              @for (conta of contas.ativas(); track conta.id) {
                <option [value]="conta.id">{{ conta.nome }}</option>
              }
            </select>
            @if (tentou() && form.controls.contaId.invalid) {
              <p class="erro">Escolha uma conta.</p>
            }
          </div>
          @if (erro(); as m) {
            <p class="alerta-erro" role="alert">{{ m }}</p>
          }
          <div class="flex flex-wrap gap-3">
            <a class="botao-secundario" [routerLink]="['/cofrinhos', id()]">Cancelar</a>
            <button type="submit" class="botao-primario" [disabled]="salvando()">
              {{ tipoAtual() === 'deposito' ? 'Registrar depósito' : 'Registrar retirada' }}
            </button>
          </div>
        </form>
      } @else {
        <h1 tabindex="-1" class="text-3xl font-bold">Cofrinho não disponível</h1>
        <p class="aviso">Este cofrinho não existe ou está encerrado.</p>
      }
    </div>
  `,
})
export class MovimentarCofrinho implements OnInit {
  readonly id = input.required<string>();
  /** Query param `tipo`: abre o formulário já em depósito ou retirada. */
  readonly tipo = input<string>();

  private readonly cofrinhos = inject(CofrinhosService);
  protected readonly contas = inject(ContasService);
  private readonly dados = inject(DadosService);
  private readonly router = inject(Router);
  private readonly aviso = inject(AvisoNavegacao);
  protected readonly mensagemValor = mensagemValor;

  protected readonly form = inject(NonNullableFormBuilder).group({
    tipo: ['deposito' as TipoMovimentacao],
    valor: ['', [Validators.required, valorMonetario()]],
    data: [this.dados.hoje(), [Validators.required]],
    contaId: ['', [Validators.required]],
  });
  protected readonly tipoAtual = toSignal(this.form.controls.tipo.valueChanges, {
    initialValue: 'deposito' as TipoMovimentacao,
  });
  protected readonly tentou = signal(false);
  protected readonly salvando = signal(false);
  protected readonly erro = signal<string | null>(null);

  protected readonly cofrinho = computed(() => {
    const c = this.dados.cofrinhos().find((x) => x.id === this.id() && x.excluidoEm === null);
    return c && emAndamento(c) ? c : null;
  });
  protected readonly saldo = computed(() => {
    const c = this.cofrinho();
    return c ? formatarDinheiro(progresso(c).saldo) : '';
  });

  ngOnInit(): void {
    if (this.tipo() === 'retirada') this.form.controls.tipo.setValue('retirada');
  }

  protected async registrar(): Promise<void> {
    this.tentou.set(true);
    this.erro.set(null);
    const v = this.form.getRawValue();
    const valor = lerDinheiro(v.valor);
    if (this.form.invalid || !valor) return;
    this.salvando.set(true);
    try {
      const mov = { valor, data: v.data, contaId: v.contaId };
      if (v.tipo === 'deposito') await this.cofrinhos.depositar(this.id(), mov);
      else await this.cofrinhos.retirar(this.id(), mov);
      this.aviso.definir(v.tipo === 'deposito' ? 'Depósito registrado.' : 'Retirada registrada.');
      await this.router.navigate(['/cofrinhos', this.id()]);
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    } finally {
      this.salvando.set(false);
    }
  }
}
