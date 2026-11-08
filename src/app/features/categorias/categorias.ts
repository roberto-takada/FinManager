import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CategoriasService } from '../../application/categorias/categorias.service';
import type { Categoria, TipoMovimento } from '../../domain/categorias/categoria';
import { DialogoConfirmacao } from '../../ui/dialogo-confirmacao/dialogo-confirmacao';
import { mensagemDeErro } from '../cofre/compartilhado/mensagens';

/** Categorias e subcategorias personalizadas (RF-015). */
@Component({
  selector: 'app-categorias',
  imports: [ReactiveFormsModule, DialogoConfirmacao],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-6">
      <h1 tabindex="-1" class="text-3xl font-bold">Categorias</h1>

      @for (grupo of grupos; track grupo.tipo) {
        <section [attr.aria-labelledby]="'titulo-' + grupo.tipo">
          <h2 [id]="'titulo-' + grupo.tipo" class="text-xl font-semibold">{{ grupo.rotulo }}</h2>
          <ul class="mt-2 space-y-1">
            @for (c of doTipo(grupo.tipo); track c.id) {
              <li [class.pl-6]="c.paiId" data-categoria>
                <span>{{ c.paiId ? '↳ ' : '' }}{{ c.nome }}</span>
                <button
                  type="button"
                  class="ml-3 link"
                  (click)="editar(c)"
                  [attr.aria-label]="'Editar ' + c.nome"
                >
                  Editar
                </button>
                <button
                  type="button"
                  class="ml-2 link"
                  (click)="alvo.set(c)"
                  [attr.aria-label]="'Excluir ' + c.nome"
                >
                  Excluir
                </button>
              </li>
            }
          </ul>
        </section>
      }

      <form
        class="space-y-4 cartao"
        [formGroup]="form"
        (ngSubmit)="salvar()"
        novalidate
        aria-labelledby="titulo-form-categoria"
      >
        <h2 id="titulo-form-categoria" class="text-xl font-semibold">
          {{ editando() ? 'Editar categoria' : 'Nova categoria' }}
        </h2>
        <div>
          <label class="rotulo" for="categoria-nome">Nome da categoria</label>
          <input id="categoria-nome" class="campo" formControlName="nome" maxlength="40" />
        </div>
        @if (!editando()) {
          <div>
            <label class="rotulo" for="categoria-tipo">Tipo da categoria</label>
            <select id="categoria-tipo" class="campo" formControlName="tipo">
              <option value="despesa">Despesa</option>
              <option value="receita">Receita</option>
            </select>
          </div>
        }
        <div>
          <label class="rotulo" for="categoria-pai">Subcategoria de (opcional)</label>
          <select id="categoria-pai" class="campo" formControlName="paiId">
            <option value="">Nenhuma (categoria principal)</option>
            @for (c of possiveisPais(); track c.id) {
              <option [value]="c.id">{{ c.nome }}</option>
            }
          </select>
        </div>
        @if (erro(); as m) {
          <p class="alerta-erro" role="alert">{{ m }}</p>
        }
        @if (status(); as s) {
          <p role="status">{{ s }}</p>
        }
        <div class="flex flex-wrap gap-3">
          @if (editando()) {
            <button type="button" class="botao-secundario" (click)="cancelarEdicao()">
              Cancelar edição
            </button>
          }
          <button type="submit" class="botao-primario">
            {{ editando() ? 'Salvar categoria' : 'Adicionar categoria' }}
          </button>
        </div>
      </form>
    </div>

    <app-dialogo-confirmacao
      titulo="Excluir categoria?"
      [mensagem]="mensagemExclusao()"
      rotuloConfirmar="Excluir categoria"
      [perigoso]="true"
      [aberto]="!!alvo()"
      (confirmado)="excluir()"
      (cancelado)="alvo.set(null)"
    >
      <p>Ela vai para a lixeira e pode ser restaurada por 180 dias.</p>
    </app-dialogo-confirmacao>
  `,
})
export class Categorias {
  private readonly categorias = inject(CategoriasService);
  protected readonly grupos = [
    { tipo: 'despesa' as const, rotulo: 'Despesas' },
    { tipo: 'receita' as const, rotulo: 'Receitas' },
  ];

  protected readonly form = inject(NonNullableFormBuilder).group({
    nome: ['', [Validators.required]],
    tipo: ['despesa' as TipoMovimento],
    paiId: [''],
  });
  private readonly tipoEscolhido = toSignal(this.form.controls.tipo.valueChanges, {
    initialValue: 'despesa' as TipoMovimento,
  });
  protected readonly editando = signal<Categoria | null>(null);
  protected readonly alvo = signal<Categoria | null>(null);
  protected readonly erro = signal<string | null>(null);
  protected readonly status = signal<string | null>(null);
  protected readonly mensagemExclusao = computed(() =>
    this.alvo() ? `A categoria "${this.alvo()!.nome}" será excluída.` : '',
  );

  protected readonly possiveisPais = computed(() => {
    const editando = this.editando();
    const tipo = editando?.tipo ?? this.tipoEscolhido();
    return this.categorias
      .arvore()
      .filter((c) => c.paiId === null && c.tipo === tipo && c.id !== editando?.id);
  });

  protected doTipo(tipo: TipoMovimento): Categoria[] {
    return this.categorias.arvore().filter((c) => c.tipo === tipo);
  }

  protected editar(c: Categoria): void {
    this.editando.set(c);
    this.erro.set(null);
    this.form.setValue({ nome: c.nome, tipo: c.tipo, paiId: c.paiId ?? '' });
  }

  protected cancelarEdicao(): void {
    this.editando.set(null);
    this.form.reset();
  }

  protected async salvar(): Promise<void> {
    this.erro.set(null);
    this.status.set(null);
    const v = this.form.getRawValue();
    // Limpa já ao enviar: o que o usuário digitar enquanto salva não é apagado depois.
    const editando = this.editando();
    this.cancelarEdicao();
    try {
      if (editando)
        await this.categorias.editar(editando.id, { nome: v.nome, paiId: v.paiId || null });
      else await this.categorias.criar({ nome: v.nome, tipo: v.tipo, paiId: v.paiId || null });
      this.status.set(editando ? 'Categoria salva.' : 'Categoria adicionada.');
    } catch (e) {
      this.editando.set(editando);
      this.form.setValue(v);
      this.erro.set(mensagemDeErro(e));
    }
  }

  protected async excluir(): Promise<void> {
    const c = this.alvo();
    this.alvo.set(null);
    if (!c) return;
    this.erro.set(null);
    try {
      await this.categorias.excluir(c.id);
      this.status.set('Categoria excluída. Ela está na lixeira.');
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    }
  }
}
