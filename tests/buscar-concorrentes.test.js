// Edge Function buscar-concorrentes (supabase/functions/buscar-concorrentes/index.ts), sem rede: Deno e fetch falsos.
// Confere: precisa estar logado; registrar_busca (banco) decide empresa e limite ANTES do Apify (de fora = 403, mesmo produto
// há pouco ou 30 no dia = 429, sem a correção 13 = 503, e nesses casos o Apify não é chamado); sem o APIFY_TOKEN avisa;
// chama o Apify com a palavra-chave, 1 página e o token só no cabeçalho; o token nunca aparece na resposta.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const env = { SUPABASE_URL: 'https://banco.exemplo', SUPABASE_ANON_KEY: 'pub', APIFY_TOKEN: 'TOKEN-NAO-VAZA' };
let atender;
globalThis.Deno = { env: { get: (k) => env[k] }, serve: (h) => (atender = h) };
await import('../supabase/functions/buscar-concorrentes/index.ts');

const chamadas = [];
let statusApify = 200;
let motivo = 'ok'; // o que registrar_busca responde
const ITENS = [{ Vendedor: 'LOJA SUL', novoPreco: '97,53', eTituloProduto: 'Dispenser Inox' }];
globalThis.fetch = async (url, op = {}) => {
  const u = String(url);
  chamadas.push({ u, op });
  const json = (corpo, status = 200) => new Response(JSON.stringify(corpo), { status });
  if (u === 'https://banco.exemplo/rest/v1/rpc/registrar_busca') {
    if (motivo === null) return json({ message: 'function not found' }, 404);
    return json(op.headers.authorization === 'Bearer membro' ? motivo : 'fora');
  }
  if (u.startsWith('https://api.apify.com/')) return json(statusApify === 200 ? ITENS : { error: { message: 'TOKEN-NAO-VAZA' } }, statusApify);
  return json({}, 404);
};
const pedir = (corpo, auth = 'Bearer membro') =>
  atender(new Request('https://f.exemplo', { method: 'POST', headers: { authorization: auth, 'content-type': 'application/json' }, body: JSON.stringify(corpo) }));
const PEDIDO = { empresa: 'A', produto: 'P1', termo: 'Dispenser papel higiênico inox' };
const foiAoApify = () => chamadas.some((c) => c.u.startsWith('https://api.apify.com/'));

test('função: logado e da empresa recebe os itens do Apify; conta a busca antes; token só no cabeçalho e nunca na resposta', async () => {
  const r = await pedir(PEDIDO);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('access-control-allow-origin'), '*');
  const texto = await r.text();
  assert.ok(!texto.includes('TOKEN-NAO-VAZA'));
  assert.deepEqual(JSON.parse(texto).itens, ITENS);
  const rpc = chamadas.findIndex((c) => c.u.endsWith('/rpc/registrar_busca'));
  const apify = chamadas.findIndex((c) => c.u.startsWith('https://api.apify.com/'));
  assert.ok(rpc >= 0 && rpc < apify, 'registra a busca (limite) antes de gastar no Apify');
  assert.deepEqual(JSON.parse(chamadas[rpc].op.body), { empresa: 'A', produto: 'P1' });
  assert.equal(chamadas[rpc].op.headers.authorization, 'Bearer membro', 'com o JWT de quem pede (a RLS vale)');
  const a = chamadas[apify];
  assert.ok(!a.u.includes('TOKEN'), 'token fora do endereço');
  assert.ok(/maxTotalChargeUsd=0\.30/.test(a.u), 'teto de gasto por busca');
  assert.equal(a.op.headers.authorization, 'Bearer TOKEN-NAO-VAZA');
  assert.deepEqual(JSON.parse(a.op.body), { keyword: 'Dispenser papel higiênico inox', maxPages: 1, sort: 'relevance', promoted: false });
});

test('função: sem login, de fora, termo curto, produto buscado há pouco, teto do dia e sem a correção 13 não chegam ao Apify', async () => {
  chamadas.length = 0;
  assert.equal((await pedir(PEDIDO, '')).status, 401);
  assert.equal((await pedir(PEDIDO, 'Bearer de-fora')).status, 403);
  assert.equal((await pedir({ ...PEDIDO, termo: 'pi' })).status, 400);
  assert.equal((await pedir({ ...PEDIDO, produto: undefined })).status, 400);
  for (const [m, status, msg] of [['produto', 429, /10 minutos/], ['dia', 429, /30 buscas/], [null, 503, /correção 13/]]) {
    motivo = m;
    const r = await pedir(PEDIDO);
    assert.equal(r.status, status);
    assert.match((await r.json()).erro, msg);
  }
  motivo = 'ok';
  assert.ok(!foiAoApify());
});

test('função: sem o APIFY_TOKEN, chave recusada e créditos acabados', async () => {
  delete env.APIFY_TOKEN;
  try {
    const r = await pedir(PEDIDO);
    assert.equal(r.status, 503);
    assert.match((await r.json()).erro, /ainda não foi ligada/);
  } finally {
    env.APIFY_TOKEN = 'TOKEN-NAO-VAZA';
  }
  for (const [s, msg] of [[401, /recusou a chave/], [402, /créditos/], [500, /falhou/]]) {
    statusApify = s;
    const texto = await (await pedir(PEDIDO)).text();
    assert.match(JSON.parse(texto).erro, msg);
    assert.ok(!texto.includes('TOKEN-NAO-VAZA'), 'a mensagem do Apify não é repassada');
  }
  statusApify = 200;
});
