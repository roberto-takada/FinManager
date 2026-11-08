import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ConfiguracaoBloqueio } from './bloqueio-automatico/configuracao-bloqueio';
import { NovaChaveRecuperacao } from './nova-chave-recuperacao/nova-chave-recuperacao';
import { TrocarSenha } from './trocar-senha/trocar-senha';

/** Configurações de segurança do cofre (RF-004 a RF-007). */
@Component({
  selector: 'app-seguranca',
  imports: [RouterLink, ConfiguracaoBloqueio, TrocarSenha, NovaChaveRecuperacao],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-6">
      <h1 tabindex="-1" class="text-3xl font-bold text-gray-900">Segurança</h1>
      <app-configuracao-bloqueio />
      <app-trocar-senha />
      <app-nova-chave-recuperacao />
      <section class="space-y-3 cartao border-red-300" aria-labelledby="titulo-perigo">
        <h2 id="titulo-perigo" class="text-xl font-semibold text-red-800">Apagar o cofre</h2>
        <p class="text-gray-700">Apaga definitivamente todos os seus dados deste navegador.</p>
        <a class="botao-perigo" routerLink="/cofre/apagar">Apagar o cofre…</a>
      </section>
    </div>
  `,
})
export class Seguranca {}
