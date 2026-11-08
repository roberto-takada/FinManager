import { ErroDominio } from '../../domain/shared/erro-dominio';

/** Lado da foto guardada, em pixels (exibida no máximo com 96 px). */
export const LADO_FOTO = 128;
const TAMANHO_MAXIMO_ARQUIVO = 10 * 1024 * 1024;

/**
 * Prepara a foto do perfil (RF-080) no próprio navegador: recorta o centro em quadrado,
 * reduz para 128 × 128 e regrava como JPEG. Regravar descarta os metadados do arquivo
 * original (ex.: localização GPS), e a imagem pequena mantém o cofre leve.
 */
export async function reduzirFoto(arquivo: File, documento: Document): Promise<string> {
  if (!/^image\/(png|jpeg|webp)$/.test(arquivo.type)) {
    throw new ErroDominio('foto-tipo', 'Escolha uma imagem PNG, JPEG ou WebP.', 'avatar');
  }
  if (arquivo.size > TAMANHO_MAXIMO_ARQUIVO) {
    throw new ErroDominio('foto-grande', 'Escolha uma imagem de até 10 MB.', 'avatar');
  }
  let imagem: ImageBitmap;
  try {
    imagem = await createImageBitmap(arquivo);
  } catch {
    throw new ErroDominio(
      'foto-ilegivel',
      'Não foi possível ler essa imagem. Tente outra.',
      'avatar',
    );
  }
  const lado = Math.min(imagem.width, imagem.height);
  const tela = documento.createElement('canvas');
  tela.width = LADO_FOTO;
  tela.height = LADO_FOTO;
  const contexto = tela.getContext('2d');
  if (!contexto) {
    imagem.close();
    throw new ErroDominio(
      'foto-ilegivel',
      'Não foi possível ler essa imagem. Tente outra.',
      'avatar',
    );
  }
  contexto.drawImage(
    imagem,
    (imagem.width - lado) / 2,
    (imagem.height - lado) / 2,
    lado,
    lado,
    0,
    0,
    LADO_FOTO,
    LADO_FOTO,
  );
  imagem.close();
  return tela.toDataURL('image/jpeg', 0.85);
}
