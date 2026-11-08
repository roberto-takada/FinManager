import { type CodigoErroCofre, ErroCofre } from '../../../application/cofre/cofre.service';
import { ErroDominio } from '../../../domain/shared/erro-dominio';

const MENSAGENS: Record<CodigoErroCofre, string> = {
  'cofre-existente': 'Já existe um cofre neste navegador.',
  'cofre-inexistente': 'Não há cofre neste navegador.',
  'cofre-bloqueado': 'O cofre foi bloqueado. Desbloqueie-o e tente de novo.',
  'senha-fraca': 'A senha não atende à força mínima.',
  'aviso-nao-aceito': 'Confirme que entendeu o aviso sobre a recuperação dos dados.',
  'chave-invalida': 'A chave de recuperação está em um formato inválido.',
  'frase-incorreta': 'A frase de confirmação não confere.',
};

/** Converte um erro em mensagem para o usuário, sem expor detalhes técnicos. */
export function mensagemDeErro(erro: unknown): string {
  if (erro instanceof ErroCofre) return MENSAGENS[erro.codigo];
  // Regras de negócio já trazem mensagens prontas para o usuário.
  if (erro instanceof ErroDominio) return erro.message;
  console.error(erro);
  return 'Ocorreu um erro inesperado. Nenhum dado foi alterado. Tente novamente.';
}

export function segundos(ms: number): number {
  return Math.ceil(ms / 1000);
}
