/** Violação de uma regra de negócio. A mensagem é exibível ao usuário (pt-BR). */
export class ErroDominio extends Error {
  constructor(
    readonly codigo: string,
    mensagem: string,
    /** Campo do formulário relacionado, quando houver. */
    readonly campo?: string,
  ) {
    super(mensagem);
    this.name = 'ErroDominio';
  }
}
