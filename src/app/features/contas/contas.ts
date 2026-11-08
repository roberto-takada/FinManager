import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ContasService } from '../../application/contas/contas.service';
import { type ContaFinanceira, TIPOS_CONTA } from '../../domain/contas/conta';
import { formatarDinheiro } from '../../domain/shared/dinheiro';
import { DialogoConfirmacao } from '../../ui/dialogo-confirmacao/dialogo-confirmacao';
import { mensagemDeErro } from '../cofre/compartilhado/mensagens';
import { AvisoNavegacao } from '../compartilhado/aviso-navegacao';

/** Contas financeiras e saldos (RF-016). Criar e editar ficam em páginas próprias. */
@Component({
  selector: 'app-contas',
  imports: [RouterLink, DialogoConfirmacao],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-6">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h1 tabindex="-1" class="text-3xl font-bold">Contas</h1>
        <a class="botao-primario" routerLink="/contas/nova"
          ><span aria-hidden="true">+</span> Nova conta</a
        >
      </div>

      @if (mensagem(); as m) {
        <p
          [class]="erro() ? 'alerta-erro' : 'alerta-sucesso'"
          [attr.role]="erro() ? 'alert' : 'status'"
        >
          {{ m }}
        </p>
      }

      @if (contas.ativas().length === 0) {
        <p class="cartao text-muted">
          Você ainda não tem contas. Use "Nova conta" para cadastrar a primeira.
        </p>
      } @else {
        <div class="overflow-x-auto cartao">
          <table class="w-full text-left">
            <caption class="sr-only">
              Contas e saldos atuais
            </caption>
            <thead>
              <tr>
                <th scope="col">Conta</th>
                <th scope="col">Tipo</th>
                <th scope="col" class="text-right">Saldo atual</th>
                <th scope="col"><span class="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              @for (c of contas.ativas(); track c.id) {
                <tr data-conta>
                  <td class="font-medium">{{ c.nome }}</td>
                  <td>{{ tipos[c.tipo] }}</td>
                  <td class="text-right font-semibold tabular-nums" data-saldo>{{ saldo(c) }}</td>
                  <td class="whitespace-nowrap">
                    <div class="flex justify-end gap-2">
                      <a
                        class="botao-acao"
                        [routerLink]="['/contas', c.id, 'editar']"
                        [attr.aria-label]="'Editar ' + c.nome"
                        >Editar</a
                      >
                      <button
                        type="button"
                        class="botao-acao-perigo"
                        (click)="alvo.set(c)"
                        [attr.aria-label]="'Excluir ' + c.nome"
                      >
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
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
  protected readonly alvo = signal<ContaFinanceira | null>(null);
  protected readonly mensagem = signal<string | null>(inject(AvisoNavegacao).consumir());
  protected readonly erro = signal(false);
  protected readonly mensagemExclusao = computed(() =>
    this.alvo() ? `A conta "${this.alvo()!.nome}" será excluída.` : '',
  );

  protected saldo(conta: ContaFinanceira): string {
    return formatarDinheiro(this.contas.saldos().get(conta.id) ?? conta.saldoInicial);
  }

  protected async excluir(): Promise<void> {
    const conta = this.alvo();
    this.alvo.set(null);
    if (!conta) return;
    try {
      await this.contas.excluir(conta.id);
      this.erro.set(false);
      this.mensagem.set('Conta excluída. Ela está na lixeira.');
    } catch (e) {
      this.erro.set(true);
      this.mensagem.set(mensagemDeErro(e));
    }
  }
}
