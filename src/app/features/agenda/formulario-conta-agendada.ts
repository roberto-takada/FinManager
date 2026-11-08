import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  type OnInit,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AgendaService } from '../../application/agenda/agenda.service';
import { CategoriasService } from '../../application/categorias/categorias.service';
import { ContasService } from '../../application/contas/contas.service';
import { DadosService } from '../../application/dados/dados.service';
import {
  type ContaAgendada,
  type DadosContaAgendada,
  ehAlteracaoSignificativaConta,
  type TipoContaAgendada,
} from '../../domain/agenda/conta-agendada';
import { rotuloCategoria } from '../../domain/categorias/categoria';
import { FREQUENCIAS, type Frequencia } from '../../domain/recorrencias/recorrencia';
import { lerDinheiro, paraTextoEditavel } from '../../domain/shared/dinheiro';
import { DialogoConfirmacao } from '../../ui/dialogo-confirmacao/dialogo-confirmacao';
import { mensagemDeErro } from '../cofre/compartilhado/mensagens';
import { AvisoNavegacao } from '../compartilhado/aviso-navegacao';
import { mensagemValor, valorMonetario } from '../compartilhado/validadores-financeiros';

/**
 * Página de criação (`/agenda/nova`) e edição (`/agenda/:id/editar`) de conta a pagar ou a
 * receber (RF-020). Mudar valor, vencimento, tipo ou repetição pede confirmação (RN-003).
 */
