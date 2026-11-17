// Convite e senha nova por link secreto (Eduardo 17/11): a tela chama a Edge Function gerar-link e mostra o link.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gerarLink, entrarComSenha, entrarPeloLink, mandarLink } from '../src/nuvem.js';

const resposta = (status, corpo) => ({ data: null, error: { context: { status, json: async () => corpo } } });

test('gerar-link: convite vai com o e-mail limpo e o endereço de volta; devolve o link', async () => {
  let pedido;
  const link = await gerarLink({ tipo: 'convite', empresa: 'e1', email: ' Bia@Empresa.com.br ', papel: 'membro' },
    { invoke: async (nome, { body }) => ((pedido = [nome, body]), { data: { link: 'https://x/verify?token=t' }, error: null }) });
  assert.equal(link, 'https://x/verify?token=t');
  assert.equal(pedido[0], 'gerar-link');
  assert.equal(pedido[1].email, 'bia@empresa.com.br');
});

test('gerar-link: link null = a pessoa já tem conta com senha (o convite ficou salvo)', async () => {
  assert.equal(await gerarLink({ tipo: 'convite', empresa: 'e1', email: 'ana@a.com', papel: 'membro' }, { invoke: async () => ({ data: { link: null, email: 'ana@a.com' }, error: null }) }), null);
});

test('volta do link secreto: troca o token por sessão (verifyOtp); tipo estranho ou token vencido dão erro', async () => {
  let pedido;
  await entrarPeloLink('abc123', 'invite', { verifyOtp: async (p) => ((pedido = p), { error: null }) });
  assert.deepEqual(pedido, { token_hash: 'abc123', type: 'invite' });
  await assert.rejects(entrarPeloLink('abc123', 'signup', { verifyOtp: async () => ({ error: null }) }));
  await assert.rejects(entrarPeloLink('abc123', 'recovery', { verifyOtp: async () => ({ error: { message: 'Token has expired or is invalid' } }) }));
});

test('gerar-link: e-mail inválido nem chega na função', async () => {
  let chamou = false;
  await assert.rejects(gerarLink({ tipo: 'convite', empresa: 'e1', email: 'abc', papel: 'membro' }, { invoke: async () => ((chamou = true), {}) }), /e-mail válido/);
  assert.equal(chamou, false);
});

test('gerar-link: o erro da função aparece como ela escreveu; função não publicada vem marcada (a tela faz o convite de antes)', async () => {
  await assert.rejects(gerarLink({ tipo: 'senha', empresa: 'e1', usuario: 'u2' }, { invoke: async () => resposta(403, { erro: 'Só o admin da empresa pode gerar links.' }) }),
    (x) => x.message === 'Só o admin da empresa pode gerar links.' && !x.semFuncao);
  await assert.rejects(gerarLink({ tipo: 'senha', empresa: 'e1', usuario: 'u2' }, { invoke: async () => resposta(404, null) }), (x) => x.semFuncao === true && /ainda não foi ligado/.test(x.message));
});

test('gerar-link: 401 (a função recusou o acesso), 503, 500 e falta de internet aparecem na tela; só o 404 vira o convite de antes', async () => {
  const pede = (r) => gerarLink({ tipo: 'senha', empresa: 'e1', usuario: 'u2' }, { invoke: async () => r }).then(() => null, (x) => [x.message, x.semFuncao]);
  assert.deepEqual(await pede(resposta(401, { code: 401, message: 'Invalid JWT' })), ['Não deu para gerar o link agora (erro 401). Tente de novo; se continuar, avise o suporte.', false]);
  assert.deepEqual(await pede(resposta(503, { erro: 'O convite por link ainda não foi ligado no Supabase.' })), ['O convite por link ainda não foi ligado no Supabase.', false]);
  assert.deepEqual(await pede(resposta(500, null)), ['Não deu para gerar o link agora (erro 500). Tente de novo; se continuar, avise o suporte.', false]);
  assert.deepEqual(await pede({ data: null, error: { name: 'FunctionsFetchError', message: 'Failed to send a request' } }), ['Não deu para gerar o link agora. Confira a internet e tente de novo.', false]);
  assert.equal((await pede(resposta(404, null)))[1], true);
});

test('cadastro aberto desligado: e-mail sem conta no Entrar diz só "E-mail ou senha incorretos"', async () => {
  const auth = {
    signInWithPassword: async () => ({ data: { session: null }, error: { message: 'Invalid login credentials' } }),
    signUp: async () => ({ data: { session: null, user: null }, error: { message: 'Signups not allowed for this instance' } }),
  };
  await assert.rejects(entrarComSenha('ze@x.com', 'senha1234', auth), { message: 'E-mail ou senha incorretos.' });
});

test('link secreto sem rede ou com o servidor fora: erro marcado como rede (o link continua valendo); 4xx é link vencido', async () => {
  const tenta = (error) => entrarPeloLink('abc', 'invite', { verifyOtp: async () => ({ error }) }).then(() => null, (x) => x.rede);
  assert.equal(await tenta({ name: 'AuthRetryableFetchError', message: 'Failed to fetch', status: 0 }), true);
  assert.equal(await tenta({ message: 'upstream error', status: 502 }), true);
  assert.equal(await tenta({ message: 'Token has expired or is invalid', status: 403 }), false);
});

test('receber link por e-mail: não cria conta e responde igual para quem tem e quem não tem conta', async () => {
  let opcoes;
  await mandarLink(' Ana@A.com ', { signInWithOtp: async ({ email, options }) => ((opcoes = { email, ...options }), { error: null }) });
  assert.equal(opcoes.shouldCreateUser, false);
  assert.equal(opcoes.email, 'ana@a.com');
  await mandarLink('ze@x.com', { signInWithOtp: async () => ({ error: { message: 'Signups not allowed for otp' } }) }); // sem conta: nada muda na tela
  await assert.rejects(mandarLink('ana@a.com', { signInWithOtp: async () => ({ error: { message: 'For security purposes, you can only request this after 40 seconds.' } }) }), /Espere 1 minuto/);
});
