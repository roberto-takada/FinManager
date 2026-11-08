import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CofreService } from '../../../application/cofre/cofre.service';
import { avaliarForcaSenha } from '../../../domain/cofre/forca-senha';
import { DialogoConfirmacao } from '../../../ui/dialogo-confirmacao/dialogo-confirmacao';
import { MedidorForcaSenha } from '../../../ui/medidor-forca-senha/medidor-forca-senha';
import { mensagemDeErro } from '../../cofre/compartilhado/mensagens';
import { camposIguais, senhaForte } from '../../cofre/compartilhado/validadores';

/** Alteração da senha mestra, exigindo a atual (RF-004) e confirmação (RN-003, RN-005 f). */
@Component({
  selector: 'app-trocar-senha',
  imports: [ReactiveFormsModule, MedidorForcaSenha, DialogoConfirmacao],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="space-y-5 cartao" aria-labelledby="titulo-trocar-senha">
      <h2 id="titulo-trocar-senha" class="text-xl font-semibold">Alterar senha mestra</h2>

      <form class="space-y-5" [formGroup]="form" (ngSubmit)="pedirConfirmacao()" novalidate>
        <div>
          <label class="rotulo" for="senha-atual">Senha mestra atual</label>
          <input
            id="senha-atual"
            class="campo"
            type="password"
            formControlName="senhaAtual"
            autocomplete="current-password"
            [attr.aria-invalid]="tentouEnviar() && form.controls.senhaAtual.invalid"
          />
          @if (tentouEnviar() && form.controls.senhaAtual.invalid) {
            <p class="erro">Digite a senha mestra atual.</p>
          }
        </div>

        <div>
          <label class="rotulo" for="senha-nova">Nova senha mestra</label>
          <input
            id="senha-nova"
            class="campo"
            type="password"
            formControlName="novaSenha"
            autocomplete="new-password"
            aria-describedby="senha-nova-forca"
            [attr.aria-invalid]="tentouEnviar() && form.controls.novaSenha.invalid"
          />
          <app-medidor-forca-senha idDescricao="senha-nova-forca" [avaliacao]="avaliacao()" />
          @if (tentouEnviar() && form.controls.novaSenha.invalid) {
            <p class="erro">Escolha uma senha que atenda à força mínima.</p>
          }
        </div>

        <div>
          <label class="rotulo" for="senha-nova-confirmacao">Repita a nova senha mestra</label>
          <input
            id="senha-nova-confirmacao"
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

        <div aria-live="polite">
          @if (erro(); as mensagem) {
            <p class="alerta-erro">{{ mensagem }}</p>
          }
          @if (sucesso()) {
            <div class="alerta-sucesso">
              <p>Senha mestra alterada.</p>
              <p class="mt-1">
                Backups exportados antes desta troca continuam abrindo só com a senha antiga ou com
                a chave de recuperação. Exporte um novo backup.
              </p>
            </div>
          }
        </div>

        <button
          type="submit"
          class="botao-primario"
          [disabled]="processando()"
          [attr.aria-busy]="processando()"
        >
          @if (processando()) {
            Alterando…
          } @else {
            Alterar senha mestra
          }
        </button>
      </form>
    </section>

    <app-dialogo-confirmacao
      titulo="Alterar a senha mestra?"
      mensagem="A senha atual deixará de funcionar para desbloquear o cofre."
      rotuloConfirmar="Alterar senha mestra"
      [aberto]="confirmando()"
      (confirmado)="trocar()"
      (cancelado)="confirmando.set(false)"
    >
      <p>Backups exportados antes desta troca continuam abrindo com a senha antiga.</p>
    </app-dialogo-confirmacao>
  `,
})
export class TrocarSenha {
  private readonly cofre = inject(CofreService);

  protected readonly form = inject(NonNullableFormBuilder).group(
    {
      senhaAtual: ['', [Validators.required]],
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
  protected readonly sucesso = signal(false);

  protected pedirConfirmacao(): void {
    this.tentouEnviar.set(true);
    this.erro.set(null);
    this.sucesso.set(false);
    if (this.form.valid) this.confirmando.set(true);
  }

  protected async trocar(): Promise<void> {
    this.confirmando.set(false);
    this.processando.set(true);
    const { senhaAtual, novaSenha } = this.form.getRawValue();
    try {
      const resultado = await this.cofre.trocarSenha(senhaAtual, novaSenha);
      if (resultado.ok) {
        this.form.reset();
        this.tentouEnviar.set(false);
        this.sucesso.set(true);
      } else {
        this.erro.set(
          resultado.motivo === 'senha-incorreta'
            ? 'A senha mestra atual está incorreta.'
            : 'A nova senha precisa ser diferente da atual.',
        );
      }
    } catch (erro) {
      this.erro.set(mensagemDeErro(erro));
    } finally {
      this.processando.set(false);
    }
  }
}
