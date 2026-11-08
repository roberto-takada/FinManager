import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DOCUMENT,
  inject,
  signal,
} from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AgendaService } from '../../application/agenda/agenda.service';
import { ContasService } from '../../application/contas/contas.service';
import { DadosService } from '../../application/dados/dados.service';
import {
  DIAS_DA_SEMANA,
  diasDaSemana,
  intervaloDaVisao,
  mesmoMes,
  navegar,
  semanasDoMes,
  tituloDaVisao,
  type VisaoCalendario,
} from '../../domain/agenda/calendario';
import {
  type Ocorrencia,
  rotuloSituacao,
  SIMBOLO_SITUACAO,
  TIPOS_CONTA_AGENDADA,
} from '../../domain/agenda/conta-agendada';
import { formatarData } from '../../domain/shared/data';
import { formatarDinheiro, lerDinheiro, paraTextoEditavel } from '../../domain/shared/dinheiro';
import { DialogoConfirmacao } from '../../ui/dialogo-confirmacao/dialogo-confirmacao';
import { mensagemDeErro } from '../cofre/compartilhado/mensagens';
import { baixarArquivo } from '../compartilhado/baixar-arquivo';
import { mensagemValor, valorMonetario } from '../compartilhado/validadores-financeiros';

const chave = (o: Ocorrencia) => `${o.conta.id}|${o.vencimento}`;

/**
 * Calendário de contas a pagar/receber (RF-021 a RF-023, RF-025).
 * A situação aparece em texto e símbolo, não só por cor (RF-022, RNF-024).
 */
