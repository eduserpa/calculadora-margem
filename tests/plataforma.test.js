// Correção 17: painel da plataforma. A segurança é no banco: roda o schema.sql (instalação nova) e o schema.sql + a correção 17
// duas vezes (projeto que já existe; pode rodar de novo) num Postgres de verdade (PGlite), com os papéis do Supabase.
// Como no Supabase, função nova nasce com execute para anon e authenticated: a correção precisa tirar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const ler = (arquivo) => readFileSync(new URL(arquivo, import.meta.url), 'utf8');

const A = '00000000-0000-0000-0000-00000000000a'; // Loren Metais
const B = '00000000-0000-0000-0000-00000000000b'; // Empresa Secreta (ninguém de fora pode ver o nome)
const NAO_EXISTE = '00000000-0000-0000-0000-0000000000ee';
const EDU = '00000000-0000-0000-0000-0000000000e1'; // admin da plataforma (não é de nenhuma empresa)
const ANA = '00000000-0000-0000-0000-0000000000a1'; // dona da A
const CAIO = '00000000-0000-0000-0000-0000000000a2'; // membro da A
const BIA = '00000000-0000-0000-0000-0000000000b1'; // dona da B
const SEM = '00000000-0000-0000-0000-0000000000c1'; // conta confirmada, sem senha, sem empresa
const COD_A = 'K7QP9M';
const COD_B = 'B4XWZ8';
const PIA = '00000000-0000-0000-0000-0000000000f1';
const CUBA = '00000000-0000-0000-0000-0000000000f2';
const BALDE = '00000000-0000-0000-0000-0000000000f3';

// Toda função do painel, com argumentos válidos (para conferir que quem não pode recebe 'sem permissão' em todas).
const FUNCOES = [
  'plataforma_empresas()',
  `plataforma_pessoas('${B}')`,
  `plataforma_criar_empresa('Nova', 'dono@nova.com', 20)`,
  `plataforma_convidar('${B}', 'x@b.com', 'membro')`,
  `plataforma_cancelar_convite('${B}', 'pendente@b.com')`,
  `plataforma_remover_pessoa('${B}', '${BIA}')`,
  `plataforma_suspender('${B}', true)`,
  `plataforma_limite_buscas('${B}', 5)`,
  'plataforma_auditoria(100)',
];

async function ambiente() {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role supabase_auth_admin nologin;
    create schema auth; create table auth.users (id uuid primary key, email text, last_sign_in_at timestamptz, email_confirmed_at timestamptz, encrypted_password text);
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable
      as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid(), auth.jwt() to anon, authenticated;
    create schema storage; create table storage.buckets (id text primary key, name text, public boolean); create table storage.objects (bucket_id text, name text);
    create function storage.foldername(name text) returns text[] language sql immutable
      as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated; grant select, insert, update, delete on storage.objects to authenticated; -- como no Supabase (a RLS decide)
    alter default privileges in schema public grant execute on functions to anon, authenticated;
  `);
  return db;
}

async function banco(comCorrecao) {
  const db = await ambiente();
  await db.exec(ler('../supabase/schema.sql'));
  await db.exec(`
    insert into auth.users values ('${EDU}', 'edu@calculeo.com', null), ('${ANA}', 'ana@a.com', '2026-11-10 10:00-03'),
      ('${CAIO}', 'caio@a.com', '2026-11-15 09:00-03'), ('${BIA}', 'bia@b.com', null);
    insert into empresas (id, nome, codigo, limite_buscas_mes) values ('${A}', 'Loren Metais', '${COD_A}', null), ('${B}', 'Empresa Secreta', '${COD_B}', null); -- de antes da 17: sem limite
    insert into membros (empresa_id, usuario_id, email, papel) values
      ('${A}', '${ANA}', 'ana@a.com', 'dono'), ('${A}', '${CAIO}', 'caio@a.com', 'membro'), ('${B}', '${BIA}', 'bia@b.com', 'dono');
    insert into convites (empresa_id, email, papel) values ('${B}', 'pendente@b.com', 'membro');
    insert into produtos (id, empresa_id, nome, sku, tipo_custo) values ('${PIA}', '${A}', 'Pia Inox', 'P-1', 'revenda'),
      ('${CUBA}', '${A}', 'Cuba', 'C-1', 'revenda'), ('${BALDE}', '${A}', 'Balde', 'B-1', 'revenda');
  `);
  if (comCorrecao) {
    await db.exec(ler('../supabase/correcao-17-plataforma.sql'));
    await db.exec(ler('../supabase/correcao-17-plataforma.sql')); // 2 vezes não quebra
    await db.exec(ler('../supabase/correcao-18-excluir-empresa-plataforma.sql'));
    await db.exec(ler('../supabase/correcao-18-excluir-empresa-plataforma.sql'));
    await db.exec(ler('../supabase/correcao-19-cota-buscas.sql'));
    await db.exec(ler('../supabase/correcao-19-cota-buscas.sql'));
  }
  await db.exec(`insert into admins_plataforma (usuario_id, email) values ('${EDU}', 'edu@calculeo.com'); delete from historico;`);
  return db;
}

// Roda como alguém logado (authenticated) ou de fora (anon); aal2 = entrou com as 2 etapas.
async function como(db, usuario, sql, { aal = 'aal1', papel = 'authenticated' } = {}) {
  const claims = usuario ? JSON.stringify({ sub: usuario, aal }) : '';
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${usuario ?? ''}', false),
    set_config('request.jwt.claims', '${claims}', false); set role ${papel};`);
  try {
    return await db.query(sql);
  } finally {
    await db.exec('reset role');
  }
}
const linhas = async (...a) => (await como(...a)).rows;
const um = async (...a) => Object.values((await linhas(...a))[0])[0];
const admin = (db, sql) => como(db, EDU, sql, { aal: 'aal2' });
const erro = async (p) => {
  try { await p; } catch (e) { return e.message; }
  assert.fail('devia dar erro');
};

