import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  OnInit,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CategoriasService } from '../../application/categorias/categorias.service';
import { ContasService } from '../../application/contas/contas.service';
import { DadosService } from '../../application/dados/dados.service';
import {
  PARCELAMENTO_HABILITADO,
  TransacoesService,
} from '../../application/transacoes/transacoes.service';
import { rotuloCategoria } from '../../domain/categorias/categoria';
import { FREQUENCIAS, type Frequencia } from '../../domain/recorrencias/recorrencia';
import { formatarData } from '../../domain/shared/data';
import { formatarDinheiro, lerDinheiro, paraTextoEditavel } from '../../domain/shared/dinheiro';
import {
  type DadosTransacao,
  ehAlteracaoSignificativa,
  MAXIMO_PARCELAS,
  TAMANHO_MAXIMO_DESCRICAO,
  type TipoTransacao,
  TIPOS_TRANSACAO,
  type Transacao,
} from '../../domain/transacoes/transacao';
import { DialogoConfirmacao } from '../../ui/dialogo-confirmacao/dialogo-confirmacao';
import { mensagemDeErro } from '../cofre/compartilhado/mensagens';
import { mensagemValor, valorMonetario } from '../compartilhado/validadores-financeiros';

type Repeticao = 'unica' | 'parcelada' | 'recorrente';

/**
 * Cadastro e edição de transações (RF-010 a RF-013, RF-017).
 * Na edição, mudar valor, data ou tipo pede confirmação (RN-003, RN-005 b).
 */
