import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  type OnInit,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CategoriasService } from '../../application/categorias/categorias.service';
import { DadosService } from '../../application/dados/dados.service';
import type { Categoria, TipoMovimento } from '../../domain/categorias/categoria';
import { mensagemDeErro } from '../cofre/compartilhado/mensagens';
import { AvisoNavegacao } from '../compartilhado/aviso-navegacao';

/** Página de criação (`/categorias/nova`) e edição (`/categorias/:id/editar`) (RF-015). */
@Component({
  selector: 'app-formulario-categoria',
  imports: [ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="max-w-2xl space-y-6">
      <a class="botao-secundario" routerLink="/categorias"
        ><span aria-hidden="true">←</span> Voltar para as categorias</a
      >
      <h1 tabindex="-1" class="text-3xl font-bold">
        {{ original() ? 'Editar categoria' : 'Nova categoria' }}
      </h1>

      @if (id() && !original()) {
        <p class="alerta-erro" role="alert">Categoria não encontrada.</p>
      } @else {
        <form class="space-y-4 cartao" [formGroup]="form" (ngSubmit)="salvar()" novalidate>
          <div>
            <label class="rotulo" for="categoria-nome">Nome da categoria</label>
            <input
              id="categoria-nome"
              class="campo"
              formControlName="nome"
              maxlength="40"
              [attr.aria-invalid]="tentou() && form.controls.nome.invalid"
            />
            @if (tentou() && form.controls.nome.invalid) {
              <p class="erro">Informe o nome da categoria.</p>
            }
          </div>
          @if (!original()) {
            <div>
              <label class="rotulo" for="categoria-tipo">Tipo da categoria</label>
              <select id="categoria-tipo" class="campo" formControlName="tipo">
                <option value="despesa">Despesa</option>
                <option value="receita">Receita</option>
              </select>
            </div>
          } @else {
            <p class="ajuda">
              Tipo: {{ original()!.tipo === 'despesa' ? 'Despesa' : 'Receita' }} (não muda depois de
              criada).
            </p>
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
          <div class="flex flex-wrap gap-3">
            <a class="botao-secundario" routerLink="/categorias">Cancelar</a>
            <button type="submit" class="botao-primario" [disabled]="salvando()">
              Salvar categoria
            </button>
          </div>
        </form>
      }
    </div>
  `,
})
export class FormularioCategoria implements OnInit {
  readonly id = input<string>();

  private readonly categorias = inject(CategoriasService);
  private readonly dados = inject(DadosService);
  private readonly router = inject(Router);
  private readonly aviso = inject(AvisoNavegacao);

  protected readonly form = inject(NonNullableFormBuilder).group({
    nome: ['', [Validators.required]],
    tipo: ['despesa' as TipoMovimento],
    paiId: [''],
  });
  private readonly tipoEscolhido = toSignal(this.form.controls.tipo.valueChanges, {
    initialValue: 'despesa' as TipoMovimento,
  });
  protected readonly original = signal<Categoria | null>(null);
  protected readonly tentou = signal(false);
  protected readonly salvando = signal(false);
  protected readonly erro = signal<string | null>(null);

  protected readonly possiveisPais = computed(() => {
    const original = this.original();
    const tipo = original?.tipo ?? this.tipoEscolhido();
    return this.categorias
      .arvore()
      .filter((c) => c.paiId === null && c.tipo === tipo && c.id !== original?.id);
  });

  ngOnInit(): void {
    const id = this.id();
    if (!id) return;
    const c = this.dados.categorias().find((x) => x.id === id && x.excluidoEm === null);
    if (!c) return;
    this.original.set(c);
    this.form.setValue({ nome: c.nome, tipo: c.tipo, paiId: c.paiId ?? '' });
  }

  protected async salvar(): Promise<void> {
    this.tentou.set(true);
    this.erro.set(null);
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    this.salvando.set(true);
    try {
      const original = this.original();
      if (original)
        await this.categorias.editar(original.id, { nome: v.nome, paiId: v.paiId || null });
      else await this.categorias.criar({ nome: v.nome, tipo: v.tipo, paiId: v.paiId || null });
      this.aviso.definir(original ? 'Categoria salva.' : 'Categoria adicionada.');
      await this.router.navigateByUrl('/categorias');
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    } finally {
      this.salvando.set(false);
    }
  }
}
