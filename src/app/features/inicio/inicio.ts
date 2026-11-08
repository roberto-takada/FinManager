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
        <p class="text-gray-700">
          Transações, contas e relatórios chegam nas próximas versões. Por enquanto, você pode
          ajustar as opções de <a class="link" routerLink="/seguranca">segurança</a> do cofre.
        </p>
      </div>
    </div>
  `,
})
export class Inicio {}
