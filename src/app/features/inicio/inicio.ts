import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DashboardService } from '../../application/dashboard/dashboard.service';
import { ResumoService } from '../../application/resumo/resumo.service';
import type { LarguraWidget } from '../../domain/dashboard/layout';
import { PerfilService } from '../../application/perfil/perfil.service';
import { primeiroNome } from '../../domain/perfil/perfil';
import { AvisoNavegacao } from '../compartilhado/aviso-navegacao';
import { WidgetContasAVencer } from './widgets/widget-contas-a-vencer';
import { WidgetDespesasCategoria } from './widgets/widget-despesas-categoria';
import { WidgetMetas } from './widgets/widget-metas';
import { WidgetPatrimonio } from './widgets/widget-patrimonio';
import { WidgetReceitasDespesas } from './widgets/widget-receitas-despesas';
import { WidgetRecentes } from './widgets/widget-recentes';
import { WidgetResumo } from './widgets/widget-resumo';

/** Classes completas para o Tailwind gerar (a largura só vale em telas largas). */
const COLUNAS: Record<LarguraWidget, string> = {
  1: 'lg:col-span-1',
  2: 'lg:col-span-2',
  3: 'lg:col-span-3',
};

/**
 * Dashboard "Início" (RF-040 a RF-045): os widgets aparecem na ordem e na largura escolhidas
 * em "Personalizar" (RF-043), guardadas nas preferências cifradas (RF-044).
 */
@Component({
  selector: 'app-inicio',
  imports: [
    RouterLink,
    WidgetResumo,
    WidgetPatrimonio,
    WidgetDespesasCategoria,
    WidgetReceitasDespesas,
    WidgetRecentes,
    WidgetMetas,
    WidgetContasAVencer,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-6">
      <div class="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 tabindex="-1" class="text-3xl font-bold">Início</h1>
          <p class="mt-1 text-muted">
            @if (nome()) {
              Olá, {{ nome() }}!
            }
            Resumo de {{ resumo.mes().nome }}
          </p>
        </div>
        <div class="flex flex-wrap gap-3">
          <a class="botao-secundario" routerLink="/inicio/personalizar">Personalizar</a>
          <a class="botao-primario" routerLink="/transacoes/nova"
            ><span aria-hidden="true">+</span> Nova transação</a
          >
        </div>
      </div>

      @if (mensagem(); as m) {
        <p class="alerta-sucesso" role="status">{{ m }}</p>
      }

      @if (dashboard.layout().widgets.length === 0) {
        <div class="space-y-3 cartao">
          <p>Nenhum widget no Início.</p>
          <a class="botao-suave" routerLink="/inicio/personalizar">Escolher widgets</a>
        </div>
      } @else {
        <div class="grid gap-4 lg:grid-cols-3">
          @for (w of dashboard.layout().widgets; track w.id) {
            <div class="min-w-0" [class]="colunas[w.largura]" [attr.data-widget]="w.id">
              @switch (w.id) {
                @case ('resumo') {
                  <app-widget-resumo />
                }
                @case ('patrimonio') {
                  <app-widget-patrimonio />
                }
                @case ('despesas-categoria') {
                  <app-widget-despesas-categoria />
                }
                @case ('receitas-despesas') {
                  <app-widget-receitas-despesas />
                }
                @case ('recentes') {
                  <app-widget-recentes />
                }
                @case ('metas') {
                  <app-widget-metas />
                }
                @case ('contas-a-vencer') {
                  <app-widget-contas-a-vencer />
                }
              }
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class Inicio {
  protected readonly resumo = inject(ResumoService);
  protected readonly dashboard = inject(DashboardService);
  protected readonly colunas = COLUNAS;
  private readonly perfil = inject(PerfilService);
  protected readonly nome = computed(() => primeiroNome(this.perfil.perfil().nome));
  protected readonly mensagem = signal<string | null>(inject(AvisoNavegacao).consumir());
}
