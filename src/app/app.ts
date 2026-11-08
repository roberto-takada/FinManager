import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { CofreService } from './application/cofre/cofre.service';
import { DadosService } from './application/dados/dados.service';
import { PerfilService } from './application/perfil/perfil.service';
import { PreferenciasService } from './application/preferencias/preferencias.service';
import { type Tema, TEMAS } from './domain/shared/preferencias';
import { Avatar } from './ui/avatar/avatar';
import { Logo } from './ui/logo/logo';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Logo, Avatar],
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly cofre = inject(CofreService);
  protected readonly dados = inject(DadosService);
  protected readonly preferencias = inject(PreferenciasService);
  protected readonly perfil = inject(PerfilService);
  /** Menu recolhível em telas pequenas. */
  protected readonly menuAberto = signal(false);
  protected readonly temas = (Object.keys(TEMAS) as Tema[]).map((valor) => ({
    valor,
    rotulo: TEMAS[valor],
  }));
  protected readonly menu = [
    { rota: '/', rotulo: 'Início' },
    { rota: '/transacoes', rotulo: 'Transações' },
    { rota: '/calendario', rotulo: 'Calendário' },
    { rota: '/agenda', rotulo: 'A pagar e receber' },
    { rota: '/cofrinhos', rotulo: 'Cofrinhos' },
    { rota: '/relatorios', rotulo: 'Relatórios' },
    { rota: '/contas', rotulo: 'Contas' },
    { rota: '/categorias', rotulo: 'Categorias' },
    { rota: '/recorrencias', rotulo: 'Recorrências' },
    { rota: '/historico', rotulo: 'Histórico' },
    { rota: '/perfil', rotulo: 'Perfil' },
    { rota: '/seguranca', rotulo: 'Segurança' },
  ];

  protected bloquear(): void {
    this.menuAberto.set(false);
    this.cofre.bloquear('manual');
  }

  protected alterarTema(evento: Event): void {
    void this.preferencias.definirTema((evento.target as HTMLSelectElement).value as Tema);
  }
}
