import { estaEmFrame, exibirAvisoDeFrame, MENSAGEM_FRAME } from './anti-clickjacking';

describe('estaEmFrame', () => {
  it('retorna false quando a página é a janela de topo', () => {
    const janela = {} as Window;
    expect(estaEmFrame({ self: janela, top: janela })).toBe(false);
  });

  it('retorna true quando a página está dentro de outra janela', () => {
    expect(estaEmFrame({ self: {} as Window, top: {} as Window })).toBe(true);
  });

  it('retorna true (falha segura) se o acesso a window.top lançar erro', () => {
    const janela = {
      self: {} as Window,
      get top(): Window {
        throw new Error('acesso negado');
      },
    };
    expect(estaEmFrame(janela)).toBe(true);
  });
});

describe('exibirAvisoDeFrame', () => {
  beforeEach(() => {
    document.body.replaceChildren(document.createElement('app-root'));
  });

  it('remove a aplicação e exibe o aviso como alerta', () => {
    exibirAvisoDeFrame(document, 'https://exemplo.test/FinManager/');

    expect(document.querySelector('app-root')).toBeNull();
    const alerta = document.querySelector('[role="alert"]');
    expect(alerta?.textContent).toContain(MENSAGEM_FRAME);
  });

  it('oferece link seguro para abrir o app em nova aba', () => {
    exibirAvisoDeFrame(document, 'https://exemplo.test/FinManager/');

    const link = document.querySelector('a');
    expect(link?.getAttribute('href')).toBe('https://exemplo.test/FinManager/');
    expect(link?.target).toBe('_blank');
    expect(link?.rel).toBe('noopener noreferrer');
  });
});
