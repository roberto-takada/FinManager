import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CofreService } from '../../../application/cofre/cofre.service';
import { mensagemDeErro, segundos } from '../compartilhado/mensagens';

/** Desbloqueio do cofre com a senha mestra (RF-002, RNF-006, US-009). */
@Component({
  selector: 'app-desbloquear-cofre',
  imports: [ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-6">
      <div>
        <h1 tabindex="-1" class="text-3xl font-bold text-gray-900">Desbloquear cofre</h1>
        <p class="mt-2 text-gray-700">Digite sua senha mestra para acessar seus dados.</p>
      </div>

      @if (cofre.motivoUltimoBloqueio() === 'inatividade') {
        <p class="aviso" role="status">
          O cofre foi bloqueado automaticamente após
          {{ cofre.bloqueioAutomaticoMinutos() }}
          {{ cofre.bloqueioAutomaticoMinutos() === 1 ? 'minuto' : 'minutos' }} sem atividade.
        </p>
      }

      <form class="space-y-5 cartao" [formGroup]="form" (ngSubmit)="desbloquear()" novalidate>
        <div>
          <label class="rotulo" for="senha">Senha mestra</label>
          <input
            id="senha"
            class="campo"
            type="password"
            formControlName="senha"
            autocomplete="current-password"
            [readOnly]="desbloqueando()"
            [attr.aria-invalid]="!!erro()"
            [attr.aria-describedby]="erro() ? 'desbloqueio-erro' : null"
          />
        </div>

        <div id="desbloqueio-erro" aria-live="assertive">
          @if (erro(); as mensagem) {
            <div class="alerta-erro">
              <p>{{ mensagem }}</p>
              @if (segundosRestantes() > 0) {
                <p class="mt-1">
                  Por segurança, aguarde {{ segundosRestantes() }}
                  {{ segundosRestantes() === 1 ? 'segundo' : 'segundos' }} antes de tentar de novo.
                </p>
              }
            </div>
          }
        </div>

        <button
          type="submit"
          class="botao-primario"
          [disabled]="desbloqueando() || segundosRestantes() > 0"
          [attr.aria-busy]="desbloqueando()"
        >
          @if (desbloqueando()) {
            Desbloqueando…
          } @else {
            Desbloquear
          }
        </button>
      </form>

      <ul class="space-y-2">
        <li><a class="link" routerLink="/cofre/recuperar">Esqueci minha senha mestra</a></li>
        <li><a class="link" routerLink="/cofre/apagar">Apagar o cofre e começar do zero</a></li>
      </ul>
    </div>
  `,
})
export class DesbloquearCofre {
  protected readonly cofre = inject(CofreService);
  private readonly router = inject(Router);

  protected readonly form = inject(NonNullableFormBuilder).group({
    senha: ['', [Validators.required]],
  });
  protected readonly desbloqueando = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly segundosRestantes = signal(0);
  private contagem: ReturnType<typeof setInterval> | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.pararContagem());
  }

  protected async desbloquear(): Promise<void> {
    if (this.form.invalid) {
      this.erro.set('Digite a senha mestra.');
      return;
    }
    this.desbloqueando.set(true);
    this.erro.set(null);
    try {
      const resultado = await this.cofre.desbloquear(this.form.controls.senha.value);
      if (resultado.ok) {
        this.form.reset();
        await this.router.navigateByUrl('/');
        return;
      }
      this.form.reset();
      this.erro.set(
        resultado.motivo === 'senha-incorreta'
          ? 'Senha incorreta.'
          : 'Muitas tentativas com senha incorreta.',
      );
      this.iniciarContagem(resultado.aguardarMs);
    } catch (erro) {
      this.erro.set(mensagemDeErro(erro));
    } finally {
      this.desbloqueando.set(false);
    }
  }

  private iniciarContagem(ms: number): void {
    this.pararContagem();
    const fim = Date.now() + ms;
    this.segundosRestantes.set(segundos(ms));
    if (ms <= 0) return;
    this.contagem = setInterval(() => {
      const restante = segundos(fim - Date.now());
      this.segundosRestantes.set(Math.max(0, restante));
      if (restante <= 0) this.pararContagem();
    }, 250);
  }

  private pararContagem(): void {
    if (this.contagem) clearInterval(this.contagem);
    this.contagem = null;
  }
}
