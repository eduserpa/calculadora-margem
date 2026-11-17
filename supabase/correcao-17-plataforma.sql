-- Correção 17: painel da plataforma (só para os donos do Calculéo, hoje só o Eduardo).
-- A segurança é toda aqui no banco: as tabelas novas não têm permissão para ninguém. Toda função do painel começa conferindo
-- sou_admin_plataforma(): a pessoa precisa estar na lista E ter entrado com as 2 etapas (JWT aal2). Esconder o menu no app é
-- só conforto. O painel não vê produtos, preços nem margens: só nome, contagens, uso e quem está na empresa.
-- Muda também o resto do banco:
--   - empresa suspensa: ninguém dela lê nem grava nada (minhas_empresas e sou_dono deixam a empresa de fora);
--   - limite de buscas no mês por empresa: registrar_busca devolve 'mes' ao chegar nele (as empresas de hoje ficam sem limite; as novas nascem com 20);
--   - apagar o produto não apaga mais a contagem de buscas dele (apagar e recriar não zera o limite);
--   - minhas_empresas_suspensas(): a tela avisa "A empresa X está suspensa";
--   - código único da empresa (empresas.codigo, ex.: K7QP9M), que nunca muda; as de hoje recebem um;
--   - convite por link secreto: funções que a Edge Function gerar-link chama (pode_gerar_link, preparar_link_*).
-- Cole este arquivo inteiro no SQL Editor e clique em Run. Pode rodar mais de uma vez. Depois, rode o trecho do fim (com o
-- seu e-mail) para entrar na lista. A Edge Function buscar-concorrentes precisa ser publicada de novo para mostrar a mensagem
-- do limite do mês (antes disso a busca é recusada do mesmo jeito, só que com a mensagem genérica).

-- ---------- tabelas ----------

alter table empresas add column if not exists suspensa boolean not null default false;
alter table empresas add column if not exists limite_buscas_mes int check (limite_buscas_mes is null or limite_buscas_mes >= 0); -- null = sem limite
-- Empresa nova (pela tela ou pelo painel) nasce com 20. Vem depois do add column, sem default nele: as que já existiam ficam null.
alter table empresas alter column limite_buscas_mes set default 20;

-- Código da empresa (correção 17): 6 letras e números sem os que confundem (0/O, 1/I/L), sorteado (não revela quantas
-- empresas há). Sorteia de novo se já existir. Nunca muda (gatilho codigo_nao_muda).
create or replace function novo_codigo_empresa() returns text
language plpgsql volatile security definer set search_path = public
as $$
declare c text;
begin
  loop
    select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + floor(random() * 31)::int, 1), '') into c from generate_series(1, 6);
    exit when not exists (select 1 from empresas where codigo = c);
  end loop;
  return c;
end $$;

-- As empresas de hoje recebem o código uma a uma (cada sorteio vê os já dados).
alter table empresas add column if not exists codigo text;
do $$
declare r record;
begin
  for r in select id from empresas where codigo is null loop
    update empresas set codigo = novo_codigo_empresa() where id = r.id;
  end loop;
end $$;
alter table empresas alter column codigo set default novo_codigo_empresa(), alter column codigo set not null;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'empresas_codigo_key') then
    alter table empresas add constraint empresas_codigo_key unique (codigo);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'codigo_da_empresa') then
    alter table empresas add constraint codigo_da_empresa check (codigo ~ '^[A-HJKMNP-Z2-9]{6}$');
  end if;
end $$;
create or replace function codigo_nao_muda() returns trigger
language plpgsql set search_path = public
as $$
begin
  if new.codigo is distinct from old.codigo then raise exception 'o código da empresa não muda'; end if;
  return new;
end $$;
drop trigger if exists codigo_nao_muda on empresas;
create trigger codigo_nao_muda before update of codigo on empresas for each row execute function codigo_nao_muda();

