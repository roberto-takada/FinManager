import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import {
  type FormControl,
  type FormGroup,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';

export type FormConfirmacaoGrupos = FormGroup<{
  grupoA: FormControl<string>;
  grupoB: FormControl<string>;
}>;

export function criarFormConfirmacaoGrupos(fb: NonNullableFormBuilder): FormConfirmacaoGrupos {
  return fb.group({
    grupoA: ['', [Validators.required]],
    grupoB: ['', [Validators.required]],
  });
}

/**
 * Pede que o usuário redigite dois grupos da chave de recuperação, confirmando que a
 * anotou (RF-003). Os grupos são exibidos a partir de 1.
 */
@Component({
  selector: 'app-confirmacao-grupos-chave',
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fieldset [formGroup]="form()" class="space-y-4">
      <legend class="rotulo">
        Para confirmar que você guardou a chave, digite os grupos
        {{ grupos()[0] + 1 }} e {{ grupos()[1] + 1 }}.
      </legend>
      <div class="flex flex-wrap gap-4">
        @for (campo of campos; track campo; let i = $index) {
          <div>
            <label class="rotulo" [for]="idPrefixo() + campo">Grupo {{ grupos()[i]! + 1 }}</label>
            <input
              class="campo w-32 font-mono uppercase"
              [id]="idPrefixo() + campo"
              [formControlName]="campo"
              autocomplete="off"
              autocapitalize="characters"
              spellcheck="false"
              maxlength="4"
              [attr.aria-invalid]="mostrarErros() && form().controls[campo].invalid"
            />
          </div>
        }
      </div>
    </fieldset>
  `,
})
export class ConfirmacaoGruposChave {
  readonly form = input.required<FormConfirmacaoGrupos>();
  readonly grupos = input.required<readonly [number, number]>();
  readonly idPrefixo = input('confirmacao-');
  readonly mostrarErros = input(false);
  protected readonly campos = ['grupoA', 'grupoB'] as const;
}
