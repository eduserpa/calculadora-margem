// O supabase-js servido pelo próprio site (vendor/, 1.2.1) faz os mesmos pedidos de antes: login, banco, Storage e
// Edge Function. Sem rede: um fetch de mentira anota cada pedido e responde o mínimo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createClient } from '../vendor/supabase-js-2.115.0.js';

const URL_SB = 'https://falso.supabase.co';
function cliente() {
  const pedidos = [];
  const fetch = async (url, init = {}) => {
    const u = new URL(String(url));
    pedidos.push(`${init.method ?? 'GET'} ${u.pathname}${u.search}`);
    const corpo = u.pathname === '/auth/v1/token'
      ? { access_token: 'a', refresh_token: 'r', expires_in: 3600, token_type: 'bearer', user: { id: 'u1', email: 'ana@a.com' } }
      : u.pathname.startsWith('/storage/') ? { Key: 'fotos/x.webp' } : u.pathname.startsWith('/functions/') ? { ok: true } : [{ id: 'p1' }];
    return new Response(JSON.stringify(corpo), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const sb = createClient(URL_SB, 'chave-anon', { global: { fetch }, auth: { persistSession: false, autoRefreshToken: false } });
  return { sb, pedidos };
}

test('vendor: login, banco, Storage e Edge Function fazem os pedidos certos', async () => {
  const { sb, pedidos } = cliente();
  const login = await sb.auth.signInWithPassword({ email: 'ana@a.com', password: 'senha1234' });
  assert.equal(login.data.session.user.id, 'u1');
  const r = await sb.from('produtos').select('*').eq('empresa_id', 'e1').range(0, 999);
  assert.deepEqual(r.data, [{ id: 'p1' }]);
  const up = await sb.storage.from('fotos').upload('e1/p1/a.webp', new Blob(['x'], { type: 'image/webp' }), { upsert: true });
  assert.equal(up.error, null);
  assert.match(sb.storage.from('fotos').getPublicUrl('e1/p1/a.webp').data.publicUrl, /\/storage\/v1\/object\/public\/fotos\/e1\/p1\/a\.webp$/);
  const f = await sb.functions.invoke('buscar-concorrentes', { body: { termo: 'pia' } });
  assert.deepEqual(f.data, { ok: true });
  assert.deepEqual(pedidos, [
    'POST /auth/v1/token?grant_type=password',
    'GET /rest/v1/produtos?select=*&empresa_id=eq.e1&offset=0&limit=1000',
    'POST /storage/v1/object/fotos/e1/p1/a.webp',
    'POST /functions/v1/buscar-concorrentes',
  ]);
});

test('vendor: o app importa o arquivo local, na versão do cabeçalho, com a licença', () => {
  const nuvem = readFileSync(new URL('../src/nuvem.js', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const lib = readFileSync(new URL('../vendor/supabase-js-2.115.0.js', import.meta.url), 'utf8');
  assert.match(nuvem, /'\.\.\/vendor\/supabase-js-2\.115\.0\.js'/);
  assert.match(html, /rel="modulepreload" href="vendor\/supabase-js-2\.115\.0\.js"/);
  assert.doesNotMatch(nuvem + html, /jsdelivr/);
  assert.match(lib.slice(0, 3000), /supabase-js 2\.115\.0[\s\S]*MIT License/);
});