-- A contagem das buscas é da empresa: apagar o produto não apaga as buscas dele (senão apagar e recriar o produto zerava o
-- limite do mês e do dia). A linha fica, sem o produto. Tira a chave antiga (cascata), qualquer que seja o nome dela.
alter table buscas_feitas alter column produto_id drop not null;
do $$
declare c text;
begin
  for c in select conname from pg_constraint where conrelid = 'buscas_feitas'::regclass and confrelid = 'produtos'::regclass loop
    execute format('alter table buscas_feitas drop constraint %I', c);
  end loop;
end $$;
alter table buscas_feitas add constraint buscas_feitas_produto foreign key (empresa_id, produto_id)
  references produtos (empresa_id, id) on delete set null (produto_id);

-- Quem administra a plataforma. Só o SQL Editor grava aqui (trecho no fim do arquivo).
create table if not exists admins_plataforma (
  usuario_id uuid primary key references auth.users on delete cascade,
  email text,
  criado_em timestamptz not null default now()
);

-- O que o painel fez (toda função de escrita grava uma linha).
create table if not exists auditoria_plataforma (
  id bigserial primary key,
  quando timestamptz not null default now(),
  usuario_id uuid,
  email text,
  acao text not null,
  detalhe text not null default ''
);

-- Sem grant e com RLS ligada sem policy: ninguém (anon, authenticated) lê nem grava direto; só as funções abaixo.
revoke all on admins_plataforma, auditoria_plataforma from public, anon, authenticated;
revoke all on sequence auditoria_plataforma_id_seq from public, anon, authenticated;
alter table admins_plataforma enable row level security;
alter table auditoria_plataforma enable row level security;

-- ---------- empresa suspensa e limite do mês no resto do banco ----------

-- Empresas da pessoa logada, sem as suspensas. Todas as RLS e funções da empresa passam por aqui ou por sou_dono.
create or replace function minhas_empresas() returns setof uuid
language sql stable security definer set search_path = public
as $$ select m.empresa_id from membros m join empresas e on e.id = m.empresa_id where m.usuario_id = auth.uid() and not e.suspensa $$;

create or replace function sou_dono(empresa uuid) returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from membros m join empresas e on e.id = m.empresa_id
  where m.empresa_id = empresa and m.usuario_id = auth.uid() and m.papel = 'dono' and not e.suspensa) $$;

-- Para a tela dizer "A empresa X está suspensa" no lugar de "sem empresa": só os nomes das suspensas da própria pessoa.
create or replace function minhas_empresas_suspensas() returns setof text
language sql stable security definer set search_path = public
as $$ select e.nome from membros m join empresas e on e.id = m.empresa_id where m.usuario_id = auth.uid() and e.suspensa order by e.nome $$;

-- Começo do mês no horário de Brasília (as buscas do mês contam daqui).
create or replace function inicio_do_mes() returns timestamptz
language sql stable set search_path = public
as $$ select date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo' $$;

-- 'ok' (contou a busca) | 'fora' (não é da empresa) | 'so_admin' | 'produto' (buscado há menos de 10 min)
-- | 'mes' (limite do mês da empresa, correção 17) | 'dia' (30 em 24 h)
create or replace function registrar_busca(empresa uuid, produto uuid) returns text
language plpgsql security definer set search_path = public
as $$
begin
  if empresa is null or empresa not in (select minhas_empresas()) then return 'fora'; end if;
  if not sou_dono(empresa) then return 'so_admin'; end if; -- buscar gasta crédito: só o admin (correção 16)
  perform pg_advisory_xact_lock(hashtext('busca:' || empresa)); -- 2 cliques ao mesmo tempo contam um depois do outro
  if exists (select 1 from buscas_feitas where empresa_id = empresa and produto_id = produto and feita_em > now() - interval '10 minutes') then
    return 'produto';
  end if;
  if (select limite_buscas_mes from empresas where id = empresa) <= (select count(*) from buscas_feitas where empresa_id = empresa and feita_em >= inicio_do_mes()) then
    return 'mes'; -- limite null: a comparação dá null e passa
  end if;
  if (select count(*) from buscas_feitas where empresa_id = empresa and feita_em > now() - interval '24 hours') >= 30 then
    return 'dia';
  end if;
  insert into buscas_feitas (empresa_id, produto_id) values (empresa, produto);
  return 'ok';
