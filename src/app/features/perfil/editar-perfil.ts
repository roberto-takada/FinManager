import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DOCUMENT,
  inject,
  type OnInit,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { PerfilService } from '../../application/perfil/perfil.service';
import {
  type Avatar as DadosAvatar,
  type CorAvatar,
  CORES_AVATAR,
  TAMANHO_MAXIMO_NOME_PERFIL,
} from '../../domain/perfil/perfil';
import { ErroDominio } from '../../domain/shared/erro-dominio';
import { Avatar } from '../../ui/avatar/avatar';
import { mensagemDeErro } from '../cofre/compartilhado/mensagens';
import { AvisoNavegacao } from '../compartilhado/aviso-navegacao';
import { reduzirFoto } from './reduzir-foto';

type Campo = 'nome' | 'email' | 'avatar';

/** Edição do perfil (`/perfil/editar`, RF-080), com os dados atuais já no formulário. */
@Component({
  selector: 'app-editar-perfil',
  imports: [ReactiveFormsModule, RouterLink, Avatar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="max-w-2xl space-y-6">
      <a class="botao-secundario" routerLink="/perfil"
        ><span aria-hidden="true">←</span> Voltar para o perfil</a
      >
      <h1 tabindex="-1" class="text-3xl font-bold">Editar perfil</h1>

      <form class="space-y-5 cartao" [formGroup]="form" (ngSubmit)="salvar()" novalidate>
        <div class="flex items-center gap-4">
          <app-avatar [avatar]="avatarAtual()" [nome]="valores().nome" [tamanho]="72" />
          <p class="text-sm text-muted">Prévia do avatar</p>
        </div>

        <div>
          <label class="rotulo" for="perfil-nome">Nome (opcional)</label>
          <input
            id="perfil-nome"
            class="campo"
            formControlName="nome"
            autocomplete="name"
            [attr.maxlength]="maximoNome"
            [attr.aria-invalid]="erroCampo('nome') ? true : null"
            [attr.aria-describedby]="erroCampo('nome') ? 'perfil-nome-erro' : null"
          />
          @if (erroCampo('nome'); as m) {
            <p class="erro" id="perfil-nome-erro">{{ m }}</p>
          }
        </div>

        <div>
          <label class="rotulo" for="perfil-email">E-mail (opcional)</label>
          <input
            id="perfil-email"
            class="campo"
            type="email"
            formControlName="email"
            autocomplete="email"
            [attr.aria-describedby]="
              erroCampo('email') ? 'perfil-email-ajuda perfil-email-erro' : 'perfil-email-ajuda'
            "
            [attr.aria-invalid]="erroCampo('email') ? true : null"
          />
          <p class="ajuda" id="perfil-email-ajuda">
            Fica só neste navegador, cifrado. O app não envia e-mails.
          </p>
          @if (erroCampo('email'); as m) {
            <p class="erro" id="perfil-email-erro">{{ m }}</p>
          }
        </div>

        <fieldset class="space-y-3">
          <legend class="rotulo">Avatar</legend>
          <div class="flex flex-wrap gap-4">
            <label class="flex items-center gap-2"
              ><input type="radio" formControlName="tipoAvatar" value="iniciais" /> Iniciais sobre
              uma cor</label
            >
            <label class="flex items-center gap-2"
              ><input type="radio" formControlName="tipoAvatar" value="foto" /> Foto</label
            >
          </div>

          @if (valores().tipoAvatar === 'iniciais') {
            <fieldset>
              <legend class="text-sm text-muted">Cor</legend>
              <div class="mt-1 flex flex-wrap gap-3">
                @for (c of cores; track c.valor) {
                  <label
                    class="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 has-checked:border-primary has-checked:bg-primary-soft has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring"
                  >
                    <input type="radio" class="sr-only" formControlName="cor" [value]="c.valor" />
                    <app-avatar
                      [avatar]="{ tipo: 'iniciais', cor: c.valor }"
                      [nome]="valores().nome"
                      [tamanho]="28"
                    />
                    {{ c.rotulo }}
                  </label>
                }
              </div>
            </fieldset>
          } @else {
            <div>
              <label class="rotulo" for="perfil-foto">
                {{ valores().imagem ? 'Trocar foto' : 'Escolher foto' }}
              </label>
              <input
                id="perfil-foto"
                type="file"
                class="campo"
                accept="image/png,image/jpeg,image/webp"
                [attr.aria-describedby]="
                  erroCampo('avatar') ? 'perfil-foto-ajuda perfil-avatar-erro' : 'perfil-foto-ajuda'
                "
                [attr.aria-invalid]="erroCampo('avatar') ? true : null"
                (change)="escolherFoto($event)"
              />
              <p class="ajuda" id="perfil-foto-ajuda">
                PNG, JPEG ou WebP. A foto é reduzida para 128 × 128 pixels neste navegador e fica
                cifrada; dados como a localização da imagem são descartados.
              </p>
              @if (processandoFoto()) {
                <p class="ajuda" role="status">Preparando a foto…</p>
              }
            </div>
          }
          @if (erroCampo('avatar'); as m) {
            <p class="erro" id="perfil-avatar-erro">{{ m }}</p>
          }
        </fieldset>

        @if (erroGeral(); as m) {
          <p class="alerta-erro" role="alert">{{ m }}</p>
        }

        <div class="flex flex-wrap gap-3">
          <a class="botao-secundario" routerLink="/perfil">Cancelar</a>
          <button
            type="submit"
            class="botao-primario"
            [disabled]="salvando() || processandoFoto()"
            [attr.aria-busy]="salvando()"
          >
            {{ salvando() ? 'Salvando…' : 'Salvar perfil' }}
          </button>
        </div>
      </form>
    </div>
  `,
})
export class EditarPerfil implements OnInit {
  private readonly perfil = inject(PerfilService);
  private readonly router = inject(Router);
  private readonly aviso = inject(AvisoNavegacao);
  private readonly documento = inject(DOCUMENT);

  protected readonly maximoNome = TAMANHO_MAXIMO_NOME_PERFIL;
  protected readonly cores = (Object.keys(CORES_AVATAR) as CorAvatar[]).map((valor) => ({
    valor,
    rotulo: CORES_AVATAR[valor],
  }));

  protected readonly form = inject(NonNullableFormBuilder).group({
    nome: [''],
    email: [''],
    tipoAvatar: ['iniciais' as DadosAvatar['tipo']],
    cor: ['roxo' as CorAvatar],
    imagem: [''],
  });
  /** Valores completos a cada mudança (o `valueChanges` pode vir parcial). */
  protected readonly valores = toSignal(
    this.form.valueChanges.pipe(map(() => this.form.getRawValue())),
    { initialValue: this.form.getRawValue() },
  );

  protected readonly salvando = signal(false);
  protected readonly processandoFoto = signal(false);
  private readonly erro = signal<{ campo: Campo | null; mensagem: string } | null>(null);
  protected readonly erroGeral = computed(() => this.erro()?.mensagem ?? null);

  protected readonly avatarAtual = computed<DadosAvatar>(() => {
    const v = this.valores();
    return v.tipoAvatar === 'foto' && v.imagem
      ? { tipo: 'foto', imagem: v.imagem }
      : { tipo: 'iniciais', cor: v.cor };
  });

  ngOnInit(): void {
    const p = this.perfil.perfil();
    this.form.setValue({
      nome: p.nome,
      email: p.email,
      tipoAvatar: p.avatar.tipo,
      cor: p.avatar.tipo === 'iniciais' ? p.avatar.cor : 'roxo',
      imagem: p.avatar.tipo === 'foto' ? p.avatar.imagem : '',
    });
  }

  protected erroCampo(campo: Campo): string | null {
    const e = this.erro();
    return e?.campo === campo ? e.mensagem : null;
  }

  protected async escolherFoto(evento: Event): Promise<void> {
    const arquivo = (evento.target as HTMLInputElement).files?.[0];
    if (!arquivo) return;
    this.erro.set(null);
    this.processandoFoto.set(true);
    try {
      this.form.controls.imagem.setValue(await reduzirFoto(arquivo, this.documento));
    } catch (e) {
      this.mostrarErro(e);
    } finally {
      this.processandoFoto.set(false);
    }
  }

  protected async salvar(): Promise<void> {
    this.erro.set(null);
    const v = this.form.getRawValue();
    if (v.tipoAvatar === 'foto' && !v.imagem) {
      this.erro.set({ campo: 'avatar', mensagem: 'Escolha uma foto ou use as iniciais.' });
      return;
    }
    this.salvando.set(true);
    try {
      await this.perfil.salvar({
        nome: v.nome,
        email: v.email,
        avatar:
          v.tipoAvatar === 'foto'
            ? { tipo: 'foto', imagem: v.imagem }
            : { tipo: 'iniciais', cor: v.cor },
      });
      this.aviso.definir('Perfil salvo.');
      await this.router.navigateByUrl('/perfil');
    } catch (e) {
      this.mostrarErro(e);
    } finally {
      this.salvando.set(false);
    }
  }

  private mostrarErro(e: unknown): void {
    const campo = e instanceof ErroDominio ? ((e.campo as Campo | undefined) ?? null) : null;
    this.erro.set({ campo, mensagem: mensagemDeErro(e) });
  }
}
