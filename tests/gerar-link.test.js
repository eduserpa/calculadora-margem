// Edge Function gerar-link (supabase/functions/gerar-link/index.ts), sem rede: Deno e fetch falsos.
// Confere: precisa estar logado; o banco (preparar_link_*, com o JWT de quem pede) decide ANTES, e quando recusa (sem permissão,
// e-mail ou papel inválido, alvo de outra empresa, link que entraria em outra empresa) o Auth nem é chamado; a chave de
// serviço só vai no cabeçalho do Auth e nunca aparece na resposta; o link é do app, com o token depois do # (a prévia do
// WhatsApp não gasta); quem já tem senha não recebe link.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const env = { SUPABASE_URL: 'https://banco.exemplo', SUPABASE_ANON_KEY: 'pub', SUPABASE_SERVICE_ROLE_KEY: 'CHAVE-SERVICO-NAO-VAZA' };
let atender;
globalThis.Deno = { env: { get: (k) => env[k] }, serve: (h) => (atender = h) };
await import('../supabase/functions/gerar-link/index.ts');

const chamadas = [];
let banco = { email: 'novo@a.com', tipo: 'invite' }; // o que preparar_link_* responde (status 200), ou { status, message }
let statusAuth = 200;
globalThis.fetch = async (url, op = {}) => {
  const u = String(url);
  chamadas.push({ u, op });
  const json = (corpo, status = 200) => new Response(JSON.stringify(corpo), { status });
  if (u.startsWith('https://banco.exemplo/rest/v1/rpc/preparar_link_')) {
    if (op.headers.authorization !== 'Bearer dono') return json({ message: 'sem permissão' }, 400);
    return banco.status ? json(banco, banco.status) : json(banco);
  }
  if (u === 'https://banco.exemplo/auth/v1/admin/generate_link') {
    const { type } = JSON.parse(op.body);
    return statusAuth === 200
      ? json({ id: 'u1', action_link: 'https://banco.exemplo/auth/v1/verify?token=XYZ', hashed_token: 'HASH+1/2', verification_type: type, email_otp: '123456' })
      : json({ msg: 'erro com CHAVE-SERVICO-NAO-VAZA' }, statusAuth);
  }
  return json({}, 404);
};
const pedir = (corpo, { auth = 'Bearer dono', origem = 'http://127.0.0.1:8090' } = {}) =>
  atender(new Request('https://f.exemplo', {
    method: 'POST',
    headers: { authorization: auth, 'content-type': 'application/json', ...(origem && { origin: origem }) },
    body: JSON.stringify(corpo),
  }));
const CONVITE = { tipo: 'convite', empresa: 'A', email: 'Novo@A.com', papel: 'membro' };
const SENHA = { tipo: 'senha', empresa: 'A', usuario: 'U-CAIO' };
const foiAoAuth = () => chamadas.some((c) => c.u.includes('/auth/v1/admin/'));

test('gerar-link: convite — o banco confere antes, com o JWT de quem pede; link do app com o token depois do #', async () => {
  chamadas.length = 0;
  const r = await pedir(CONVITE);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('access-control-allow-origin'), '*');
  const texto = await r.text();
  assert.ok(!texto.includes('CHAVE-SERVICO-NAO-VAZA'));
  assert.deepEqual(JSON.parse(texto), { link: 'http://127.0.0.1:8090/#link=HASH%2B1%2F2&tipo=invite', email: 'novo@a.com' });
  assert.ok(!texto.includes('verify?token') && !texto.includes('123456'), 'nem o action_link (a prévia do WhatsApp gastaria) nem o código');
  const [rpc, auth] = chamadas;
  assert.equal(rpc.u, 'https://banco.exemplo/rest/v1/rpc/preparar_link_convite');
  assert.equal(rpc.op.headers.authorization, 'Bearer dono', 'com o JWT de quem pede (o banco decide)');
  assert.equal(rpc.op.headers.apikey, 'pub', 'a chave pública, não a de serviço');
  assert.deepEqual(JSON.parse(rpc.op.body), { empresa: 'A', email: 'Novo@A.com', papel: 'membro' });
  assert.equal(auth.op.headers.authorization, 'Bearer CHAVE-SERVICO-NAO-VAZA');
  assert.deepEqual(JSON.parse(auth.op.body), { type: 'invite', email: 'novo@a.com' }, 'o e-mail que o banco devolveu, sem mandar e-mail');
});

