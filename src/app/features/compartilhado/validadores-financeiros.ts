import type { ValidatorFn } from '@angular/forms';
import { lerDinheiro } from '../../domain/shared/dinheiro';

/**
 * Valor monetário digitado no formato brasileiro (ex.: "1.234,56").
 * Erros: `valorInvalido` (não é um valor) e `valorNaoPositivo` (zero ou negativo).
 */
export function valorMonetario(opcoes: { permitirNegativoOuZero?: boolean } = {}): ValidatorFn {
  return (controle) => {
    const texto = String(controle.value ?? '').trim();
    if (!texto) return null; // obrigatoriedade fica com Validators.required
    const valor = lerDinheiro(texto);
    if (!valor) return { valorInvalido: true };
    if (!opcoes.permitirNegativoOuZero && valor.unidades <= 0) return { valorNaoPositivo: true };
    return null;
  };
}

/** Mensagem do campo de valor conforme o erro (US-001). */
export function mensagemValor(erros: Record<string, unknown> | null): string | null {
  if (!erros) return null;
  if (erros['required'] || erros['valorNaoPositivo']) return 'Informe um valor maior que zero.';
  if (erros['valorInvalido']) return 'Informe um valor válido, por exemplo 1.234,56.';
  return null;
}
