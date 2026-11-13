// O banco (supabase/schema.sql) roda num Postgres de verdade (PGlite) com os papéis do Supabase, num projeto
// com "Automatically expose new tables" DESLIGADO (as tabelas só têm as permissões que o schema dá).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { calcularMargem } from '../src/calculos/margem.js';

const A = '00000000-0000-0000-0000-00000000000a'; // empresa A
const B = '00000000-0000-0000-0000-00000000000b'; // empresa B
const ANA = '00000000-0000-0000-0000-0000000000a1'; // dona da A
const CAIO = '00000000-0000-0000-0000-0000000000a2'; // membro da A
const BIA = '00000000-0000-0000-0000-0000000000b1'; // dona da B
const DUDA = '00000000-0000-0000-0000-0000000000d1'; // membro da A e da B
const SEM_EMPRESA = '00000000-0000-0000-0000-0000000000c1';
const BANCO_A = '00000000-0000-0000-0000-0000000000f1';
const TABELAS = ['empresas', 'membros', 'convites', 'produtos', 'itens_kit', 'precificacoes', 'config_canais', 'historico'];
const ler = (arquivo) => readFileSync(new URL(arquivo, import.meta.url), 'utf8');

// O que o Supabase já traz pronto: papéis, auth.uid() e o Storage. Nada de acesso automático às tabelas novas.
async function bancoVazio() {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role supabase_auth_admin nologin;
    create schema auth; create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean);
    create table storage.objects (bucket_id text, name text);
    create function storage.foldername(name text) returns text[] language sql immutable
      as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
    alter table storage.objects enable row level security;
    grant usage on schema storage to anon, authenticated;
    grant all on storage.objects to anon, authenticated;
  `);
  await db.exec(ler('../supabase/schema.sql'));
  return db;
}

async function bancoComDados() {
  const db = await bancoVazio();
  await db.exec(`
    insert into auth.users values ('${ANA}', 'ana@a.com'), ('${CAIO}', 'caio@a.com'), ('${BIA}', 'bia@b.com'),
      ('${DUDA}', 'duda@grupo.com'), ('${SEM_EMPRESA}', 'ze@x.com');
    insert into empresas (id, nome) values ('${A}', 'Empresa A'), ('${B}', 'Empresa B');
    insert into membros (empresa_id, usuario_id, email, papel) values
      ('${A}', '${ANA}', 'ana@a.com', 'dono'), ('${A}', '${CAIO}', 'caio@a.com', 'membro'),
      ('${B}', '${BIA}', 'bia@b.com', 'dono'), ('${A}', '${DUDA}', 'duda@grupo.com', 'membro'), ('${B}', '${DUDA}', 'duda@grupo.com', 'membro');
    insert into produtos (id, empresa_id, nome, sku, tipo_custo, custo, peso_g) values
      ('${BANCO_A}', '${A}', 'Banco', '1058', 'revenda', '{"revenda": {"custoCompra": 300}}', 4000),
      ('00000000-0000-0000-0000-0000000000f2', '${B}', 'Suporte', 'S-1', 'revenda', '{}', 300);
    insert into precificacoes (empresa_id, produto_id, canal, preco_de) values ('${A}', '${BANCO_A}', 'shopee', 250);
    insert into config_canais (empresa_id, canal, config) values ('${A}', 'shopee', '{}');
    delete from historico;
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
const linhas = async (...a) => (await como(...a)).rows;

test('banco: sem login não lê nem grava nada', async () => {
  const db = await bancoComDados();
  for (const t of TABELAS) await assert.rejects(como(db, 'anon', null, `select * from ${t}`), /permission denied/, `anon leu ${t}`);
  await assert.rejects(como(db, 'anon', null, `insert into produtos (empresa_id, nome, tipo_custo) values ('${A}', 'x', 'revenda')`), /permission denied/);
  await assert.rejects(como(db, 'anon', null, 'select aceitar_convites()'), /permission denied/);
  await assert.rejects(como(db, 'anon', null, `select copiar_produtos('${A}', '${B}')`), /permission denied/);
  // logado mas sem empresa (não convidado para nenhuma): não vê nada
  for (const t of TABELAS) assert.equal((await linhas(db, 'authenticated', SEM_EMPRESA, `select * from ${t}`)).length, 0, t);
});

