import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DialogoConfirmacao } from './dialogo-confirmacao';

@Component({
  imports: [DialogoConfirmacao],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button id="origem">Abrir</button>
    <app-dialogo-confirmacao
      titulo="Excluir conta de luz?"
      mensagem="A conta irá para a lixeira."
      rotuloConfirmar="Excluir conta de luz"
      [perigoso]="true"
      [aberto]="aberto()"
      (confirmado)="eventos.push('confirmado'); aberto.set(false)"
      (cancelado)="eventos.push('cancelado'); aberto.set(false)"
    />
  `,
})
class Hospedeiro {
  readonly aberto = signal(false);
  readonly eventos: string[] = [];
}

describe('DialogoConfirmacao (RN-003, §5.3)', () => {
  let hospedeiro: Hospedeiro;
  let raiz: HTMLElement;

  beforeEach(async () => {
    const fixture = TestBed.createComponent(Hospedeiro);
    hospedeiro = fixture.componentInstance;
    raiz = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  });

  const abrir = async () => {
    hospedeiro.aberto.set(true);
    TestBed.tick();
  };
  const dialogo = () => raiz.querySelector('dialog')!;
  const botao = (texto: string) =>
    [...raiz.querySelectorAll('button')].find((b) => b.textContent?.trim() === texto)!;

  it('começa fechado', () => {
    expect(dialogo().open).toBe(false);
  });

  it('abre com título e descrição acessíveis e foco em "Cancelar"', async () => {
    await abrir();

    expect(dialogo().open).toBe(true);
    const titulo = raiz.querySelector(`#${dialogo().getAttribute('aria-labelledby')}`);
    const descricao = raiz.querySelector(`#${dialogo().getAttribute('aria-describedby')}`);
    expect(titulo?.textContent).toContain('Excluir conta de luz?');
    expect(descricao?.textContent).toContain('A conta irá para a lixeira.');
    expect(document.activeElement).toBe(botao('Cancelar'));
  });

  it('o botão de ação usa o verbo explícito e estilo de perigo', async () => {
    await abrir();
    expect(botao('Excluir conta de luz').className).toContain('botao-perigo');
  });

  it('confirmar emite "confirmado" e fecha', async () => {
    await abrir();
    botao('Excluir conta de luz').click();
    TestBed.tick();

    expect(hospedeiro.eventos).toEqual(['confirmado']);
    expect(dialogo().open).toBe(false);
  });

  it('cancelar e Esc emitem "cancelado"', async () => {
    await abrir();
    botao('Cancelar').click();
    TestBed.tick();
    await abrir();
    dialogo().dispatchEvent(new Event('cancel', { cancelable: true }));
    TestBed.tick();

    expect(hospedeiro.eventos).toEqual(['cancelado', 'cancelado']);
    expect(dialogo().open).toBe(false);
  });
});
