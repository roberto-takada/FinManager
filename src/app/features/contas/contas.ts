import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ContasService } from '../../application/contas/contas.service';
import { type ContaFinanceira, type TipoConta, TIPOS_CONTA } from '../../domain/contas/conta';
import {
  formatarDinheiro,
  lerDinheiro,
  paraTextoEditavel,
  zero,
} from '../../domain/shared/dinheiro';
import { DialogoConfirmacao } from '../../ui/dialogo-confirmacao/dialogo-confirmacao';
import { mensagemDeErro } from '../cofre/compartilhado/mensagens';
import { valorMonetario } from '../compartilhado/validadores-financeiros';

/** Contas financeiras e saldos (RF-016). */
@Component({
  selector: 'app-contas',
  imports: [ReactiveFormsModule, DialogoConfirmacao],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-6">
      <h1 tabindex="-1" class="text-3xl font-bold">Contas</h1>

      @if (contas.ativas().length === 0) {
        <p>Você ainda não tem contas. Cadastre a primeira abaixo.</p>
      } @else {
        <div class="overflow-x-auto">
          <table class="w-full text-left">
            <caption class="sr-only">
              Contas e saldos atuais
            </caption>
            <thead>
              <tr>
                <th scope="col">Conta</th>
                <th scope="col">Tipo</th>
                <th scope="col">Saldo atual</th>
                <th scope="col"><span class="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              @for (c of contas.ativas(); track c.id) {
                <tr data-conta>
                  <td>{{ c.nome }}</td>
                  <td>{{ tipos[c.tipo] }}</td>
                  <td data-saldo>{{ saldo(c) }}</td>
                  <td class="flex gap-2">
                    <button
                      type="button"
                      class="link"
                      (click)="editar(c)"
                      [attr.aria-label]="'Editar ' + c.nome"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      class="link"
                      (click)="alvo.set(c)"
                      [attr.aria-label]="'Excluir ' + c.nome"
                    >
                      Excluir
                    </button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }

      <form
        class="space-y-4 cartao"
        [formGroup]="form"
        (ngSubmit)="salvar()"
        novalidate
        aria-labelledby="titulo-form-conta"
      >
        <h2 id="titulo-form-conta" class="text-xl font-semibold">
          {{ editando() ? 'Editar conta' : 'Nova conta' }}
        </h2>
        <div>
          <label class="rotulo" for="conta-nome">Nome da conta</label>
          <input id="conta-nome" class="campo" formControlName="nome" maxlength="60" />
        </div>
        <div>
          <label class="rotulo" for="conta-tipo">Tipo de conta</label>
          <select id="conta-tipo" class="campo" formControlName="tipo">
            @for (t of listaTipos; track t.valor) {
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
        @if (status(); as s) {
          <p role="status">{{ s }}</p>
        }
        <div class="flex flex-wrap gap-3">
          @if (editando()) {
            <button type="button" class="botao-secundario" (click)="cancelarEdicao()">
              Cancelar edição
            </button>
          }
          <button type="submit" class="botao-primario">
            {{ editando() ? 'Salvar conta' : 'Adicionar conta' }}
          </button>
        </div>
      </form>
    </div>

    <app-dialogo-confirmacao
      titulo="Excluir conta?"
      [mensagem]="mensagemExclusao()"
      rotuloConfirmar="Excluir conta"
      [perigoso]="true"
      [aberto]="!!alvo()"
      (confirmado)="excluir()"
      (cancelado)="alvo.set(null)"
    >
      <p>Ela vai para a lixeira e pode ser restaurada por 180 dias.</p>
    </app-dialogo-confirmacao>
  `,
})
export class Contas {
  protected readonly contas = inject(ContasService);
  protected readonly tipos = TIPOS_CONTA;
  protected readonly listaTipos = (Object.keys(TIPOS_CONTA) as TipoConta[]).map((valor) => ({
    valor,
    rotulo: TIPOS_CONTA[valor],
  }));

  protected readonly form = inject(NonNullableFormBuilder).group({
    nome: ['', [Validators.required]],
    tipo: ['corrente' as TipoConta],
    saldoInicial: ['0,00', [valorMonetario({ permitirNegativoOuZero: true })]],
  });
  protected readonly editando = signal<ContaFinanceira | null>(null);
  protected readonly alvo = signal<ContaFinanceira | null>(null);
  protected readonly erro = signal<string | null>(null);
  protected readonly status = signal<string | null>(null);
  protected readonly mensagemExclusao = computed(() =>
    this.alvo() ? `A conta "${this.alvo()!.nome}" será excluída.` : '',
  );

  protected saldo(conta: ContaFinanceira): string {
    return formatarDinheiro(this.contas.saldos().get(conta.id) ?? conta.saldoInicial);
  }

  protected editar(conta: ContaFinanceira): void {
    this.editando.set(conta);
    this.erro.set(null);
    this.form.setValue({
      nome: conta.nome,
      tipo: conta.tipo,
      saldoInicial: paraTextoEditavel(conta.saldoInicial),
    });
  }

  protected cancelarEdicao(): void {
    this.editando.set(null);
    this.form.reset();
  }

  protected async salvar(): Promise<void> {
    this.erro.set(null);
    this.status.set(null);
    const v = this.form.getRawValue();
    const saldoInicial = v.saldoInicial.trim() ? lerDinheiro(v.saldoInicial) : zero();
    if (!saldoInicial) {
      this.erro.set('Informe um saldo inicial válido, por exemplo 1.234,56.');
      return;
    }
    // Limpa já ao enviar: o que o usuário digitar enquanto salva não é apagado depois.
    const conta = this.editando();
    this.cancelarEdicao();
    try {
      const dados = { nome: v.nome, tipo: v.tipo, saldoInicial };
      if (conta) await this.contas.editar(conta.id, dados);
      else await this.contas.criar(dados);
      this.status.set(conta ? 'Conta salva.' : 'Conta adicionada.');
    } catch (e) {
      this.editando.set(conta);
      this.form.setValue(v);
      this.erro.set(mensagemDeErro(e));
    }
  }

  protected async excluir(): Promise<void> {
    const conta = this.alvo();
    this.alvo.set(null);
    if (!conta) return;
    this.erro.set(null);
    try {
      await this.contas.excluir(conta.id);
      this.status.set('Conta excluída. Ela está na lixeira.');
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    }
  }
}