for (const [nome, comCorrecao] of [['schema.sql', false], ['schema.sql + correções 17, 18 e 19 (2 vezes)', true]]) {
  test(`plataforma (${nome}): usuário comum recebe 'sem permissão' em toda função e não vê o nome de outra empresa`, async () => {
    const db = await banco(comCorrecao);
    for (const [quem, aal] of [[ANA, 'aal1'], [ANA, 'aal2'], [CAIO, 'aal2']]) {
      assert.equal(await um(db, quem, 'select meu_acesso_plataforma()', { aal }), 'nao');
      assert.equal(await um(db, quem, 'select sou_admin_plataforma()', { aal }), false);
      for (const f of FUNCOES) {
        const msg = await erro(como(db, quem, `select * from ${f}`, { aal }));
        assert.match(msg, /^sem permissão$/, f);
      }
      // empresa que não existe: mesma resposta (não dá para descobrir quais ids existem)
      assert.equal(await erro(como(db, quem, `select plataforma_suspender('${NAO_EXISTE}', true)`, { aal })), 'sem permissão');
      assert.equal(await erro(como(db, quem, `select plataforma_convidar('${NAO_EXISTE}', 'ruim')`, { aal })), 'sem permissão');
    }
    // nada mudou
    const [b] = (await db.query(`select suspensa, limite_buscas_mes from empresas where id = '${B}'`)).rows;
    assert.deepEqual(b, { suspensa: false, limite_buscas_mes: null });
    assert.equal((await db.query('select count(*)::int n from auditoria_plataforma')).rows[0].n, 0);
    assert.equal((await db.query(`select count(*)::int n from membros where empresa_id = '${B}'`)).rows[0].n, 1);
    // e continua sem ver a empresa B pelas tabelas
    assert.deepEqual((await linhas(db, ANA, 'select nome from empresas', { aal: 'aal2' })).map((r) => r.nome), ['Loren Metais']);
  });

  test(`plataforma (${nome}): admin sem as 2 etapas recebe 'sem permissão' e meu_acesso = 'precisa_mfa'`, async () => {
    const db = await banco(comCorrecao);
    assert.equal(await um(db, EDU, 'select meu_acesso_plataforma()', { aal: 'aal1' }), 'precisa_mfa');
    assert.equal(await um(db, EDU, 'select sou_admin_plataforma()', { aal: 'aal1' }), false);
    for (const f of FUNCOES) assert.equal(await erro(como(db, EDU, `select * from ${f}`, { aal: 'aal1' })), 'sem permissão', f);
    // JWT sem aal nenhum: também não
    await db.exec(`select set_config('request.jwt.claim.sub', '${EDU}', false), set_config('request.jwt.claims', '{"sub": "${EDU}"}', false); set role authenticated;`);
    await assert.rejects(db.query('select * from plataforma_empresas()'), /sem permissão/);
    await db.exec('reset role');
    assert.equal(await um(db, EDU, 'select meu_acesso_plataforma()', { aal: 'aal2' }), 'sim');
  });

  test(`plataforma (${nome}): sem login nada roda; ninguém lê nem grava a lista de admins e a auditoria direto`, async () => {
    const db = await banco(comCorrecao);
    for (const f of ['meu_acesso_plataforma()', 'sou_admin_plataforma()', ...FUNCOES])
      await assert.rejects(como(db, null, `select * from ${f}`, { papel: 'anon' }), /permission denied/, f);
    for (const [quem, aal] of [[ANA, 'aal2'], [EDU, 'aal2']]) {
      for (const t of ['admins_plataforma', 'auditoria_plataforma']) {
        await assert.rejects(como(db, quem, `select * from ${t}`, { aal }), /permission denied/, t);
        await assert.rejects(como(db, quem, `delete from ${t}`, { aal }), /permission denied/, t);
      }
      await assert.rejects(como(db, quem, `insert into admins_plataforma (usuario_id) values ('${ANA}')`, { aal }), /permission denied/);
      await assert.rejects(como(db, quem, `insert into auditoria_plataforma (acao) values ('falsa')`, { aal }), /permission denied/);
      await assert.rejects(como(db, quem, `update empresas set suspensa = false, limite_buscas_mes = null`, { aal }), /permission denied/);
    }
    // as funções de apoio não são chamáveis de fora (gravar auditoria falsa, etc.)
    for (const f of ['anotar_plataforma(text, text)', 'nome_da_empresa(uuid)', 'email_valido(text)', 'inicio_do_mes()', 'novo_codigo_empresa()',
      'link_pode_entrar(uuid, text)'])
      for (const p of ['anon', 'authenticated'])
        assert.equal((await db.query(`select has_function_privilege('${p}', '${f}', 'execute') ok`)).rows[0].ok, false, `${p} ${f}`);
    await assert.rejects(admin(db, `select anotar_plataforma('falsa', 'x')`), /permission denied/);
  });

  test(`plataforma (${nome}): admin com as 2 etapas vê a lista e as pessoas, sem dado de negócio`, async () => {
    const db = await banco(comCorrecao);
    await db.exec(`insert into buscas_feitas (empresa_id, produto_id, feita_em) values ('${A}', '${PIA}', now()), ('${A}', '${CUBA}', now()),
      ('${A}', '${BALDE}', inicio_do_mes() - interval '1 minute')`); // a do mês passado não conta
    const lista = (await admin(db, 'select * from plataforma_empresas()')).rows;
    assert.deepEqual(lista.map((e) => [e.nome, e.codigo, e.suspensa, e.limite_buscas_mes, e.buscas_mes, e.pessoas, e.convites, e.produtos]), [
      ['Empresa Secreta', COD_B, false, null, 0, 1, 1, 0],
      ['Loren Metais', COD_A, false, null, 2, 2, 0, 3],
    ]);
    assert.equal(new Date(lista[1].ultimo_acesso).toISOString(), '2026-11-15T12:00:00.000Z');
    assert.equal(lista[0].ultimo_acesso, null);
    assert.deepEqual(Object.keys(lista[0]), ['id', 'nome', 'codigo', 'criado_em', 'suspensa', 'limite_buscas_mes', 'buscas_mes', 'pessoas', 'convites', 'produtos', 'ultimo_acesso']);
    const pessoas = (await admin(db, `select * from plataforma_pessoas('${B}')`)).rows;
    assert.deepEqual(pessoas.map((p) => [p.tipo, p.usuario_id, p.email, p.papel, p.ultimo_acesso]), [
      ['membro', BIA, 'bia@b.com', 'dono', null],
      ['convite', null, 'pendente@b.com', 'membro', null],
    ]);
    assert.ok(pessoas.every((p) => p.desde));
    // o admin da plataforma não é de nenhuma empresa: não lê produtos nem preços
    for (const t of ['produtos', 'precificacoes', 'config_canais', 'historico', 'empresas'])
      assert.equal((await admin(db, `select * from ${t}`)).rows.length, 0, t);
  });

  test(`plataforma (${nome}): admin cria empresa, convida, cancela, remove, suspende e muda o limite; tudo na auditoria`, async () => {
    const db = await banco(comCorrecao);
    const nova = await um(db, EDU, `select plataforma_criar_empresa('  Casa Nova ', ' Dono@Nova.com ')`, { aal: 'aal2' });
    assert.deepEqual((await db.query(`select nome, limite_buscas_mes, suspensa from empresas where id = '${nova}'`)).rows[0],
      { nome: 'Casa Nova', limite_buscas_mes: 20, suspensa: false });
    assert.deepEqual((await db.query(`select email, papel from convites where empresa_id = '${nova}'`)).rows, [{ email: 'dono@nova.com', papel: 'dono' }]);
    const semLimite = await um(db, EDU, `select plataforma_criar_empresa('Livre', 'l@l.com', null)`, { aal: 'aal2' });
    assert.equal((await db.query(`select limite_buscas_mes from empresas where id = '${semLimite}'`)).rows[0].limite_buscas_mes, null);

    await admin(db, `select plataforma_convidar('${A}', 'Novo@A.com')`);
    await admin(db, `select plataforma_convidar('${A}', 'novo@a.com', 'dono')`); // de novo: só troca o papel
    assert.deepEqual((await db.query(`select email, papel from convites where empresa_id = '${A}'`)).rows, [{ email: 'novo@a.com', papel: 'dono' }]);
    await admin(db, `select plataforma_cancelar_convite('${A}', 'NOVO@a.com')`);
    assert.equal((await db.query(`select count(*)::int n from convites where empresa_id = '${A}'`)).rows[0].n, 0);

    await admin(db, `select plataforma_remover_pessoa('${A}', '${CAIO}')`);
    assert.deepEqual((await db.query(`select email from membros where empresa_id = '${A}'`)).rows, [{ email: 'ana@a.com' }]);
    await admin(db, `select plataforma_suspender('${B}', true)`);
    await admin(db, `select plataforma_suspender('${B}', false)`);
    await admin(db, `select plataforma_limite_buscas('${A}', 50)`);
    await admin(db, `select plataforma_limite_buscas('${A}', null)`);

    const reg = (await admin(db, 'select * from plataforma_auditoria()')).rows;
    const cod = async (id) => (await db.query(`select codigo from empresas where id = '${id}'`)).rows[0].codigo;
    assert.deepEqual(reg.map((r) => [r.acao, r.detalhe]), [
      ['Limite de buscas alterado', `Loren Metais (${COD_A}) · 50 → sem limite`],
      ['Limite de buscas alterado', `Loren Metais (${COD_A}) · sem limite → 50`],
      ['Empresa reativada', `Empresa Secreta (${COD_B})`],
      ['Empresa suspensa', `Empresa Secreta (${COD_B})`],
      ['Pessoa removida', `Loren Metais (${COD_A}) · caio@a.com (membro)`],
      ['Convite cancelado', `Loren Metais (${COD_A}) · novo@a.com`],
      ['Convite enviado', `Loren Metais (${COD_A}) · novo@a.com (dono)`],
      ['Convite enviado', `Loren Metais (${COD_A}) · novo@a.com (membro)`],
      ['Empresa criada', `Livre (${await cod(semLimite)}) · dono: l@l.com · limite: sem limite`],
      ['Empresa criada', `Casa Nova (${await cod(nova)}) · dono: dono@nova.com · limite: 20`],
    ]);
    assert.ok(reg.every((r) => r.email === 'edu@calculeo.com' && r.quando));
    assert.deepEqual(Object.keys(reg[0]), ['quando', 'email', 'acao', 'detalhe']);
    assert.equal((await admin(db, 'select * from plataforma_auditoria(2)')).rows.length, 2);
    assert.equal((await db.query(`select count(*)::int n from auditoria_plataforma where usuario_id = '${EDU}'`)).rows[0].n, 10);
  });

  test(`plataforma (${nome}): o que o admin não consegue (dados ruins, empresa sem dono); erro não grava auditoria`, async () => {
    const db = await banco(comCorrecao);
    const casos = [
      [`plataforma_criar_empresa('  ', 'a@a.com')`, 'dê um nome à empresa'],
      [`plataforma_criar_empresa('X', 'sem-arroba')`, 'e-mail inválido'],
      [`plataforma_criar_empresa('X', 'a b@c.com')`, 'e-mail inválido'],
      [`plataforma_criar_empresa('X', null)`, 'e-mail inválido'],
      [`plataforma_criar_empresa('X', 'a@a.com', -1)`, 'o limite de buscas não pode ser negativo'],
      [`plataforma_convidar('${A}', 'x@x.com', 'chefe')`, 'papel inválido'],
      [`plataforma_convidar('${A}', 'Caio@A.com')`, 'essa pessoa já está na empresa'],
      [`plataforma_convidar('${NAO_EXISTE}', 'x@x.com')`, 'empresa não encontrada'],
      [`plataforma_cancelar_convite('${A}', 'ninguem@a.com')`, 'convite não encontrado'],
      [`plataforma_remover_pessoa('${A}', '${BIA}')`, 'essa pessoa não está na empresa'],
      [`plataforma_remover_pessoa('${A}', '${ANA}')`, 'a empresa precisa de pelo menos um dono'],
      [`plataforma_remover_pessoa('${B}', '${BIA}')`, 'a empresa precisa de pelo menos um dono'],
      [`plataforma_suspender('${NAO_EXISTE}', true)`, 'empresa não encontrada'],
      [`plataforma_suspender('${A}', null)`, 'diga se suspende ou reativa'],
      [`plataforma_limite_buscas('${A}', -5)`, 'o limite de buscas não pode ser negativo'],
      [`plataforma_limite_buscas('${NAO_EXISTE}', 5)`, 'empresa não encontrada'],
    ];
    for (const [f, msg] of casos) assert.equal(await erro(admin(db, `select ${f}`)), msg, f);
    assert.equal((await db.query('select count(*)::int n from auditoria_plataforma')).rows[0].n, 0);
    assert.equal((await db.query(`select count(*)::int n from empresas`)).rows[0].n, 2);
    // com 2 donos, tira um (e o outro fica)
    await db.exec(`update membros set papel = 'dono' where usuario_id = '${CAIO}'`);
    await admin(db, `select plataforma_remover_pessoa('${A}', '${ANA}')`);
    assert.deepEqual((await db.query(`select email, papel from membros where empresa_id = '${A}'`)).rows, [{ email: 'caio@a.com', papel: 'dono' }]);
  });

  test(`plataforma (${nome}): empresa suspensa — ninguém dela lê nem grava; a outra empresa segue normal; reativar devolve tudo`, async () => {
    const db = await banco(comCorrecao);
    await admin(db, `select plataforma_suspender('${A}', true)`);
    for (const quem of [ANA, CAIO]) {
      for (const t of ['empresas', 'membros', 'convites', 'produtos', 'precificacoes', 'config_canais', 'historico', 'concorrentes', 'buscas_concorrentes'])
        assert.equal((await linhas(db, quem, `select * from ${t}`)).length, 0, `${quem} leu ${t}`);
      assert.deepEqual(await linhas(db, quem, 'select minhas_empresas()'), []);
      await assert.rejects(como(db, quem, `insert into produtos (empresa_id, nome, tipo_custo) values ('${A}', 'x', 'revenda')`), /row-level security/);
      assert.equal((await como(db, quem, `update produtos set nome = 'mudou'`)).affectedRows, 0);
      assert.equal((await como(db, quem, `delete from produtos`)).affectedRows, 0);
      assert.equal(await um(db, quem, `select registrar_busca('${A}', '${PIA}')`), 'fora');
    }
    // a dona também perde os poderes de admin da empresa
    assert.equal(await um(db, ANA, `select sou_dono('${A}')`), false);
    assert.equal((await como(db, ANA, `update empresas set nome = 'mudou' where id = '${A}'`)).affectedRows, 0);
    await assert.rejects(como(db, ANA, `insert into convites (empresa_id, email) values ('${A}', 'z@z.com')`), /row-level security/);
    await assert.rejects(como(db, ANA, `select mudar_papel('${A}', '${CAIO}', 'dono')`), /só o dono/);
    await assert.rejects(como(db, ANA, `select excluir_empresa('${A}')`), /só o admin/);
    assert.equal((await como(db, ANA, `delete from membros where usuario_id = '${CAIO}'`)).affectedRows, 0);
    await assert.rejects(como(db, ANA, `select copiar_produtos('${A}', '${B}')`), /só dá para copiar/);
    assert.equal((await db.query(`select count(*)::int n, min(nome) nome from produtos where empresa_id = '${A}'`)).rows[0].n, 3);
    // a B não muda
    assert.deepEqual((await linhas(db, BIA, 'select nome from empresas')).map((r) => r.nome), ['Empresa Secreta']);
    // reativou: tudo volta
    await admin(db, `select plataforma_suspender('${A}', false)`);
    assert.equal((await linhas(db, CAIO, 'select * from produtos')).length, 3);
    assert.equal(await um(db, ANA, `select registrar_busca('${A}', '${PIA}')`), 'ok');
  });

  test(`plataforma (${nome}): limite de buscas do mês ('mes'); sem limite nada muda; mês passado não conta`, async () => {
    const db = await banco(comCorrecao);
    assert.deepEqual((await db.query('select suspensa, limite_buscas_mes from empresas order by nome')).rows,
      [{ suspensa: false, limite_buscas_mes: null }, { suspensa: false, limite_buscas_mes: null }]); // empresas de antes: sem limite
    await db.exec(`insert into buscas_feitas (empresa_id, produto_id, feita_em) values ('${A}', '${BALDE}', inicio_do_mes() - interval '1 minute')`);
    await admin(db, `select plataforma_limite_buscas('${A}', 2)`);
    assert.equal(await um(db, ANA, `select registrar_busca('${A}', '${PIA}')`), 'ok');
    assert.equal(await um(db, ANA, `select registrar_busca('${A}', '${CUBA}')`), 'ok');
    assert.equal(await um(db, ANA, `select registrar_busca('${A}', '${BALDE}')`), 'mes');
    assert.equal((await db.query(`select count(*)::int n from buscas_feitas where empresa_id = '${A}'`)).rows[0].n, 3); // a recusada não conta
    assert.equal((await admin(db, 'select buscas_mes from plataforma_empresas() where nome = \'Loren Metais\'')).rows[0].buscas_mes, 2);
    await admin(db, `select plataforma_limite_buscas('${A}', 0)`);
    assert.equal(await um(db, ANA, `select registrar_busca('${A}', '${BALDE}')`), 'mes');
    await admin(db, `select plataforma_limite_buscas('${A}', null)`);
    assert.equal(await um(db, ANA, `select registrar_busca('${A}', '${BALDE}')`), 'ok');
    // os limites de antes continuam: membro não busca; mesmo produto em 10 min
    assert.equal(await um(db, CAIO, `select registrar_busca('${A}', '${PIA}')`), 'so_admin');
    assert.equal(await um(db, ANA, `select registrar_busca('${A}', '${PIA}')`), 'produto');
  });

  test(`plataforma (${nome}): apagar e recriar o produto NÃO zera o limite do mês nem o do dia`, async () => {
    const db = await banco(comCorrecao);
    await admin(db, `select plataforma_limite_buscas('${A}', 2)`);
    assert.equal(await um(db, ANA, `select registrar_busca('${A}', '${PIA}')`), 'ok');
    assert.equal(await um(db, ANA, `select registrar_busca('${A}', '${CUBA}')`), 'ok');
    assert.equal((await como(db, ANA, `delete from produtos where id in ('${PIA}', '${CUBA}')`)).affectedRows, 2);
    await como(db, ANA, `insert into produtos (empresa_id, nome, sku, tipo_custo) values ('${A}', 'Pia Inox', 'P-1', 'revenda')`);
    const nova = (await db.query(`select id from produtos where sku = 'P-1'`)).rows[0].id;
    assert.equal(await um(db, ANA, `select registrar_busca('${A}', '${nova}')`), 'mes');
    assert.deepEqual((await db.query(`select produto_id from buscas_feitas where empresa_id = '${A}'`)).rows, [{ produto_id: null }, { produto_id: null }]);
    assert.equal((await admin(db, `select buscas_mes from plataforma_empresas() where nome = 'Loren Metais'`)).rows[0].buscas_mes, 2);
    // o do dia (30 em 24 h) também fica
    await admin(db, `select plataforma_limite_buscas('${A}', null)`);
    await db.exec(`insert into buscas_feitas (empresa_id, produto_id) select '${A}', '${BALDE}' from generate_series(1, 28)`);
    await como(db, ANA, `delete from produtos where id = '${BALDE}'`);
    assert.equal(await um(db, ANA, `select registrar_busca('${A}', '${nova}')`), 'dia');
    // a empresa saindo leva a contagem junto
    await como(db, ANA, `select excluir_empresa('${A}')`);
    assert.equal((await db.query('select count(*)::int n from buscas_feitas')).rows[0].n, 0);
  });

  test(`plataforma (${nome}): minhas_empresas_suspensas só dá o nome das suspensas da própria pessoa`, async () => {
    const db = await banco(comCorrecao);
    const susp = async (quem) => (await linhas(db, quem, 'select * from minhas_empresas_suspensas() n')).map((r) => r.n);
    assert.deepEqual(await susp(ANA), []);
    await admin(db, `select plataforma_suspender('${A}', true)`);
    await admin(db, `select plataforma_suspender('${B}', true)`);
    assert.deepEqual(await susp(ANA), ['Loren Metais']); // a B (também suspensa) não aparece
    assert.deepEqual(await susp(CAIO), ['Loren Metais']);
    assert.deepEqual(await susp(BIA), ['Empresa Secreta']);
    assert.deepEqual(await susp(EDU), []); // o admin da plataforma não é de nenhuma
    await assert.rejects(como(db, null, 'select * from minhas_empresas_suspensas()', { papel: 'anon' }), /permission denied/);
    await admin(db, `select plataforma_suspender('${A}', false)`);
    assert.deepEqual(await susp(ANA), []);
  });

  test(`plataforma (${nome}): sair do Auth tira da lista de admins`, async () => {
    const db = await banco(comCorrecao);
    await db.exec(`delete from auth.users where id = '${EDU}'`);
    assert.equal((await db.query('select count(*)::int n from admins_plataforma')).rows[0].n, 0);
  });

  test(`plataforma (${nome}): minha_cota_buscas — limite e buscas do mês, só para quem é da empresa`, async () => {
    const db = await banco(comCorrecao);
    const cota = async (quem, emp = A) => (await como(db, quem, `select * from minha_cota_buscas('${emp}')`)).rows;
    await db.exec(`insert into buscas_feitas (empresa_id, produto_id, feita_em) values ('${A}', '${PIA}', now()), ('${A}', '${CUBA}', now()),
      ('${A}', '${BALDE}', inicio_do_mes() - interval '1 minute')`); // a do mês passado não conta
    assert.deepEqual(await cota(ANA), [{ limite: null, usadas_mes: 2 }], 'sem limite');
    assert.deepEqual(await cota(CAIO), [{ limite: null, usadas_mes: 2 }], 'membro também vê');
    assert.deepEqual(await cota(BIA), [], 'de outra empresa: nada');
    assert.deepEqual(await cota(ANA, NAO_EXISTE), []);
    await admin(db, `select plataforma_limite_buscas('${A}', 0)`);
    assert.deepEqual(await cota(ANA), [{ limite: 0, usadas_mes: 2 }]);
    assert.equal(await um(db, ANA, `select registrar_busca('${A}', '${BALDE}')`), 'mes', 'no limite (0): o botão desliga e o banco recusa');
    await admin(db, `select plataforma_limite_buscas('${A}', 3)`);
    assert.equal(await um(db, ANA, `select registrar_busca('${A}', '${BALDE}')`), 'ok');
    assert.deepEqual(await cota(ANA), [{ limite: 3, usadas_mes: 3 }], 'contou a nova; usadas >= limite = no limite');
    await db.exec(`insert into produtos (id, empresa_id, nome, sku, tipo_custo) values ('${NAO_EXISTE}', '${A}', 'Torneira', 'T-1', 'revenda')`);
    assert.equal(await um(db, ANA, `select registrar_busca('${A}', '${NAO_EXISTE}')`), 'mes', 'produto sem busca recente: barra no mês');
    await admin(db, `select plataforma_suspender('${A}', true)`);
    assert.deepEqual(await cota(ANA), [], 'suspensa: nada');
    await assert.rejects(como(db, null, `select * from minha_cota_buscas('${B}')`, { papel: 'anon' }), /permission denied/);
  });

  test(`plataforma (${nome}): excluir empresa — só suspensa e com o código; some tudo dela; as outras, as contas e a auditoria ficam`, async () => {
    const db = await banco(comCorrecao);
    const URL = 'https://x.supabase.co/storage/v1/object/public/fotos/';
    const CLONE = '00000000-0000-0000-0000-0000000000f9';
    await db.exec(`
      insert into storage.objects values ('fotos', '${A}/${PIA}/1.webp'), ('fotos', '${A}/${PIA}/2.webp'), ('fotos', '${A}/empresa/logo.webp'),
        ('fotos', '${B}/${CLONE}/9.webp');
      update produtos set fotos = array['${URL}${A}/${PIA}/1.webp', '${URL}${A}/${PIA}/2.webp'] where id = '${PIA}';
      -- a B clonou a Pia: usa a foto 1 da pasta da A (o Clonar copia o endereço)
      insert into produtos (id, empresa_id, nome, sku, tipo_custo, fotos) values
        ('${CLONE}', '${B}', 'Pia (clone)', 'P-1', 'revenda', array['${URL}${A}/${PIA}/1.webp', '${URL}${B}/${CLONE}/9.webp']);
      insert into precificacoes (empresa_id, produto_id, canal, preco_de) values ('${A}', '${PIA}', 'shopee', 100), ('${B}', '${CLONE}', 'shopee', 90);
      insert into buscas_feitas (empresa_id, produto_id) values ('${A}', '${PIA}');
    `);
    const exc = (quem, conf, aal = 'aal2', emp = A) =>
      um(db, quem, `select plataforma_excluir_empresa('${emp}', ${conf === null ? 'null' : `'${conf}'`})`, { aal });
    const conta = async (sql) => (await db.query(`select count(*)::int n from ${sql}`)).rows[0].n;
    // quem não pode, empresa ativa e código errado: recusa, e nada some
    assert.equal(await erro(exc(ANA, COD_A)), 'sem permissão', 'dona da A');
    assert.equal(await erro(exc(EDU, COD_A, 'aal1')), 'sem permissão', 'admin sem as 2 etapas');
    assert.equal(await erro(exc(EDU, 'X', 'aal2', NAO_EXISTE)), 'empresa não encontrada');
    assert.equal(await erro(exc(EDU, COD_A)), 'suspenda a empresa antes de excluir');
    await admin(db, `select plataforma_suspender('${A}', true)`);
    for (const c of [COD_B, COD_A.slice(0, 5), '', null]) assert.equal(await erro(exc(EDU, c)), 'o código não confere', String(c));
    assert.equal(await conta(`empresas where id = '${A}'`), 1);
    assert.equal(await conta(`produtos where empresa_id = '${A}'`), 3);
    // código certo (minúsculo e com espaço vale): some tudo da A; devolve só as fotos que ninguém mais usa
    const fotos = await exc(EDU, ` ${COD_A.toLowerCase()} `);
    assert.deepEqual(fotos, [`${A}/${PIA}/2.webp`, `${A}/empresa/logo.webp`], 'a foto 1 fica: o clone da B usa');
    assert.equal(await conta(`empresas where id = '${A}'`), 0);
    for (const t of ['membros', 'convites', 'produtos', 'itens_kit', 'precificacoes', 'config_canais', 'historico', 'buscas_feitas', 'concorrentes', 'buscas_concorrentes'])
      assert.equal(await conta(`${t} where empresa_id = '${A}'`), 0, t);
    // a B fica inteira; as contas (Auth) ficam; a auditoria guarda a exclusão
    assert.equal(await conta(`empresas where id = '${B}'`), 1);
    assert.equal(await conta(`membros where empresa_id = '${B}'`), 1);
    assert.equal(await conta(`convites where empresa_id = '${B}'`), 1);
    assert.equal(await conta(`produtos where empresa_id = '${B}'`), 1);
    assert.equal(await conta(`precificacoes where empresa_id = '${B}'`), 1);
    assert.equal(await conta('auth.users'), 4);
    assert.deepEqual((await admin(db, 'select acao, detalhe from plataforma_auditoria(1)')).rows[0], { acao: 'Empresa excluída', detalhe: `Loren Metais (${COD_A})` });
    assert.equal(await erro(exc(EDU, COD_A)), 'empresa não encontrada', 'de novo: já não existe');
    // Storage: o admin da plataforma (2 etapas) vê e apaga SÓ as fotos órfãs
    const apaga = async (quem, nome, aal = 'aal2') => (await como(db, quem, `delete from storage.objects where name = '${nome}' returning name`, { aal })).rows.length;
    assert.equal(await apaga(EDU, `${A}/${PIA}/1.webp`), 0, 'usada pelo clone da B');
    assert.equal(await apaga(EDU, `${B}/${CLONE}/9.webp`), 0, 'pasta de empresa que existe');
    assert.equal(await apaga(ANA, `${A}/${PIA}/2.webp`), 0, 'quem não é admin da plataforma');
    assert.equal(await apaga(EDU, `${A}/${PIA}/2.webp`, 'aal1'), 0, 'admin sem as 2 etapas');
    for (const f of fotos) assert.equal(await apaga(EDU, f), 1, f);
    assert.deepEqual((await db.query('select name from storage.objects order by 1')).rows.map((r) => r.name), [`${A}/${PIA}/1.webp`, `${B}/${CLONE}/9.webp`]);
    // anon não chama; a função de apagar não é chamável de fora
    await assert.rejects(como(db, null, `select plataforma_excluir_empresa('${B}', '${COD_B}')`, { papel: 'anon' }), /permission denied/);
    for (const p of ['anon', 'authenticated'])
      assert.equal((await db.query(`select has_function_privilege('${p}', 'apagar_dados_empresa(uuid)', 'execute') ok`)).rows[0].ok, false, p);
  });

  test(`plataforma (${nome}): código da empresa — formato, único, nunca muda, toda empresa nova recebe`, async () => {
    const db = await banco(comCorrecao);
    const FORMATO = /^[A-HJKMNP-Z2-9]{6}$/; // sem 0/O, 1/I/L
    const nova = await um(db, BIA, `select criar_empresa('Da Bia')`);
    await db.exec(`insert into empresas (nome) select 'E' || i from generate_series(1, 300) i`);
    const cods = (await db.query('select codigo from empresas')).rows.map((r) => r.codigo);
    assert.equal(cods.length, 303);
    assert.equal(new Set(cods).size, cods.length, 'únicos');
    assert.ok(cods.every((c) => FORMATO.test(c)), cods.find((c) => !FORMATO.test(c)));
    assert.ok(new Set(cods.join('')).size > 20, 'sorteado, não sequencial');
    // ninguém muda: nem o dono pela tela, nem o banco
    await assert.rejects(como(db, ANA, `update empresas set codigo = 'ABCDEF' where id = '${A}'`), /permission denied/);
    await assert.rejects(db.query(`update empresas set codigo = 'ABCDEF' where id = '${A}'`), /o código da empresa não muda/);
    await como(db, ANA, `update empresas set nome = 'Loren Metais SA' where id = '${A}'`); // o nome muda, o código fica
    assert.equal((await db.query(`select codigo from empresas where id = '${A}'`)).rows[0].codigo, COD_A);
    await assert.rejects(db.query(`insert into empresas (nome, codigo) values ('X', '${COD_A}')`), /empresas_codigo_key/);
    for (const ruim of ['K7QP9O', 'K7QP91', 'k7qp9m', 'K7QP9', 'K7QP9ML'])
      await assert.rejects(db.query(`insert into empresas (nome, codigo) values ('X', '${ruim}')`), /codigo_da_empresa/, ruim);
    assert.ok(FORMATO.test((await db.query(`select codigo from empresas where id = '${nova}'`)).rows[0].codigo));
    // o dono vê o código da própria empresa (tela Empresa)
    assert.deepEqual(await linhas(db, ANA, 'select codigo from empresas'), [{ codigo: COD_A }]);
  });

  test(`plataforma (${nome}): link secreto — quem pode gerar e para quem (sem virar roubo de conta)`, async () => {
    const db = await banco(comCorrecao);
    await db.exec(`update auth.users set email_confirmed_at = now(), encrypted_password = 'hash';
      insert into auth.users (id, email, email_confirmed_at, encrypted_password) values ('${SEM}', 'sem@x.com', now(), '');`);
    const pode = (quem, emp, aal = 'aal1') => um(db, quem, `select pode_gerar_link('${emp}')`, { aal });
    assert.equal(await pode(CAIO, A), false, 'membro');
    assert.equal(await pode(ANA, A), true, 'dona da A');
    assert.equal(await pode(ANA, B), false, 'dona da A, na B');
    assert.equal(await pode(BIA, A), false, 'de outra empresa');
    assert.equal(await pode(EDU, A, 'aal2'), true);
    assert.equal(await pode(EDU, B, 'aal2'), true);
    assert.equal(await pode(EDU, A), false, 'admin sem as 2 etapas');
    for (const f of [`pode_gerar_link('${A}')`, `preparar_link_convite('${A}', 'x@x.com')`, `preparar_link_senha('${A}', '${CAIO}')`])
      await assert.rejects(como(db, null, `select ${f}`, { papel: 'anon' }), /permission denied/, f);

    const conv = (quem, args, aal = 'aal1') => um(db, quem, `select preparar_link_convite(${args})`, { aal });
    const senha = (quem, emp, alvo, aal = 'aal1') => um(db, quem, `select preparar_link_senha('${emp}', '${alvo}')`, { aal });
    // não pode: 'sem permissão' antes de qualquer outra conferência (não revela empresa nem e-mail)
    for (const [quem, args] of [[CAIO, `'${A}', 'x@x.com'`], [ANA, `'${B}', 'x@x.com'`], [ANA, `'${NAO_EXISTE}', 'ruim'`], [BIA, `'${A}', 'x@x.com', 'chefe'`]])
      assert.equal(await erro(conv(quem, args)), 'sem permissão', args);
    assert.equal(await erro(conv(EDU, `'${A}', 'x@x.com'`)), 'sem permissão', 'admin aal1');
    assert.equal(await erro(senha(CAIO, A, ANA)), 'sem permissão');
    assert.equal(await erro(senha(ANA, B, BIA)), 'sem permissão');
    // dados ruins
    assert.equal(await erro(conv(ANA, `'${A}', 'sem-arroba'`)), 'e-mail inválido');
    assert.equal(await erro(conv(ANA, `'${A}', 'x@x.com', 'chefe'`)), 'papel inválido');
    assert.equal(await erro(conv(ANA, `'${A}', 'Caio@A.com'`)), 'essa pessoa já está na empresa');
    assert.equal(await erro(senha(ANA, A, BIA)), 'essa pessoa não está na empresa');
    assert.equal(await erro(conv(EDU, `'${NAO_EXISTE}', 'x@x.com'`, 'aal2')), 'empresa não encontrada');
    assert.equal((await db.query('select count(*)::int n from convites')).rows[0].n, 1, 'erro não grava convite');

    // conta nova: 'invite'; grava o convite (de novo: troca o papel) e o histórico da empresa
    assert.deepEqual(await conv(ANA, `'${A}', ' Novo@A.com '`), { email: 'novo@a.com', tipo: 'invite' });
    assert.deepEqual(await conv(ANA, `'${A}', 'novo@a.com', 'dono'`), { email: 'novo@a.com', tipo: 'invite' });
    assert.deepEqual((await db.query(`select email, papel from convites where empresa_id = '${A}'`)).rows, [{ email: 'novo@a.com', papel: 'dono' }]);
    // já tem senha (Bia, de outra empresa): sem link; o convite fica e ela entra com a senha dela
    assert.deepEqual(await conv(ANA, `'${A}', 'bia@b.com'`), { email: 'bia@b.com', tipo: null });
    // confirmada e sem senha, sem outra empresa: 'magiclink'
    assert.deepEqual(await conv(ANA, `'${A}', 'sem@x.com'`), { email: 'sem@x.com', tipo: 'magiclink' });
    // convite pendente em outra empresa: o link aceitaria esse convite também. A dona não; o admin da plataforma sim
    assert.equal(await erro(conv(ANA, `'${A}', 'pendente@b.com'`)), 'link não permitido');
    assert.deepEqual(await conv(EDU, `'${A}', 'pendente@b.com'`, 'aal2'), { email: 'pendente@b.com', tipo: 'invite' });

    // senha nova: só de quem é só das empresas em que eu sou dona
    assert.deepEqual(await senha(ANA, A, CAIO), { email: 'caio@a.com', tipo: 'recovery' });
    await db.exec(`insert into membros (empresa_id, usuario_id, email, papel) values ('${B}', '${CAIO}', 'caio@a.com', 'membro')`);
    assert.equal(await erro(senha(ANA, A, CAIO)), 'link não permitido', 'o Caio também é da B: a Ana entraria na B');
    assert.deepEqual(await senha(EDU, A, CAIO, 'aal2'), { email: 'caio@a.com', tipo: 'recovery' });
    // conta sem senha que já é da B: convite com link também não (magiclink entraria na B)
    await db.exec(`insert into membros (empresa_id, usuario_id, email, papel) values ('${B}', '${SEM}', 'sem@x.com', 'membro')`);
    await db.exec(`delete from convites where email = 'sem@x.com'`);
    assert.equal(await erro(conv(ANA, `'${A}', 'sem@x.com'`)), 'link não permitido');
    // admin da plataforma: link só dele mesmo, com as 2 etapas
    const ADM2 = '00000000-0000-0000-0000-0000000000e2';
    await db.exec(`insert into auth.users (id, email, encrypted_password) values ('${ADM2}', 'outro@calculeo.com', 'hash');
      insert into admins_plataforma (usuario_id, email) values ('${ADM2}', 'outro@calculeo.com');
      insert into membros (empresa_id, usuario_id, email, papel) values ('${A}', '${EDU}', 'edu@calculeo.com', 'dono'), ('${A}', '${ADM2}', 'outro@calculeo.com', 'membro')`);
    assert.equal(await erro(senha(ANA, A, EDU)), 'link não permitido');
    assert.equal(await erro(senha(EDU, A, ADM2, 'aal2')), 'link não permitido');
    assert.equal(await erro(senha(EDU, A, EDU)), 'link não permitido', 'aal1: ele é dono da A, mas é admin sem as 2 etapas');
    assert.deepEqual(await senha(EDU, A, EDU, 'aal2'), { email: 'edu@calculeo.com', tipo: 'recovery' });

    // registro: dono -> histórico da empresa; admin da plataforma (de fora da empresa) -> auditoria
    assert.deepEqual((await db.query(`select quem, acao, detalhe from historico where empresa_id = '${A}' order by id`)).rows, [
      { quem: 'ana@a.com', acao: 'Convite enviado', detalhe: 'novo@a.com (membro) · link' },
      { quem: 'ana@a.com', acao: 'Convite enviado', detalhe: 'novo@a.com (dono) · link' },
      { quem: 'ana@a.com', acao: 'Convite enviado', detalhe: 'bia@b.com (membro)' },
      { quem: 'ana@a.com', acao: 'Convite enviado', detalhe: 'sem@x.com (membro) · link' },
      { quem: 'ana@a.com', acao: 'Link de senha nova', detalhe: 'caio@a.com' },
      { quem: 'edu@calculeo.com', acao: 'Link de senha nova', detalhe: 'edu@calculeo.com' }, // aqui ele já é dono da A
    ]);
    assert.deepEqual((await admin(db, 'select acao, detalhe from plataforma_auditoria()')).rows.reverse(), [
      { acao: 'Convite enviado', detalhe: `Loren Metais (${COD_A}) · pendente@b.com (membro) · link` },
      { acao: 'Link de senha nova', detalhe: `Loren Metais (${COD_A}) · caio@a.com` },
    ]);
  });
}

