import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { CofreService } from './application/cofre/cofre.service';
import { DadosService } from './application/dados/dados.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly cofre = inject(CofreService);
  protected readonly dados = inject(DadosService);
  protected readonly menu = [
    { rota: '/', rotulo: 'Início' },
    { rota: '/transacoes', rotulo: 'Transações' },
    { rota: '/contas', rotulo: 'Contas' },
    { rota: '/categorias', rotulo: 'Categorias' },
    { rota: '/recorrencias', rotulo: 'Recorrências' },
    { rota: '/historico', rotulo: 'Histórico' },
    { rota: '/seguranca', rotulo: 'Segurança' },
  ];

  protected bloquear(): void {
    this.cofre.bloquear('manual');
  }
}
