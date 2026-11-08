import { DestroyRef, DOCUMENT, effect, inject, Injectable } from '@angular/core';
import { CofreService } from './cofre.service';

/** Eventos que contam como atividade do usuário. */
const EVENTOS_ATIVIDADE = [
  'pointerdown',
  'pointermove',
  'keydown',
  'wheel',
  'touchstart',
  'scroll',
];

/** Intervalo de verificação. O bloqueio acontece no máximo este tempo depois do limite. */
export const INTERVALO_VERIFICACAO_MS = 5_000;

/**
 * RF-005: bloqueia o cofre após o tempo de inatividade configurado.
 * Funciona por verificação periódica do horário da última atividade, o que também cobre
 * abas em segundo plano (onde os timers são atrasados pelo navegador).
 */
@Injectable({ providedIn: 'root' })
export class BloqueioAutomaticoService {
  private readonly cofre = inject(CofreService);
  private readonly documento = inject(DOCUMENT);

  private ultimaAtividade = Date.now();
  private intervalo: ReturnType<typeof setInterval> | null = null;
  private readonly registrarAtividade = () => {
    this.ultimaAtividade = Date.now();
  };
  private readonly verificarAoVoltar = () => {
    if (this.documento.visibilityState === 'visible') this.verificar();
  };

  constructor() {
    effect(() => {
      if (this.cofre.desbloqueado()) this.iniciar();
      else this.parar();
    });
    inject(DestroyRef).onDestroy(() => this.parar());
  }

  private iniciar(): void {
    if (this.intervalo) return;
    this.ultimaAtividade = Date.now();
    for (const evento of EVENTOS_ATIVIDADE) {
      this.documento.addEventListener(evento, this.registrarAtividade, {
        passive: true,
        capture: true,
      });
    }
    this.documento.addEventListener('visibilitychange', this.verificarAoVoltar);
    this.intervalo = setInterval(() => this.verificar(), INTERVALO_VERIFICACAO_MS);
  }

  private parar(): void {
    if (!this.intervalo) return;
    clearInterval(this.intervalo);
    this.intervalo = null;
    for (const evento of EVENTOS_ATIVIDADE) {
      this.documento.removeEventListener(evento, this.registrarAtividade, { capture: true });
    }
    this.documento.removeEventListener('visibilitychange', this.verificarAoVoltar);
  }

  private verificar(): void {
    const limiteMs = this.cofre.bloqueioAutomaticoMinutos() * 60_000;
    if (Date.now() - this.ultimaAtividade >= limiteMs) {
      this.cofre.bloquear('inatividade');
    }
  }
}
