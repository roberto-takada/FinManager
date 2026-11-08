import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AgendaService } from '../../application/agenda/agenda.service';
import {
  type ContaAgendada,
  rotuloSituacao,
  TIPOS_CONTA_AGENDADA,
} from '../../domain/agenda/conta-agendada';
import { FREQUENCIAS } from '../../domain/recorrencias/recorrencia';
import { formatarData } from '../../domain/shared/data';
import { formatarDinheiro } from '../../domain/shared/dinheiro';
import { DialogoConfirmacao } from '../../ui/dialogo-confirmacao/dialogo-confirmacao';
import { mensagemDeErro } from '../cofre/compartilhado/mensagens';
import { AvisoNavegacao } from '../compartilhado/aviso-navegacao';
import { ConfiguracaoNotificacoes } from './configuracao-notificacoes';

/** Contas a pagar e a receber (RF-020) e alertas (RF-024, RF-026). Criar e editar ficam em páginas próprias. */
@Component({
  selector: 'app-contas-agendadas',
  imports: [RouterLink, DialogoConfirmacao, ConfiguracaoNotificacoes],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-6">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h1 tabindex="-1" class="text-3xl font-bold">Contas a pagar e a receber</h1>
        <div class="flex flex-wrap items-center gap-3">
          <a class="botao-secundario" routerLink="/calendario">Ver no calendário</a>
          <a class="botao-primario" routerLink="/agenda/nova"
            ><span aria-hidden="true">+</span> Nova conta</a
          >
        </div>
      </div>

      @if (mensagem(); as m) {
        <p
          [class]="erro() ? 'alerta-erro' : 'alerta-sucesso'"
          [attr.role]="erro() ? 'alert' : 'status'"
        >
          {{ m }}
        </p>
      }

      @if (agenda.ativas().length === 0) {
        <p class="cartao text-muted">
          Nenhuma conta cadastrada. Use "Nova conta" para cadastrar contas a pagar ou a receber.
        </p>
      } @else {
        <div class="overflow-x-auto cartao">
          <table class="w-full text-left">
            <caption class="sr-only">
              Contas a pagar e a receber
            </caption>
            <thead>
              <tr>
                <th scope="col">Descrição</th>
                <th scope="col">Tipo</th>
                <th scope="col" class="text-right">Valor</th>
                <th scope="col">Repetição</th>
                <th scope="col">Próxima em aberto</th>
                <th scope="col"><span class="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              @for (c of agenda.ativas(); track c.id) {
                <tr data-conta-agendada>
                  <td class="font-medium">{{ c.descricao }}</td>
                  <td>
                    <span [class]="c.tipo === 'pagar' ? 'selo-negativo' : 'selo-positivo'">{{
                      tipos[c.tipo]
                    }}</span>
                  </td>
                  <td class="text-right tabular-nums">{{ formatar(c.valor) }}</td>
                  <td>{{ c.recorrencia ? frequencias[c.recorrencia.frequencia] : 'Única' }}</td>
                  <td>{{ proxima(c) }}</td>
                  <td class="whitespace-nowrap">
                    <div class="flex justify-end gap-2">
                      <a
                        class="botao-acao"
                        [routerLink]="['/agenda', c.id, 'editar']"
                        [attr.aria-label]="'Editar ' + c.descricao"
                        >Editar</a
                      >
                      <button
                        type="button"
                        class="botao-acao-perigo"
                        (click)="alvo.set(c)"
                        [attr.aria-label]="'Excluir ' + c.descricao"
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

      <app-configuracao-notificacoes />
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
      <p>
        Pagamentos já registrados continuam como transações. A conta vai para a lixeira por 180
        dias.
      </p>
    </app-dialogo-confirmacao>
  `,
})
export class ContasAgendadas {
  protected readonly agenda = inject(AgendaService);
  protected readonly tipos = TIPOS_CONTA_AGENDADA;
  protected readonly frequencias = FREQUENCIAS;
  protected readonly formatar = formatarDinheiro;

  protected readonly alvo = signal<ContaAgendada | null>(null);
  protected readonly mensagem = signal<string | null>(inject(AvisoNavegacao).consumir());
  protected readonly erro = signal(false);
  protected readonly mensagemExclusao = computed(() => {
    const c = this.alvo();
    return c ? `"${c.descricao}" e todos os vencimentos futuros saem do calendário.` : '';
  });

  protected proxima(conta: ContaAgendada): string {
    const o = this.agenda.proximaEmAberto(conta);
    return o
      ? `${formatarData(o.vencimento)} (${rotuloSituacao(conta.tipo, o.situacao)})`
      : 'Nenhuma';
  }

  protected async excluir(): Promise<void> {
    const conta = this.alvo();
    this.alvo.set(null);
    if (!conta) return;
    try {
      await this.agenda.excluir(conta.id);
      this.erro.set(false);
      this.mensagem.set('Conta excluída. Ela está na lixeira.');
    } catch (e) {
      this.erro.set(true);
      this.mensagem.set(mensagemDeErro(e));
    }
  }
}