test('gerar-link: senha nova (recovery), conta sem senha (magiclink) e quem já tem senha (sem link)', async () => {
  chamadas.length = 0;
  banco = { email: 'caio@a.com', tipo: 'recovery' };
  const s = await (await pedir(SENHA, { origem: 'https://calculeo.com.br' })).json();
  assert.equal(s.link, 'https://calculeo.com.br/#link=HASH%2B1%2F2&tipo=recovery');
  assert.equal(chamadas[0].u, 'https://banco.exemplo/rest/v1/rpc/preparar_link_senha');
  assert.deepEqual(JSON.parse(chamadas[0].op.body), { empresa: 'A', usuario: 'U-CAIO' });
  banco = { email: 'sem@x.com', tipo: 'magiclink' };
  assert.match((await (await pedir(CONVITE)).json()).link, /#link=.+&tipo=magiclink$/);
  chamadas.length = 0;
  banco = { email: 'bia@b.com', tipo: null };
  assert.deepEqual(await (await pedir(CONVITE)).json(), { link: null, email: 'bia@b.com' });
  assert.ok(!foiAoAuth(), 'já tem senha: não gera link (entraria na conta dela)');
  banco = { email: 'novo@a.com', tipo: 'invite' };
});

test('gerar-link: sem login, sem permissão, dados ruins e alvo de fora não chegam ao Auth; erro em português de tela', async () => {
  chamadas.length = 0;
  assert.equal((await pedir(CONVITE, { auth: '' })).status, 401);
  const negado = await pedir(CONVITE, { auth: 'Bearer de-fora' });
  assert.equal(negado.status, 403);
  assert.equal((await negado.json()).erro, 'Só o admin da empresa pode gerar links.');
  for (const corpo of [{ ...CONVITE, tipo: 'outro' }, { ...CONVITE, email: '' }, { ...SENHA, usuario: undefined }, { ...CONVITE, empresa: undefined }])
    assert.equal((await pedir(corpo)).status, 400, JSON.stringify(corpo));
  assert.equal((await pedir(CONVITE, { origem: '' })).status, 400, 'sem Origin não sabe para onde voltar');
  assert.equal((await pedir(CONVITE, { origem: 'javascript:alert(1)' })).status, 400);
  for (const [message, status, erro] of [
    ['e-mail inválido', 400, /e-mail válido/],
    ['papel inválido', 400, /Membro ou Admin/],
    ['essa pessoa já está na empresa', 400, /já está na empresa/],
    ['essa pessoa não está na empresa', 400, /não está nesta empresa/],
    ['link não permitido', 403, /não pode ser gerado por aqui/],
    ['empresa não encontrada', 400, /Empresa não encontrada/],
  ]) {
    banco = { status: 400, message };
    const r = await pedir(CONVITE);
    assert.equal(r.status, status, message);
    assert.match((await r.json()).erro, erro);
  }
  banco = { status: 404, code: 'PGRST202', message: 'Could not find the function' };
  const sem17 = await pedir(CONVITE);
  assert.equal(sem17.status, 503);
  assert.equal((await sem17.json()).erro, 'O convite por link ainda não foi ligado no Supabase.');
  banco = { status: 500, message: 'qualquer outra coisa' };
  assert.equal((await pedir(CONVITE)).status, 502);
  banco = { email: 'novo@a.com', tipo: 'invite' };
  assert.ok(!foiAoAuth());
});

test('gerar-link: sem a chave de serviço avisa; Auth falhou não repassa a mensagem dele', async () => {
  delete env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    chamadas.length = 0;
    const r = await pedir(CONVITE);
    assert.equal(r.status, 503);
    assert.match((await r.json()).erro, /ainda não foi ligado/);
    assert.equal(chamadas.length, 0, 'nem grava o convite');
  } finally {
    env.SUPABASE_SERVICE_ROLE_KEY = 'CHAVE-SERVICO-NAO-VAZA';
  }
  statusAuth = 422;
  const texto = await (await pedir(CONVITE)).text();
  assert.match(JSON.parse(texto).erro, /Não deu para gerar o link/);
  assert.ok(!texto.includes('CHAVE-SERVICO-NAO-VAZA'));
  statusAuth = 200;
});