test('banco: cada empresa só vê e grava o que é dela', async () => {
  const db = await bancoComDados();
  assert.deepEqual(await linhas(db, 'authenticated', ANA, 'select nome from produtos'), [{ nome: 'Banco' }]);
  assert.deepEqual(await linhas(db, 'authenticated', BIA, 'select nome from produtos'), [{ nome: 'Suporte' }]);
  assert.equal((await linhas(db, 'authenticated', BIA, 'select * from precificacoes')).length, 0);
  await assert.rejects(como(db, 'authenticated', BIA, `insert into produtos (empresa_id, nome, tipo_custo) values ('${A}', 'Intruso', 'revenda')`), /row-level security/);
  assert.equal((await como(db, 'authenticated', BIA, `update produtos set nome = 'x' where sku = '1058'`)).affectedRows, 0);
  assert.equal((await como(db, 'authenticated', BIA, `delete from produtos where sku = '1058'`)).affectedRows, 0);
  await assert.rejects(
    como(db, 'authenticated', ANA, `insert into itens_kit values ('${A}', '${BANCO_A}', '00000000-0000-0000-0000-0000000000f2', 1)`),
    /foreign key/,
    'kit não aponta para produto de outra empresa',
  );
  assert.equal((await linhas(db, 'authenticated', DUDA, 'select * from produtos')).length, 2, 'quem está nas duas vê as duas');
});

test('banco: membro usa o app (lê, grava, muda e apaga na própria empresa)', async () => {
  const db = await bancoComDados();
  const novo = '00000000-0000-0000-0000-0000000000f3';
  await como(db, 'authenticated', CAIO, `insert into produtos (id, empresa_id, nome, tipo_custo) values ('${novo}', '${A}', 'Pia', 'revenda')`);
  await como(db, 'authenticated', CAIO, `insert into itens_kit values ('${A}', '${novo}', '${BANCO_A}', 2)`);
  await como(db, 'authenticated', CAIO, `insert into precificacoes (empresa_id, produto_id, canal, preco_de) values ('${A}', '${novo}', 'mercadolivre', 99.9)`);
  await como(db, 'authenticated', CAIO, `insert into config_canais (empresa_id, canal, config) values ('${A}', 'empresa', '{"impostos": 12}')`);
  assert.equal((await como(db, 'authenticated', CAIO, `update produtos set nome = 'Pia inox' where id = '${novo}'`)).affectedRows, 1);
  assert.equal((await como(db, 'authenticated', CAIO, `delete from produtos where id = '${novo}'`)).affectedRows, 1);
  await assert.rejects(como(db, 'authenticated', CAIO, `update empresas set nome = 'x'`), /permission denied/);
});

test('banco: dono convida e remove; membro não', async () => {
  const db = await bancoComDados();
  assert.equal((await linhas(db, 'authenticated', CAIO, 'select * from membros')).length, 3, 'membro vê a equipe da A');
  await assert.rejects(como(db, 'authenticated', CAIO, `insert into convites (empresa_id, email) values ('${A}', 'x@x.com')`), /row-level security/);
  assert.equal((await como(db, 'authenticated', CAIO, `delete from membros where usuario_id = '${DUDA}'`)).affectedRows, 0);
  assert.equal((await linhas(db, 'authenticated', CAIO, 'select * from convites')).length, 0);
  await assert.rejects(como(db, 'authenticated', CAIO, `insert into membros (empresa_id, usuario_id, email) values ('${B}', '${CAIO}', 'caio@a.com')`), /permission denied/);

  await como(db, 'authenticated', ANA, `insert into convites (empresa_id, email) values ('${A}', 'nova@a.com')`);
  assert.equal((await como(db, 'authenticated', ANA, `delete from membros where usuario_id = '${CAIO}' and empresa_id = '${A}'`)).affectedRows, 1);
  assert.equal((await como(db, 'authenticated', ANA, `delete from membros where usuario_id = '${ANA}'`)).affectedRows, 0, 'dono não se remove');
  assert.equal((await como(db, 'authenticated', BIA, `delete from membros where usuario_id = '${DUDA}' and empresa_id = '${A}'`)).affectedRows, 0, 'dono de outra empresa não mexe');
  await assert.rejects(como(db, 'authenticated', BIA, `insert into convites (empresa_id, email) values ('${A}', 'x@x.com')`), /row-level security/);
});

