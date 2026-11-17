// Categoria do Mercado Livre por produto (correção 20): coluna produtos.categoria_ml (null = a do canal), na mesma RLS dos
// produtos; o histórico anota a troca e o Clonar leva a categoria. Roda no schema.sql novo e no schema de antes + correção 20
// (2 vezes). Postgres de verdade (PGlite).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const A = '00000000-0000-0000-0000-00000000000a';
const B = '00000000-0000-0000-0000-00000000000b';
const ANA = '00000000-0000-0000-0000-0000000000a1'; // dona da A e da B
const BIA = '00000000-0000-0000-0000-0000000000b1'; // dona só da B
const PIA = '00000000-0000-0000-0000-0000000000f1';
const CAT = 'Casa, Móveis e Decoração > Banheiros > Torneiras';
const ler = (arquivo) => readFileSync(new URL(arquivo, import.meta.url), 'utf8');

async function banco(antigo) {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role supabase_auth_admin nologin;
    create schema auth; create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
    grant usage on schema auth to anon, authenticated; grant execute on function auth.uid(), auth.jwt() to anon, authenticated;
    create schema storage; create table storage.buckets (id text primary key, name text, public boolean); create table storage.objects (bucket_id text, name text);
    create function storage.foldername(name text) returns text[] language sql immutable
      as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
    alter table storage.objects enable row level security;
  `);
  if (antigo) {
    // o projeto de hoje: schema de antes + 17, 18, 19 (já rodadas) e a 20 por cima, 2 vezes
    await db.exec(ler('./fixtures/schema-antes-17.sql'));
    for (const f of ['17-plataforma', '18-excluir-empresa-plataforma', '19-cota-buscas', '20-categoria-ml-produto', '20-categoria-ml-produto'])
      await db.exec(ler(`../supabase/correcao-${f}.sql`));
  } else await db.exec(ler('../supabase/schema.sql'));
  await db.exec(`
    insert into auth.users values ('${ANA}', 'ana@a.com'), ('${BIA}', 'bia@b.com');
    insert into empresas (id, nome) values ('${A}', 'Loren Metais'), ('${B}', 'Outra');
    insert into membros (empresa_id, usuario_id, email, papel) values ('${A}', '${ANA}', 'ana@a.com', 'dono'), ('${B}', '${ANA}', 'ana@a.com', 'dono'), ('${B}', '${BIA}', 'bia@b.com', 'dono');
    insert into produtos (id, empresa_id, nome, sku, tipo_custo) values ('${PIA}', '${A}', 'Torneira', 'T-1', 'revenda');
    delete from historico;
  `);
  return db;
}

async function como(db, usuario, sql) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${usuario}', false); set role authenticated;`);
  try {
    return await db.query(sql);
  } finally {
    await db.exec('reset role');
  }
}

for (const [nome, antigo] of [['schema.sql', false], ['schema de antes + correções 17 a 20 (a 20 duas vezes)', true]]) {
  test(`categoria do ML por produto (${nome}): começa sem (usa a do canal), grava, vai para o histórico e o Clonar leva`, async () => {
    const db = await banco(antigo);
    const cat = async () => (await db.query(`select categoria_ml from produtos where id = '${PIA}'`)).rows[0].categoria_ml;
    assert.equal(await cat(), null, 'produto de antes: sem categoria = a do canal');
    // a dona grava; quem é de outra empresa não muda (RLS dos produtos)
    assert.equal((await como(db, BIA, `update produtos set categoria_ml = 'X' where id = '${PIA}' returning id`)).rows.length, 0);
    await como(db, ANA, `update produtos set categoria_ml = '${CAT}' where id = '${PIA}'`);
    assert.equal(await cat(), CAT);
    // vazio não vale (sem categoria é null)
    await assert.rejects(como(db, ANA, `update produtos set categoria_ml = '  ' where id = '${PIA}'`), /categoria_ml/);
    // histórico: a troca, com antes e depois
    await como(db, ANA, `update produtos set categoria_ml = null where id = '${PIA}'`);
    const h = (await db.query(`select acao, mudancas from historico where empresa_id = '${A}' order by id`)).rows;
    assert.deepEqual(h.map((r) => [r.acao, r.mudancas]), [
      ['Produto alterado', [{ campo: 'Categoria do Mercado Livre', antes: 'padrão do canal', depois: CAT }]],
      ['Produto alterado', [{ campo: 'Categoria do Mercado Livre', antes: CAT, depois: 'padrão do canal' }]],
    ]);
    // Clonar (copiar_produtos) leva a categoria
    await como(db, ANA, `update produtos set categoria_ml = '${CAT}' where id = '${PIA}'`);
    await como(db, ANA, `select copiar_produtos('${A}', '${B}')`);
    assert.deepEqual((await db.query(`select nome, categoria_ml from produtos where empresa_id = '${B}'`)).rows, [{ nome: 'Torneira', categoria_ml: CAT }]);
    // e de novo (agora atualiza o mesmo SKU): leva a categoria nova
    await como(db, ANA, `update produtos set categoria_ml = 'Outra > Categoria' where id = '${PIA}'`);
    await como(db, ANA, `select copiar_produtos('${A}', '${B}')`);
    assert.deepEqual((await db.query(`select categoria_ml from produtos where empresa_id = '${B}'`)).rows, [{ categoria_ml: 'Outra > Categoria' }]);
  });
}

test('categoria do ML por produto: o schema.sql e a correção 20 dão a mesma coluna e as mesmas funções', async () => {
  const [novo, antigo] = [await banco(false), await banco(true)];
  const q = async (db, sql) => (await db.query(sql)).rows;
  const col = `select column_name, data_type, is_nullable, column_default from information_schema.columns where table_name = 'produtos' and column_name = 'categoria_ml'`;
  const chk = `select pg_get_constraintdef(oid) d from pg_constraint where conrelid = 'produtos'::regclass and pg_get_constraintdef(oid) like '%categoria_ml%'`;
  const fn = `select proname, regexp_replace(pg_get_functiondef(oid), '\\s+', ' ', 'g') d from pg_proc where proname in ('mudancas_produto', 'copiar_produtos') order by 1`;
  for (const sql of [col, chk, fn]) assert.deepEqual(await q(antigo, sql), await q(novo, sql), sql.slice(0, 40));
  assert.equal((await q(novo, col)).length, 1);
});
