import { ativos, type Entidade, normalizarTexto } from '../shared/entidade';
import { ErroDominio } from '../shared/erro-dominio';

/** Categorias e subcategorias (RF-015). Só um nível de subcategoria. */
export type TipoMovimento = 'receita' | 'despesa';

export interface DadosCategoria {
  readonly nome: string;
  readonly tipo: TipoMovimento;
  /** Categoria-pai, para subcategorias. */
  readonly paiId: string | null;
}

export interface Categoria extends Entidade, DadosCategoria {}

export const TAMANHO_MAXIMO_NOME_CATEGORIA = 40;

export function validarCategoria(
  dados: DadosCategoria,
  categorias: readonly Categoria[],
  idAtual?: string,
): DadosCategoria {
  const nome = dados.nome.trim();
  if (!nome) throw new ErroDominio('nome-obrigatorio', 'Informe o nome da categoria.', 'nome');
  if (nome.length > TAMANHO_MAXIMO_NOME_CATEGORIA) {
    throw new ErroDominio(
      'nome-longo',
      `O nome pode ter até ${TAMANHO_MAXIMO_NOME_CATEGORIA} caracteres.`,
      'nome',
    );
  }
  if (dados.tipo !== 'receita' && dados.tipo !== 'despesa') {
    throw new ErroDominio(
      'tipo-invalido',
      'Escolha se a categoria é de receita ou despesa.',
      'tipo',
    );
  }

  const ativas = ativos(categorias);
  if (dados.paiId !== null) {
    if (dados.paiId === idAtual) {
      throw new ErroDominio('pai-invalido', 'Uma categoria não pode ser pai de si mesma.', 'paiId');
    }
    const pai = ativas.find((c) => c.id === dados.paiId);
    if (!pai) throw new ErroDominio('pai-inexistente', 'A categoria-pai não existe.', 'paiId');
    if (pai.paiId !== null) {
      throw new ErroDominio(
        'pai-invalido',
        'Subcategorias não podem ter outras subcategorias.',
        'paiId',
      );
    }
    if (pai.tipo !== dados.tipo) {
      throw new ErroDominio(
        'pai-invalido',
        'A subcategoria precisa ser do mesmo tipo da categoria-pai.',
        'paiId',
      );
    }
    if (idAtual && ativas.some((c) => c.paiId === idAtual)) {
      throw new ErroDominio(
        'pai-invalido',
        'Esta categoria tem subcategorias e não pode virar subcategoria.',
        'paiId',
      );
    }
  }

  const repetida = ativas.some(
    (c) =>
      c.id !== idAtual &&
      c.tipo === dados.tipo &&
      c.paiId === dados.paiId &&
      normalizarTexto(c.nome) === normalizarTexto(nome),
  );
  if (repetida) {
    throw new ErroDominio('nome-repetido', 'Já existe uma categoria com esse nome aqui.', 'nome');
  }
  return { ...dados, nome };
}

/** O id da categoria e de todas as suas subcategorias (usado nos filtros). */
export function idsComSubcategorias(categorias: readonly Categoria[], id: string): Set<string> {
  return new Set([id, ...categorias.filter((c) => c.paiId === id).map((c) => c.id)]);
}

/** Nome para exibição, ex.: "Alimentação › Mercado". */
export function rotuloCategoria(categoria: Categoria, categorias: readonly Categoria[]): string {
  const pai = categoria.paiId ? categorias.find((c) => c.id === categoria.paiId) : undefined;
  return pai ? `${pai.nome} › ${categoria.nome}` : categoria.nome;
}

/** Categorias ativas ordenadas como árvore: cada pai seguido das suas subcategorias. */
export function ordenarComoArvore(categorias: readonly Categoria[]): Categoria[] {
  const ativas = ativos(categorias);
  const porNome = (a: Categoria, b: Categoria) => a.nome.localeCompare(b.nome, 'pt-BR');
  return ativas
    .filter((c) => c.paiId === null)
    .sort(porNome)
    .flatMap((pai) => [pai, ...ativas.filter((c) => c.paiId === pai.id).sort(porNome)]);
}

/** Categorias criadas junto com o cofre (o usuário pode editar ou excluir). */
export const CATEGORIAS_PADRAO: readonly {
  nome: string;
  tipo: TipoMovimento;
  subcategorias?: readonly string[];
}[] = [
  { nome: 'Salário', tipo: 'receita' },
  { nome: 'Renda extra', tipo: 'receita', subcategorias: ['Freelance', 'Vendas'] },
  { nome: 'Rendimentos', tipo: 'receita' },
  { nome: 'Outras receitas', tipo: 'receita' },
  { nome: 'Moradia', tipo: 'despesa', subcategorias: ['Aluguel', 'Contas da casa'] },
  { nome: 'Alimentação', tipo: 'despesa', subcategorias: ['Mercado', 'Restaurantes'] },
  { nome: 'Transporte', tipo: 'despesa', subcategorias: ['Combustível', 'Aplicativos'] },
  { nome: 'Saúde', tipo: 'despesa' },
  { nome: 'Educação', tipo: 'despesa' },
  { nome: 'Lazer', tipo: 'despesa', subcategorias: ['Assinaturas'] },
  { nome: 'Compras', tipo: 'despesa' },
  { nome: 'Outras despesas', tipo: 'despesa' },
];

/** Monta as categorias padrão como entidades (usado ao criar o cofre). */
export function montarCategoriasPadrao(gerarId: () => string, instante: string): Categoria[] {
  const base = () => ({
    id: gerarId(),
    criadoEm: instante,
    atualizadoEm: instante,
    excluidoEm: null,
  });
  return CATEGORIAS_PADRAO.flatMap(({ nome, tipo, subcategorias = [] }) => {
    const pai: Categoria = { ...base(), nome, tipo, paiId: null };
    return [
      pai,
      ...subcategorias.map((sub): Categoria => ({ ...base(), nome: sub, tipo, paiId: pai.id })),
    ];
  });
}
