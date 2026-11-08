import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CofrinhosService } from '../../application/cofrinhos/cofrinhos.service';
import type { CorCofrinho, IconeCofrinho } from '../../domain/cofrinhos/cofrinho';
import { lerDinheiro } from '../../domain/shared/dinheiro';
import { mensagemDeErro } from '../cofre/compartilhado/mensagens';
import { AvisoNavegacao } from '../compartilhado/aviso-navegacao';
import { mensagemValor, valorMonetario } from '../compartilhado/validadores-financeiros';
import { LISTA_CORES, LISTA_ICONES } from './textos-cofrinho';

export type FormCofrinho = ReturnType<typeof criarFormCofrinho>;

export function criarFormCofrinho(fb: NonNullableFormBuilder) {
  return fb.group({
    nome: ['', [Validators.required]],
    meta: ['', [Validators.required, valorMonetario()]],
    prazo: [''],
    icone: ['geral' as IconeCofrinho],
    cor: ['azul' as CorCofrinho],
  });
}

/**
 * Campos do cofrinho (RF-030), usados na página de criação e na de configurações (edição).
 * O formulário e o envio ficam com a página que o usa.
 */
@Component({
  selector: 'app-campos-cofrinho',
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-4" [formGroup]="form()">
      <div>
        <label class="rotulo" for="cofrinho-nome">Nome do objetivo</label>
        <input
          id="cofrinho-nome"
          class="campo"
          formControlName="nome"
          maxlength="60"
          [attr.aria-invalid]="mostrarErros() && form().controls.nome.invalid"
        />
        @if (mostrarErros() && form().controls.nome.invalid) {
          <p class="erro">Informe o nome do cofrinho.</p>
        }
      </div>
      <div>
        <label class="rotulo" for="cofrinho-meta">Meta (R$)</label>
        <input
          id="cofrinho-meta"
          class="campo"
          formControlName="meta"
          inputmode="decimal"
          [attr.aria-invalid]="mostrarErros() && form().controls.meta.invalid"
        />
        @if (mostrarErros() && form().controls.meta.invalid) {
          <p class="erro">{{ mensagemMeta() }}</p>
        }
      </div>
      <div>
        <label class="rotulo" for="cofrinho-prazo">Prazo (opcional)</label>
        <input
          id="cofrinho-prazo"
          class="campo w-auto"
          type="date"
          formControlName="prazo"
          aria-describedby="cofrinho-prazo-ajuda"
        />
        <p class="ajuda" id="cofrinho-prazo-ajuda">
          Com prazo, o app calcula quanto guardar por mês.
        </p>
      </div>
      <div class="flex flex-wrap gap-4">
        <div>
          <label class="rotulo" for="cofrinho-icone">Ícone</label>
          <select id="cofrinho-icone" class="campo" formControlName="icone">
            @for (i of listaIcones; track i.valor) {
              <option [value]="i.valor">{{ i.rotulo }}</option>
            }
          </select>
        </div>
        <div>
          <label class="rotulo" for="cofrinho-cor">Cor</label>
          <select id="cofrinho-cor" class="campo" formControlName="cor">
            @for (c of listaCores; track c.valor) {
              <option [value]="c.valor">{{ c.rotulo }}</option>
            }
          </select>
        </div>
      </div>
    </div>
  `,
})
export class CamposCofrinho {
  readonly form = input.required<FormCofrinho>();
  readonly mostrarErros = input(false);
  protected readonly listaIcones = LISTA_ICONES;
  protected readonly listaCores = LISTA_CORES;

  protected mensagemMeta(): string {
    return (mensagemValor(this.form().controls.meta.errors) ?? '').replace('um valor', 'uma meta');
  }
}

/** Página de criação de cofrinho (`/cofrinhos/novo`, RF-030). */
@Component({
  selector: 'app-novo-cofrinho',
  imports: [ReactiveFormsModule, RouterLink, CamposCofrinho],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="max-w-2xl space-y-6">
      <a class="botao-secundario" routerLink="/cofrinhos"
        ><span aria-hidden="true">←</span> Voltar para os cofrinhos</a
      >
      <h1 tabindex="-1" class="text-3xl font-bold">Novo cofrinho</h1>
      <form class="space-y-4 cartao" [formGroup]="form" (ngSubmit)="criar()" novalidate>
        <app-campos-cofrinho [form]="form" [mostrarErros]="tentou()" />
        @if (erro(); as m) {
          <p class="alerta-erro" role="alert">{{ m }}</p>
        }
        <div class="flex flex-wrap gap-3">
          <a class="botao-secundario" routerLink="/cofrinhos">Cancelar</a>
          <button type="submit" class="botao-primario" [disabled]="salvando()">
            Criar cofrinho
          </button>
        </div>
      </form>
    </div>
  `,
})
export class NovoCofrinho {
  private readonly cofrinhos = inject(CofrinhosService);
  private readonly router = inject(Router);
  private readonly aviso = inject(AvisoNavegacao);

  protected readonly form = criarFormCofrinho(inject(NonNullableFormBuilder));
  protected readonly tentou = signal(false);
  protected readonly salvando = signal(false);
  protected readonly erro = signal<string | null>(null);

  protected async criar(): Promise<void> {
    this.tentou.set(true);
    this.erro.set(null);
    const v = this.form.getRawValue();
    const meta = lerDinheiro(v.meta);
    if (this.form.invalid || !meta) return;
    this.salvando.set(true);
    try {
      const c = await this.cofrinhos.criar({
        nome: v.nome,
        meta,
        prazo: v.prazo || null,
        icone: v.icone,
        cor: v.cor,
      });
      this.aviso.definir(`Cofrinho "${c.nome}" criado.`);
      await this.router.navigateByUrl('/cofrinhos');
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    } finally {
      this.salvando.set(false);
    }
  }
}
