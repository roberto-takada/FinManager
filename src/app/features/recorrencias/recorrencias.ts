import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DadosService } from '../../application/dados/dados.service';
import { RecorrenciasService } from '../../application/recorrencias/recorrencias.service';
import {
  FREQUENCIAS,
  proximaOcorrencia,
  type Recorrencia,
} from '../../domain/recorrencias/recorrencia';
import { formatarData } from '../../domain/shared/data';
import { formatarDinheiro } from '../../domain/shared/dinheiro';
import { TIPOS_TRANSACAO } from '../../domain/transacoes/transacao';
import { DialogoConfirmacao } from '../../ui/dialogo-confirmacao/dialogo-confirmacao';
import { mensagemDeErro } from '../cofre/compartilhado/mensagens';

/** Transações recorrentes (RF-012). A criação é feita em "Nova transação". */
@Component({
  selector: 'app-recorrencias',
  imports: [RouterLink, DialogoConfirmacao],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-6">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h1 tabindex="-1" class="text-3xl font-bold">Recorrências</h1>
        <a class="botao-primario" routerLink="/transacoes/nova">Nova transação recorrente</a>
      </div>
      <p class="ajuda">
        As ocorrências são registradas como transações quando a data chega (ao abrir o app). Excluir
        uma recorrência não apaga as transações que ela já registrou.
      </p>

      @if (mensagem(); as m) {
        <p class="alerta-erro" role="alert">{{ m }}</p>
      }

      @if (recorrencias.ativas().length === 0) {
        <p>Nenhuma recorrência cadastrada.</p>
      } @else {
        <div class="overflow-x-auto">
          <table class="w-full text-left">
            <caption class="sr-only">
              Recorrências ativas
            </caption>
            <thead>
              <tr>
                <th scope="col">Descrição</th>
                <th scope="col">Tipo</th>
                <th scope="col">Valor</th>
                <th scope="col">Frequência</th>
                <th scope="col">Próxima</th>
                <th scope="col"><span class="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              @for (r of recorrencias.ativas(); track r.id) {
                <tr data-recorrencia>
                  <td>{{ r.modelo.descricao || '—' }}</td>
                  <td>{{ tipos[r.modelo.tipo] }}</td>
                  <td>{{ formatar(r.modelo.valor) }}</td>
                  <td>{{ frequencias[r.frequencia] }}</td>
                  <td>{{ proxima(r) }}</td>
                  <td>
                    <button
                      type="button"
                      class="link"
                      (click)="alvo.set(r)"
                      [attr.aria-label]="'Excluir recorrência ' + (r.modelo.descricao || '')"
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
    </div>

    <app-dialogo-confirmacao
      titulo="Excluir recorrência?"
      [mensagem]="mensagemExclusao()"
      rotuloConfirmar="Excluir recorrência"
      [perigoso]="true"
      [aberto]="!!alvo()"
      (confirmado)="excluir()"
      (cancelado)="alvo.set(null)"
    >
      <p>Novas ocorrências deixam de ser registradas. As transações já registradas continuam.</p>
    </app-dialogo-confirmacao>
  `,
})
export class Recorrencias {
  protected readonly recorrencias = inject(RecorrenciasService);
  private readonly dados = inject(DadosService);
  protected readonly frequencias = FREQUENCIAS;
  protected readonly tipos = TIPOS_TRANSACAO;
  protected readonly formatar = formatarDinheiro;
  protected readonly alvo = signal<Recorrencia | null>(null);
  protected readonly mensagem = signal<string | null>(null);
  protected readonly mensagemExclusao = computed(() =>
    this.alvo()
      ? `"${this.alvo()!.modelo.descricao || 'Recorrência'}" deixará de gerar transações.`
      : '',
  );

  protected proxima(r: Recorrencia): string {
    const data = proximaOcorrencia(r, r.geradaAte ?? this.dados.hoje());
    return data ? formatarData(data) : 'Encerrada';
  }

  protected async excluir(): Promise<void> {
    const r = this.alvo();
    this.alvo.set(null);
    if (!r) return;
    try {
      await this.recorrencias.excluir(r.id);
    } catch (e) {
      this.mensagem.set(mensagemDeErro(e));
    }
  }
}