end $$;

-- ---------- quem é admin da plataforma ----------
-- plpgsql: auth.jwt() só é procurada na hora de rodar.

-- Na lista E com as 2 etapas (aal2 no JWT, assinado pelo Supabase).
create or replace function sou_admin_plataforma() returns boolean
language plpgsql stable security definer set search_path = public
as $$
begin
  return exists (select 1 from admins_plataforma where usuario_id = auth.uid()) and coalesce(auth.jwt() ->> 'aal', '') = 'aal2';
end $$;

-- Para o app mostrar ou não o menu: 'nao' | 'precisa_mfa' | 'sim'. A única do painel que não dá erro.
create or replace function meu_acesso_plataforma() returns text
language plpgsql stable security definer set search_path = public
as $$
begin
  if not exists (select 1 from admins_plataforma where usuario_id = auth.uid()) then return 'nao'; end if;
  if coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then return 'precisa_mfa'; end if;
  return 'sim';
end $$;

-- Linha da auditoria (só as funções do painel chamam; sem grant para ninguém).
create or replace function anotar_plataforma(acao text, detalhe text) returns void
language sql security definer set search_path = public
as $$ insert into auditoria_plataforma (usuario_id, email, acao, detalhe) values (auth.uid(), meu_email(), acao, detalhe) $$;

-- "Nome (CÓDIGO)" da empresa para a auditoria; empresa que não existe dá erro.
create or replace function nome_da_empresa(empresa uuid) returns text
language plpgsql stable security definer set search_path = public
as $$
declare n text;
begin
  select nome || ' (' || codigo || ')' into n from empresas where id = empresa;
  if not found then raise exception 'empresa não encontrada'; end if;
  return n;
end $$;

-- E-mail em minúsculas, sem espaço, com cara de e-mail.
create or replace function email_valido(email text) returns text
language plpgsql immutable set search_path = public
as $$
declare e text := lower(trim(email));
begin
  if e is null or e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'e-mail inválido'; end if;
  return e;
end $$;

-- ---------- painel: leitura ----------

-- Uma 17 de antes (sem o código da empresa) tinha outro retorno nestas três, e "create or replace" não troca o retorno:
-- apaga e cria de novo (as permissões são dadas de novo no fim deste arquivo).
drop function if exists plataforma_empresas();
drop function if exists plataforma_pessoas(uuid);
drop function if exists plataforma_auditoria(int);

create or replace function plataforma_empresas()
returns table (id uuid, nome text, codigo text, criado_em timestamptz, suspensa boolean, limite_buscas_mes int, buscas_mes int,
  pessoas int, convites int, produtos int, ultimo_acesso timestamptz)
language plpgsql stable security definer set search_path = public
as $$
#variable_conflict use_column
begin
  if not sou_admin_plataforma() then raise exception 'sem permissão'; end if;
  return query
    select e.id, e.nome, e.codigo, e.criado_em, e.suspensa, e.limite_buscas_mes,
      (select count(*) from buscas_feitas b where b.empresa_id = e.id and b.feita_em >= inicio_do_mes())::int,
      (select count(*) from membros m where m.empresa_id = e.id)::int,
      (select count(*) from convites c where c.empresa_id = e.id)::int,
      (select count(*) from produtos p where p.empresa_id = e.id)::int,
      (select max(u.last_sign_in_at) from membros m join auth.users u on u.id = m.usuario_id where m.empresa_id = e.id)
    from empresas e
    order by e.nome, e.id;
end $$;

create or replace function plataforma_pessoas(empresa uuid)
returns table (tipo text, usuario_id uuid, email text, papel text, desde timestamptz, ultimo_acesso timestamptz)
language plpgsql stable security definer set search_path = public
as $$
#variable_conflict use_column
begin
  if not sou_admin_plataforma() then raise exception 'sem permissão'; end if;
  return query
    select 'membro'::text, m.usuario_id, m.email, m.papel, m.entrou_em, u.last_sign_in_at
    from membros m left join auth.users u on u.id = m.usuario_id where m.empresa_id = empresa
    union all
    select 'convite'::text, null::uuid, c.email, c.papel, c.convidado_em, null::timestamptz
    from convites c where c.empresa_id = empresa
    order by 1 desc, 3; -- membros primeiro, depois convites; por e-mail
