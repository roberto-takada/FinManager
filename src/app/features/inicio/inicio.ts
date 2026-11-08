import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/** Tela inicial provisória: será substituída pela dashboard (RF-040). */
@Component({
  selector: 'app-inicio',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-6">
      <h1 tabindex="-1" class="text-3xl font-bold text-gray-900">Início</h1>
      <div class="space-y-3 cartao">
        <p>Seu cofre está desbloqueado.</p>
        <ul class="list-disc pl-5">
          <li><a class="link" routerLink="/transacoes/nova">Registrar uma transação</a></li>
          <li><a class="link" routerLink="/transacoes">Ver e filtrar transações</a></li>
          <li><a class="link" routerLink="/contas">Contas e saldos</a></li>
        </ul>
        <p class="text-gray-700">A dashboard e os relatórios chegam nas próximas versões.</p>
      </div>
    </div>
  `,
})
export class Inicio {}
