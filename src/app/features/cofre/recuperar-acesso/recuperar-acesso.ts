import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CofreService } from '../../../application/cofre/cofre.service';
import { avaliarForcaSenha } from '../../../domain/cofre/forca-senha';
import { DialogoConfirmacao } from '../../../ui/dialogo-confirmacao/dialogo-confirmacao';
import { MedidorForcaSenha } from '../../../ui/medidor-forca-senha/medidor-forca-senha';
import { mensagemDeErro } from '../compartilhado/mensagens';
import { camposIguais, formatoChaveRecuperacao, senhaForte } from '../compartilhado/validadores';

/**
 * Recuperação de acesso com a chave de recuperação (RF-003, §5.6).
 * Redefinir a senha mestra é uma ação significativa (RN-005 f), por isso pede confirmação.
 */
@Component({
  selector: 'app-recuperar-acesso',
  imports: [ReactiveFormsModule, RouterLink, MedidorForcaSenha, DialogoConfirmacao],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-6">
      <div>
        <h1 tabindex="-1" class="text-3xl font-bold text-gray-900">Recuperar acesso</h1>
        <p class="mt-2 text-gray-700">
          Use a chave de recuperação que você guardou ao criar o cofre para definir uma nova senha
          mestra.
        </p>
      </div>

      <form class="space-y-5 cartao" [formGroup]="form" (ngSubmit)="pedirConfirmacao()" novalidate>
        <div>
          <label class="rotulo" for="chave">Chave de recuperação</label>
          <input
            id="chave"
            class="campo font-mono uppercase"
            formControlName="chave"
            autocomplete="off"
            autocapitalize="characters"
            spellcheck="false"
            placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
            aria-describedby="chave-ajuda"
            [attr.aria-invalid]="tentouEnviar() && form.controls.chave.invalid"
          />
          <p class="ajuda" id="chave-ajuda">
            32 caracteres. Hífens, espaços e letras minúsculas são aceitos.
          </p>
          @if (tentouEnviar() && form.controls.chave.invalid) {
            <p class="erro">Digite a chave completa, com 32 caracteres.</p>
          }
        </div>

        <div>
          <label class="rotulo" for="nova-senha">Nova senha mestra</label>
          <input
            id="nova-senha"
            class="campo"
            type="password"
            formControlName="novaSenha"
            autocomplete="new-password"
            aria-describedby="nova-senha-forca"
            [attr.aria-invalid]="tentouEnviar() && form.controls.novaSenha.invalid"
          />
          <app-medidor-forca-senha idDescricao="nova-senha-forca" [avaliacao]="avaliacao()" />
          @if (tentouEnviar() && form.controls.novaSenha.invalid) {
            <p class="erro">Escolha uma senha que atenda à força mínima.</p>
          }
        </div>

        <div>
          <label class="rotulo" for="confirmacao">Repita a nova senha mestra</label>
          <input
            id="confirmacao"
            class="campo"
            type="password"
            formControlName="confirmacao"
            autocomplete="new-password"
            [attr.aria-invalid]="tentouEnviar() && form.hasError('naoConferem')"
          />
          @if (
            tentouEnviar() && (form.controls.confirmacao.invalid || form.hasError('naoConferem'))
          ) {
            <p class="erro">As senhas não são iguais.</p>
          }
        </div>

        @if (erro(); as mensagem) {
          <p class="alerta-erro" role="alert">{{ mensagem }}</p>
        }

        <div class="flex flex-wrap gap-3">
          <a class="botao-secundario" routerLink="/cofre/desbloquear">Voltar</a>
          <button
            type="submit"
            class="botao-primario"
            [disabled]="processando()"
            [attr.aria-busy]="processando()"
          >
            @if (processando()) {
              Redefinindo…
            } @else {
              Redefinir senha mestra
            }
          </button>
        </div>
      </form>
    </div>

    <app-dialogo-confirmacao
      titulo="Redefinir a senha mestra?"
      mensagem="A senha mestra atual deixará de funcionar. A chave de recuperação continua valendo."
      rotuloConfirmar="Redefinir senha mestra"
      [aberto]="confirmando()"
      (confirmado)="recuperar()"
      (cancelado)="confirmando.set(false)"
    >
      <p>Backups exportados antes desta troca continuam abrindo com a senha antiga.</p>
    </app-dialogo-confirmacao>
  `,
})
export class RecuperarAcesso {
  private readonly cofre = inject(CofreService);
  private readonly router = inject(Router);

  protected readonly form = inject(NonNullableFormBuilder).group(
    {
      chave: ['', [Validators.required, formatoChaveRecuperacao]],
      novaSenha: ['', [Validators.required, senhaForte]],
      confirmacao: ['', [Validators.required]],
    },
    { validators: camposIguais('novaSenha', 'confirmacao') },
  );
  private readonly novaSenha = toSignal(this.form.controls.novaSenha.valueChanges, {
    initialValue: '',
  });
  protected readonly avaliacao = computed(() => avaliarForcaSenha(this.novaSenha()));
  protected readonly tentouEnviar = signal(false);
  protected readonly confirmando = signal(false);
  protected readonly processando = signal(false);
  protected readonly erro = signal<string | null>(null);

  protected pedirConfirmacao(): void {
    this.tentouEnviar.set(true);
    this.erro.set(null);
    if (this.form.valid) this.confirmando.set(true);
  }

  protected async recuperar(): Promise<void> {
    this.confirmando.set(false);
    this.processando.set(true);
    const { chave, novaSenha } = this.form.getRawValue();
    try {
      const resultado = await this.cofre.recuperarAcesso(chave, novaSenha);
      if (resultado.ok) {
        this.form.reset();
        await this.router.navigateByUrl('/');
      } else {
        this.erro.set('Chave de recuperação incorreta. Confira o que você anotou.');
      }
    } catch (erro) {
      this.erro.set(mensagemDeErro(erro));
    } finally {
      this.processando.set(false);
    }
  }
}