test('plataforma: projeto de antes da 17 — as empresas de hoje ficam sem limite e recebem código; a nova nasce com limite 20', async () => {
  const limite = async (db, id) => (await db.query(`select limite_buscas_mes l from empresas where id = '${id}'`)).rows[0].l;
  // projeto de antes da 17: a coluna ainda não existe quando a empresa é criada
  const db = await banco(false);
  await db.exec(`alter table empresas drop column limite_buscas_mes, drop column codigo cascade;
    insert into empresas (id, nome) values ('${NAO_EXISTE}', 'Antiga');`);
  await db.exec(ler('../supabase/correcao-17-plataforma.sql'));
  await db.exec(ler('../supabase/correcao-17-plataforma.sql'));
  assert.equal(await limite(db, NAO_EXISTE), null);
  assert.equal(await limite(db, A), null);
  const cods = (await db.query('select codigo from empresas')).rows.map((r) => r.codigo);
  assert.equal(cods.length, 3);
  assert.equal(new Set(cods).size, 3);
  assert.ok(cods.every((c) => /^[A-HJKMNP-Z2-9]{6}$/.test(c)), cods.join());
  await assert.rejects(db.query(`update empresas set codigo = 'ABCDEF' where id = '${A}'`), /o código da empresa não muda/);
  // usuário comum cria a empresa dele pela tela: nasce com 20 (no projeto corrigido e na instalação nova)
  for (const d of [db, await banco(false)]) assert.equal(await limite(d, await um(d, BIA, `select criar_empresa('Outra da Bia')`)), 20);
  // o painel continua respeitando o que o admin pede
  assert.equal(await limite(db, await um(db, EDU, `select plataforma_criar_empresa('Cinco', 'c@c.com', 5)`, { aal: 'aal2' })), 5);
  assert.equal(await limite(db, await um(db, EDU, `select plataforma_criar_empresa('Livre', 'l@l.com', null)`, { aal: 'aal2' })), null);
});

