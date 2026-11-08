import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CofreService } from '../../../application/cofre/cofre.service';
import {
  conferirGrupos,
  escolherGruposParaConfirmacao,
} from '../../../domain/cofre/chave-recuperacao';
import { DialogoConfirmacao } from '../../../ui/dialogo-confirmacao/dialogo-confirmacao';
import {
  ConfirmacaoGruposChave,
  criarFormConfirmacaoGrupos,
} from '../../cofre/compartilhado/confirmacao-grupos-chave';
import { ExibicaoChaveRecuperacao } from '../../cofre/compartilhado/exibicao-chave-recuperacao';
import { mensagemDeErro } from '../../cofre/compartilhado/mensagens';
import { sortear } from '../../cofre/compartilhado/validadores';

/**
 * Geração de nova chave de recuperação (RF-007), exigindo a senha mestra e confirmação
 * (RN-003, RN-005 f). A chave antiga só é invalidada depois que o usuário confirma ter
 * guardado a nova.
 */
@Component({
  selector: 'app-nova-chave-recuperacao',
  imports: [
    ReactiveFormsModule,
    ExibicaoChaveRecuperacao,
    ConfirmacaoGruposChave,
    DialogoConfirmacao,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="space-y-5 cartao" aria-labelledby="titulo-nova-chave">
      <h2 id="titulo-nova-chave" class="text-xl font-semibold">Chave de recuperação</h2>
      <p class="text-gray-700">
        Gere uma nova chave se a atual foi perdida ou pode ter sido vista por outra pessoa. A chave
        atual deixa de funcionar assim que a nova for salva.
      </p>

      <div aria-live="polite">
        @if (sucesso()) {
          <div class="alerta-sucesso">
            <p>Nova chave de recuperação salva. A chave anterior não funciona mais.</p>
            <p class="mt-1">
              Backups exportados antes desta troca continuam abrindo com a chave anterior.
            </p>
          </div>
        }
      </div>

      @if (!chave()) {
        <button type="button" class="botao-secundario" (click)="gerar()">
          Gerar nova chave de recuperação
        </button>
      } @else {
        <app-exibicao-chave-recuperacao [chave]="chave()" />

        <form class="space-y-5" [formGroup]="form" (ngSubmit)="pedirConfirmacao()" novalidate>
          <app-confirmacao-grupos-chave
            idPrefixo="nova-chave-"
            [form]="form.controls.grupos"
            [grupos]="grupos()"
            [mostrarErros]="tentouEnviar()"
          />

          <div>
            <label class="rotulo" for="nova-chave-senha">Senha mestra</label>
            <input
              id="nova-chave-senha"
              class="campo"
              type="password"
              formControlName="senha"
              autocomplete="current-password"
              [attr.aria-invalid]="tentouEnviar() && form.controls.senha.invalid"
            />
          </div>

          @if (erro(); as mensagem) {
            <p class="alerta-erro" role="alert">{{ mensagem }}</p>
          }

          <div class="flex flex-wrap gap-3">
            <button
              type="button"
              class="botao-secundario"
              (click)="descartar()"
              [disabled]="processando()"
            >
              Cancelar
            </button>
            <button
              type="submit"
              class="botao-primario"
              [disabled]="processando()"
              [attr.aria-busy]="processando()"
            >
              @if (processando()) {
                Salvando…
              } @else {
                Salvar nova chave
              }
            </button>
          </div>
        </form>
      }
    </section>

    <app-dialogo-confirmacao
      titulo="Substituir a chave de recuperação?"
      mensagem="A chave de recuperação atual deixará de funcionar e só a nova poderá redefinir a senha mestra."
      rotuloConfirmar="Substituir chave de recuperação"
      [aberto]="confirmando()"
      (confirmado)="salvar()"
      (cancelado)="confirmando.set(false)"
    />
  `,
})
export class NovaChaveRecuperacao {
  private readonly cofre = inject(CofreService);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly chave = signal('');
  protected readonly grupos = signal<readonly [number, number]>([0, 1]);
  protected readonly form = this.fb.group({
    grupos: criarFormConfirmacaoGrupos(this.fb),
    senha: ['', [Validators.required]],
  });
  protected readonly tentouEnviar = signal(false);
  protected readonly confirmando = signal(false);
  protected readonly processando = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly sucesso = signal(false);

  protected gerar(): void {
    this.chave.set(this.cofre.gerarChaveRecuperacao());
    this.grupos.set(escolherGruposParaConfirmacao(sortear));
    this.form.reset();
    this.tentouEnviar.set(false);
    this.erro.set(null);
    this.sucesso.set(false);
  }

  protected descartar(): void {
    this.chave.set('');
    this.form.reset();
    this.erro.set(null);
  }

  protected pedirConfirmacao(): void {
    this.tentouEnviar.set(true);
    this.erro.set(null);
    if (this.form.invalid) {
      this.erro.set('Preencha os dois grupos da chave e a senha mestra.');
      return;
    }
    const { grupoA, grupoB } = this.form.controls.grupos.getRawValue();
    const [a, b] = this.grupos();
    if (
      !conferirGrupos(this.chave(), [
        { indice: a, valor: grupoA },
        { indice: b, valor: grupoB },
      ])
    ) {
      this.erro.set('Os grupos digitados não conferem com a nova chave.');
      return;
    }
    this.confirmando.set(true);
  }

  protected async salvar(): Promise<void> {
    this.confirmando.set(false);
    this.processando.set(true);
    try {
      const resultado = await this.cofre.trocarChaveRecuperacao(
        this.form.controls.senha.value,
        this.chave(),
      );
      if (resultado.ok) {
        this.descartar();
        this.sucesso.set(true);
      } else {
        this.form.controls.senha.reset();
        this.erro.set('Senha mestra incorreta. A chave de recuperação não foi alterada.');
      }
    } catch (erro) {
      this.erro.set(mensagemDeErro(erro));
    } finally {
      this.processando.set(false);
    }
  }
}
