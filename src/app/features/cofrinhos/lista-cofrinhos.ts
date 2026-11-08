import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CofrinhosService } from '../../application/cofrinhos/cofrinhos.service';
import { DadosService } from '../../application/dados/dados.service';
import { type Cofrinho, ICONES_COFRINHO, progresso } from '../../domain/cofrinhos/cofrinho';
import { AvisoNavegacao } from '../compartilhado/aviso-navegacao';
import { classeProgresso, textoPlanejamento, textoProgresso } from './textos-cofrinho';

/** Lista de cofrinhos (RF-032, RF-033). Criar fica em página própria. */
@Component({
  selector: 'app-lista-cofrinhos',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-6">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h1 tabindex="-1" class="text-3xl font-bold">Cofrinhos</h1>
        <a class="botao-primario" routerLink="/cofrinhos/novo"
          ><span aria-hidden="true">+</span> Novo cofrinho</a
        >
      </div>

      @if (mensagem(); as m) {
        <p class="alerta-sucesso" role="status">{{ m }}</p>
      }

      @if (cofrinhos.emAndamento().length === 0) {
        <p class="cartao text-muted">
          Você ainda não tem cofrinhos. Use "Novo cofrinho" para criar o primeiro objetivo.
        </p>
      } @else {
        <ul class="grid gap-4 md:grid-cols-2">
          @for (c of cofrinhos.emAndamento(); track c.id) {
            <li class="space-y-3 cartao" data-cofrinho [attr.data-cor]="c.cor">
              <h2 class="text-lg font-semibold">
                <span aria-hidden="true">{{ icones[c.icone].simbolo }}</span>
                <a class="link" [routerLink]="['/cofrinhos', c.id]">{{ c.nome }}</a>
              </h2>
              <progress
                max="100"
                [value]="barra(c)"
                [class]="classeProgresso(c)"
                [attr.aria-label]="'Progresso de ' + c.nome"
              ></progress>
              <p data-progresso>{{ textoProgresso(c) }}</p>
              <p class="text-sm text-muted" data-planejamento>
                {{ textoPlanejamento(c, dados.hoje()) }}
              </p>
            </li>
          }
        </ul>
      }

      @if (cofrinhos.encerrados().length > 0) {
        <section aria-labelledby="titulo-encerrados" class="space-y-2 cartao">
          <h2 id="titulo-encerrados" class="text-lg font-semibold">Encerrados</h2>
          <ul class="divide-y divide-border">
            @for (c of cofrinhos.encerrados(); track c.id) {
              <li class="py-2" data-cofrinho-encerrado>
                <a class="link" [routerLink]="['/cofrinhos', c.id]">{{ c.nome }}</a>
                <span class="text-muted"> — encerrado em {{ data(c.encerradoEm!) }}</span>
              </li>
            }
          </ul>
        </section>
      }
    </div>
  `,
})
export class ListaCofrinhos {
  protected readonly cofrinhos = inject(CofrinhosService);
  protected readonly dados = inject(DadosService);
  protected readonly icones = ICONES_COFRINHO;
  protected readonly textoProgresso = textoProgresso;
  protected readonly textoPlanejamento = textoPlanejamento;
  protected readonly classeProgresso = classeProgresso;
  protected readonly mensagem = signal<string | null>(inject(AvisoNavegacao).consumir());

  protected barra(c: Cofrinho): number {
    return Math.min(100, progresso(c).percentual);
  }

  protected data(iso: string): string {
    return new Date(iso).toLocaleDateString('pt-BR');
  }
}