// Funções, permissões, colunas, chaves e regras do Storage: para comparar dois bancos.
async function estrutura(db) {
  const q = async (sql) => (await db.query(sql)).rows;
  return {
    defs: (await q(`select p.proname, regexp_replace(pg_get_functiondef(p.oid), '\s+', ' ', 'g') d, array_to_string(p.proacl, ',') acl
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' order by 1, 2`)),
    cols: await q(`select table_name, column_name, data_type, is_nullable, column_default from information_schema.columns
      where table_schema = 'public' order by 1, 2`),
    restricoes: await q(`select conrelid::regclass::text t, conname, pg_get_constraintdef(oid) d from pg_constraint
      where connamespace = 'public'::regnamespace order by 1, 2`),
    gatilhos: await q(`select tgrelid::regclass::text t, tgname from pg_trigger where not tgisinternal order by 1, 2`),
    regras: await q(`select tablename, policyname, cmd, qual, with_check from pg_policies order by 1, 2`),
    tabelas: await q(`select relname, array_to_string(relacl, ',') acl, relrowsecurity from pg_class
      where relnamespace = 'public'::regnamespace and relkind in ('r', 'S') order by 1`),
  };
}

test('plataforma: a 17 atual e a 18 rodam limpas por cima de uma 17 ANTIGA (sem código nem link) e dão o mesmo banco do schema novo', async () => {
  const db = await ambiente();
  await db.exec(ler('./fixtures/schema-antes-17.sql'));
  await db.exec(`insert into auth.users (id, email) values ('${EDU}', 'edu@calculeo.com'), ('${ANA}', 'ana@a.com');
    insert into empresas (id, nome) values ('${A}', 'Loren Metais');
    insert into membros (empresa_id, usuario_id, email, papel) values ('${A}', '${ANA}', 'ana@a.com', 'dono');`);
  await db.exec(ler('./fixtures/correcao-17-antiga.sql'));
  // a 17 antiga estava no ar: plataforma_empresas SEM a coluna codigo, e uma empresa nova criada nela
  assert.ok(!(await db.query(`select pg_get_function_result('plataforma_empresas'::regproc) r`)).rows[0].r.includes('codigo'));
  await db.exec(`insert into empresas (id, nome) values ('${B}', 'Empresa Secreta'); insert into admins_plataforma (usuario_id, email) values ('${EDU}', 'edu@calculeo.com');`);
  for (const arq of ['correcao-17-plataforma.sql', 'correcao-17-plataforma.sql', 'correcao-18-excluir-empresa-plataforma.sql',
    'correcao-18-excluir-empresa-plataforma.sql', 'correcao-19-cota-buscas.sql', 'correcao-19-cota-buscas.sql',
    'correcao-20-categoria-ml-produto.sql', 'correcao-20-categoria-ml-produto.sql'])
    await db.exec(ler(`../supabase/${arq}`));
  const novo = await ambiente();
  await novo.exec(ler('../supabase/schema.sql'));
  const [a, b] = [await estrutura(db), await estrutura(novo)];
  for (const k of Object.keys(a)) assert.deepEqual(a[k], b[k], k);
  // as empresas de antes ganharam código, e o painel lista com ele
  const lista = (await como(db, EDU, 'select nome, codigo from plataforma_empresas()', { aal: 'aal2' })).rows;
  assert.deepEqual(lista.map((e) => e.nome), ['Empresa Secreta', 'Loren Metais']);
  assert.ok(lista.every((e) => /^[A-HJKMNP-Z2-9]{6}$/.test(e.codigo)), JSON.stringify(lista));
});

