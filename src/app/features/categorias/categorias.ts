import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CategoriasService } from '../../application/categorias/categorias.service';
import type { Categoria, TipoMovimento } from '../../domain/categorias/categoria';
import { DialogoConfirmacao } from '../../ui/dialogo-confirmacao/dialogo-confirmacao';
import { mensagemDeErro } from '../cofre/compartilhado/mensagens';
import { AvisoNavegacao } from '../compartilhado/aviso-navegacao';

/** Categorias e subcategorias (RF-015). Criar e editar ficam em páginas próprias. */
@Component({
  selector: 'app-categorias',
  imports: [RouterLink, DialogoConfirmacao],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-6">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h1 tabindex="-1" class="text-3xl font-bold">Categorias</h1>
        <a class="botao-primario" routerLink="/categorias/nova"
          ><span aria-hidden="true">+</span> Nova categoria</a
        >
      </div>

      @if (mensagem(); as m) {
        <p
          [class]="erro() ? 'alerta-erro' : 'alerta-sucesso'"
          [attr.role]="erro() ? 'alert' : 'status'"
        >
          {{ m }}
        </p>
      }

      <div class="grid gap-4 lg:grid-cols-2">
        @for (grupo of grupos; track grupo.tipo) {
          <section class="cartao" [attr.aria-labelledby]="'titulo-' + grupo.tipo">
            <h2 [id]="'titulo-' + grupo.tipo" class="mb-2 text-lg font-semibold">
              {{ grupo.rotulo }}
            </h2>
            <ul class="divide-y divide-border">
              @for (c of doTipo(grupo.tipo); track c.id) {
                <li
                  class="flex items-center justify-between gap-3 py-2"
                  [class.pl-6]="c.paiId"
                  data-categoria
                >
                  <span>
                    @if (c.paiId) {
                      <span aria-hidden="true" class="text-muted">↳ </span>
                    }
                    {{ c.nome }}
                  </span>
                  <span class="flex gap-2">
                    <a
                      class="botao-acao"
                      [routerLink]="['/categorias', c.id, 'editar']"
                      [attr.aria-label]="'Editar ' + c.nome"
                      >Editar</a
                    >
                    <button
                      type="button"
                      class="botao-acao-perigo"
                      (click)="alvo.set(c)"
                      [attr.aria-label]="'Excluir ' + c.nome"
                    >
                      Excluir
                    </button>
                  </span>
                </li>
              }
            </ul>
          </section>
        }
      </div>
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
  protected readonly alvo = signal<Categoria | null>(null);
  protected readonly mensagem = signal<string | null>(inject(AvisoNavegacao).consumir());
  protected readonly erro = signal(false);
  protected readonly mensagemExclusao = computed(() =>
    this.alvo() ? `A categoria "${this.alvo()!.nome}" será excluída.` : '',
  );

  protected doTipo(tipo: TipoMovimento): Categoria[] {
    return this.categorias.arvore().filter((c) => c.tipo === tipo);
  }

  protected async excluir(): Promise<void> {
    const c = this.alvo();
    this.alvo.set(null);
    if (!c) return;
    try {
      await this.categorias.excluir(c.id);
      this.erro.set(false);
      this.mensagem.set('Categoria excluída. Ela está na lixeira.');
    } catch (e) {
      this.erro.set(true);
      this.mensagem.set(mensagemDeErro(e));
    }
  }
}