test('banco: só cria conta quem tem convite, e o 1º login entra na empresa', async () => {
  const db = await bancoComDados();
  const hook = async (email) => (await db.query(`select antes_de_criar_usuario('{"user": {"email": "${email}"}}') r`)).rows[0].r;
  assert.equal((await hook('estranho@x.com')).error.http_code, 403);
  await como(db, 'authenticated', ANA, `insert into convites (empresa_id, email) values ('${A}', 'nova@a.com')`);
  assert.deepEqual(await hook('Nova@A.com'), {});
  const NOVA = '00000000-0000-0000-0000-0000000000e1';
  await db.exec(`insert into auth.users values ('${NOVA}', 'Nova@A.com')`);
  assert.deepEqual(await linhas(db, 'authenticated', NOVA, 'select aceitar_convites() e'), [{ e: A }]);
  assert.deepEqual(await linhas(db, 'authenticated', NOVA, `select papel, email from membros where usuario_id = '${NOVA}'`), [{ papel: 'membro', email: 'nova@a.com' }]);
  assert.equal((await db.query('select * from convites')).rows.length, 0, 'convite usado sai da lista');
  assert.equal((await linhas(db, 'authenticated', NOVA, 'select * from produtos')).length, 1);
});

test('banco: primeiro acesso convida o dono, que entra no 1º login', async () => {
  const db = await bancoVazio();
  await db.exec(ler('../supabase/primeiro-acesso.sql').replace('NOME DA EMPRESA', 'Empresa A').replace('seu-email@exemplo.com', 'ana@a.com'));
  await db.exec(`insert into auth.users values ('${ANA}', 'ana@a.com')`);
  assert.equal((await linhas(db, 'authenticated', ANA, 'select aceitar_convites() e')).length, 1);
  assert.deepEqual(await linhas(db, 'authenticated', ANA, 'select e.nome, m.papel from empresas e join membros m on m.empresa_id = e.id'), [{ nome: 'Empresa A', papel: 'dono' }]);
});

test('banco: histórico gravado pelo banco, só leitura para a empresa', async () => {
  const db = await bancoComDados();
  const novo = '00000000-0000-0000-0000-0000000000f4';
  await como(db, 'authenticated', CAIO, `insert into produtos (id, empresa_id, nome, sku, tipo_custo) values ('${novo}', '${A}', 'Pia', 'P-1', 'revenda')`);
  await como(db, 'authenticated', CAIO, `update produtos set peso_g = 900 where id = '${novo}'`);
  await como(db, 'authenticated', ANA, `insert into precificacoes (empresa_id, produto_id, canal, preco_de, desconto) values ('${A}', '${novo}', 'shopee', 120, 10)`);
  await como(db, 'authenticated', ANA, `update precificacoes set salvo_em = now() where produto_id = '${novo}'`); // preço igual: não anota
  await como(db, 'authenticated', ANA, `update config_canais set config = '{"impostos": 8}' where empresa_id = '${A}' and canal = 'shopee'`);
  await como(db, 'authenticated', ANA, `insert into config_canais (empresa_id, canal, config) values ('${A}', 'empresa', '{"impostos": 12}')`);
  await como(db, 'authenticated', ANA, `select anotar_importacao('${A}', '3 produtos')`);
  await como(db, 'authenticated', CAIO, `delete from produtos where id = '${novo}'`);
  assert.deepEqual(await linhas(db, 'authenticated', CAIO, 'select quem, acao, detalhe from historico order by id'), [
    { quem: 'caio@a.com', acao: 'Produto criado', detalhe: 'Pia (P-1)' },
    { quem: 'caio@a.com', acao: 'Produto alterado', detalhe: 'Pia (P-1)' },
    { quem: 'ana@a.com', acao: 'Preço salvo', detalhe: 'Pia · shopee · R$ 120.00 com 10% de desconto' },
    { quem: 'ana@a.com', acao: 'Taxa do canal alterada', detalhe: 'shopee' },
    { quem: 'ana@a.com', acao: 'Imposto da empresa alterado', detalhe: '12%' },
    { quem: 'ana@a.com', acao: 'Importação', detalhe: '3 produtos' },
    { quem: 'caio@a.com', acao: 'Produto excluído', detalhe: 'Pia (P-1)' },
  ]);
  for (const sql of [`insert into historico (empresa_id, quem, acao) values ('${A}', 'eu', 'x')`, 'update historico set quem = 1', 'delete from historico']) {
    await assert.rejects(como(db, 'authenticated', ANA, sql), /permission denied/, sql);
  }
  await assert.rejects(como(db, 'authenticated', BIA, `select anotar_importacao('${A}', 'x')`), /sem acesso/);
  assert.equal((await linhas(db, 'authenticated', BIA, 'select * from historico')).length, 0);
});