@Component({
  selector: 'app-formulario-transacao',
  imports: [ReactiveFormsModule, RouterLink, DialogoConfirmacao],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-6">
      <h1 tabindex="-1" class="text-3xl font-bold">
        {{ original() ? 'Editar transação' : 'Nova transação' }}
      </h1>

      @if (contas.ativas().length === 0) {
        <p class="aviso">
          Cadastre uma conta antes de registrar transações:
          <a class="link" routerLink="/contas">ir para Contas</a>.
        </p>
      } @else {
        @if (original()?.parcela; as parcela) {
          <p class="aviso">
            Parcela {{ parcela.numero }} de {{ parcela.total }} de uma compra feita em
            {{ formatarData(parcela.dataCompra) }}. A alteração vale só para esta parcela.
          </p>
        }
        @if (original()?.recorrenciaId) {
          <p class="aviso">Gerada por uma recorrência. A alteração vale só para esta ocorrência.</p>
        }

        <form class="space-y-5 cartao" [formGroup]="form" (ngSubmit)="enviar()" novalidate>
          <fieldset>
            <legend class="rotulo">Tipo</legend>
            <div class="mt-1 flex flex-wrap gap-4">
              @for (opcao of tipos; track opcao.valor) {
                <label class="flex items-center gap-2">
                  <input type="radio" formControlName="tipo" [value]="opcao.valor" />
                  {{ opcao.rotulo }}
                </label>
              }
            </div>
          </fieldset>

          <div>
            <label class="rotulo" for="valor">Valor (R$)</label>
            <input
              id="valor"
              class="campo"
              formControlName="valor"
              inputmode="decimal"
              autocomplete="off"
              placeholder="0,00"
              [attr.aria-invalid]="mostrarErro('valor')"
              [attr.aria-describedby]="mostrarErro('valor') ? 'valor-erro' : null"
            />
            @if (mostrarErro('valor')) {
              <p class="erro" id="valor-erro">{{ mensagemValor(form.controls.valor.errors) }}</p>
            }
          </div>

          <div>
            <label class="rotulo" for="data">{{
              repeticao() === 'unica' ? 'Data' : 'Data da primeira ocorrência'
            }}</label>
            <input
              id="data"
              class="campo w-auto"
              type="date"
              formControlName="data"
              [attr.aria-invalid]="mostrarErro('data')"
            />
            @if (mostrarErro('data')) {
              <p class="erro">Informe a data.</p>
            }
          </div>

          <div>
            <label class="rotulo" for="descricao">Descrição (opcional)</label>
            <input
              id="descricao"
              class="campo"
              formControlName="descricao"
              [maxlength]="tamanhoDescricao"
            />
          </div>

          @if (tipo() !== 'transferencia') {
            <div>
              <label class="rotulo" for="categoria">Categoria</label>
              <select
                id="categoria"
                class="campo"
                formControlName="categoriaId"
                [attr.aria-invalid]="mostrarErro('categoriaId')"
              >
                <option value="">Escolha…</option>
                @for (c of categoriasDoTipo(); track c.id) {
                  <option [value]="c.id">{{ c.rotulo }}</option>
                }
              </select>
              @if (mostrarErro('categoriaId')) {
                <p class="erro">Escolha uma categoria.</p>
              }
            </div>
          }

          <div>
            <label class="rotulo" for="conta">{{
              tipo() === 'transferencia' ? 'Conta de origem' : 'Conta'
            }}</label>
            <select
              id="conta"
              class="campo"
              formControlName="contaId"
              [attr.aria-invalid]="mostrarErro('contaId')"
            >
              <option value="">Escolha…</option>
              @for (c of contas.ativas(); track c.id) {
                <option [value]="c.id">{{ c.nome }}</option>
              }
            </select>
            @if (mostrarErro('contaId')) {
              <p class="erro">Escolha uma conta.</p>
            }
          </div>

          @if (tipo() === 'transferencia') {
            <div>
              <label class="rotulo" for="conta-destino">Conta de destino</label>
              <select id="conta-destino" class="campo" formControlName="contaDestinoId">
                <option value="">Escolha…</option>
                @for (c of contas.ativas(); track c.id) {
                  <option [value]="c.id">{{ c.nome }}</option>
                }
              </select>
            </div>
          }

          @if (!original()) {
            <fieldset class="space-y-3">
              <legend class="rotulo">Repetição</legend>
              <div class="flex flex-wrap gap-4">
                <label class="flex items-center gap-2">
                  <input type="radio" formControlName="repeticao" value="unica" /> Só uma vez
                </label>
                @if (parcelamentoHabilitado && tipo() === 'despesa') {
                  <label class="flex items-center gap-2">
                    <input type="radio" formControlName="repeticao" value="parcelada" /> Parcelada
                  </label>
                }
                <label class="flex items-center gap-2">
                  <input type="radio" formControlName="repeticao" value="recorrente" /> Recorrente
                </label>
              </div>

              @if (repeticao() === 'parcelada') {
                <div>
                  <label class="rotulo" for="parcelas">Número de parcelas</label>
                  <input
                    id="parcelas"
                    class="campo w-32"
                    type="number"
                    min="2"
                    [max]="maximoParcelas"
                    formControlName="parcelas"
                    aria-describedby="parcelas-ajuda"
                  />
                  <p class="ajuda" id="parcelas-ajuda">
                    O valor informado é o total da compra. Uma parcela por mês, a partir da data da
                    compra; centavos que sobrarem vão na 1ª parcela.
                  </p>
                </div>
              }

              @if (repeticao() === 'recorrente') {
                <div class="flex flex-wrap gap-4">
                  <div>
                    <label class="rotulo" for="frequencia">Frequência</label>
                    <select id="frequencia" class="campo" formControlName="frequencia">
                      @for (f of frequencias; track f.valor) {
                        <option [value]="f.valor">{{ f.rotulo }}</option>
                      }
                    </select>
                  </div>
                  <div>
                    <label class="rotulo" for="fim">Até (opcional)</label>
                    <input id="fim" class="campo" type="date" formControlName="fim" />
                  </div>
                </div>
                <p class="ajuda">
                  As ocorrências até hoje são registradas agora; as próximas, conforme as datas
                  chegarem.
                </p>
              }
            </fieldset>
          }

          @if (erro(); as mensagem) {
            <p class="alerta-erro" role="alert">{{ mensagem }}</p>
          }

          <div class="flex flex-wrap gap-3">
            <a class="botao-secundario" routerLink="/transacoes">Cancelar</a>
            <button type="submit" class="botao-primario" [disabled]="salvando()">
              Salvar transação
            </button>
          </div>
        </form>
      }
    </div>

    <app-dialogo-confirmacao
      titulo="Alterar valor, data ou tipo da transação?"
      [mensagem]="mensagemConfirmacao()"
      rotuloConfirmar="Salvar alteração"
      [aberto]="confirmando()"
      (confirmado)="salvarEdicaoConfirmada()"
      (cancelado)="confirmando.set(false)"
    >
      <p>O estado anterior fica guardado no histórico.</p>
    </app-dialogo-confirmacao>
  `,
})
export class FormularioTransacao implements OnInit {
  /** Id da rota (`/transacoes/:id`); ausente ao criar. */
  readonly id = input<string>();

  protected readonly contas = inject(ContasService);
  private readonly categorias = inject(CategoriasService);
  private readonly transacoes = inject(TransacoesService);
  private readonly dados = inject(DadosService);
  private readonly router = inject(Router);

  protected readonly tipos = (Object.keys(TIPOS_TRANSACAO) as TipoTransacao[]).map((valor) => ({
    valor,
    rotulo: TIPOS_TRANSACAO[valor],
  }));
  protected readonly frequencias = (Object.keys(FREQUENCIAS) as Frequencia[]).map((valor) => ({
    valor,
    rotulo: FREQUENCIAS[valor],
  }));
  protected readonly maximoParcelas = MAXIMO_PARCELAS;
  /** RF-013 suspenso até RF-100 (faturas do cartão). */
  protected readonly parcelamentoHabilitado = PARCELAMENTO_HABILITADO;
  protected readonly tamanhoDescricao = TAMANHO_MAXIMO_DESCRICAO;
  protected readonly formatarData = formatarData;
  protected readonly mensagemValor = mensagemValor;

  protected readonly form = inject(NonNullableFormBuilder).group({
    tipo: ['despesa' as TipoTransacao],
    valor: ['', [Validators.required, valorMonetario()]],
    data: [this.dados.hoje(), [Validators.required]],
    descricao: [''],
    categoriaId: [''],
    contaId: ['', [Validators.required]],
    contaDestinoId: [''],
    repeticao: ['unica' as Repeticao],
    parcelas: [2],
    frequencia: ['mensal' as Frequencia],
    fim: [''],
  });

  protected readonly tipo = toSignal(this.form.controls.tipo.valueChanges, {
    initialValue: 'despesa' as TipoTransacao,
  });
  protected readonly repeticao = toSignal(this.form.controls.repeticao.valueChanges, {
    initialValue: 'unica' as Repeticao,
  });
  protected readonly original = signal<Transacao | null>(null);
  protected readonly tentouEnviar = signal(false);
  protected readonly salvando = signal(false);
  protected readonly confirmando = signal(false);
  protected readonly erro = signal<string | null>(null);
  private pendente: DadosTransacao | null = null;

  protected readonly categoriasDoTipo = computed(() => {
    const todas = this.dados.categorias();
    return this.categorias
      .arvore()
      .filter((c) => c.tipo === this.tipo())
      .map((c) => ({ id: c.id, rotulo: rotuloCategoria(c, todas) }));
  });

  protected readonly mensagemConfirmacao = computed(() => {
    const antes = this.original();
    return antes
      ? `Antes: ${TIPOS_TRANSACAO[antes.tipo]} de ${formatarDinheiro(antes.valor)} em ${formatarData(antes.data)}.`
      : '';
  });

  ngOnInit(): void {
    const id = this.id();
    if (!id) return;
    const transacao = this.transacoes.buscar(id);
    if (!transacao) {
      this.erro.set('Transação não encontrada.');
      return;
    }
    this.original.set(transacao);
    this.form.patchValue({
      tipo: transacao.tipo,
      valor: paraTextoEditavel(transacao.valor),
      data: transacao.data,
      descricao: transacao.descricao,
      categoriaId: transacao.categoriaId ?? '',
      contaId: transacao.contaId,
      contaDestinoId: transacao.contaDestinoId ?? '',
    });
  }

  protected mostrarErro(campo: 'valor' | 'data' | 'categoriaId' | 'contaId'): boolean {
    const controle = this.form.controls[campo];
    if (campo === 'categoriaId') {
      return this.tentouEnviar() && this.tipo() !== 'transferencia' && !controle.value;
    }
    return controle.invalid && (controle.touched || this.tentouEnviar());
  }

  protected async enviar(): Promise<void> {
    this.tentouEnviar.set(true);
    this.erro.set(null);
    const valor = lerDinheiro(this.form.controls.valor.value);
    if (
      this.form.invalid ||
      !valor ||
      (this.tipo() !== 'transferencia' && !this.form.controls.categoriaId.value)
    ) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const dados: DadosTransacao = {
      tipo: v.tipo,
      valor,
      data: v.data,
      descricao: v.descricao,
      categoriaId: v.tipo === 'transferencia' ? null : v.categoriaId || null,
      contaId: v.contaId,
      contaDestinoId: v.tipo === 'transferencia' ? v.contaDestinoId || null : null,
    };

    const original = this.original();
    if (original && ehAlteracaoSignificativa(original, dados)) {
      this.pendente = dados;
      this.confirmando.set(true);
      return;
    }
    await this.salvar(dados);
  }

  protected async salvarEdicaoConfirmada(): Promise<void> {
    this.confirmando.set(false);
    if (this.pendente) await this.salvar(this.pendente);
    this.pendente = null;
  }

  private async salvar(dados: DadosTransacao): Promise<void> {
    this.salvando.set(true);
    try {
      const original = this.original();
      if (original) {
        await this.transacoes.editar(original.id, dados);
      } else {
        const v = this.form.getRawValue();
        await this.transacoes.criar(dados, {
          parcelas:
            v.repeticao === 'parcelada' && v.tipo === 'despesa' ? Number(v.parcelas) : undefined,
          recorrencia:
            v.repeticao === 'recorrente'
              ? { frequencia: v.frequencia, fim: v.fim || null }
              : undefined,
        });
      }
      await this.router.navigateByUrl('/transacoes');
    } catch (erro) {
      this.erro.set(mensagemDeErro(erro));
    } finally {
      this.salvando.set(false);
    }
  }
}
