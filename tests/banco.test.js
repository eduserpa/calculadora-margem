// O banco (supabase/schema.sql) roda num Postgres de verdade (PGlite) com os papéis do Supabase:
// sem login não lê nada, e cada empresa só vê os próprios dados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const EMPRESA_A = '00000000-0000-0000-0000-00000000000a';
const EMPRESA_B = '00000000-0000-0000-0000-00000000000b';
const ANA = '00000000-0000-0000-0000-0000000000a1'; // da empresa A
const BIA = '00000000-0000-0000-0000-0000000000b1'; // da empresa B
const SEM_EMPRESA = '00000000-0000-0000-0000-0000000000c1';
const TABELAS = ['empresas', 'membros', 'produtos', 'itens_kit', 'precificacoes', 'config_canais'];

// O que o Supabase já traz pronto: papéis anon/authenticated, auth.uid() e acesso padrão às tabelas novas.
async function bancoComSchema() {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth; create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public, auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    alter default privileges in schema public grant all on tables to anon, authenticated;
  `);
  await db.exec(readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8'));
  await db.exec(`
    insert into auth.users values ('${ANA}'), ('${BIA}'), ('${SEM_EMPRESA}');
    insert into empresas (id, nome) values ('${EMPRESA_A}', 'Empresa A'), ('${EMPRESA_B}', 'Empresa B');
    insert into membros values ('${EMPRESA_A}', '${ANA}'), ('${EMPRESA_B}', '${BIA}');
    insert into produtos (id, empresa_id, nome, sku, tipo_custo) values
      ('00000000-0000-0000-0000-0000000000f1', '${EMPRESA_A}', 'Banco', '1058', 'revenda'),
      ('00000000-0000-0000-0000-0000000000f2', '${EMPRESA_B}', 'Suporte', 'S-1', 'revenda');
    insert into precificacoes (empresa_id, produto_id, canal, preco_de) values ('${EMPRESA_A}', '00000000-0000-0000-0000-0000000000f1', 'shopee', 250);
    insert into config_canais (empresa_id, canal, config) values ('${EMPRESA_A}', 'shopee', '{}');
  `);
  return db;
}

// Roda como alguém de fora (anon) ou logado (authenticated, com o id da pessoa).
async function como(db, papel, usuario, sql) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${usuario ?? ''}', false); set role ${papel};`);
  try {
    return await db.query(sql);
  } finally {
    await db.exec('reset role');
  }
}

test('banco: sem login não lê nem grava nada', async () => {
  const db = await bancoComSchema();
  for (const t of TABELAS) {
    await assert.rejects(como(db, 'anon', null, `select * from ${t}`), /permission denied/, `anon leu ${t}`);
  }
  await assert.rejects(como(db, 'anon', null, `insert into produtos (empresa_id, nome, tipo_custo) values ('${EMPRESA_A}', 'x', 'revenda')`), /permission denied/);
  // logado mas sem empresa (não convidado para nenhuma): não vê nada
  for (const t of TABELAS) assert.equal((await como(db, 'authenticated', SEM_EMPRESA, `select * from ${t}`)).rows.length, 0, t);
});

test('banco: cada empresa só vê e grava o que é dela', async () => {
  const db = await bancoComSchema();
  const nomes = (r) => r.rows.map((x) => x.nome);
  assert.deepEqual(nomes(await como(db, 'authenticated', ANA, 'select nome from produtos')), ['Banco']);
  assert.deepEqual(nomes(await como(db, 'authenticated', BIA, 'select nome from produtos')), ['Suporte']);
  assert.equal((await como(db, 'authenticated', BIA, 'select * from precificacoes')).rows.length, 0);
  await assert.rejects(
    como(db, 'authenticated', BIA, `insert into produtos (empresa_id, nome, tipo_custo) values ('${EMPRESA_A}', 'Intruso', 'revenda')`),
    /row-level security/,
  );
  // não dá para mudar nem apagar dado da outra empresa (a linha simplesmente não aparece)
  assert.equal((await como(db, 'authenticated', BIA, `update produtos set nome = 'x' where sku = '1058'`)).affectedRows, 0);
  assert.equal((await como(db, 'authenticated', BIA, `delete from produtos where sku = '1058'`)).affectedRows, 0);
  // ninguém se coloca numa empresa sozinho: convite só pelo administrador
  await assert.rejects(como(db, 'authenticated', BIA, `insert into membros values ('${EMPRESA_A}', '${BIA}')`), /row-level security|permission denied/);
  // kit não aponta para produto de outra empresa
  await assert.rejects(
    como(db, 'authenticated', ANA, `insert into itens_kit values ('${EMPRESA_A}', '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f2', 1)`),
    /foreign key/,
  );
});

test('nenhuma chave do Supabase no repositório', () => {
  const pastas = ['src', 'supabase', 'docs', 'data'];
  const arquivos = pastas.flatMap(function lista(p) {
    const caminho = new URL(`../${p}`, import.meta.url);
    return statSync(caminho).isDirectory() ? readdirSync(caminho).flatMap((f) => lista(`${p}/${f}`)) : [p];
  });
  for (const f of [...arquivos, 'index.html']) {
    const texto = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
    assert.doesNotMatch(texto, /eyJ[\w-]{20,}\.[\w-]{20,}|sb_(secret|publishable)_\w{10,}/, `parece uma chave em ${f}`);
  }
});
