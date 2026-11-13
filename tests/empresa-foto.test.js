// Foto (logo) da empresa (correção 09): só o admin troca ou tira; só foto da pasta da empresa; logo no selo conta como "em uso".
// Roda no schema.sql novo e no schema com a correcao-09 por cima (2 vezes). Postgres de verdade (PGlite).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const A = '00000000-0000-0000-0000-00000000000a';
const ANA = '00000000-0000-0000-0000-0000000000a1'; // admin
const BIA = '00000000-0000-0000-0000-0000000000b1'; // membro
const FOTO = `https://x.supabase.co/storage/v1/object/public/fotos/${A}/empresa/abc.webp`;
const ler = (arquivo) => readFileSync(new URL(arquivo, import.meta.url), 'utf8');

async function banco(comCorrecao) {
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
  if (comCorrecao) {
    await db.exec(ler('../supabase/correcao-09-empresa-foto.sql'));
    await db.exec(ler('../supabase/correcao-09-empresa-foto.sql')); // rodar 2 vezes não quebra
  }
  await db.exec(`
    insert into auth.users values ('${ANA}', 'ana@a.com'), ('${BIA}', 'bia@a.com');
    insert into empresas (id, nome) values ('${A}', 'Loren Metais');
    insert into membros (empresa_id, usuario_id, email, papel) values ('${A}', '${ANA}', 'ana@a.com', 'dono'), ('${A}', '${BIA}', 'bia@a.com', 'membro');
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
const foto = async (db) => (await db.query(`select foto from empresas where id = '${A}'`)).rows[0].foto;
const emUso = async (db, url) => (await como(db, BIA, `select foto_em_uso('${url}') as r`)).rows[0].r;

for (const [nome, comCorrecao] of [['schema.sql novo', false], ['correcao-09 por cima, 2 vezes', true]]) {
  test(`foto da empresa: ${nome}`, async () => {
    const db = await banco(comCorrecao);
    assert.equal(await foto(db), null, 'sem foto: o app mostra as iniciais');

    // membro não troca (a RLS esconde a linha: 0 alteradas)
    assert.equal((await como(db, BIA, `update empresas set foto = '${FOTO}' where id = '${A}'`)).affectedRows, 0);
    assert.equal(await foto(db), null);

    // admin troca; o logo no selo conta como em uso (a regra das órfãs não apaga)
    assert.equal((await como(db, ANA, `update empresas set foto = '${FOTO}' where id = '${A}'`)).affectedRows, 1);
    assert.equal(await foto(db), FOTO);
    assert.equal(await emUso(db, FOTO), true);

    // membro também não tira
    assert.equal((await como(db, BIA, `update empresas set foto = null where id = '${A}'`)).affectedRows, 0);
    assert.equal(await foto(db), FOTO);

    // endereço de fora ou da pasta de outra empresa: recusado
    await assert.rejects(como(db, ANA, `update empresas set foto = 'https://outro.site/logo.png' where id = '${A}'`), /foto_da_empresa/);
    await assert.rejects(como(db, ANA, `update empresas set foto = replace('${FOTO}', '${A}', '${BIA}') where id = '${A}'`), /foto_da_empresa/);
    await assert.rejects(como(db, ANA, `update empresas set foto = replace('${FOTO}', 'x.supabase.co', 'outro.site') where id = '${A}'`), /foto_da_empresa/);

    // admin tira: volta às iniciais e o arquivo vira órfão
    assert.equal((await como(db, ANA, `update empresas set foto = null where id = '${A}'`)).affectedRows, 1);
    assert.equal(await foto(db), null);
    assert.equal(await emUso(db, FOTO), false);
  });
}
