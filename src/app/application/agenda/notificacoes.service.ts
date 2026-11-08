import {
  computed,
  DestroyRef,
  DOCUMENT,
  effect,
  inject,
  Injectable,
  signal,
  untracked,
} from '@angular/core';
import {
  OPCOES_ANTECEDENCIA_DIAS,
  type PreferenciasNotificacao,
  textoDaNotificacao,
} from '../../domain/agenda/alertas';
import { somarDias } from '../../domain/shared/data';
import { DadosService } from '../dados/dados.service';
import { NOTIFICADOR_NAVEGADOR, type PermissaoNotificacao } from '../ports/notificacoes.ports';
import { AgendaService } from './agenda.service';

/** A verificação roda ao desbloquear, a cada hora e quando a aba volta a ficar visível. */
export const INTERVALO_VERIFICACAO_NOTIFICACOES_MS = 60 * 60 * 1000;
/** "Já notificado" é guardado por alguns dias e depois descartado. */
const DIAS_REGISTRO_NOTIFICADAS = 7;
export const TAG_NOTIFICACAO = 'finmanager-vencimentos';

/**
 * Notificações de vencimento no navegador (RF-024, RF-026, ENGENHARIA_DE_SOFTWARE §5.10).
 *
 * - Só funcionam com a aba aberta e o cofre desbloqueado: bloqueado, o app não sabe as datas.
 * - A permissão só é pedida em `ativar()`, chamado por um clique do usuário (RF-026).
 * - O texto é discreto por padrão: sem valores nem descrições (RF-024).
 * - Cada ocorrência é notificada no máximo uma vez por dia.
 * - Sem permissão, os alertas continuam aparecendo dentro do app (Início).
 */
@Injectable({ providedIn: 'root' })
export class NotificacoesService {
  private readonly dados = inject(DadosService);
  private readonly agenda = inject(AgendaService);
  private readonly notificador = inject(NOTIFICADOR_NAVEGADOR);
  private readonly documento = inject(DOCUMENT);

  private readonly _permissao = signal<PermissaoNotificacao>(this.notificador.permissao());
  readonly permissao = this._permissao.asReadonly();
  readonly preferencias = computed(() => this.dados.preferencias().notificacao);
  /** As notificações do navegador estão de fato sendo entregues? */
  readonly entregando = computed(
    () => this.preferencias().ativas && this._permissao() === 'granted',
  );

  private intervalo: ReturnType<typeof setInterval> | null = null;
  private readonly aoVoltarParaAba = () => {
    if (this.documento.visibilityState === 'visible') void this.verificar();
  };

  constructor() {
    effect(() => {
      const pronto = this.dados.estado() === 'pronto';
      untracked(() => (pronto ? this.iniciar() : this.parar()));
    });
    inject(DestroyRef).onDestroy(() => this.parar());
  }

  /**
   * RF-026: ativa as notificações a partir de uma ação explícita do usuário. Pede a
   * permissão ao navegador e só liga a preferência se ela for concedida.
   */
  async ativar(): Promise<PermissaoNotificacao> {
    const permissao = await this.notificador.solicitarPermissao();
    this._permissao.set(permissao);
    if (permissao === 'granted') {
      await this.salvar({ ativas: true });
      await this.verificar();
    }
    return permissao;
  }

  desativar(): Promise<void> {
    return this.salvar({ ativas: false });
  }

  definirAntecedencia(dias: number): Promise<void> {
    if (!(OPCOES_ANTECEDENCIA_DIAS as readonly number[]).includes(dias)) {
      throw new RangeError(`Antecedência inválida: ${dias}`);
    }
    return this.salvar({ antecedenciaDias: dias });
  }

  /** Mostrar descrições e valores na notificação (desligado por padrão, RF-024). */
  definirDetalhes(mostrar: boolean): Promise<void> {
    return this.salvar({ mostrarDetalhes: mostrar });
  }

  /**
   * Envia uma notificação se houver alertas ainda não notificados hoje. Nunca pede
   * permissão: se ela não foi concedida, não faz nada (os alertas aparecem no app).
   */
  async verificar(): Promise<void> {
    if (this.dados.estado() !== 'pronto') return;
    this._permissao.set(this.notificador.permissao()); // o usuário pode ter revogado
    if (!this.entregando()) return;

    const hoje = this.dados.hoje();
    const alertas = this.agenda.alertas();
    const jaNotificadas = new Set(this.dados.preferencias().notificadas);
    const novas = alertas.filter((a) => !jaNotificadas.has(`${a.chave}|${hoje}`));
    if (novas.length === 0) return;

    const { titulo, corpo } = textoDaNotificacao(alertas, this.preferencias().mostrarDetalhes);
    this.notificador.notificar(titulo, corpo, TAG_NOTIFICACAO);

    const limite = somarDias(hoje, -DIAS_REGISTRO_NOTIFICADAS);
    await this.dados.alterar((atual) => {
      const preferencias = atual.preferencias[0] ?? this.dados.preferencias();
      const notificadas = [
        ...preferencias.notificadas.filter((n) => (n.split('|').at(-1) ?? '') >= limite),
        ...novas.map((a) => `${a.chave}|${hoje}`),
      ];
      return {
        mudancas: { preferencias: [{ ...preferencias, notificadas }] },
        resultado: undefined,
      };
    });
  }

  private salvar(alteracao: Partial<PreferenciasNotificacao>): Promise<void> {
    return this.dados.alterar((atual) => {
      const preferencias = atual.preferencias[0] ?? this.dados.preferencias();
      return {
        mudancas: {
          preferencias: [
            { ...preferencias, notificacao: { ...preferencias.notificacao, ...alteracao } },
          ],
        },
        resultado: undefined,
      };
    });
  }

  private iniciar(): void {
    if (this.intervalo) return;
    void this.verificar().catch(() => undefined);
    this.intervalo = setInterval(
      () => void this.verificar().catch(() => undefined),
      INTERVALO_VERIFICACAO_NOTIFICACOES_MS,
    );
    this.documento.addEventListener('visibilitychange', this.aoVoltarParaAba);
  }

  private parar(): void {
    if (!this.intervalo) return;
    clearInterval(this.intervalo);
    this.intervalo = null;
    this.documento.removeEventListener('visibilitychange', this.aoVoltarParaAba);
  }
}
