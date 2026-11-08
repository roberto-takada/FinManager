import { ErroDominio } from '../shared/erro-dominio';

/**
 * Perfil do usuário (RF-080): nome, e-mail e avatar. Fica cifrado no cofre, como todo dado
 * de perfil (RN-001), e nunca sai do navegador: o e-mail não é usado para contato.
 */

/** Cores com contraste AA para as iniciais nos dois temas. */
export type CorAvatar = 'roxo' | 'aqua' | 'rosa' | 'cinza';

export const CORES_AVATAR: Readonly<Record<CorAvatar, string>> = {
  roxo: 'Roxo',
  aqua: 'Água',
  rosa: 'Rosa',
  cinza: 'Cinza',
};

/** Iniciais sobre uma cor, ou uma foto reduzida (data URL de imagem). */
export type Avatar =
  | { readonly tipo: 'iniciais'; readonly cor: CorAvatar }
  | { readonly tipo: 'foto'; readonly imagem: string };

export interface DadosPerfil {
  readonly nome: string;
  readonly email: string;
  readonly avatar: Avatar;
}

export interface Perfil extends DadosPerfil {
  readonly atualizadoEm: string;
}

export const TAMANHO_MAXIMO_NOME_PERFIL = 60;
export const TAMANHO_MAXIMO_EMAIL = 254;
/** A foto é reduzida antes de gravar; isto só barra arquivos fora do esperado (~200 KB). */
export const TAMANHO_MAXIMO_FOTO = 280_000;

export const PERFIL_PADRAO: DadosPerfil = {
  nome: '',
  email: '',
  avatar: { tipo: 'iniciais', cor: 'roxo' },
};

/** Formato simples (algo@algo.dominio): o e-mail não é verificado nem usado para envio. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Só imagens raster em base64: nada de SVG (que poderia conter script). */
const FOTO = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

export function validarPerfil(dados: DadosPerfil): DadosPerfil {
  const nome = dados.nome.trim().replace(/\s+/g, ' ');
  const email = dados.email.trim();
  if (nome.length > TAMANHO_MAXIMO_NOME_PERFIL) {
    throw new ErroDominio(
      'nome-longo',
      `O nome pode ter até ${TAMANHO_MAXIMO_NOME_PERFIL} caracteres.`,
      'nome',
    );
  }
  if (email && (email.length > TAMANHO_MAXIMO_EMAIL || !EMAIL.test(email))) {
    throw new ErroDominio(
      'email-invalido',
      'Informe um e-mail no formato nome@exemplo.com, ou deixe o campo vazio.',
      'email',
    );
  }
  const avatar = dados.avatar;
  if (avatar.tipo === 'iniciais' && !(avatar.cor in CORES_AVATAR)) {
    throw new ErroDominio('cor-invalida', 'Escolha uma cor para o avatar.', 'avatar');
  }
  if (avatar.tipo === 'foto') {
    if (!FOTO.test(avatar.imagem)) {
      throw new ErroDominio('foto-invalida', 'A foto precisa ser PNG, JPEG ou WebP.', 'avatar');
    }
    if (avatar.imagem.length > TAMANHO_MAXIMO_FOTO) {
      throw new ErroDominio(
        'foto-grande',
        'A foto ficou grande demais. Tente outra imagem.',
        'avatar',
      );
    }
  }
  if (avatar.tipo !== 'iniciais' && avatar.tipo !== 'foto') {
    throw new ErroDominio('avatar-invalido', 'Escolha um avatar.', 'avatar');
  }
  return { nome, email, avatar };
}

/** "Ana Maria Exemplo" → "AE"; "ana" → "A"; sem nome → "". */
export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '';
  const primeira = partes[0]!.charAt(0);
  const ultima = partes.length > 1 ? partes.at(-1)!.charAt(0) : '';
  return (primeira + ultima).toLocaleUpperCase('pt-BR');
}

/** Primeiro nome, para saudações ("Olá, Ana"). */
export function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? '';
}