end $$;

create or replace function plataforma_auditoria(qtd int default 100)
returns table (quando timestamptz, email text, acao text, detalhe text)
language plpgsql stable security definer set search_path = public
as $$
#variable_conflict use_column
begin
  if not sou_admin_plataforma() then raise exception 'sem permissão'; end if;
  return query
    select a.quando, a.email, a.acao, a.detalhe from auditoria_plataforma a
    order by a.quando desc, a.id desc limit least(greatest(coalesce(qtd, 100), 1), 1000);
end $$;

-- ---------- painel: escrita (cada uma grava na auditoria) ----------

-- Cria a empresa e convida o dono (ele entra como dono no primeiro login com esse e-mail).
create or replace function plataforma_criar_empresa(nome text, email_dono text, limite_buscas int default 20) returns uuid
language plpgsql security definer set search_path = public
as $$
declare nova uuid; e text;
begin
  if not sou_admin_plataforma() then raise exception 'sem permissão'; end if;
  if nullif(trim(nome), '') is null then raise exception 'dê um nome à empresa'; end if;
  if limite_buscas < 0 then raise exception 'o limite de buscas não pode ser negativo'; end if;
  e := email_valido(email_dono);
  insert into empresas (nome, limite_buscas_mes) values (trim(nome), limite_buscas) returning id into nova;
  insert into convites (empresa_id, email, papel) values (nova, e, 'dono');
  perform anotar_plataforma('Empresa criada', nome_da_empresa(nova) || ' · dono: ' || e || ' · limite: ' || coalesce(limite_buscas::text, 'sem limite'));
  return nova;
end $$;

-- Convite. Convidar de novo o mesmo e-mail só troca o papel do convite (sem erro).
create or replace function plataforma_convidar(empresa uuid, email text, papel text default 'membro') returns void
language plpgsql security definer set search_path = public
as $$
declare n text; e text;
begin
  if not sou_admin_plataforma() then raise exception 'sem permissão'; end if;
  n := nome_da_empresa(empresa); e := email_valido(email);
  if papel is null or papel not in ('dono', 'membro') then raise exception 'papel inválido'; end if;
  if exists (select 1 from membros m where m.empresa_id = empresa and lower(m.email) = e) then raise exception 'essa pessoa já está na empresa'; end if;
  insert into convites (empresa_id, email, papel) values (empresa, e, papel)
    on conflict on constraint convites_pkey do update set papel = excluded.papel;
  perform anotar_plataforma('Convite enviado', n || ' · ' || e || ' (' || papel || ')');
end $$;

create or replace function plataforma_cancelar_convite(empresa uuid, email text) returns void
language plpgsql security definer set search_path = public
as $$
declare n text; e text := lower(trim(email));
begin
  if not sou_admin_plataforma() then raise exception 'sem permissão'; end if;
  n := nome_da_empresa(empresa);
  delete from convites c where c.empresa_id = empresa and c.email = e;
  if not found then raise exception 'convite não encontrado'; end if;
  perform anotar_plataforma('Convite cancelado', n || ' · ' || e);
end $$;

-- Tira a pessoa da empresa. A empresa nunca fica sem dono (mesma regra do mudar_papel).
create or replace function plataforma_remover_pessoa(empresa uuid, usuario uuid) returns void
language plpgsql security definer set search_path = public
as $$
declare n text; atual text; alvo text;
begin
  if not sou_admin_plataforma() then raise exception 'sem permissão'; end if;
  n := nome_da_empresa(empresa);
  perform 1 from membros where empresa_id = empresa and papel = 'dono' for update; -- trava os donos: duas remoções ao mesmo tempo não zeram
  select m.papel, m.email into atual, alvo from membros m where m.empresa_id = empresa and m.usuario_id = usuario;
  if not found then raise exception 'essa pessoa não está na empresa'; end if;
  if atual = 'dono' and (select count(*) from membros m where m.empresa_id = empresa and m.papel = 'dono') = 1 then
    raise exception 'a empresa precisa de pelo menos um dono';
  end if;
  delete from membros m where m.empresa_id = empresa and m.usuario_id = usuario;
  perform anotar_plataforma('Pessoa removida', n || ' · ' || alvo || ' (' || atual || ')');