test('banco: copiar produtos entre empresas leva cadastro, não leva preços nem taxas', async () => {
  const db = await bancoComDados();
  // A e B vendem o mesmo banco 1058, com tributação diferente
  await db.exec(`
    insert into produtos (empresa_id, nome, sku, tipo_custo, custo) values ('${B}', 'Banco antigo', '1058', 'revenda', '{"revenda": {"custoCompra": 250}}');
    insert into config_canais (empresa_id, canal, config) values ('${A}', 'empresa', '{"impostos": 12}'), ('${B}', 'empresa', '{"impostos": 4}');
    update produtos set fotos = array['data:image/webp;base64,AAA'] where id = '${BANCO_A}';
    delete from historico;
  `);
  await assert.rejects(como(db, 'authenticated', ANA, `select copiar_produtos('${A}', '${B}')`), /duas empresas suas/, 'só quem está nas duas');
  assert.deepEqual(await linhas(db, 'authenticated', DUDA, `select * from previa_copia('${A}', '${B}')`), [{ nome: 'Banco', sku: '1058', situacao: 'atualizado' }]);
  assert.deepEqual((await linhas(db, 'authenticated', DUDA, `select copiar_produtos('${A}', '${B}') r`))[0].r, { novos: 0, atualizados: 1 });

  const b = (await db.query(`select * from produtos where empresa_id = '${B}' and sku = '1058'`)).rows[0];
  assert.equal(b.nome, 'Banco');
  assert.equal(b.custo.revenda.custoCompra, 300);
  assert.deepEqual(b.fotos, ['data:image/webp;base64,AAA']);
  assert.equal((await db.query(`select * from precificacoes where empresa_id = '${B}'`)).rows.length, 0, 'preço não vai');
  assert.deepEqual((await db.query(`select canal, config from config_canais where empresa_id = '${B}'`)).rows, [{ canal: 'empresa', config: { impostos: 4 } }], 'taxas da B ficam');
  assert.deepEqual(await linhas(db, 'authenticated', BIA, `select detalhe from historico where acao = 'Cópia de produtos'`), [{ detalhe: 'De Empresa A: 0 novo(s), 1 atualizado(s)' }]);

  // mesmo produto, mesmo preço: o imposto de cada empresa dá margens diferentes
  const { canais } = JSON.parse(ler('../data/canais.json'));
  const imposto = async (e) => (await db.query(`select config from config_canais where empresa_id = '${e}' and canal = 'empresa'`)).rows[0].config.impostos;
  const margem = async (e) => calcularMargem({ preco: 500, cmv: 300, canal: { ...canais.lojapropria, impostos: await imposto(e) }, pesoG: 4000 }).margem;
  const [ma, mb] = [await margem(A), await margem(B)];
  assert.ok(Math.abs(mb - ma - 8) < 1e-9, `margens ${ma} e ${mb}`);
});

