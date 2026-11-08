import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NotificacoesService } from '../../application/agenda/notificacoes.service';
import { OPCOES_ANTECEDENCIA_DIAS } from '../../domain/agenda/alertas';
import { mensagemDeErro } from '../cofre/compartilhado/mensagens';

/**
 * Alertas e notificações de vencimento (RF-024, RF-026).
 * A permissão do navegador só é pedida no clique em "Ativar notificações do navegador".
 */
@Component({
  selector: 'app-configuracao-notificacoes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="space-y-4 cartao" aria-labelledby="titulo-notificacoes">
      <h2 id="titulo-notificacoes" class="text-xl font-semibold">Alertas de vencimento</h2>

      <div>
        <label class="rotulo" for="antecedencia">Avisar sobre contas que vencem em até</label>
        <select id="antecedencia" class="campo w-auto" (change)="alterarAntecedencia($event)">
          @for (dias of opcoes; track dias) {
            <option
              [value]="dias"
              [selected]="dias === notificacoes.preferencias().antecedenciaDias"
            >
              {{ dias === 0 ? 'no próprio dia' : dias + (dias === 1 ? ' dia' : ' dias') }}
            </option>
          }
        </select>
        <p class="ajuda">Os alertas aparecem na tela Início ao desbloquear o cofre.</p>
      </div>

      <div class="space-y-2" data-estado-notificacoes>
        <h3 class="font-semibold">Notificações do navegador</h3>
        <p class="ajuda">
          Só funcionam com o FinManager aberto e o cofre desbloqueado: sem servidor, não há como
          avisar com o app fechado.
        </p>
        @switch (situacao()) {
          @case ('indisponivel') {
            <p>Este navegador não oferece notificações. Os alertas continuam na tela Início.</p>
          }
          @case ('bloqueada') {
            <p>
              As notificações estão bloqueadas nas configurações do navegador. Os alertas continuam
              na tela Início. Para recebê-las, libere a permissão do site no navegador.
            </p>
          }
          @case ('ativas') {
            <p>Notificações ativadas.</p>
            <button type="button" class="botao-secundario" (click)="desativar()">
              Desativar notificações
            </button>
          }
          @default {
            <p>Notificações desativadas.</p>
            <button type="button" class="botao-primario" (click)="ativar()">
              Ativar notificações do navegador
            </button>
          }
        }
      </div>

      <div class="flex items-start gap-2">
        <input
          id="detalhes-notificacao"
          type="checkbox"
          class="mt-1 size-5"
          [checked]="notificacoes.preferencias().mostrarDetalhes"
          (change)="alterarDetalhes($event)"
          aria-describedby="detalhes-ajuda"
        />
        <div>
          <label for="detalhes-notificacao">Mostrar descrições e valores nas notificações</label>
          <p class="ajuda" id="detalhes-ajuda">
            Desligado por padrão: notificações podem aparecer na tela de bloqueio do computador ou
            do celular. Desligado, o aviso diz só algo como "2 contas vencem amanhã".
          </p>
        </div>
      </div>

      <p role="status" class="text-sm">{{ status() }}</p>
    </section>
  `,
})
export class ConfiguracaoNotificacoes {
  protected readonly notificacoes = inject(NotificacoesService);
  protected readonly opcoes = OPCOES_ANTECEDENCIA_DIAS;
  protected readonly status = signal('');

  protected situacao(): 'indisponivel' | 'bloqueada' | 'ativas' | 'desativadas' {
    const permissao = this.notificacoes.permissao();
    if (permissao === 'indisponivel') return 'indisponivel';
    if (permissao === 'denied') return 'bloqueada';
    return this.notificacoes.entregando() ? 'ativas' : 'desativadas';
  }

  /** RF-026: o único ponto em que a permissão é pedida, a partir do clique do usuário. */
  protected async ativar(): Promise<void> {
    try {
      const permissao = await this.notificacoes.ativar();
      this.status.set(
        permissao === 'granted'
          ? 'Notificações ativadas.'
          : 'Permissão não concedida. Os alertas continuam na tela Início.',
      );
    } catch (e) {
      this.status.set(mensagemDeErro(e));
    }
  }

  protected async desativar(): Promise<void> {
    await this.executar(() => this.notificacoes.desativar(), 'Notificações desativadas.');
  }

  protected async alterarAntecedencia(evento: Event): Promise<void> {
    const dias = Number((evento.target as HTMLSelectElement).value);
    await this.executar(() => this.notificacoes.definirAntecedencia(dias), 'Antecedência salva.');
  }

  protected async alterarDetalhes(evento: Event): Promise<void> {
    const mostrar = (evento.target as HTMLInputElement).checked;
    await this.executar(() => this.notificacoes.definirDetalhes(mostrar), 'Preferência salva.');
  }

  private async executar(acao: () => Promise<void>, sucesso: string): Promise<void> {
    try {
      await acao();
      this.status.set(sucesso);
    } catch (e) {
      this.status.set(mensagemDeErro(e));
    }
  }
}
