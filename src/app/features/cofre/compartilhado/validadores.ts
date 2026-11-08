import type { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { chaveRecuperacaoValida } from '../../../domain/cofre/chave-recuperacao';
import { avaliarForcaSenha } from '../../../domain/cofre/forca-senha';

/** A senha precisa atender à força mínima do domínio (RF-001). */
export const senhaForte: ValidatorFn = (controle) =>
  avaliarForcaSenha(String(controle.value ?? '')).aceitavel ? null : { senhaFraca: true };

/** A chave de recuperação precisa estar no formato correto (32 caracteres Base32). */
export const formatoChaveRecuperacao: ValidatorFn = (controle) =>
  chaveRecuperacaoValida(String(controle.value ?? '')) ? null : { chaveInvalida: true };

/** Validador de grupo: dois campos precisam ter o mesmo valor (ex.: senha e confirmação). */
export function camposIguais(campo: string, confirmacao: string): ValidatorFn {
  return (grupo: AbstractControl): ValidationErrors | null => {
    const confirmacaoCtrl = grupo.get(confirmacao);
    if (!confirmacaoCtrl?.value) return null;
    return grupo.get(campo)?.value === confirmacaoCtrl.value ? null : { naoConferem: true };
  };
}

/** Sorteio para escolher os grupos da chave a confirmar (não é usado para segredos). */
export function sortear(limite: number): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]! % limite;
}
