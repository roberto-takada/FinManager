import { ErroDominio } from '../shared/erro-dominio';
import { iniciais, PERFIL_PADRAO, primeiroNome, validarPerfil } from './perfil';

const FOTO = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==';

describe('perfil (RF-080)', () => {
  it('normaliza nome e e-mail; ambos podem ficar vazios', () => {
    expect(
      validarPerfil({ ...PERFIL_PADRAO, nome: '  Ana   Exemplo ', email: ' ana@example.com ' }),
    ).toEqual({ ...PERFIL_PADRAO, nome: 'Ana Exemplo', email: 'ana@example.com' });
    expect(validarPerfil(PERFIL_PADRAO)).toEqual(PERFIL_PADRAO);
  });

  it('recusa e-mail fora do formato e nome longo, indicando o campo', () => {
    for (const email of ['ana', 'ana@', 'ana@exemplo', 'a b@example.com']) {
      expect(() => validarPerfil({ ...PERFIL_PADRAO, email })).toThrow(
        expect.objectContaining({ campo: 'email' }) as unknown as ErroDominio,
      );
    }
    expect(() => validarPerfil({ ...PERFIL_PADRAO, nome: 'x'.repeat(61) })).toThrow(/60/);
  });

  it('aceita foto PNG/JPEG/WebP em base64 e recusa SVG, outros esquemas e excesso de tamanho', () => {
    expect(
      validarPerfil({ ...PERFIL_PADRAO, avatar: { tipo: 'foto', imagem: FOTO } }).avatar,
    ).toEqual({
      tipo: 'foto',
      imagem: FOTO,
    });
    for (const imagem of [
      'data:image/svg+xml;base64,PHN2Zz4=',
      'javascript:alert(1)',
      'https://example.com/a.png',
    ]) {
      expect(() => validarPerfil({ ...PERFIL_PADRAO, avatar: { tipo: 'foto', imagem } })).toThrow(
        ErroDominio,
      );
    }
    const enorme = `data:image/png;base64,${'A'.repeat(300_000)}`;
    expect(() =>
      validarPerfil({ ...PERFIL_PADRAO, avatar: { tipo: 'foto', imagem: enorme } }),
    ).toThrow(/grande/);
    expect(() =>
      validarPerfil({ ...PERFIL_PADRAO, avatar: { tipo: 'iniciais', cor: 'neon' as never } }),
    ).toThrow(ErroDominio);
  });

  it('iniciais e primeiro nome', () => {
    expect(iniciais('Ana Maria Exemplo')).toBe('AE');
    expect(iniciais('ana')).toBe('A');
    expect(iniciais('  ')).toBe('');
    expect(iniciais('élio souza')).toBe('ÉS');
    expect(primeiroNome(' Ana Exemplo')).toBe('Ana');
  });
});