end $$;

create or replace function plataforma_suspender(empresa uuid, suspender boolean) returns void
language plpgsql security definer set search_path = public
as $$
declare n text;
begin
  if not sou_admin_plataforma() then raise exception 'sem permissão'; end if;
  n := nome_da_empresa(empresa);
  if suspender is null then raise exception 'diga se suspende ou reativa'; end if;
  update empresas set suspensa = suspender where id = empresa;
  perform anotar_plataforma(case when suspender then 'Empresa suspensa' else 'Empresa reativada' end, n);
end $$;

-- null = sem limite.
create or replace function plataforma_limite_buscas(empresa uuid, limite int) returns void
language plpgsql security definer set search_path = public
as $$
declare n text; antes int;
begin
  if not sou_admin_plataforma() then raise exception 'sem permissão'; end if;
  n := nome_da_empresa(empresa);
  if limite < 0 then raise exception 'o limite de buscas não pode ser negativo'; end if;
  select limite_buscas_mes into antes from empresas where id = empresa;
  update empresas set limite_buscas_mes = limite where id = empresa;
  perform anotar_plataforma('Limite de buscas alterado', n || ' · ' || coalesce(antes::text, 'sem limite') || ' → ' || coalesce(limite::text, 'sem limite'));
end $$;

-- ---------- convite por link secreto (Edge Function gerar-link) ----------
-- A gerar-link chama estas funções com o JWT de quem pede: quem pode é o banco que decide. Só depois ela usa a chave de
-- serviço para gerar o link no Auth (sem mandar e-mail).

-- Admin da plataforma (2 etapas) ou dono da empresa.
create or replace function pode_gerar_link(empresa uuid) returns boolean
language sql stable security definer set search_path = public
as $$ select sou_admin_plataforma() or sou_dono(empresa) $$;

-- O link entra na conta da pessoa. Para não virar roubo de conta: o admin da plataforma pode para qualquer um, menos para
-- outro admin; o dono, só para quem não tem empresa nem convite fora das que ele é dono (senão ele entrava nelas também).
-- Link para admin da plataforma: só o próprio, com as 2 etapas.
create or replace function link_pode_entrar(alvo uuid, e text) returns boolean
language plpgsql stable security definer set search_path = public
as $$
begin
  if exists (select 1 from admins_plataforma a where a.usuario_id = alvo) then return alvo = auth.uid() and sou_admin_plataforma(); end if;
  if sou_admin_plataforma() then return true; end if;
  return not exists (select 1 from membros m where m.usuario_id = alvo and not sou_dono(m.empresa_id))
    and not exists (select 1 from convites c where c.email = e and not sou_dono(c.empresa_id));
end $$;