@Component({
  selector: 'app-calendario',
  imports: [ReactiveFormsModule, RouterLink, DialogoConfirmacao],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-6">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h1 tabindex="-1" class="text-3xl font-bold">Calendário</h1>
        <div class="flex flex-wrap items-center gap-4">
          <a class="link" routerLink="/agenda">Cadastrar contas a pagar e a receber</a>
          <button type="button" class="botao-secundario" (click)="confirmandoExportacao.set(true)">
            Exportar calendário (.ics)
          </button>
        </div>
      </div>

      <div
        class="flex flex-wrap items-center gap-3"
        role="toolbar"
        aria-label="Navegação do calendário"
      >
        <div role="group" aria-label="Visão" class="flex gap-2">
          <button
            type="button"
            class="botao-secundario"
            [attr.aria-pressed]="visao() === 'mes'"
            (click)="visao.set('mes')"
          >
            Mês
          </button>
          <button
            type="button"
            class="botao-secundario"
            [attr.aria-pressed]="visao() === 'semana'"
            (click)="visao.set('semana')"
          >
            Semana
          </button>
        </div>
        <button type="button" class="botao-secundario" (click)="mover(-1)">
          {{ visao() === 'mes' ? 'Mês anterior' : 'Semana anterior' }}
        </button>
        <button type="button" class="botao-secundario" (click)="referencia.set(hoje())">
          Hoje
        </button>
        <button type="button" class="botao-secundario" (click)="mover(1)">
          {{ visao() === 'mes' ? 'Próximo mês' : 'Próxima semana' }}
        </button>
      </div>

      <h2
        class="text-xl font-semibold first-letter:uppercase"
        aria-live="polite"
        data-titulo-calendario
      >
        {{ titulo() }}
      </h2>
      <p class="ajuda">
        Legenda: {{ simbolos.pendente }} Pendente · {{ simbolos.paga }} Paga/Recebida ·
        {{ simbolos.vencida }} Vencida
      </p>

      <div class="overflow-x-auto">
        <table class="w-full table-fixed border-collapse text-left text-sm">
          <caption class="sr-only">
            {{
              titulo()
            }}: vencimentos de contas a pagar e a receber
          </caption>
          <thead>
            <tr>
              @for (dia of diasDaSemana; track dia) {
                <th scope="col" class="p-1">{{ dia }}</th>
              }
            </tr>
          </thead>
          <tbody>
            @for (semana of semanas(); track semana[0]) {
              <tr>
                @for (dia of semana; track dia) {
                  <td
                    class="h-24 border border-border p-1 align-top"
                    [class.text-muted]="visao() === 'mes' && !mesmoMes(dia, referencia())"
                    [attr.aria-current]="dia === hoje() ? 'date' : null"
                    [attr.data-dia]="dia"
                  >
                    <div class="font-medium">
                      {{ diaDoMes(dia) }}
                      @if (dia === hoje()) {
                        <span class="text-xs">(hoje)</span>
                      }
                    </div>
                    <ul class="space-y-1">
                      @for (o of porDia().get(dia) ?? []; track chaveDe(o)) {
                        <li>
                          <button
                            type="button"
                            class="chip-ocorrencia"
                            [class.chip-paga]="o.situacao === 'paga'"
                            [class.chip-vencida]="o.situacao === 'vencida'"
                            [attr.data-ocorrencia]="o.conta.descricao"
                            [attr.data-situacao]="o.situacao"
                            [attr.aria-pressed]="selecionada() === chaveDe(o)"
                            (click)="selecionar(o)"
                          >
                            <span aria-hidden="true">{{ simbolos[o.situacao] }}</span>
                            {{ o.conta.descricao }} — {{ formatar(o.conta.valor) }} —
                            {{ rotulo(o) }}
                          </button>
                        </li>
                      }
                    </ul>
                  </td>
                }
              </tr>
            }
          </tbody>
        </table>
      </div>

      @if (mensagem(); as m) {
        <p
          [class]="erro() ? 'alerta-erro' : 'alerta-sucesso'"
          [attr.role]="erro() ? 'alert' : 'status'"
        >
          {{ m }}
        </p>
      }

      @if (detalhe(); as o) {
        <section class="space-y-3 cartao" aria-labelledby="titulo-detalhe" data-detalhe>
          <h2 id="titulo-detalhe" class="text-xl font-semibold">{{ o.conta.descricao }}</h2>
          <dl class="grid grid-cols-2 gap-1">
            <dt>Tipo</dt>
            <dd>{{ tipos[o.conta.tipo] }}</dd>
            <dt>Vencimento</dt>
            <dd>{{ formatarData(o.vencimento) }}</dd>
            <dt>Valor previsto</dt>
            <dd>{{ formatar(o.conta.valor) }}</dd>
            <dt>Situação</dt>
            <dd data-situacao-detalhe>{{ simbolos[o.situacao] }} {{ rotulo(o) }}</dd>
          </dl>

          @if (o.situacao === 'paga') {
            <button type="button" class="botao-secundario" (click)="confirmandoDesfazer.set(true)">
              {{ o.conta.tipo === 'pagar' ? 'Desfazer pagamento' : 'Desfazer recebimento' }}
            </button>
          } @else {
            <form class="space-y-3" [formGroup]="formPagamento" (ngSubmit)="pagar(o)" novalidate>
              <h3 class="font-semibold">
                {{ o.conta.tipo === 'pagar' ? 'Marcar como paga' : 'Marcar como recebida' }}
              </h3>
              <div>
                <label class="rotulo" for="pagamento-conta">{{
                  o.conta.tipo === 'pagar' ? 'Pago com a conta' : 'Recebido na conta'
                }}</label>
                <select id="pagamento-conta" class="campo" formControlName="contaId">
                  <option value="">Escolha…</option>
                  @for (c of contas.ativas(); track c.id) {
                    <option [value]="c.id">{{ c.nome }}</option>
                  }
                </select>
              </div>
              <div>
                <label class="rotulo" for="pagamento-data">{{
                  o.conta.tipo === 'pagar' ? 'Data do pagamento' : 'Data do recebimento'
                }}</label>
                <input
                  id="pagamento-data"
                  class="campo w-auto"
                  type="date"
                  formControlName="data"
                />
              </div>
              <div>
                <label class="rotulo" for="pagamento-valor">Valor (R$)</label>
                <input
                  id="pagamento-valor"
                  class="campo"
                  formControlName="valor"
                  inputmode="decimal"
                />
                @if (formPagamento.controls.valor.invalid && formPagamento.controls.valor.touched) {
                  <p class="erro">{{ mensagemValor(formPagamento.controls.valor.errors) }}</p>
                }
              </div>
              <p class="ajuda">
                Uma {{ o.conta.tipo === 'pagar' ? 'despesa' : 'receita' }} será registrada nas
                transações.
              </p>
              <button type="submit" class="botao-primario">
                {{ o.conta.tipo === 'pagar' ? 'Confirmar pagamento' : 'Confirmar recebimento' }}
              </button>
            </form>
          }
        </section>
      }
    </div>

    <app-dialogo-confirmacao
      titulo="Desfazer?"
      mensagem="A transação gerada vai para a lixeira e a conta volta a ficar em aberto."
      rotuloConfirmar="Desfazer e excluir a transação"
      [perigoso]="true"
      [aberto]="confirmandoDesfazer()"
      (confirmado)="desfazer()"
      (cancelado)="confirmandoDesfazer.set(false)"
    >
      <p>A transação pode ser restaurada pela lixeira por 180 dias.</p>
    </app-dialogo-confirmacao>

    <app-dialogo-confirmacao
      titulo="Exportar o calendário sem proteção?"
      mensagem="O arquivo .ics NÃO é criptografado: contém as descrições, os valores e as datas das suas contas, e qualquer pessoa com acesso a ele poderá lê-los."
      rotuloConfirmar="Exportar mesmo assim"
      [aberto]="confirmandoExportacao()"
      (confirmado)="exportar()"
      (cancelado)="confirmandoExportacao.set(false)"
    >
      <p>Use-o para importar em outro aplicativo de calendário e apague-o depois.</p>
    </app-dialogo-confirmacao>
  `,
})
export class Calendario {
  private readonly agenda = inject(AgendaService);
  protected readonly contas = inject(ContasService);
  private readonly dados = inject(DadosService);
  private readonly documento = inject(DOCUMENT);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly diasDaSemana = DIAS_DA_SEMANA;
  protected readonly simbolos = SIMBOLO_SITUACAO;
  protected readonly tipos = TIPOS_CONTA_AGENDADA;
  protected readonly formatar = formatarDinheiro;
  protected readonly formatarData = formatarData;
  protected readonly mesmoMes = mesmoMes;
  protected readonly mensagemValor = mensagemValor;
  protected readonly chaveDe = chave;

  protected readonly hoje = () => this.dados.hoje();
  protected readonly visao = signal<VisaoCalendario>('mes');
  protected readonly referencia = signal(this.dados.hoje());
  protected readonly selecionada = signal<string | null>(null);
  protected readonly confirmandoDesfazer = signal(false);
  protected readonly confirmandoExportacao = signal(false);
  protected readonly mensagem = signal<string | null>(null);
  protected readonly erro = signal(false);

  protected readonly formPagamento = this.fb.group({
    contaId: ['', [Validators.required]],
    data: [this.dados.hoje(), [Validators.required]],
    valor: ['', [Validators.required, valorMonetario()]],
  });

  protected readonly titulo = computed(() => tituloDaVisao(this.visao(), this.referencia()));
  protected readonly semanas = computed(() =>
    this.visao() === 'mes' ? semanasDoMes(this.referencia()) : [diasDaSemana(this.referencia())],
  );
  private readonly ocorrencias = computed(() => {
    const [de, ate] = intervaloDaVisao(this.visao(), this.referencia());
    return this.agenda.ocorrencias(de, ate);
  });
  protected readonly porDia = computed(() => {
    const mapa = new Map<string, Ocorrencia[]>();
    for (const o of this.ocorrencias())
      mapa.set(o.vencimento, [...(mapa.get(o.vencimento) ?? []), o]);
    return mapa;
  });
  /** A ocorrência selecionada, sempre com a situação atualizada. */
  protected readonly detalhe = computed(
    () => this.ocorrencias().find((o) => chave(o) === this.selecionada()) ?? null,
  );

  protected diaDoMes(data: string): number {
    return Number(data.slice(8));
  }

  protected rotulo(o: Ocorrencia): string {
    return rotuloSituacao(o.conta.tipo, o.situacao);
  }

  protected mover(passos: number): void {
    this.referencia.set(navegar(this.visao(), this.referencia(), passos));
  }

  protected selecionar(o: Ocorrencia): void {
    this.mensagem.set(null);
    this.selecionada.set(chave(o));
    this.formPagamento.reset({
      contaId: o.conta.contaId ?? '',
      data: this.dados.hoje(),
      valor: paraTextoEditavel(o.conta.valor),
    });
  }

  /** RF-023: registra o pagamento/recebimento e a transação correspondente. */
  protected async pagar(o: Ocorrencia): Promise<void> {
    this.formPagamento.markAllAsTouched();
    const v = this.formPagamento.getRawValue();
    const valor = lerDinheiro(v.valor);
    if (this.formPagamento.invalid || !valor) {
      this.informar('Preencha a conta, a data e um valor maior que zero.', true);
      return;
    }
    try {
      await this.agenda.pagar({
        contaAgendadaId: o.conta.id,
        vencimento: o.vencimento,
        contaId: v.contaId,
        data: v.data,
        valor,
      });
      this.informar(o.conta.tipo === 'pagar' ? 'Pagamento registrado.' : 'Recebimento registrado.');
    } catch (e) {
      this.informar(mensagemDeErro(e), true);
    }
  }

  protected async desfazer(): Promise<void> {
    this.confirmandoDesfazer.set(false);
    const o = this.detalhe();
    if (!o) return;
    try {
      await this.agenda.desfazerPagamento(o.conta.id, o.vencimento);
      this.informar('Desfeito. A transação está na lixeira.');
    } catch (e) {
      this.informar(mensagemDeErro(e), true);
    }
  }

  /** RF-025: exporta em iCal depois do aviso de que o arquivo não é cifrado. */
  protected exportar(): void {
    this.confirmandoExportacao.set(false);
    baixarArquivo(
      this.documento,
      'finmanager-calendario.ics',
      this.agenda.exportarIcs(),
      'text/calendar;charset=utf-8',
    );
    this.informar('Calendário exportado.');
  }

  private informar(texto: string, erro = false): void {
    this.erro.set(erro);
    this.mensagem.set(texto);
  }
}
