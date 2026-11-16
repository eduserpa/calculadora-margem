// Imposto só de um produto NUM canal (correção 14; ex.: DIFAL no Mercado Livre): sem valor = o do canal/empresa; com valor,
// vale para esse produto nesse canal, por cima dos outros. Conta (Resultado, preço mínimo, concorrentes, Início/planilha),
// ida e volta da nuvem e o banco (mapa por canal 0–100, histórico "Imposto no Mercado Livre: padrão → 15%", clonar leva,
// e a correcao-14 roda 2 vezes num banco da 1ª versão, que tinha produtos.imposto para todos os canais).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { calcularMargem, precoMinimo } from '../src/calculos/margem.js';
import { canalDoProduto, impostoDoProdutoNoCanal, precosSalvos, produtoVazio } from '../src/produtos.js';
import { margensDosConcorrentes } from '../src/concorrentes.js';
import { dados } from '../src/dados.js';
import { paraLinhas, deLinhas } from '../src/nuvem.js';

const { canais } = JSON.parse(readFileSync(new URL('../data/canais.json', import.meta.url), 'utf8'));
const ml = { ...canais.mercadolivre, impostos: 10 };

test('canalDoProduto: só no canal em que foi mudado; sem valor usa o do canal; zero vale', () => {
  const produto = { impostosCanal: { mercadolivre: 15, shopee: 0 } };
  assert.deepEqual([canalDoProduto(ml, produto, 'mercadolivre').impostos, canalDoProduto(ml, produto, 'mercadolivre').impostoDoProduto], [15, true]);
  assert.equal(canalDoProduto(ml, produto, 'shein'), ml, 'outro canal: o padrão');
  assert.equal(canalDoProduto(ml, produto, 'shopee').impostos, 0, 'zero é um imposto de verdade');
  assert.equal(canalDoProduto(ml, {}, 'mercadolivre'), ml, 'produto antigo, sem o mapa');
  assert.equal(canalDoProduto(ml, null, 'mercadolivre'), ml, 'sem produto (custo digitado à mão)');
  assert.equal(impostoDoProdutoNoCanal(produto, 'shein'), null);
});

test('conta com o imposto do produto no canal: Resultado, preço mínimo e concorrentes', () => {
  const canal = canalDoProduto(ml, { impostosCanal: { mercadolivre: 15 } }, 'mercadolivre');
  const sem = calcularMargem({ preco: 100, cmv: 40, canal: ml, pesoG: 300 });
  const com = calcularMargem({ preco: 100, cmv: 40, canal, pesoG: 300 });
  assert.deepEqual([sem.impostosPercentual, com.impostosPercentual], [10, 15]);
  assert.equal(Math.round((sem.lucro - com.lucro) * 100) / 100, 5, '5% a mais de imposto sobre R$ 100');
  assert.ok(precoMinimo({ cmv: 40, canal, pesoG: 300, margemDesejada: 20 }) > precoMinimo({ cmv: 40, canal: ml, pesoG: 300, margemDesejada: 20 }));
  const conc = (c) => margensDosConcorrentes({ concorrentes: [{ preco: 100 }], cmv: 40, canal: c, pesoG: 300 }).itens[0].margem;
  assert.ok(conc(canal) < conc(ml), 'a margem no preço do concorrente usa o imposto do produto');
});

test('Início e planilha (precosSalvos): o imposto do produto só no canal dele; nos outros, o da empresa', () => {
  const antes = { ...dados };
  try {
    Object.assign(dados, {
      canais: { shopee: canais.shopee, mercadolivre: canais.mercadolivre },
      empresa: { impostos: 8 },
      produtos: [{ ...produtoVazio(), id: 'a', nome: 'Pia', impostosCanal: { mercadolivre: 15 }, revenda: { custoCompra: 40, freteFornecedor: 0, embalagem: 0, outros: 0 } }],
      precificacoes: { a: { shopee: { de: 100, desconto: 0 }, mercadolivre: { de: 100, desconto: 0 } } },
    });
    assert.deepEqual(precosSalvos().map((s) => [s.canalId, s.r.impostosPercentual]), [['mercadolivre', 15], ['shopee', 8]]);
  } finally {
    Object.assign(dados, antes);
  }
});

test('nuvem: o mapa de impostos do produto vai e volta (vazio continua vazio)', () => {
  const d = { produtos: [{ ...produtoVazio(), id: 'a', nome: 'A', impostosCanal: { mercadolivre: 15 } }, { ...produtoVazio(), id: 'b', nome: 'B' }], precificacoes: {}, canais: null, empresa: null };
  const l = paraLinhas(d, 'E');
  assert.deepEqual(l.produtos.map((p) => p.impostos_canal), [{ mercadolivre: 15 }, {}]);
  const volta = deLinhas({ ...JSON.parse(JSON.stringify(l)), itens_kit: [], precificacoes: [], config_canais: [] });
  assert.deepEqual(volta.produtos.map((p) => p.impostosCanal), [{ mercadolivre: 15 }, {}]);
});

// ---------- banco (PGlite) ----------

const A = '00000000-0000-0000-0000-00000000000a';
const B = '00000000-0000-0000-0000-00000000000b';
const ANA = '00000000-0000-0000-0000-0000000000a1';
const PIA = '00000000-0000-0000-0000-0000000000f1';
const ler = (arquivo) => readFileSync(new URL(arquivo, import.meta.url), 'utf8');

