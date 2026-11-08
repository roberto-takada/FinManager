import {
  ChangeDetectionStrategy,
  Component,
  computed,
  type ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { CofreService } from '../../../application/cofre/cofre.service';
import {
  conferirGrupos,
  escolherGruposParaConfirmacao,
} from '../../../domain/cofre/chave-recuperacao';
import { avaliarForcaSenha } from '../../../domain/cofre/forca-senha';
import { MedidorForcaSenha } from '../../../ui/medidor-forca-senha/medidor-forca-senha';
import {
  ConfirmacaoGruposChave,
  criarFormConfirmacaoGrupos,
} from '../compartilhado/confirmacao-grupos-chave';
import { ExibicaoChaveRecuperacao } from '../compartilhado/exibicao-chave-recuperacao';
import { mensagemDeErro } from '../compartilhado/mensagens';
import { camposIguais, senhaForte, sortear } from '../compartilhado/validadores';

type Etapa = 'senha' | 'chave';

/**
 * Criação do cofre (RF-001, RF-003, RN-013, US-009).
 * Etapa 1: senha mestra + aviso de irrecuperabilidade. Etapa 2: chave de recuperação,
 * que só é gravada depois que o usuário confirma tê-la guardado.
 */
@Component({
  selector: 'app-criar-cofre',
  imports: [
    ReactiveFormsModule,
    MedidorForcaSenha,
    ExibicaoChaveRecuperacao,
    ConfirmacaoGruposChave,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './criar-cofre.html',
})
export class CriarCofre {
  private readonly cofre = inject(CofreService);
  private readonly router = inject(Router);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly etapa = signal<Etapa>('senha');
  protected readonly tentouAvancar = signal(false);
  protected readonly tentouCriar = signal(false);
  protected readonly mostrarSenha = signal(false);
  protected readonly criando = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly chave = signal('');
  protected readonly grupos = signal<readonly [number, number]>([0, 1]);

  protected readonly formSenha = this.fb.group(
    {
      senha: ['', [Validators.required, senhaForte]],
      confirmacao: ['', [Validators.required]],
      avisoAceito: [false, [Validators.requiredTrue]],
    },
    { validators: camposIguais('senha', 'confirmacao') },
  );
  protected readonly formChave = criarFormConfirmacaoGrupos(this.fb);

  private readonly senhaDigitada = toSignal(this.formSenha.controls.senha.valueChanges, {
    initialValue: '',
  });
  protected readonly avaliacao = computed(() => avaliarForcaSenha(this.senhaDigitada()));

  private readonly tituloChave = viewChild<ElementRef<HTMLElement>>('tituloChave');

  protected avancar(): void {
    this.tentouAvancar.set(true);
    if (this.formSenha.invalid) {
      this.formSenha.markAllAsTouched();
      return;
    }
    this.chave.set(this.cofre.gerarChaveRecuperacao());
    this.grupos.set(escolherGruposParaConfirmacao(sortear));
    this.formChave.reset();
    this.tentouCriar.set(false);
    this.erro.set(null);
    this.etapa.set('chave');
    setTimeout(() => this.tituloChave()?.nativeElement.focus());
  }

  protected voltar(): void {
    this.chave.set('');
    this.erro.set(null);
    this.etapa.set('senha');
  }

  protected async criar(): Promise<void> {
    this.tentouCriar.set(true);
    this.erro.set(null);
    if (this.formChave.invalid) return;

    const { grupoA, grupoB } = this.formChave.getRawValue();
    const [a, b] = this.grupos();
    const conferem = conferirGrupos(this.chave(), [
      { indice: a, valor: grupoA },
      { indice: b, valor: grupoB },
    ]);
    if (!conferem) {
      this.erro.set('Os grupos digitados não conferem com a chave. Confira o que você anotou.');
      return;
    }

    const { senha, avisoAceito } = this.formSenha.getRawValue();
    this.criando.set(true);
    try {
      await this.cofre.criar(senha, this.chave(), avisoAceito);
      this.formSenha.reset();
      this.chave.set('');
      await this.router.navigateByUrl('/');
    } catch (erro) {
      this.erro.set(mensagemDeErro(erro));
    } finally {
      this.criando.set(false);
    }
  }
}
