// Excluir empresa (correção 11): só o admin dela; some tudo da empresa (produtos, kits, preços, taxas, histórico, membros, convites)
// e nada das outras. Roda no schema.sql novo e no schema com a correcao-11 por cima (2 vezes). Postgres de verdade (PGlite).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const A = '00000000-0000-0000-0000-00000000000a';
const B = '00000000-0000-0000-0000-00000000000b';
const ANA = '00000000-0000-0000-0000-0000000000a1'; // admin da A
const BIA = '00000000-0000-0000-0000-0000000000b1'; // membro da A
const CAIO = '00000000-0000-0000-0000-0000000000c1'; // admin da B (não está na A)
const [PIA, TORNEIRA, KIT, PIA_B] = ['f1', 'f2', 'f3', 'f4'].map((x) => `00000000-0000-0000-0000-0000000000${x}`);
const PASTA = 'https://x.supabase.co/storage/v1/object/public/fotos/';
const [FOTO_1, FOTO_2] = [`${PASTA}${A}/${PIA}/1.webp`, `${PASTA}${A}/${PIA}/2.webp`];
const TABELAS = ['membros', 'convites', 'produtos', 'itens_kit', 'precificacoes', 'config_canais', 'historico'];
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
    await db.exec(ler('../supabase/correcao-11-excluir-empresa.sql'));
    await db.exec(ler('../supabase/correcao-11-excluir-empresa.sql')); // rodar 2 vezes não quebra
  }
  // duas empresas cheias: produtos, kit, preços, taxas, histórico (pelos gatilhos), membros e convite
  await db.exec(`
    insert into auth.users values ('${ANA}', 'ana@a.com'), ('${BIA}', 'bia@a.com'), ('${CAIO}', 'caio@b.com');
    insert into empresas (id, nome) values ('${A}', 'TESTE-EXCLUIR'), ('${B}', 'Outra');
    insert into membros (empresa_id, usuario_id, email, papel) values
      ('${A}', '${ANA}', 'ana@a.com', 'dono'), ('${A}', '${BIA}', 'bia@a.com', 'membro'), ('${B}', '${CAIO}', 'caio@b.com', 'dono'), ('${B}', '${ANA}', 'ana@a.com', 'membro');
    insert into convites (empresa_id, email) values ('${A}', 'novo@a.com'), ('${B}', 'novo@b.com');
    select set_config('request.jwt.claim.sub', '${ANA}', false);
    insert into produtos (id, empresa_id, nome, tipo_custo) values
      ('${PIA}', '${A}', 'Pia', 'revenda'), ('${TORNEIRA}', '${A}', 'Torneira', 'revenda'), ('${KIT}', '${A}', 'Kit', 'kit'), ('${PIA_B}', '${B}', 'Pia B', 'revenda');
    -- a Pia da A tem 2 fotos na pasta da A; a Pia B foi clonada da A e usa a 1ª (o Clonar copia o endereço)
    update produtos set fotos = array['${FOTO_1}', '${FOTO_2}'] where id = '${PIA}';
    update produtos set fotos = array['${FOTO_1}'] where id = '${PIA_B}';
    insert into itens_kit values ('${A}', '${KIT}', '${PIA}', 1), ('${A}', '${KIT}', '${TORNEIRA}', 2);
    insert into precificacoes (empresa_id, produto_id, canal, preco_de) values ('${A}', '${PIA}', 'shopee', 100), ('${B}', '${PIA_B}', 'shopee', 90);
    insert into config_canais (empresa_id, canal, config) values ('${A}', 'empresa', '{"impostos": 8}'), ('${B}', 'empresa', '{"impostos": 6}');
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
const contar = async (db, empresa) => {
  const n = { empresas: +(await db.query(`select count(*) as n from empresas where id = '${empresa}'`)).rows[0].n };
  for (const t of TABELAS) n[t] = +(await db.query(`select count(*) as n from ${t} where empresa_id = '${empresa}'`)).rows[0].n;
  return n;
};
const vazia = { empresas: 0, ...Object.fromEntries(TABELAS.map((t) => [t, 0])) };

for (const [nome, comCorrecao] of [['schema.sql novo', false], ['correcao-11 por cima, 2 vezes', true]]) {
  test(`excluir empresa: ${nome}`, async () => {
    const db = await banco(comCorrecao);
    const antesA = await contar(db, A);
    const antesB = await contar(db, B);
    assert.ok(TABELAS.every((t) => antesA[t] > 0), `a empresa A começa com tudo: ${JSON.stringify(antesA)}`);

    // sem login, membro da A e admin de outra empresa: não excluem; nada some
    await assert.rejects(como(db, '', `select excluir_empresa('${A}')`), /permission denied|só o admin/);
    await assert.rejects(como(db, BIA, `select excluir_empresa('${A}')`), /só o admin pode excluir a empresa/);
    await assert.rejects(como(db, CAIO, `select excluir_empresa('${A}')`), /só o admin pode excluir a empresa/);
    await assert.rejects(como(db, ANA, `select excluir_empresa('${B}')`), /só o admin pode excluir a empresa/, 'Ana é só membro da B');
    assert.deepEqual(await contar(db, A), antesA);

    // anon não chega nem a chamar
    await db.exec(`reset role; set role anon;`);
    await assert.rejects(db.query(`select excluir_empresa('${A}')`), /permission denied/);
    await db.exec('reset role');

    // fotos da pasta da A que a B usa: o app não apaga (só o admin da A pergunta; para os outros, vazio)
    const fora = async (quem) => (await como(db, quem, `select fotos_usadas_fora('${A}') as c`)).rows.map((r) => r.c);
    assert.deepEqual(await fora(ANA), [`${A}/${PIA}/1.webp`]);
    assert.deepEqual(await fora(BIA), []);
    assert.deepEqual(await fora(CAIO), []);

    // admin exclui: some tudo da A (com kit, que tem "restrict"), e a B fica igual
    await como(db, ANA, `select excluir_empresa('${A}')`);
    assert.deepEqual(await contar(db, A), vazia);
    assert.deepEqual(await contar(db, B), antesB);
    assert.deepEqual((await como(db, ANA, 'select nome from empresas')).rows, [{ nome: 'Outra' }], 'Ana continua só na B');
    assert.deepEqual((await db.query(`select fotos from produtos where id = '${PIA_B}'`)).rows[0].fotos, [FOTO_1], 'a foto clonada continua na B');
  });
}
