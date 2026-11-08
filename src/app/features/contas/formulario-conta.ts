import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  type OnInit,
  signal,
} from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ContasService } from '../../application/contas/contas.service';
import { DadosService } from '../../application/dados/dados.service';
import { type ContaFinanceira, type TipoConta, TIPOS_CONTA } from '../../domain/contas/conta';
import { lerDinheiro, paraTextoEditavel, zero } from '../../domain/shared/dinheiro';
import { mensagemDeErro } from '../cofre/compartilhado/mensagens';
import { AvisoNavegacao } from '../compartilhado/aviso-navegacao';
import { valorMonetario } from '../compartilhado/validadores-financeiros';

/** Página de criação (`/contas/nova`) e edição (`/contas/:id/editar`) de conta (RF-016). */
@Component({
  selector: 'app-formulario-conta',
  imports: [ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="max-w-2xl space-y-6">
      <a class="botao-secundario" routerLink="/contas"
        ><span aria-hidden="true">←</span> Voltar para as contas</a
      >
      <h1 tabindex="-1" class="text-3xl font-bold">
        {{ original() ? 'Editar conta' : 'Nova conta' }}
      </h1>

      @if (id() && !original()) {
        <p class="alerta-erro" role="alert">Conta não encontrada.</p>
      } @else {
        <form class="space-y-4 cartao" [formGroup]="form" (ngSubmit)="salvar()" novalidate>
          <div>
            <label class="rotulo" for="conta-nome">Nome da conta</label>
            <input
              id="conta-nome"
              class="campo"
              formControlName="nome"
              maxlength="60"
              [attr.aria-invalid]="tentou() && form.controls.nome.invalid"
            />
            @if (tentou() && form.controls.nome.invalid) {
              <p class="erro">Informe o nome da conta.</p>
            }
          </div>
          <div>
            <label class="rotulo" for="conta-tipo">Tipo de conta</label>
            <select id="conta-tipo" class="campo" formControlName="tipo">
              @for (t of tipos; track t.valor) {
                <option [value]="t.valor">{{ t.rotulo }}</option>
              }
            </select>
          </div>
          <div>
            <label class="rotulo" for="conta-saldo">Saldo inicial (R$)</label>
            <input
              id="conta-saldo"
              class="campo"
              formControlName="saldoInicial"
              inputmode="decimal"
              aria-describedby="conta-saldo-ajuda"
            />
            <p class="ajuda" id="conta-saldo-ajuda">
              Use valor negativo para dívidas, como a fatura atual do cartão.
            </p>
          </div>
          @if (erro(); as m) {
            <p class="alerta-erro" role="alert">{{ m }}</p>
          }
          <div class="flex flex-wrap gap-3">
            <a class="botao-secundario" routerLink="/contas">Cancelar</a>
            <button type="submit" class="botao-primario" [disabled]="salvando()">
              Salvar conta
            </button>
          </div>
        </form>
      }
    </div>
  `,
})
export class FormularioConta implements OnInit {
  /** Id da rota; ausente ao criar. */
  readonly id = input<string>();

  private readonly contas = inject(ContasService);
  private readonly dados = inject(DadosService);
  private readonly router = inject(Router);
  private readonly aviso = inject(AvisoNavegacao);

  protected readonly tipos = (Object.keys(TIPOS_CONTA) as TipoConta[]).map((valor) => ({
    valor,
    rotulo: TIPOS_CONTA[valor],
  }));
  protected readonly form = inject(NonNullableFormBuilder).group({
    nome: ['', [Validators.required]],
    tipo: ['corrente' as TipoConta],
    saldoInicial: ['0,00', [valorMonetario({ permitirNegativoOuZero: true })]],
  });
  protected readonly original = signal<ContaFinanceira | null>(null);
  protected readonly tentou = signal(false);
  protected readonly salvando = signal(false);
  protected readonly erro = signal<string | null>(null);

  ngOnInit(): void {
    const id = this.id();
    if (!id) return;
    const conta = this.dados.contas().find((c) => c.id === id && c.excluidoEm === null);
    if (!conta) return;
    this.original.set(conta);
    this.form.setValue({
      nome: conta.nome,
      tipo: conta.tipo,
      saldoInicial: paraTextoEditavel(conta.saldoInicial),
    });
  }

  protected async salvar(): Promise<void> {
    this.tentou.set(true);
    this.erro.set(null);
    const v = this.form.getRawValue();
    const saldoInicial = v.saldoInicial.trim() ? lerDinheiro(v.saldoInicial) : zero();
    if (this.form.invalid) return;
    if (!saldoInicial) {
      this.erro.set('Informe um saldo inicial válido, por exemplo 1.234,56.');
      return;
    }
    this.salvando.set(true);
    try {
      const dados = { nome: v.nome, tipo: v.tipo, saldoInicial };
      const original = this.original();
      if (original) await this.contas.editar(original.id, dados);
      else await this.contas.criar(dados);
      this.aviso.definir(original ? 'Conta salva.' : 'Conta adicionada.');
      await this.router.navigateByUrl('/contas');
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    } finally {
      this.salvando.set(false);
    }
  }
}
