import { ChangeDetectionStrategy, Component, DOCUMENT, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BackupService } from '../../application/backup/backup.service';
import { PerfilService } from '../../application/perfil/perfil.service';
import { PreferenciasService } from '../../application/preferencias/preferencias.service';
import {
  type Animacoes,
  type Contraste,
  CONTRASTES,
  OPCOES_ANIMACOES,
  type PreferenciasAcessibilidade,
  type Tema,
  TEMAS,
  type TamanhoFonte,
  TAMANHOS_FONTE,
} from '../../domain/shared/preferencias';
import { Avatar } from '../../ui/avatar/avatar';
import { mensagemDeErro } from '../cofre/compartilhado/mensagens';
import { AvisoNavegacao } from '../compartilhado/aviso-navegacao';
import { baixarArquivo } from '../compartilhado/baixar-arquivo';

const opcoes = <T extends string>(rotulos: Readonly<Record<T, string>>) =>
  (Object.keys(rotulos) as T[]).map((valor) => ({ valor, rotulo: rotulos[valor] }));

/**
 * Perfil e personalização (seção 5.9): dados do perfil (RF-080), tema (RF-081),
 * acessibilidade (RF-082) e exportação de todos os dados (RF-084). As preferências de moeda
 * e formatos (RF-083) virão com os requisitos de moedas.
 */
