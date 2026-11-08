import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CofreService, FRASE_APAGAR_COFRE } from '../../../application/cofre/cofre.service';
import { mensagemDeErro } from '../compartilhado/mensagens';

/**
 * Apagamento definitivo do cofre (RF-006, RN-003, RN-005 e, RN-010).
 * Confirmação reforçada: digitar uma frase. Não exige senha, para que quem perdeu a
 * senha e a chave de recuperação possa recomeçar.
 */
@Component({
  selector: 'app-apagar-cofre',
  imports: [ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-6">
      <div>
        <h1 tabindex="-1" class="text-3xl font-bold text-gray-900">Apagar o cofre</h1>
        <p class="mt-2 text-gray-700">
          Esta ação apaga definitivamente <strong>todos os seus dados</strong> deste navegador. Ela
          não pode ser desfeita.
        </p>
      </div>

      <div class="space-y-2 aviso" role="note">
        <h2 class="font-semibold">Antes de apagar, faça um backup</h2>
        <p>
          Se você ainda quiser seus dados no futuro, exporte um backup antes de apagar o cofre. A
          exportação de backup estará disponível em uma próxima versão do FinManager.
        </p>
      </div>

      <form class="space-y-5 cartao" [formGroup]="form" (ngSubmit)="apagar()" novalidate>
        <div>
          <label class="rotulo" for="frase">
            Para confirmar, digite <strong class="font-mono">{{ frase }}</strong>
          </label>
          <input
            id="frase"
            class="campo font-mono"
            formControlName="frase"
            autocomplete="off"
            spellcheck="false"
          />
        </div>

        @if (erro(); as mensagem) {
          <p class="alerta-erro" role="alert">{{ mensagem }}</p>
        }

        <div class="flex flex-wrap gap-3">
          <a class="botao-secundario" routerLink="/">Cancelar</a>
          <button
            type="submit"
            class="botao-perigo"
            [disabled]="!fraseConfere() || apagando()"
            [attr.aria-busy]="apagando()"
          >
            Apagar cofre definitivamente
          </button>
        </div>
      </form>
    </div>
  `,
})
export class ApagarCofre {
  private readonly cofre = inject(CofreService);
  private readonly router = inject(Router);

  protected readonly frase = FRASE_APAGAR_COFRE;
  protected readonly form = inject(NonNullableFormBuilder).group({ frase: [''] });
  private readonly fraseDigitada = toSignal(this.form.controls.frase.valueChanges, {
    initialValue: '',
  });
  protected readonly fraseConfere = computed(
    () => this.fraseDigitada().trim() === FRASE_APAGAR_COFRE,
  );
  protected readonly apagando = signal(false);
  protected readonly erro = signal<string | null>(null);

  protected async apagar(): Promise<void> {
    if (!this.fraseConfere()) return;
    this.apagando.set(true);
    this.erro.set(null);
    try {
      await this.cofre.apagar(this.form.controls.frase.value);
      await this.router.navigateByUrl('/cofre/criar');
    } catch (erro) {
      this.erro.set(mensagemDeErro(erro));
    } finally {
      this.apagando.set(false);
    }
  }
}