async function banco(primeiraVersao) {
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
    insert into empresas (id, nome) values ('${A}', 'Loren Metais'), ('${B}', 'Outra');
    insert into membros (empresa_id, usuario_id, email, papel) values ('${A}', '${ANA}', 'ana@a.com', 'dono'), ('${B}', '${ANA}', 'ana@a.com', 'dono');
    insert into produtos (id, empresa_id, nome, sku, tipo_custo) values ('${PIA}', '${A}', 'Pia Inox', 'P-1', 'revenda');
  `);
  if (primeiraVersao) {
    // banco da 1ª versão: produtos.imposto (todos os canais) e sem o mapa; a correção 14 final troca, 2 vezes sem quebrar
    await db.exec(`alter table produtos drop column impostos_canal; alter table produtos add column imposto numeric;
      alter table produtos disable trigger historico; update produtos set imposto = 12.5 where id = '${PIA}'; alter table produtos enable trigger historico;`);
    await db.exec(ler('../supabase/correcao-14-imposto-produto.sql'));
    await db.exec(ler('../supabase/correcao-14-imposto-produto.sql'));
  }
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
const mapa = async (db, empresa = A) => (await db.query(`select impostos_canal from produtos where empresa_id = '${empresa}'`)).rows[0].impostos_canal;

test('correcao-14 num banco da 1ª versão: o imposto único vai para todos os canais e a coluna antiga sai', async () => {
  const db = await banco(true);
  const m = await mapa(db);
  assert.deepEqual(Object.keys(m).sort(), ['atacado', 'lojafisica', 'lojapropria', 'mercadolivre', 'shein', 'shopee', 'tiktokshop']);
  assert.ok(Object.values(m).every((v) => v === 12.5));
  assert.equal((await db.query(`select count(*)::int as n from information_schema.columns where table_name = 'produtos' and column_name = 'imposto'`)).rows[0].n, 0);
});

for (const [nome, primeiraVersao] of [['schema.sql novo', false], ['1ª versão + correcao-14 2 vezes', true]]) {
  test(`imposto do produto por canal no banco: ${nome}`, async () => {
    const db = await banco(primeiraVersao);
    await como(db, `update produtos set impostos_canal = '{}' where id = '${PIA}'`);
    await db.exec('delete from historico');
    await como(db, `update produtos set impostos_canal = '{"mercadolivre": 15}' where id = '${PIA}'`);
    await como(db, `update produtos set impostos_canal = '{"mercadolivre": 12, "shopee": 4}' where id = '${PIA}'`);
    await como(db, `update produtos set impostos_canal = '{"shopee": 4}' where id = '${PIA}'`);
    const h = (await db.query(`select mudancas from historico where empresa_id = '${A}' order by id`)).rows.map((r) => r.mudancas);
    assert.deepEqual(h, [
      [{ campo: 'Imposto no Mercado Livre', antes: 'padrão', depois: '15%' }],
      [{ campo: 'Imposto no Mercado Livre', antes: '15%', depois: '12%' }, { campo: 'Imposto no Shopee', antes: 'padrão', depois: '4%' }],
      [{ campo: 'Imposto no Mercado Livre', antes: '12%', depois: 'padrão' }],
    ]);
    for (const ruim of ['{"mercadolivre": 101}', '{"mercadolivre": -1}', '{"mercadolivre": "15"}', '[15]'])
      await assert.rejects(como(db, `update produtos set impostos_canal = '${ruim}' where id = '${PIA}'`), /check/, ruim);
    // clonar de outra empresa leva o mapa (novo e atualizado)
    await como(db, `select copiar_produtos('${A}', '${B}')`);
    assert.deepEqual(await mapa(db, B), { shopee: 4 });
    await como(db, `update produtos set impostos_canal = '{"mercadolivre": 7}' where id = '${PIA}'`);
    await como(db, `select copiar_produtos('${A}', '${B}')`);
    assert.deepEqual(await mapa(db, B), { mercadolivre: 7 });
  });
}

test('ordem dos canais: sempre a lista fixa, não a ordem gravada pela empresa; canal desconhecido no fim', async () => {
  const { canais: canaisEmUso, ORDEM_DOS_CANAIS } = await import('../src/dados.js');
  const antes = { ...dados };
  try {
    // como a Loren tem gravado: outra ordem e um canal que não está na lista
    Object.assign(dados, { empresa: null, canais: Object.fromEntries(['lojafisica', 'outro', 'shopee', 'atacado', 'mercadolivre', 'shein', 'lojapropria', 'tiktokshop'].map((id) => [id, { nome: id, impostos: 10 }])) });
    assert.deepEqual(Object.keys(canaisEmUso()), [...ORDEM_DOS_CANAIS, 'outro']);
    assert.deepEqual(ORDEM_DOS_CANAIS, ['mercadolivre', 'shopee', 'shein', 'tiktokshop', 'lojapropria', 'atacado', 'lojafisica']);
    // Início e planilha seguem a mesma ordem, não a ordem em que os preços foram salvos
    Object.assign(dados, {
      produtos: [{ ...produtoVazio(), id: 'a', nome: 'Pia', revenda: { custoCompra: 40, freteFornecedor: 0, embalagem: 0, outros: 0 } }],
      precificacoes: { a: { lojafisica: { de: 100, desconto: 0 }, shopee: { de: 100, desconto: 0 }, mercadolivre: { de: 100, desconto: 0 } } },
    });
    assert.deepEqual(precosSalvos().map((s) => s.canalId), ['mercadolivre', 'shopee', 'lojafisica']);
  } finally {
    Object.assign(dados, antes);
  }
});
