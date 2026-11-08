/**
 * Proteção contra clickjacking (RNF-064, ADR-0005).
 *
 * O GitHub Pages não permite o cabeçalho `frame-ancestors`, que também não funciona
 * em `<meta>`. Por isso o app verifica em código se está dentro de um iframe e, nesse
 * caso, não é inicializado: no lugar da interface aparece só um aviso.
 */

/** Indica se a página está sendo exibida dentro de um frame (iframe, frame, object). */
export function estaEmFrame(janela: { readonly self: unknown; readonly top: unknown }): boolean {
  try {
    return janela.top !== janela.self;
  } catch {
    // Na dúvida, trata como se estivesse em um frame (falhar de forma segura).
    return true;
  }
}

export const MENSAGEM_FRAME =
  'Por segurança, o FinManager não pode ser aberto dentro de outra página.';

/**
 * Substitui o conteúdo da página por um aviso com link para abrir o app em uma aba própria.
 * Usa apenas APIs de DOM (sem innerHTML), compatível com Trusted Types.
 */
export function exibirAvisoDeFrame(documento: Document, urlDoApp: string): void {
  const aviso = documento.createElement('main');
  aviso.setAttribute('role', 'alert');
  aviso.className = 'mx-auto flex max-w-xl flex-col gap-3 p-6';

  const texto = documento.createElement('p');
  texto.textContent = MENSAGEM_FRAME;

  const link = documento.createElement('a');
  link.href = urlDoApp;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.className = 'underline';
  link.textContent = 'Abrir o FinManager em uma nova aba';

  aviso.append(texto, link);
  documento.body.replaceChildren(aviso);
}
