/** Oferece um arquivo para download, gerado no próprio navegador (sem rede). */
export function baixarArquivo(
  documento: Document,
  nome: string,
  conteudo: string,
  tipo: string,
): void {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const link = documento.createElement('a');
  link.href = url;
  link.download = nome;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
