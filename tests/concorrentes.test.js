// Concorrentes (correção 12): a equipe da empresa grava e lê, outra empresa não vê; link só web; entra no histórico;
// produto excluído leva os concorrentes sem anotar um por um; excluir a empresa continua funcionando.
// Buscas guardadas (correção 13): uma por produto, substituída no "Atualizar", só da empresa, vão junto com o produto.
// Roda no schema.sql novo e com as correções 12 e 13 por cima (2 vezes). Postgres de verdade (PGlite).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const A = '00000000-0000-0000-0000-00000000000a';
const B = '00000000-0000-0000-0000-00000000000b';
const ANA = '00000000-0000-0000-0000-0000000000a1'; // admin da A
const BIA = '00000000-0000-0000-0000-0000000000b1'; // membro da A
const LEO = '00000000-0000-0000-0000-0000000000c1'; // só da B
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
    await db.exec(ler('../supabase/correcao-12-concorrentes.sql'));
    await db.exec(ler('../supabase/correcao-12-concorrentes.sql')); // rodar 2 vezes não quebra
    await db.exec(ler('../supabase/correcao-13-buscas-concorrentes.sql'));
    await db.exec(ler('../supabase/correcao-13-buscas-concorrentes.sql'));
    await db.exec(ler('../supabase/correcao-16-concorrentes-so-admin.sql'));
    await db.exec(ler('../supabase/correcao-16-concorrentes-so-admin.sql'));
  }
  await db.exec(`
    insert into auth.users values ('${ANA}', 'ana@a.com'), ('${BIA}', 'bia@a.com'), ('${LEO}', 'leo@b.com');
    insert into empresas (id, nome, limite_buscas_mes) values ('${A}', 'Loren Metais', null), ('${B}', 'Outra', null); -- sem o limite do mês (correção 17): aqui é o do dia
    insert into membros (empresa_id, usuario_id, email, papel) values
      ('${A}', '${ANA}', 'ana@a.com', 'dono'), ('${A}', '${BIA}', 'bia@a.com', 'membro'), ('${B}', '${LEO}', 'leo@b.com', 'dono');
    insert into produtos (id, empresa_id, nome, sku, tipo_custo) values ('${PIA}', '${A}', 'Pia Inox', 'P-1', 'revenda');
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
const novo = (vendedor, preco, link = null) =>
  `insert into concorrentes (empresa_id, produto_id, canal, vendedor, preco, link) values ('${A}', '${PIA}', 'mercadolivre', '${vendedor}', ${preco}, ${link ? `'${link}'` : 'null'})`;
const hist = async (db) => (await db.query(`select acao || ': ' || detalhe as l from historico where empresa_id = '${A}' order by id`)).rows.map((r) => r.l);

const guardar = (termo, preco) =>
  `insert into buscas_concorrentes (empresa_id, produto_id, termo, resultados, buscado_em) values ('${A}', '${PIA}', '${termo}', '[{"vendedor":"Loja X","preco":${preco}}]', now())
   on conflict (empresa_id, produto_id) do update set termo = excluded.termo, resultados = excluded.resultados, buscado_em = excluded.buscado_em`;

for (const [nome, comCorrecao] of [['schema.sql novo', false], ['correções 12, 13 e 16 por cima, 2 vezes', true]]) {
  test(`limite de buscas no Apify: ${nome}`, async () => {
    const db = await banco(comCorrecao);
    const registrar = async (quem, produto = PIA) => (await como(db, quem, `select registrar_busca('${A}', '${produto}') as r`)).rows[0].r;
    const produto = async (id) => db.exec(`insert into produtos (id, empresa_id, nome, sku, tipo_custo) values ('${id}', '${A}', 'P ${id.slice(-2)}', '', 'revenda')`);
    assert.equal(await registrar(BIA), 'so_admin', 'membro não busca: gasta crédito (correção 16)');
    assert.equal(await registrar(ANA), 'ok', 'o admin busca');
    assert.equal(await registrar(ANA), 'produto', 'o mesmo produto em menos de 10 min é recusado');
    assert.equal((await db.query('select count(*)::int as n from buscas_feitas')).rows[0].n, 1, 'a recusa do membro não conta');
    assert.equal(await registrar(LEO), 'fora', 'outra empresa');
    await assert.rejects(db.exec(`set role anon; select registrar_busca('${A}', '${PIA}');`).finally(() => db.exec('reset role')), /permission denied/);
    await assert.rejects(como(db, BIA, 'select * from buscas_feitas'), /permission denied/, 'ninguém lê nem mexe na contagem direto');
    await assert.rejects(como(db, BIA, 'delete from buscas_feitas'), /permission denied/);
    // 10 min depois, o mesmo produto pode de novo
    await db.exec(`update buscas_feitas set feita_em = now() - interval '11 minutes'`);
    assert.equal(await registrar(ANA), 'ok');
    // teto de 30 em 24 h para a empresa (outros produtos contam)
    await db.exec(`insert into buscas_feitas (empresa_id, produto_id, feita_em) select '${A}', '${PIA}', now() - interval '1 hour' from generate_series(1, 27)`);
    const P2 = '00000000-0000-0000-0000-0000000000f2', P3 = '00000000-0000-0000-0000-0000000000f3';
    await produto(P2); await produto(P3);
    assert.equal(await registrar(ANA, P2), 'ok', 'a 30ª passa');
    assert.equal(await registrar(ANA, P3), 'dia', 'a 31ª em 24 h é recusada');
    await db.exec(`update buscas_feitas set feita_em = now() - interval '25 hours'`);
    assert.equal(await registrar(ANA, P3), 'ok', 'mais de 24 h atrás não conta');
    await como(db, ANA, `delete from produtos where id = '${PIA}'`);
    assert.equal((await db.query(`select count(*)::int as n from buscas_feitas where produto_id = '${PIA}'`)).rows[0].n, 0, 'sem o produto apagado');
    assert.ok((await db.query(`select count(*)::int as n from buscas_feitas where produto_id is null`)).rows[0].n > 0, 'a busca continua contando (correção 17)');
  });
  test(`buscas guardadas: ${nome}`, async () => {
    const db = await banco(comCorrecao);
    await assert.rejects(como(db, BIA, guardar('pia inox', 199.9)), /row-level security/, 'membro não grava a busca (correção 16)');
    await como(db, ANA, guardar('pia inox', 199.9));
    await como(db, ANA, guardar('pia inox 50', 189.9)); // Atualizar: substitui, continua 1 por produto
    const rows = (await como(db, BIA, 'select termo, resultados from buscas_concorrentes')).rows;
    assert.deepEqual(rows.map((r) => [r.termo, r.resultados[0].preco]), [['pia inox 50', 189.9]]);
    // desmarcados: guardados por produto, sobrevivem ao Atualizar (o app não reenvia a coluna) e só aceitam lista
    assert.equal((await como(db, BIA, `update buscas_concorrentes set excluidos = '["X"]' where produto_id = '${PIA}' returning 1`)).rows.length, 0, 'membro não desmarca');
    await como(db, ANA, `update buscas_concorrentes set excluidos = '["MLB1"]' where produto_id = '${PIA}'`);
    await como(db, ANA, guardar('pia inox 50', 179.9));
    assert.deepEqual((await como(db, BIA, 'select excluidos from buscas_concorrentes')).rows[0].excluidos, ['MLB1']);
    await assert.rejects(como(db, ANA, `update buscas_concorrentes set excluidos = '{"x":1}'`), /check/);
    assert.equal((await como(db, LEO, 'select * from buscas_concorrentes')).rows.length, 0);
    await assert.rejects(como(db, LEO, guardar('intruso', 1)), /row-level security/);
    await assert.rejects(db.exec('set role anon; select * from buscas_concorrentes;').finally(() => db.exec('reset role')), /permission denied/);
    await como(db, ANA, `delete from produtos where id = '${PIA}'`);
    assert.equal((await db.query('select count(*)::int as n from buscas_concorrentes')).rows[0].n, 0);
  });

  test(`concorrentes: ${nome}`, async () => {
    const db = await banco(comCorrecao);
    // só o admin anota (correção 16); o membro vê; o e-mail de quem anotou fica na linha
    await assert.rejects(como(db, BIA, novo('Loja X', 199.9)), /row-level security/, 'membro não anota');
    await como(db, ANA, novo('Loja X', 199.9, 'https://www.mercadolivre.com.br/p/MLB123'));
    await como(db, ANA, novo('Loja Y', 210));
    const rows = (await como(db, BIA, 'select vendedor, preco, criado_por from concorrentes order by preco')).rows;
    assert.deepEqual(rows.map((r) => [r.vendedor, Number(r.preco), r.criado_por]), [['Loja X', 199.9, 'ana@a.com'], ['Loja Y', 210, 'ana@a.com']]);

    // outra empresa não vê nem grava na nossa
    assert.equal((await como(db, LEO, 'select * from concorrentes')).rows.length, 0);
    await assert.rejects(como(db, LEO, novo('Intruso', 1)), /row-level security/);
    // anônimo não lê nada
    await assert.rejects(db.exec('set role anon; select * from concorrentes;').finally(() => db.exec('reset role')), /permission denied/);

    // link só endereço web; preço > 0; vendedor não vazio
    await assert.rejects(como(db, ANA, novo('Z', 10, 'javascript:alert(1)')), /check/);
    await assert.rejects(como(db, ANA, novo('Z', 0)), /check/);
    await assert.rejects(como(db, ANA, novo('  ', 10)), /check/);

    // remover anota; o histórico sai com o nome do canal e vírgula
    assert.equal((await como(db, BIA, `delete from concorrentes where vendedor = 'Loja Y' returning 1`)).rows.length, 0, 'membro não exclui');
    await como(db, ANA, `delete from concorrentes where vendedor = 'Loja Y'`);
    assert.deepEqual(await hist(db), [
      'Concorrente adicionado: Pia Inox (P-1) · Mercado Livre · Loja X · R$ 199,90',
      'Concorrente adicionado: Pia Inox (P-1) · Mercado Livre · Loja Y · R$ 210,00',
      'Concorrente removido: Pia Inox (P-1) · Mercado Livre · Loja Y · R$ 210,00',
    ]);

    // produto excluído: concorrentes vão junto, e só o "Produto excluído" é anotado
    await db.exec('delete from historico');
    await como(db, ANA, `delete from produtos where id = '${PIA}'`);
    assert.equal((await db.query('select count(*)::int as n from concorrentes')).rows[0].n, 0);
    assert.deepEqual(await hist(db), ['Produto excluído: Pia Inox (P-1)']);
  });
}

test('concorrentes: excluir a empresa continua funcionando com concorrentes anotados', async () => {
  const db = await banco(true);
  await como(db, ANA, novo('Loja X', 199.9));
  await como(db, ANA, guardar('pia inox', 199.9));
  await como(db, ANA, `select excluir_empresa('${A}')`);
  assert.equal((await db.query('select count(*)::int as n from buscas_concorrentes')).rows[0].n, 0);
  assert.equal((await db.query(`select count(*)::int as n from empresas where id = '${A}'`)).rows[0].n, 0);
  assert.equal((await db.query('select count(*)::int as n from concorrentes')).rows[0].n, 0);
});
