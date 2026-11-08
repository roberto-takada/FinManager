/**
 * Lista central das ações significativas (RN-005). Toda ação desta lista exige
 * confirmação explícita do usuário (RN-003) — ver ENGENHARIA_DE_SOFTWARE §5.3.
 */
export const ACOES_SIGNIFICATIVAS = {
  excluirRegistro: 'RN-005 (a): exclusão de registro',
  editarValorOuData: 'RN-005 (b): edição de valor ou data de transação',
  alteracaoEmLote: 'RN-005 (c): alteração em lote',
  encerrarCofrinho: 'RN-005 (d): encerramento ou zeramento de cofrinho',
  apagarCofre: 'RN-005 (e): apagamento do cofre',
  alterarSenhaMestra: 'RN-005 (f): alteração da senha mestra',
  alterarChaveRecuperacao: 'RN-005 (f): alteração da chave de recuperação',
  importarBackup: 'RN-005 (g): importação de backup',
  trocarMoeda: 'RN-005 (h): troca da moeda do app',
} as const;

export type AcaoSignificativa = keyof typeof ACOES_SIGNIFICATIVAS;
