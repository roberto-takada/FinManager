import { TestBed } from '@angular/core/testing';
import { FormControl, FormGroup } from '@angular/forms';
import { provideRouter } from '@angular/router';
import { type AmbienteDados, prepararAmbienteDados } from '../../../testing/dados';
import { RascunhosService } from '../../application/rascunhos/rascunhos.service';
import {
  ATRASO_RASCUNHO_MS,
  EdicaoFormularios,
  type RascunhoFormulario,
  rascunhoDoFormulario,
} from './rascunho-formulario';

describe('RascunhoFormulario (RF-070 a RF-072)', () => {
  let amb: AmbienteDados;
  let rascunhos: RascunhosService;
  let form: FormGroup<{ valor: FormControl<string>; descricao: FormControl<string> }>;
  let rascunho: RascunhoFormulario;
  const OPCOES = { chave: 'transacao:nova', titulo: 'Nova transação' };

  const criar = () =>
    TestBed.runInInjectionContext(() => {
      form = new FormGroup({
        valor: new FormControl('', { nonNullable: true }),
        descricao: new FormControl('', { nonNullable: true }),
      });
      return rascunhoDoFormulario(form);
    });
  const esperarGravacao = () => vi.advanceTimersByTimeAsync(ATRASO_RASCUNHO_MS + 10);

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    amb = await prepararAmbienteDados();
    rascunhos = TestBed.inject(RascunhosService);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    rascunho = criar();
    rascunho.iniciar(OPCOES);
  });

  afterEach(() => vi.useRealTimers());

  it('grava o rascunho pouco depois da última alteração (RNF-011: até 2 s)', async () => {
    expect(ATRASO_RASCUNHO_MS).toBeLessThanOrEqual(2000);
    form.controls.valor.setValue('1');
    form.controls.valor.setValue('12,50');
    expect(rascunhos.buscar(OPCOES.chave)).toBeNull();
    await esperarGravacao();
    expect(rascunhos.buscar(OPCOES.chave)).toMatchObject({
      titulo: 'Nova transação',
      url: '/',
      valores: { valor: '12,50', descricao: '' },
    });
    expect(rascunho.salvoEm()).not.toBeNull();
    expect(TestBed.inject(EdicaoFormularios).haAlteracoes()).toBe(true);
  });

  it('voltar ao estado inicial apaga o rascunho', async () => {
    form.controls.valor.setValue('9');
    await esperarGravacao();
    form.controls.valor.setValue('');
    await esperarGravacao();
    expect(rascunhos.buscar(OPCOES.chave)).toBeNull();
    expect(rascunho.alterado()).toBe(false);
  });

  it('ao reabrir o formulário, oferece o rascunho sem sobrescrevê-lo até a escolha', async () => {
    form.patchValue({ valor: '50,00', descricao: 'Feira' });
    await esperarGravacao();

    const outro = criar();
    outro.iniciar(OPCOES);
    expect(outro.oferta()?.valores).toEqual({ valor: '50,00', descricao: 'Feira' });
    form.controls.descricao.setValue('Outra coisa');
    await esperarGravacao();
    expect(rascunhos.buscar(OPCOES.chave)?.valores['descricao']).toBe('Feira');

    outro.restaurar();
    expect(form.getRawValue()).toEqual({ valor: '50,00', descricao: 'Feira' });
    expect(outro.oferta()).toBeNull();
    expect(outro.anuncio()).toContain('Rascunho restaurado');
  });

  it('"Restaurar" no aviso global abre o formulário já restaurado', async () => {
    form.patchValue({ valor: '7,00' });
    await esperarGravacao();
    TestBed.inject(EdicaoFormularios).pedirRestauracao(OPCOES.chave);
    criar().iniciar(OPCOES);
    expect(form.getRawValue().valor).toBe('7,00');
  });

  it('"Descartar" apaga o rascunho guardado', async () => {
    form.patchValue({ valor: '7,00' });
    await esperarGravacao();
    const outro = criar();
    outro.iniciar(OPCOES);
    await outro.descartar();
    expect(rascunhos.buscar(OPCOES.chave)).toBeNull();
    expect(outro.anuncio()).toBe('Rascunho descartado.');
  });

  it('concluir salva e encerra o rascunho; nada é regravado depois', async () => {
    form.controls.valor.setValue('3,00');
    await esperarGravacao();
    form.controls.valor.setValue('30,00');
    await rascunho.concluir(() =>
      amb.dados.alterar(() => ({ mudancas: { contas: [] }, resultado: null })),
    );
    await esperarGravacao();
    expect(rascunhos.buscar(OPCOES.chave)).toBeNull();
    expect(rascunho.temAlteracoesPendentes()).toBe(false);
  });

  it('sair sem salvar (confirmado) apaga o rascunho', async () => {
    form.controls.valor.setValue('3,00');
    await esperarGravacao();
    await rascunho.abandonar();
    expect(rascunhos.buscar(OPCOES.chave)).toBeNull();
    expect(rascunho.temAlteracoesPendentes()).toBe(false);
  });

  it('a pergunta "Sair sem salvar?" é respondida pelo diálogo', async () => {
    const edicao = TestBed.inject(EdicaoFormularios);
    const resposta = edicao.perguntarSaida('Nova transação');
    expect(edicao.pedidoSaida()?.titulo).toBe('Nova transação');
    edicao.pedidoSaida()!.responder(false);
    expect(await resposta).toBe(false);
    expect(edicao.pedidoSaida()).toBeNull();
  });
});
