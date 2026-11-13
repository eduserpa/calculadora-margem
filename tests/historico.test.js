// Histórico (correção 06): a migração das fotos para o Storage não vira "Produto alterado", o "Preço salvo" sai com o nome do canal
// e vírgula, a correção roda 2 vezes, e o bloco opcional de limpeza apaga só as linhas da migração. Postgres de verdade (PGlite).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const A = '00000000-0000-0000-0000-00000000000a';
const ANA = '00000000-0000-0000-0000-0000000000a1';
const LEO = '00000000-0000-0000-0000-0000000000a2';
const PIA = '00000000-0000-0000-0000-0000000000f1';
const COPO = '00000000-0000-0000-0000-0000000000f2';
const ler = (arquivo) => readFileSync(new URL(arquivo, import.meta.url), 'utf8');
const DATA = 'data:image/webp;base64,AAAA';
const STORAGE = 'https://x.supabase.co/storage/v1/object/public/fotos/a/1.webp';

// O mínimo do Supabase (papéis, auth.uid() e o Storage), como no banco.test.js; o resto vem do schema.sql.
async function banco() {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role supabase_auth_admin nologin;
    create schema auth; create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean);
    create table storage.objects (bucket_id text, name text);
    create function storage.foldername(name text) returns text[] language sql immutable
      as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
    alter table storage.objects enable row level security;
  `);
  await db.exec(ler('../supabase/schema.sql'));
  await db.exec(`
    insert into auth.users values ('${ANA}', 'ana@loren.com'), ('${LEO}', 'leo@loren.com');
    insert into empresas (id, nome) values ('${A}', 'Loren Metais');
    insert into produtos (id, empresa_id, nome, sku, tipo_custo, fotos) values
      ('${PIA}', '${A}', 'Pia', 'P-1', 'revenda', array['${DATA}', '${DATA}']),
      ('${COPO}', '${A}', 'Copo', '', 'revenda', array['${STORAGE}']);
    delete from historico;
  `);
  return db;
}
const quem = (db, id) => db.exec(`select set_config('request.jwt.claim.sub', '${id}', false)`);
const hist = async (db) => (await db.query('select quem, acao, detalhe from historico order by id')).rows;

async function regrasDoHistorico(db) {
  await quem(db, ANA);
  // migração: data URL > Storage, uma foto por vez (cada gravação também mexe no atualizado_em) — nada anotado
  await db.exec(`update produtos set fotos = array['${STORAGE}', '${DATA}'], atualizado_em = now() + interval '1 s' where id = '${PIA}'`);
  await db.exec(`update produtos set fotos = array['${STORAGE}', '${STORAGE}'], atualizado_em = now() + interval '2 s' where id = '${PIA}'`);
  assert.deepEqual(await hist(db), [], 'a migração das fotos não pode virar Produto alterado');
  // foto trocada por alguém (Storage > Storage, foto a mais, foto a menos) e qualquer outro campo: anota
  await db.exec(`update produtos set fotos = array['https://x/2.webp'] where id = '${COPO}'`);
  await db.exec(`update produtos set fotos = array['https://x/2.webp', '${DATA}'] where id = '${COPO}'`);
  await db.exec(`update produtos set fotos = array['${STORAGE}'], nome = 'Pia Inox' where id = '${PIA}'`);
  await db.exec(`update produtos set peso_g = 500 where id = '${PIA}'`);
  assert.deepEqual((await hist(db)).map((h) => h.acao + ': ' + h.detalhe), [
    'Produto alterado: Copo', 'Produto alterado: Copo', 'Produto alterado: Pia Inox (P-1)', 'Produto alterado: Pia Inox (P-1)']);
  await db.exec('delete from historico');
  // preço: nome do canal como na tela, vírgula, milhar e desconto quebrado
  await db.exec(`
    insert into precificacoes (empresa_id, produto_id, canal, preco_de) values ('${A}', '${PIA}', 'mercadolivre', 119.9);
    insert into precificacoes (empresa_id, produto_id, canal, preco_de, desconto) values ('${A}', '${PIA}', 'lojapropria', 1234.5, 12.5);
    insert into precificacoes (empresa_id, produto_id, canal, preco_de, desconto) values ('${A}', '${PIA}', 'shopee', 99, 10);
    insert into config_canais (empresa_id, canal, config) values ('${A}', 'shein', '{"nome": "SHEIN Loja Oficial"}');
    insert into precificacoes (empresa_id, produto_id, canal, preco_de) values ('${A}', '${PIA}', 'shein', 0.5);
  `);
  assert.deepEqual((await hist(db)).filter((h) => h.acao === 'Preço salvo').map((h) => h.detalhe), [
    'Pia Inox · Mercado Livre · R$ 119,90',
    'Pia Inox · Loja online · R$ 1.234,50 com 12,5% de desconto',
    'Pia Inox · Shopee · R$ 99,00 com 10% de desconto',
    'Pia Inox · SHEIN Loja Oficial · R$ 0,50',
  ]);
  // taxa do canal: nome como na tela (ou o da empresa); imposto da empresa com vírgula, ou sem imposto
  await db.exec(`
    insert into config_canais (empresa_id, canal, config) values ('${A}', 'mercadolivre', '{}');
    insert into config_canais (empresa_id, canal, config) values ('${A}', 'empresa', '{"impostos": 8.5}');
    update config_canais set config = '{"impostos": null}' where canal = 'empresa';
  `);
  assert.deepEqual((await hist(db)).filter((h) => h.acao !== 'Preço salvo').map((h) => h.acao + ': ' + h.detalhe), [
    'Taxa do canal alterada: SHEIN Loja Oficial', 'Taxa do canal alterada: Mercado Livre',
    'Imposto da empresa alterado: 8,5%', 'Imposto da empresa alterado: sem imposto da empresa']);
}

test('histórico: schema.sql novo', async () => {
  await regrasDoHistorico(await banco());
});

test('histórico: correcao-06 por cima, 2 vezes, sem apagar nada', async () => {
  const db = await banco();
  await quem(db, ANA);
  await db.exec(`update produtos set nome = 'Pia' where id = '${PIA}'`);
  const antes = await hist(db);
  await db.exec(ler('../supabase/correcao-06-historico.sql'));
  await db.exec(ler('../supabase/correcao-06-historico.sql'));
  await db.exec(ler('../supabase/correcao-10-loja-online.sql')); // a 06 ainda tem o nome antigo da Loja online
  assert.deepEqual(await hist(db), antes, 'rodar a correção não apaga histórico (o bloco opcional está comentado)');
  await db.exec('delete from historico');
  await regrasDoHistorico(db);
});

test('histórico: o bloco opcional apaga só a migração de hoje', async () => {
  const db = await banco();
  const sql = ler('../supabase/correcao-06-historico.sql');
  const apagar = sql.slice(sql.indexOf('-- APAGAR'), sql.lastIndexOf('*/'))
    .replace("between timestamp '2026-11-13 HH:MM' and timestamp '2026-11-13 HH:MM'", "between timestamp '2026-11-13 10:00' and timestamp '2026-11-13 10:30'")
    .replace("'email-de-quem-migrou@lorenmetais.com.br'", "'ana@loren.com'");
  const linha = (quando, email, acao, detalhe) => `('${A}', timestamptz '${quando} America/Sao_Paulo', '${email}', '${acao}', '${detalhe}')`;
  await db.exec(`update produtos set fotos = array['${STORAGE}'] where id = '${PIA}'`);
  await db.exec('delete from historico');
  await db.exec(`insert into historico (empresa_id, quando, quem, acao, detalhe) values
    ${linha('2026-11-13 10:05', 'ana@loren.com', 'Produto alterado', 'Pia (P-1)')},
    ${linha('2026-11-13 10:20', 'ana@loren.com', 'Produto alterado', 'Copo')},
    ${linha('2026-11-13 10:10', 'leo@loren.com', 'Produto alterado', 'Pia (P-1)')},
    ${linha('2026-11-13 11:00', 'ana@loren.com', 'Produto alterado', 'Pia (P-1)')},
    ${linha('2026-11-12 10:05', 'ana@loren.com', 'Produto alterado', 'Pia (P-1)')},
    ${linha('2026-11-13 10:06', 'ana@loren.com', 'Preço salvo', 'Pia · Shopee · R$ 1,00')},
    ${linha('2026-11-13 10:07', 'ana@loren.com', 'Produto alterado', 'Panela')}`);
  await db.exec(apagar);
  assert.deepEqual((await db.query(`select to_char(quando at time zone 'America/Sao_Paulo', 'DD HH24:MI') as q, quem, acao, detalhe from historico order by quando`)).rows
    .map((r) => `${r.q} ${r.quem} ${r.acao}: ${r.detalhe}`), [
    '12 10:05 ana@loren.com Produto alterado: Pia (P-1)', // outro dia
    '13 10:06 ana@loren.com Preço salvo: Pia · Shopee · R$ 1,00', // outra ação
    '13 10:07 ana@loren.com Produto alterado: Panela', // produto que não existe (ou sem foto no Storage)
    '13 10:10 leo@loren.com Produto alterado: Pia (P-1)', // outra pessoa
    '13 11:00 ana@loren.com Produto alterado: Pia (P-1)', // fora do intervalo
  ]); // saíram só 10:05 Pia (foto no Storage) e 10:20 Copo (foto no Storage)
  // sem trocar o intervalo, o comando dá erro e não apaga nada
  await assert.rejects(db.exec(sql.slice(sql.indexOf('-- APAGAR'), sql.lastIndexOf('*/'))));
});

test('histórico: correcao-10, Loja online mesmo com o nome antigo guardado nas taxas da empresa', async () => {
  const db = await banco();
  await db.exec(ler('../supabase/correcao-10-loja-online.sql'));
  await quem(db, ANA);
  await db.exec(`
    insert into config_canais (empresa_id, canal, config) values ('${A}', 'lojapropria', '{"nome": "Loja própria (site)"}');
    insert into precificacoes (empresa_id, produto_id, canal, preco_de) values ('${A}', '${PIA}', 'lojapropria', 10);
  `);
  assert.deepEqual((await hist(db)).map((h) => h.detalhe), ['Loja online', 'Pia · Loja online · R$ 10,00']);
});