-- Grava o convite (mesmas regras do convidar) e diz qual link gerar: 'invite' (conta nova ou nunca confirmada),
-- 'magiclink' (conta confirmada sem senha) ou null (já tem senha: entra com ela; o convite fica salvo, sem link).
create or replace function preparar_link_convite(empresa uuid, email text, papel text default 'membro') returns jsonb
language plpgsql security definer set search_path = public
as $$
declare n text; e text; alvo uuid; confirmada boolean; com_senha boolean; tipo text;
begin
  if not pode_gerar_link(empresa) then raise exception 'sem permissão'; end if;
  n := nome_da_empresa(empresa); e := email_valido(email);
  if papel is null or papel not in ('dono', 'membro') then raise exception 'papel inválido'; end if;
  if exists (select 1 from membros m where m.empresa_id = empresa and lower(m.email) = e) then raise exception 'essa pessoa já está na empresa'; end if;
  select u.id, u.email_confirmed_at is not null, coalesce(u.encrypted_password, '') <> '' into alvo, confirmada, com_senha
    from auth.users u where lower(u.email) = e;
  tipo := case when com_senha then null when confirmada then 'magiclink' else 'invite' end;
  if tipo is not null and not link_pode_entrar(alvo, e) then raise exception 'link não permitido'; end if;
  insert into convites (empresa_id, email, papel) values (empresa, e, papel)
    on conflict on constraint convites_pkey do update set papel = excluded.papel;
  if sou_dono(empresa) then perform anotar(empresa, 'Convite enviado', e || ' (' || papel || ')' || case when tipo is null then '' else ' · link' end);
  else perform anotar_plataforma('Convite enviado', n || ' · ' || e || ' (' || papel || ')' || case when tipo is null then '' else ' · link' end);
  end if;
  return jsonb_build_object('email', e, 'tipo', tipo);
end $$;

-- Link de senha nova para quem já está na empresa.
create or replace function preparar_link_senha(empresa uuid, usuario uuid) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare n text; e text;
begin
  if not pode_gerar_link(empresa) then raise exception 'sem permissão'; end if;
  n := nome_da_empresa(empresa);
  select lower(u.email) into e from membros m join auth.users u on u.id = m.usuario_id where m.empresa_id = empresa and m.usuario_id = usuario;
  if e is null then raise exception 'essa pessoa não está na empresa'; end if;
  if not link_pode_entrar(usuario, e) then raise exception 'link não permitido'; end if;
  if sou_dono(empresa) then perform anotar(empresa, 'Link de senha nova', e);
  else perform anotar_plataforma('Link de senha nova', n || ' · ' || e);
  end if;
  return jsonb_build_object('email', e, 'tipo', 'recovery');
end $$;

-- ---------- permissões ----------
-- O Supabase dá execute em função nova para anon e authenticated: tira de todas e devolve só o que o app chama.
revoke execute on function minhas_empresas_suspensas(), inicio_do_mes(), sou_admin_plataforma(), meu_acesso_plataforma(), anotar_plataforma(text, text),
  nome_da_empresa(uuid), email_valido(text), plataforma_empresas(), plataforma_pessoas(uuid), plataforma_auditoria(int),
  plataforma_criar_empresa(text, text, int), plataforma_convidar(uuid, text, text), plataforma_cancelar_convite(uuid, text),
  plataforma_remover_pessoa(uuid, uuid), plataforma_suspender(uuid, boolean), plataforma_limite_buscas(uuid, int), novo_codigo_empresa(), codigo_nao_muda(), pode_gerar_link(uuid), link_pode_entrar(uuid, text),
  preparar_link_convite(uuid, text, text), preparar_link_senha(uuid, uuid)
  from public, anon, authenticated;
grant execute on function minhas_empresas_suspensas(), sou_admin_plataforma(), meu_acesso_plataforma(), plataforma_empresas(), plataforma_pessoas(uuid),
  plataforma_auditoria(int), plataforma_criar_empresa(text, text, int), plataforma_convidar(uuid, text, text),
  plataforma_cancelar_convite(uuid, text), plataforma_remover_pessoa(uuid, uuid), plataforma_suspender(uuid, boolean),
  plataforma_limite_buscas(uuid, int), pode_gerar_link(uuid), preparar_link_convite(uuid, text, text), preparar_link_senha(uuid, uuid) to authenticated;

-- ---------- entrar na lista (rodar à parte, uma vez, depois de já ter entrado no Calculéo com este e-mail) ----------
-- Troque o e-mail (em minúsculas) e rode só estas linhas. Para tirar alguém: delete from admins_plataforma where email = '...';
-- insert into admins_plataforma (usuario_id, email)
-- select id, lower(email) from auth.users where lower(email) = 'seu-email@exemplo.com'
-- on conflict (usuario_id) do nothing
-- returning email;