@Component({
  selector: 'app-formulario-conta-agendada',
  imports: [ReactiveFormsModule, RouterLink, DialogoConfirmacao],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="max-w-2xl space-y-6">
      <a class="botao-secundario" routerLink="/agenda"
        ><span aria-hidden="true">←</span> Voltar para as contas a pagar e a receber</a
      >
      <h1 tabindex="-1" class="text-3xl font-bold">
        {{ original() ? 'Editar conta' : 'Nova conta a pagar ou a receber' }}
      </h1>

      @if (id() && !original()) {
        <p class="alerta-erro" role="alert">Conta não encontrada.</p>
      } @else {
        <form class="space-y-4 cartao" [formGroup]="form" (ngSubmit)="enviar()" novalidate>
          <fieldset>
            <legend class="rotulo">Tipo</legend>
            <div class="mt-1 flex gap-4">
              <label class="flex items-center gap-2"
                ><input type="radio" formControlName="tipo" value="pagar" /> A pagar</label
              >
              <label class="flex items-center gap-2"
                ><input type="radio" formControlName="tipo" value="receber" /> A receber</label
              >
            </div>
          </fieldset>

          <div>
            <label class="rotulo" for="agendada-descricao">Descrição</label>
            <input
              id="agendada-descricao"
              class="campo"
              formControlName="descricao"
              maxlength="120"
              [attr.aria-invalid]="tentou() && form.controls.descricao.invalid"
            />
            @if (tentou() && form.controls.descricao.invalid) {
              <p class="erro">Informe a descrição da conta.</p>
            }
          </div>

          <div>
            <label class="rotulo" for="agendada-valor">Valor (R$)</label>
            <input
              id="agendada-valor"
              class="campo"
              formControlName="valor"
              inputmode="decimal"
              [attr.aria-invalid]="tentou() && form.controls.valor.invalid"
            />
            @if (tentou() && form.controls.valor.invalid) {
              <p class="erro">{{ mensagemValor(form.controls.valor.errors) }}</p>
            }
          </div>

          <div>
            <label class="rotulo" for="agendada-vencimento">{{
              repetir() ? 'Primeiro vencimento' : 'Vencimento'
            }}</label>
            <input
              id="agendada-vencimento"
              class="campo w-auto"
              type="date"
              formControlName="vencimento"
            />
          </div>

          <div>
            <label class="rotulo" for="agendada-categoria">Categoria</label>
            <select
              id="agendada-categoria"
              class="campo"
              formControlName="categoriaId"
              [attr.aria-invalid]="tentou() && !form.controls.categoriaId.value"
            >
              <option value="">Escolha…</option>
              @for (c of categoriasDoTipo(); track c.id) {
                <option [value]="c.id">{{ c.rotulo }}</option>
              }
            </select>
            @if (tentou() && !form.controls.categoriaId.value) {
              <p class="erro">Escolha uma categoria.</p>
            }
          </div>

          <div>
            <label class="rotulo" for="agendada-conta">Conta para pagar/receber (opcional)</label>
            <select id="agendada-conta" class="campo" formControlName="contaId">
              <option value="">Escolher na hora</option>
              @for (c of contas.ativas(); track c.id) {
                <option [value]="c.id">{{ c.nome }}</option>
              }
            </select>
          </div>

          <fieldset class="space-y-3">
            <legend class="sr-only">Repetição</legend>
            <label class="flex items-center gap-2"
              ><input type="checkbox" formControlName="repetir" /> Repetir esta conta</label
            >
            @if (repetir()) {
              <div class="flex flex-wrap gap-4">
                <div>
                  <label class="rotulo" for="agendada-frequencia">Frequência</label>
                  <select id="agendada-frequencia" class="campo" formControlName="frequencia">
                    @for (f of listaFrequencias; track f.valor) {
                      <option [value]="f.valor">{{ f.rotulo }}</option>
                    }
                  </select>
                </div>
                <div>
                  <label class="rotulo" for="agendada-fim">Até (opcional)</label>
                  <input id="agendada-fim" class="campo" type="date" formControlName="fim" />
                </div>
              </div>
            }
          </fieldset>

          @if (erro(); as m) {
            <p class="alerta-erro" role="alert">{{ m }}</p>
          }
          <div class="flex flex-wrap gap-3">
            <a class="botao-secundario" routerLink="/agenda">Cancelar</a>
            <button type="submit" class="botao-primario" [disabled]="salvando()">
              Salvar conta
            </button>
          </div>
        </form>
      }
    </div>

    <app-dialogo-confirmacao
      titulo="Alterar valor, vencimento ou repetição?"
      mensagem="A mudança vale para todos os vencimentos ainda não pagos desta conta."
      rotuloConfirmar="Salvar alteração"
      [aberto]="!!pendente()"
      (confirmado)="salvarPendente()"
      (cancelado)="pendente.set(null)"
    >
      <p>O estado anterior fica guardado no histórico.</p>
    </app-dialogo-confirmacao>
  `,
})
export class FormularioContaAgendada implements OnInit {
  readonly id = input<string>();

  private readonly agenda = inject(AgendaService);
  protected readonly contas = inject(ContasService);
  private readonly categorias = inject(CategoriasService);
  private readonly dados = inject(DadosService);
  private readonly router = inject(Router);
  private readonly aviso = inject(AvisoNavegacao);

  protected readonly listaFrequencias = (Object.keys(FREQUENCIAS) as Frequencia[]).map((valor) => ({
    valor,
    rotulo: FREQUENCIAS[valor],
  }));
  protected readonly mensagemValor = mensagemValor;

  protected readonly form = inject(NonNullableFormBuilder).group({
    tipo: ['pagar' as TipoContaAgendada],
    descricao: ['', [Validators.required]],
    valor: ['', [Validators.required, valorMonetario()]],
    vencimento: [this.dados.hoje(), [Validators.required]],
    categoriaId: [''],
    contaId: [''],
    repetir: [false],
    frequencia: ['mensal' as Frequencia],
    fim: [''],
  });
  private readonly tipo = toSignal(this.form.controls.tipo.valueChanges, {
    initialValue: 'pagar' as TipoContaAgendada,
  });
  protected readonly repetir = toSignal(this.form.controls.repetir.valueChanges, {
    initialValue: false,
  });

  protected readonly original = signal<ContaAgendada | null>(null);
  protected readonly pendente = signal<DadosContaAgendada | null>(null);
  protected readonly tentou = signal(false);
  protected readonly salvando = signal(false);
  protected readonly erro = signal<string | null>(null);

  protected readonly categoriasDoTipo = computed(() => {
    const todas = this.dados.categorias();
    const tipoCategoria = this.tipo() === 'pagar' ? 'despesa' : 'receita';
    return this.categorias
      .arvore()
      .filter((c) => c.tipo === tipoCategoria)
      .map((c) => ({ id: c.id, rotulo: rotuloCategoria(c, todas) }));
  });

  ngOnInit(): void {
    const id = this.id();
    if (!id) return;
    const conta = this.dados.contasAgendadas().find((c) => c.id === id && c.excluidoEm === null);
    if (!conta) return;
    this.original.set(conta);
    this.form.setValue({
      tipo: conta.tipo,
      descricao: conta.descricao,
      valor: paraTextoEditavel(conta.valor),
      vencimento: conta.vencimento,
      categoriaId: conta.categoriaId,
      contaId: conta.contaId ?? '',
      repetir: conta.recorrencia !== null,
      frequencia: conta.recorrencia?.frequencia ?? 'mensal',
      fim: conta.recorrencia?.fim ?? '',
    });
  }

  protected async enviar(): Promise<void> {
    this.tentou.set(true);
    this.erro.set(null);
    const v = this.form.getRawValue();
    const valor = lerDinheiro(v.valor);
    if (this.form.invalid || !valor || !v.categoriaId) return;
    const dados: DadosContaAgendada = {
      tipo: v.tipo,
      descricao: v.descricao,
      valor,
      vencimento: v.vencimento,
      categoriaId: v.categoriaId,
      contaId: v.contaId || null,
      recorrencia: v.repetir ? { frequencia: v.frequencia, fim: v.fim || null } : null,
    };
    const original = this.original();
    if (original && ehAlteracaoSignificativaConta(original, dados)) {
      this.pendente.set(dados);
      return;
    }
    await this.salvar(dados);
  }

  protected async salvarPendente(): Promise<void> {
    const dados = this.pendente();
    this.pendente.set(null);
    if (dados) await this.salvar(dados);
  }

  private async salvar(dados: DadosContaAgendada): Promise<void> {
    this.salvando.set(true);
    try {
      const original = this.original();
      if (original) await this.agenda.editar(original.id, dados);
      else await this.agenda.criar(dados);
      this.aviso.definir(original ? 'Conta salva.' : 'Conta adicionada.');
      await this.router.navigateByUrl('/agenda');
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    } finally {
      this.salvando.set(false);
    }
  }
}
