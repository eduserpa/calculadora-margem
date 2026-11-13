// Histórico detalhado (correção 08): cada linha guarda o que mudou, campo a campo, como a tela mostra; nada mudou = sem linha.
// Roda no schema.sql novo e no schema com a correcao-08 por cima (2 vezes). Postgres de verdade (PGlite).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const A = '00000000-0000-0000-0000-00000000000a';
const ANA = '00000000-0000-0000-0000-0000000000a1';
const PIA = '00000000-0000-0000-0000-0000000000f1';
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
    await db.exec(ler('../supabase/correcao-08-historico-detalhe.sql'));
    await db.exec(ler('../supabase/correcao-08-historico-detalhe.sql')); // rodar 2 vezes não quebra
  }
  await db.exec(`
    insert into auth.users values ('${ANA}', 'ana@a.com');
    insert into empresas (id, nome) values ('${A}', 'Empresa A');
    select set_config('request.jwt.claim.sub', '${ANA}', false);
    insert into produtos (id, empresa_id, nome, sku, tipo_custo, custo, peso_g, fotos) values
      ('${PIA}', '${A}', 'Pia', 'P-1', 'revenda', '{"revenda": {"custoCompra": 26, "embalagem": 2}}', 1200, array['https://x/1.webp']);
  `);
  return db;
}
const ultima = async (db) => (await db.query('select acao, detalhe, mudancas from historico order by id desc limit 1')).rows[0];
const conta = async (db) => +(await db.query('select count(*) as n from historico')).rows[0].n;

for (const [nome, comCorrecao] of [['schema.sql novo', false], ['correcao-08 por cima, 2 vezes', true]]) {
  test(`histórico detalhado: ${nome}`, async () => {
    const db = await banco(comCorrecao);
    assert.equal((await ultima(db)).mudancas, null, 'produto criado: sem detalhe');

    // custo: 1 mudança, certa
    await db.exec(`update produtos set custo = jsonb_set(custo, '{revenda,custoCompra}', '28.5'), atualizado_em = now() + interval '1 s' where id = '${PIA}'`);
    assert.deepEqual(await ultima(db), { acao: 'Produto alterado', detalhe: 'Pia (P-1)', mudancas: [{ campo: 'Custo de aquisição', antes: 'R$ 26,00', depois: 'R$ 28,50' }] });

    // nada mudou (só atualizado_em, ou a mesma coisa de novo): sem linha
    const n = await conta(db);
    await db.exec(`update produtos set atualizado_em = now() + interval '2 s' where id = '${PIA}'`);
    await db.exec(`update produtos set custo = custo, nome = 'Pia' where id = '${PIA}'`);
    assert.equal(await conta(db), n, 'alteração sem mudança não vira linha');

    // peso em kg, medida e foto
    await db.exec(`update produtos set peso_g = 1500, altura_cm = 25, fotos = array['https://x/2.webp'] where id = '${PIA}'`);
    assert.deepEqual((await ultima(db)).mudancas, [
      { campo: 'Peso real', antes: '1,2 kg', depois: '1,5 kg' }, { campo: 'Altura', antes: '0 cm', depois: '25 cm' }, { campo: 'Foto trocada' }]);

    // preço: novo e alterado (com o nome do canal como na tela)
    await db.exec(`insert into precificacoes (empresa_id, produto_id, canal, preco_de) values ('${A}', '${PIA}', 'mercadolivre', 119.9)`);
    assert.deepEqual((await ultima(db)).mudancas, [{ campo: 'Preço no Mercado Livre', antes: '—', depois: 'R$ 119,90' }]);
    await db.exec(`update precificacoes set preco_de = 129.9, desconto = 10 where canal = 'mercadolivre'`);
    assert.deepEqual((await ultima(db)).mudancas, [
      { campo: 'Preço no Mercado Livre', antes: 'R$ 119,90', depois: 'R$ 129,90' }, { campo: 'Desconto no Mercado Livre', antes: '0%', depois: '10%' }]);

    // taxa do canal: comissão Clássico (por tipo de anúncio) e taxa fixa; a fonte não conta
    await db.exec(`insert into config_canais (empresa_id, canal, config) values ('${A}', 'mercadolivre', '{"comissao": {"classico": 11.5, "premium": 16}, "taxa_fixa": 6, "comissao_fonte": "x"}')`);
    await db.exec(`update config_canais set config = '{"comissao": {"classico": 12, "premium": 16}, "taxa_fixa": 6.5, "comissao_fonte": "y"}' where canal = 'mercadolivre'`);
    assert.deepEqual(await ultima(db), { acao: 'Taxa do canal alterada', detalhe: 'Mercado Livre', mudancas: [
      { campo: 'Comissão Clássico', antes: '11,5%', depois: '12%' }, { campo: 'Taxa fixa', antes: 'R$ 6,00', depois: 'R$ 6,50' }] });
    const n2 = await conta(db);
    await db.exec(`update config_canais set config = config || '{"comissao_fonte": "z"}' where canal = 'mercadolivre'`);
    assert.equal(await conta(db), n2, 'só a fonte mudou: sem linha');

    // imposto da empresa
    await db.exec(`insert into config_canais (empresa_id, canal, config) values ('${A}', 'empresa', '{"impostos": 8}')`);
    await db.exec(`update config_canais set config = '{"impostos": 8.5}' where canal = 'empresa'`);
    assert.deepEqual(await ultima(db), { acao: 'Imposto da empresa alterado', detalhe: '8,5%', mudancas: [{ campo: 'Imposto da empresa', antes: '8%', depois: '8,5%' }] });

    // migração das fotos (data URL > Storage) continua sem linha
    await db.exec(`update produtos set fotos = array['data:image/webp;base64,AA'] where id = '${PIA}'`);
    const n3 = await conta(db);
    await db.exec(`update produtos set fotos = array['https://x/storage/v1/object/public/fotos/a.webp'] where id = '${PIA}'`);
    assert.equal(await conta(db), n3);
  });
}