test('plataforma: o schema.sql e a correção 17 deixam as mesmas funções e colunas', async () => {
  const defs = async (db) => (await db.query(`select p.proname, pg_get_functiondef(p.oid) d, array_to_string(p.proacl, ',') acl
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and (p.proname like 'plataforma_%' or p.proname in ('minhas_empresas', 'sou_dono', 'registrar_busca',
      'sou_admin_plataforma', 'meu_acesso_plataforma', 'minhas_empresas_suspensas', 'anotar_plataforma', 'nome_da_empresa', 'email_valido', 'inicio_do_mes',
      'novo_codigo_empresa', 'codigo_nao_muda', 'pode_gerar_link', 'link_pode_entrar', 'preparar_link_convite', 'preparar_link_senha',
      'apagar_dados_empresa', 'excluir_empresa', 'foto_orfa', 'plataforma_excluir_empresa', 'minha_cota_buscas'))
    order by 1`)).rows;
  const cols = async (db) => (await db.query(`select table_name, column_name, data_type, is_nullable, column_default from information_schema.columns
    where table_schema = 'public' and table_name in ('empresas', 'admins_plataforma', 'auditoria_plataforma', 'buscas_feitas') order by 1, 2`)).rows;
  const [novo, antigo] = [await banco(false), await banco(true)];
  const norm = (rs) => rs.map((r) => ({ ...r, d: r.d.replace(/\s+/g, ' ') }));
  assert.deepEqual(norm(await defs(antigo)), norm(await defs(novo)));
  assert.deepEqual(await cols(antigo), await cols(novo));
  const fks = async (db) => (await db.query(`select conname, pg_get_constraintdef(oid) d from pg_constraint
    where conrelid = 'buscas_feitas'::regclass and contype = 'f' order by 1`)).rows;
  assert.deepEqual(await fks(antigo), await fks(novo));
  const regras = async (db) => (await db.query(`select policyname, cmd, qual from pg_policies where schemaname = 'storage' order by 1`)).rows;
  assert.deepEqual(await regras(antigo), await regras(novo));
  assert.equal((await regras(novo)).length, 3);
  assert.equal((await fks(novo)).filter((f) => /ON DELETE SET NULL \(produto_id\)/.test(f.d)).length, 1);
});
