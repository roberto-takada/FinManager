import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import {
  CofreService,
  OPCOES_BLOQUEIO_AUTOMATICO_MINUTOS,
} from '../../../application/cofre/cofre.service';
import { mensagemDeErro } from '../../cofre/compartilhado/mensagens';

/** Configuração do tempo de bloqueio automático por inatividade (RF-005). */
@Component({
  selector: 'app-configuracao-bloqueio',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="space-y-3 cartao" aria-labelledby="titulo-bloqueio">
      <h2 id="titulo-bloqueio" class="text-xl font-semibold">Bloqueio automático</h2>
      <p class="text-muted">
        Após esse tempo sem uso, o cofre é bloqueado e a senha mestra é pedida de novo.
      </p>
      <div>
        <label class="rotulo" for="bloqueio-minutos">Bloquear após</label>
        <select
          id="bloqueio-minutos"
          class="campo w-auto"
          [value]="cofre.bloqueioAutomaticoMinutos()"
          (change)="alterar($event)"
        >
          @for (opcao of opcoes; track opcao) {
            <option [value]="opcao" [selected]="opcao === cofre.bloqueioAutomaticoMinutos()">
              {{ opcao }} {{ opcao === 1 ? 'minuto' : 'minutos' }} sem atividade
            </option>
          }
        </select>
      </div>
      <p role="status" class="text-sm text-muted">{{ status() }}</p>
    </section>
  `,
})
export class ConfiguracaoBloqueio {
  protected readonly cofre = inject(CofreService);
  protected readonly opcoes = OPCOES_BLOQUEIO_AUTOMATICO_MINUTOS;
  protected readonly status = signal('');

  protected async alterar(evento: Event): Promise<void> {
    const minutos = Number((evento.target as HTMLSelectElement).value);
    try {
      await this.cofre.definirBloqueioAutomatico(minutos);
      this.status.set('Tempo de bloqueio automático salvo.');
    } catch (erro) {
      this.status.set(mensagemDeErro(erro));
    }
  }
}