test('banco: copiar com SKU repetido cria novo em vez de sobrescrever', async () => {
  const db = await bancoComDados();
  await db.exec(`
    insert into produtos (empresa_id, nome, sku, tipo_custo) values
      ('${A}', 'Kit 20 piso', '1121', 'revenda'), ('${A}', 'Kit 10 piso', '1121', 'revenda'),
      ('${A}', 'Porta luvas', '13689', 'revenda'),
      ('${B}', 'Porta luvas B', '13689', 'revenda'), ('${B}', 'Kit 2 porta luvas B', '13689', 'revenda'),
      ('${B}', 'Banco B', '1058', 'revenda');
  `);
  const previa = await linhas(db, 'authenticated', DUDA, `select nome, situacao from previa_copia('${A}', '${B}') order by nome`);
  assert.deepEqual(previa, [
    { nome: 'Banco', situacao: 'atualizado' }, // 1058: único nas duas
    { nome: 'Kit 10 piso', situacao: 'repetido' }, // 1121: repetido na origem
    { nome: 'Kit 20 piso', situacao: 'repetido' },
    { nome: 'Porta luvas', situacao: 'repetido' }, // 13689: repetido no destino
  ]);
  assert.deepEqual((await linhas(db, 'authenticated', DUDA, `select copiar_produtos('${A}', '${B}') r`))[0].r, { novos: 3, atualizados: 1 }, 'cópia faz o que a prévia disse');
  const nomesB = (await db.query(`select nome from produtos where empresa_id = '${B}' order by nome`)).rows.map((r) => r.nome);
  assert.deepEqual(nomesB, ['Banco', 'Kit 10 piso', 'Kit 2 porta luvas B', 'Kit 20 piso', 'Porta luvas', 'Porta luvas B', 'Suporte'], 'nada some');
});

test('banco: a correção 01 roda por cima de um banco já criado', async () => {
  const db = await bancoComDados();
  await db.exec(ler('../supabase/correcao-01-copiar.sql'));
  await db.exec(ler('../supabase/correcao-01-copiar.sql')); // rodar 2 vezes não quebra
  await db.exec(`insert into produtos (empresa_id, nome, sku, tipo_custo) values ('${A}', 'Outro banco', '1058', 'revenda')`);
  assert.deepEqual((await linhas(db, 'authenticated', DUDA, `select situacao from previa_copia('${A}', '${B}') where sku = '1058'`)).map((r) => r.situacao), ['repetido', 'repetido']);
  await assert.rejects(como(db, 'anon', null, `select previa_copia('${A}', '${B}')`), /permission denied/);
});

test('banco: fotos no Storage só na pasta da própria empresa', async () => {
  const db = await bancoComDados();
  await como(db, 'authenticated', ANA, `insert into storage.objects values ('fotos', '${A}/banco.webp')`);
  await assert.rejects(como(db, 'authenticated', ANA, `insert into storage.objects values ('fotos', '${B}/x.webp')`), /row-level security/);
  await assert.rejects(como(db, 'authenticated', ANA, `insert into storage.objects values ('fotos', 'solta.webp')`), /row-level security/);
  assert.equal((await linhas(db, 'authenticated', BIA, 'select * from storage.objects')).length, 0);
  assert.equal((await linhas(db, 'anon', null, 'select * from storage.objects')).length, 0);
  assert.equal((await linhas(db, 'authenticated', ANA, 'select * from storage.objects')).length, 1);
});

// A chave publishable é pública (vai no site, em src/config.js). Segredo nenhum pode entrar.
test('nenhum segredo do Supabase no repositório', () => {
  const pastas = ['src', 'supabase', 'docs', 'data'];
  const arquivos = pastas.flatMap(function lista(p) {
    const caminho = new URL(`../${p}`, import.meta.url);
    return statSync(caminho).isDirectory() ? readdirSync(caminho).flatMap((f) => lista(`${p}/${f}`)) : [p];
  });
  for (const f of [...arquivos, 'index.html']) {
    assert.doesNotMatch(ler(`../${f}`), /sb_secret_\w{6,}|eyJ[\w-]{20,}\.[\w-]{20,}|(senha|password)\s*[:=]\s*['"][^'"]{4,}/i, `parece um segredo em ${f}`);
  }
});