@Component({
  selector: 'app-perfil',
  imports: [RouterLink, Avatar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="max-w-3xl space-y-6">
      <h1 tabindex="-1" class="text-3xl font-bold">Perfil</h1>

      @if (mensagem(); as m) {
        <p class="alerta-sucesso" role="status">{{ m }}</p>
      }

      <section class="cartao" aria-labelledby="titulo-dados">
        <h2 id="titulo-dados" class="sr-only">Seus dados</h2>
        <div class="flex flex-wrap items-center gap-5">
          <app-avatar
            [avatar]="perfil.perfil().avatar"
            [nome]="perfil.perfil().nome"
            [tamanho]="80"
          />
          <div class="min-w-0 flex-1 space-y-1">
            <p class="font-display text-2xl font-semibold" data-perfil-nome>
              {{ perfil.perfil().nome || 'Sem nome' }}
            </p>
            <p class="text-muted" data-perfil-email>
              {{ perfil.perfil().email || 'Sem e-mail' }}
            </p>
          </div>
          <a class="botao-secundario" routerLink="/perfil/editar">Editar perfil</a>
        </div>
        @if (!perfil.preenchido()) {
          <p class="ajuda mt-4">
            Seu nome aparece no menu e na saudação do Início. Tudo fica cifrado neste navegador.
          </p>
        }
      </section>

      <section class="space-y-5 cartao" aria-labelledby="titulo-aparencia">
        <div>
          <h2 id="titulo-aparencia" class="text-lg font-semibold">Aparência e acessibilidade</h2>
          <p class="ajuda">
            As mudanças valem na hora e ficam cifradas no cofre. Na tela de desbloqueio, use o zoom
            do navegador (Ctrl e +) se precisar de letras maiores.
          </p>
        </div>

        <fieldset>
          <legend class="rotulo">Tema</legend>
          <div class="mt-2 flex flex-wrap gap-2">
            @for (o of temas; track o.valor) {
              <label [class]="classeOpcao">
                <input
                  type="radio"
                  name="tema"
                  class="sr-only"
                  [checked]="preferencias.tema() === o.valor"
                  (change)="definirTema(o.valor)"
                />
                {{ o.rotulo }}
              </label>
            }
          </div>
        </fieldset>

        <fieldset>
          <legend class="rotulo">Tamanho do texto</legend>
          <div class="mt-2 flex flex-wrap gap-2">
            @for (o of tamanhos; track o.valor) {
              <label [class]="classeOpcao">
                <input
                  type="radio"
                  name="tamanho-fonte"
                  class="sr-only"
                  [checked]="preferencias.acessibilidade().tamanhoFonte === o.valor"
                  (change)="ajustar({ tamanhoFonte: o.valor })"
                />
                {{ o.rotulo }}
              </label>
            }
          </div>
        </fieldset>

        <fieldset>
          <legend class="rotulo">Contraste</legend>
          <div class="mt-2 flex flex-wrap gap-2">
            @for (o of contrastes; track o.valor) {
              <label [class]="classeOpcao">
                <input
                  type="radio"
                  name="contraste"
                  class="sr-only"
                  [checked]="preferencias.acessibilidade().contraste === o.valor"
                  (change)="ajustar({ contraste: o.valor })"
                />
                {{ o.rotulo }}
              </label>
            }
          </div>
          <p class="ajuda">O alto contraste reforça textos secundários, bordas e o foco.</p>
        </fieldset>

        <fieldset>
          <legend class="rotulo">Animações</legend>
          <div class="mt-2 flex flex-wrap gap-2">
            @for (o of animacoes; track o.valor) {
              <label [class]="classeOpcao">
                <input
                  type="radio"
                  name="animacoes"
                  class="sr-only"
                  [checked]="preferencias.acessibilidade().animacoes === o.valor"
                  (change)="ajustar({ animacoes: o.valor })"
                />
                {{ o.rotulo }}
              </label>
            }
          </div>
          <p class="ajuda">"Reduzir animações" desliga transições e a animação dos gráficos.</p>
        </fieldset>

        <p class="sr-only" role="status">{{ anuncio() }}</p>
        @if (erro(); as m) {
          <p class="alerta-erro" role="alert">{{ m }}</p>
        }
      </section>

      <section class="space-y-3 cartao" aria-labelledby="titulo-exportar">
        <h2 id="titulo-exportar" class="text-lg font-semibold">Exportar todos os dados</h2>
        <p>
          Baixe um arquivo <strong>.json cifrado</strong> com tudo o que está no cofre: contas,
          transações, agenda, cofrinhos, histórico, preferências e perfil.
        </p>
        <ul class="list-disc space-y-1 pl-5 text-sm text-muted">
          <li>
            Ele abre com a senha mestra de agora ou com a chave de recuperação. Se você trocar a
            senha depois, este arquivo continua pedindo a senha antiga.
          </li>
          <li>Sem a senha e sem a chave de recuperação, ninguém consegue ler o arquivo.</li>
          <li>A importação (restaurar o backup) chega em uma próxima versão do app.</li>
        </ul>
        <button
          type="button"
          class="botao-primario"
          [disabled]="exportando()"
          [attr.aria-busy]="exportando()"
          (click)="exportar()"
        >
          {{ exportando() ? 'Exportando…' : 'Exportar backup cifrado' }}
        </button>
        @if (erroExportacao(); as m) {
          <p class="alerta-erro" role="alert">{{ m }}</p>
        }
      </section>
    </div>
  `,
})
export class Perfil {
  protected readonly perfil = inject(PerfilService);
  protected readonly preferencias = inject(PreferenciasService);
  private readonly backup = inject(BackupService);
  private readonly documento = inject(DOCUMENT);

  /** Opções como botões alternáveis: o rádio fica oculto, mas focável e anunciado. */
  protected readonly classeOpcao =
    'botao-secundario cursor-pointer has-checked:border-primary has-checked:bg-primary-soft has-checked:text-primary-soft-foreground has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring';
  protected readonly temas = opcoes<Tema>(TEMAS);
  protected readonly tamanhos = opcoes<TamanhoFonte>(TAMANHOS_FONTE);
  protected readonly contrastes = opcoes<Contraste>(CONTRASTES);
  protected readonly animacoes = opcoes<Animacoes>(OPCOES_ANIMACOES);

  protected readonly mensagem = signal<string | null>(inject(AvisoNavegacao).consumir());
  protected readonly anuncio = signal('');
  protected readonly erro = signal<string | null>(null);
  protected readonly exportando = signal(false);
  protected readonly erroExportacao = signal<string | null>(null);

  protected async definirTema(tema: Tema): Promise<void> {
    await this.aplicar(() => this.preferencias.definirTema(tema), `Tema: ${TEMAS[tema]}.`);
  }

  protected async ajustar(ajuste: Partial<PreferenciasAcessibilidade>): Promise<void> {
    await this.aplicar(() => this.preferencias.definirAcessibilidade(ajuste), 'Preferência salva.');
  }

  protected async exportar(): Promise<void> {
    this.erroExportacao.set(null);
    this.mensagem.set(null);
    this.exportando.set(true);
    try {
      const { nome, conteudo } = await this.backup.exportar();
      baixarArquivo(this.documento, nome, conteudo, 'application/json');
      this.mensagem.set(`Backup exportado: ${nome}. Guarde-o em um lugar seguro.`);
    } catch (e) {
      this.erroExportacao.set(mensagemDeErro(e));
    } finally {
      this.exportando.set(false);
    }
  }

  private async aplicar(acao: () => Promise<void>, sucesso: string): Promise<void> {
    this.erro.set(null);
    try {
      await acao();
      this.anuncio.set(sucesso);
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    }
  }
}
