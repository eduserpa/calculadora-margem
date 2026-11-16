// Correção 15 (1.2.1): histórico "Imposto (Canal)", chave de canal conferida, índices e fotos em uso pelo índice.
// schema.sql + a correção 2 vezes, num Postgres de verdade (PGlite).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const ler = (arquivo) => readFileSync(new URL(arquivo, import.meta.url), 'utf8');

const A = '00000000-0000-0000-0000-00000000000a';
const ANA = '00000000-0000-0000-0000-0000000000a1';
const PIA = '00000000-0000-0000-0000-0000000000f1';

async function banco() {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role supabase_auth_admin nologin;
    create schema auth; create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create schema storage; create table storage.buckets (id text primary key, name text, public boolean); create table storage.objects (bucket_id text, name text);
    create function storage.foldername(name text) returns text[] language sql immutable
      as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
    alter table storage.objects enable row level security;
  `);
  await db.exec(ler('../supabase/schema.sql'));
  await db.exec(`
    insert into auth.users values ('${ANA}', 'ana@a.com');
    insert into empresas (id, nome) values ('${A}', 'Loren Metais');
    insert into membros (empresa_id, usuario_id, email, papel) values ('${A}', '${ANA}', 'ana@a.com', 'dono');
    insert into produtos (id, empresa_id, nome, sku, tipo_custo, impostos_canal) values ('${PIA}', '${A}', 'Pia Inox', 'P-1', 'revenda', '{"lojafisica": 5}');
  `);
  await db.exec(ler('../supabase/correcao-15-historico-e-indices.sql'));
  await db.exec(ler('../supabase/correcao-15-historico-e-indices.sql')); // 2 vezes não quebra
  await db.exec('delete from historico');
  return db;
}
async function como(db, sql) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${ANA}', false); set role authenticated;`);
  try {
    return await db.query(sql);
  } finally {
    await db.exec('reset role');
  }
}

test('correção 15: histórico "Imposto (Canal)" sem erro de gênero', async () => {
  const db = await banco();
  await como(db, `update produtos set impostos_canal = '{"lojafisica": 7, "shein": 4, "mercadolivre": 15}' where id = '${PIA}'`);
  const [m] = (await db.query(`select mudancas from historico where empresa_id = '${A}'`)).rows.map((r) => r.mudancas);
  assert.deepEqual(m, [
    { campo: 'Imposto (Loja física)', antes: '5%', depois: '7%' },
    { campo: 'Imposto (Mercado Livre)', antes: 'padrão', depois: '15%' },
    { campo: 'Imposto (SHEIN)', antes: 'padrão', depois: '4%' },
  ]);
});

test('correção 15: só chave de canal de verdade; os dados de hoje continuam valendo', async () => {
  const db = await banco();
  for (const ruim of ['{"x y": 5}', '{"Mercadolivre": 5}', '{"ml1": 5}', '{"": 5}', '{"<b>": 5}'])
    await assert.rejects(como(db, `update produtos set impostos_canal = '${ruim}' where id = '${PIA}'`), /check/, ruim);
  await como(db, `update produtos set impostos_canal = '{"mercadolivre": 12.5, "tiktokshop": 0}' where id = '${PIA}'`);
  assert.deepEqual((await db.query(`select impostos_canal from produtos where id = '${PIA}'`)).rows[0].impostos_canal, { mercadolivre: 12.5, tiktokshop: 0 });
  // a correção não tira a permissão do check (create or replace mantém o grant)
  assert.equal((await db.query(`select has_function_privilege('authenticated', 'impostos_validos(jsonb)', 'execute') as ok`)).rows[0].ok, true);
});

test('correção 15: índices de escala e foto em uso pelo índice', async () => {
  const db = await banco();
  const nomes = (await db.query(`select indexname from pg_indexes where schemaname = 'public'`)).rows.map((r) => r.indexname);
  for (const i of ['membros_usuario', 'convites_email', 'itens_kit_empresa_produto', 'precificacoes_empresa_produto',
    'concorrentes_empresa_produto', 'produtos_empresa_sku', 'produtos_fotos']) assert.ok(nomes.includes(i), i);
  const url = 'https://x.supabase.co/storage/v1/object/public/fotos/a/p/1.webp';
  await db.exec(`update produtos set fotos = array['${url}'] where id = '${PIA}'`);
  const usa = async (u) => (await db.query(`select foto_em_uso('${u}') r`)).rows[0].r;
  assert.equal(await usa(url), true);
  assert.equal(await usa(url.replace('1.webp', '2.webp')), false);
  await db.exec('set enable_seqscan = off');
  const plano = (await db.query(`explain select exists (select 1 from produtos where fotos @> array['${url}'])`)).rows.map((r) => r['QUERY PLAN']).join(' ');
  assert.match(plano, /produtos_fotos/);
});
