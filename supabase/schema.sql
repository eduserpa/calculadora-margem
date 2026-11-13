-- Banco do Calculéo (Supabase / Postgres). Rodar uma vez no SQL Editor do projeto.
-- Várias empresas do grupo, cada uma com os seus produtos, preços e taxas (a tributação muda de uma para outra).
-- Várias pessoas por empresa (dono e membro). Sem login, ninguém lê nada.
-- Só entra quem foi convidado: convite pendente + hook "antes de criar usuário" (sem chave secreta no site).
-- Feito para projeto com "Automatically expose new tables" DESLIGADO: as permissões estão aqui, explícitas.

-- ---------- empresas, pessoas e convites ----------

create table empresas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  criado_em timestamptz not null default now()
);

create table membros (
  empresa_id uuid not null references empresas on delete cascade,
  usuario_id uuid not null references auth.users on delete cascade,
  email text not null,
  papel text not null default 'membro' check (papel in ('dono', 'membro')),
  entrou_em timestamptz not null default now(),
  primary key (empresa_id, usuario_id)
);

-- Convite pendente: a pessoa entra na empresa no primeiro login com este e-mail.
create table convites (
  empresa_id uuid not null references empresas on delete cascade,
  email text not null check (email = lower(trim(email))),
  papel text not null default 'membro' check (papel in ('dono', 'membro')),
  convidado_em timestamptz not null default now(),
  primary key (empresa_id, email)
);

-- Empresas da pessoa logada (vazio sem login).
create function minhas_empresas() returns setof uuid
language sql stable security definer set search_path = public
as $$ select empresa_id from membros where usuario_id = auth.uid() $$;

create function sou_dono(empresa uuid) returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from membros where empresa_id = empresa and usuario_id = auth.uid() and papel = 'dono') $$;

-- E-mail de quem está logado (para o histórico e os convites).
create function meu_email() returns text
language sql stable security definer set search_path = public
as $$ select lower(email) from auth.users where id = auth.uid() $$;

-- Chamado pelo app logo após o login: aceita os convites pendentes deste e-mail.
create function aceitar_convites() returns setof uuid
language plpgsql security definer set search_path = public
as $$
begin
  return query
    with aceitos as (
      delete from convites where email = meu_email() returning empresa_id, papel
    )
    insert into membros (empresa_id, usuario_id, email, papel)
    select a.empresa_id, auth.uid(), meu_email(), a.papel from aceitos a
    on conflict (empresa_id, usuario_id) do nothing
    returning membros.empresa_id;
end $$;

-- Hook do Supabase Auth "Before User Created": só cria conta para e-mail com convite pendente.
-- Ligar em Authentication > Hooks (ver docs/banco.md).
create function antes_de_criar_usuario(event jsonb) returns jsonb
language sql stable security definer set search_path = public
as $$
  select case
    when exists (select 1 from convites where email = lower(trim(event -> 'user' ->> 'email'))) then '{}'::jsonb
    else jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'Este e-mail não foi convidado.'))
  end
$$;

-- ---------- dados da calculadora (por empresa) ----------

create table produtos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas on delete cascade,
  nome text not null,
  sku text,
  tipo_custo text not null check (tipo_custo in ('revenda', 'fabricacao', 'kit')),
  custo jsonb not null default '{}', -- partes do custo: revenda {custoCompra, ...} ou fabricacao {materiais, maoDeObra, ...}
  peso_g numeric not null default 0 check (peso_g >= 0),
  comprimento_cm numeric not null default 0 check (comprimento_cm >= 0),
  largura_cm numeric not null default 0 check (largura_cm >= 0),
  altura_cm numeric not null default 0 check (altura_cm >= 0),
  fotos text[] not null default '{}',
  atualizado_em timestamptz not null default now(),
  unique (empresa_id, id) -- para kit e precificação apontarem só para produto da mesma empresa
);

create table itens_kit (
  empresa_id uuid not null references empresas on delete cascade,
  kit_id uuid not null,
  produto_id uuid not null,
  quantidade numeric not null check (quantidade > 0),
  primary key (kit_id, produto_id),
  foreign key (empresa_id, kit_id) references produtos (empresa_id, id) on delete cascade,
  foreign key (empresa_id, produto_id) references produtos (empresa_id, id) on delete restrict -- não apaga produto que está num kit
);

create table precificacoes (
  empresa_id uuid not null references empresas on delete cascade,
  produto_id uuid not null,
  canal text not null,
  preco_de numeric not null check (preco_de > 0),
  desconto numeric not null default 0 check (desconto >= 0 and desconto < 100),
  salvo_em timestamptz not null default now(),
  primary key (produto_id, canal),
  foreign key (empresa_id, produto_id) references produtos (empresa_id, id) on delete cascade
);

-- Taxas de cada canal, por empresa (mesmo formato de data/canais.json).
-- A linha com canal = 'empresa' guarda o imposto da empresa, que vale para todo canal que não tiver o seu.
create table config_canais (
  empresa_id uuid not null references empresas on delete cascade,
  canal text not null,
  config jsonb not null,
  atualizado_em timestamptz not null default now(),
  primary key (empresa_id, canal)
);

-- ---------- histórico (gravado pelo próprio banco) ----------

create table historico (
  id bigint generated always as identity primary key,
  empresa_id uuid not null references empresas on delete cascade,
  quando timestamptz not null default now(),
  quem text not null,
  acao text not null,
  detalhe text not null default ''
);
create index on historico (empresa_id, quando desc);

create function anotar(empresa uuid, acao text, detalhe text) returns void
language sql security definer set search_path = public
as $$ insert into historico (empresa_id, quem, acao, detalhe) values (empresa, coalesce(meu_email(), 'sistema'), acao, detalhe) $$;

create function historico_produto() returns trigger
language plpgsql security definer set search_path = public
as $$
declare p produtos := coalesce(new, old);
begin
  perform anotar(p.empresa_id,
    case tg_op when 'INSERT' then 'Produto criado' when 'UPDATE' then 'Produto alterado' else 'Produto excluído' end,
    p.nome || coalesce(' (' || nullif(p.sku, '') || ')', ''));
  return null;
end $$;

create function historico_preco() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.preco_de = old.preco_de and new.desconto = old.desconto then return null; end if;
  perform anotar(new.empresa_id, 'Preço salvo',
    (select nome from produtos where id = new.produto_id) || ' · ' || new.canal || ' · R$ ' || to_char(new.preco_de, 'FM999999990.00')
    || case when new.desconto > 0 then ' com ' || new.desconto || '% de desconto' else '' end);
  return null;
end $$;

create function historico_canal() returns trigger
language plpgsql security definer set search_path = public
as $$
declare c config_canais := coalesce(new, old);
begin
  perform anotar(c.empresa_id, case when c.canal = 'empresa' then 'Imposto da empresa alterado' else 'Taxa do canal alterada' end,
    case when c.canal = 'empresa' then coalesce((new).config ->> 'impostos', '') || '%' else c.canal end);
  return null;
end $$;

create trigger historico after insert or update or delete on produtos for each row execute function historico_produto();
create trigger historico after insert or update on precificacoes for each row execute function historico_preco();
create trigger historico after insert or update or delete on config_canais for each row execute function historico_canal();

-- O app anota a importação (um resumo); o resto vem dos gatilhos acima.
create function anotar_importacao(empresa uuid, detalhe text) returns void
language plpgsql security definer set search_path = public
as $$
begin
  if empresa not in (select minhas_empresas()) then raise exception 'sem acesso a esta empresa'; end if;
  perform anotar(empresa, 'Importação', detalhe);
end $$;

-- ---------- copiar produtos de outra empresa do grupo ----------
-- Só para quem é membro das duas. Copia nome, SKU, custo, peso, medidas e fotos; casa pelo SKU (atualiza) ou cria.
-- Preços salvos e taxas NÃO vão: cada empresa tem a sua tributação. Kits ficam de fora (os itens são de cada empresa).

create function previa_copia(origem uuid, destino uuid)
returns table (nome text, sku text, situacao text)
language sql stable security definer set search_path = public
as $$
  select o.nome, o.sku,
    case when exists (select 1 from produtos d where d.empresa_id = destino and lower(trim(d.sku)) = lower(trim(o.sku)))
      then 'atualizado' else 'novo' end
  from produtos o
  where o.empresa_id = origem and o.tipo_custo <> 'kit'
    and origem in (select minhas_empresas()) and destino in (select minhas_empresas())
  order by o.nome
$$;

create function copiar_produtos(origem uuid, destino uuid) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  o produtos;
  novos int := 0;
  atualizados int := 0;
  n int;
begin
  if origem not in (select minhas_empresas()) or destino not in (select minhas_empresas()) or origem = destino then
    raise exception 'só dá para copiar entre duas empresas suas';
  end if;
  for o in select * from produtos where empresa_id = origem and tipo_custo <> 'kit' loop
    n := 0;
    if nullif(trim(o.sku), '') is not null then
      update produtos d set nome = o.nome, tipo_custo = o.tipo_custo, custo = o.custo, peso_g = o.peso_g,
        comprimento_cm = o.comprimento_cm, largura_cm = o.largura_cm, altura_cm = o.altura_cm, fotos = o.fotos, atualizado_em = now()
      where d.empresa_id = destino and lower(trim(d.sku)) = lower(trim(o.sku));
      get diagnostics n = row_count;
    end if;
    if n > 0 then
      atualizados := atualizados + 1;
    else
      insert into produtos (empresa_id, nome, sku, tipo_custo, custo, peso_g, comprimento_cm, largura_cm, altura_cm, fotos)
      values (destino, o.nome, o.sku, o.tipo_custo, o.custo, o.peso_g, o.comprimento_cm, o.largura_cm, o.altura_cm, o.fotos);
      novos := novos + 1;
    end if;
  end loop;
  perform anotar(destino, 'Cópia de produtos',
    'De ' || (select nome from empresas where id = origem) || ': ' || novos || ' novo(s), ' || atualizados || ' atualizado(s)');
  return jsonb_build_object('novos', novos, 'atualizados', atualizados);
end $$;

-- ---------- permissões ----------
-- anon (sem login): nada. authenticated: só o que o app usa, sempre filtrado pela RLS abaixo.

revoke all on all tables in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
revoke execute on all functions in schema public from anon, public;
grant usage on schema public to authenticated;
grant execute on function minhas_empresas(), sou_dono(uuid), meu_email(), aceitar_convites(),
  anotar_importacao(uuid, text), previa_copia(uuid, uuid), copiar_produtos(uuid, uuid) to authenticated;
grant select on empresas, historico to authenticated;
grant select, delete on membros to authenticated;
grant select, insert, delete on convites to authenticated;
grant select, insert, update, delete on produtos, itens_kit, precificacoes, config_canais to authenticated;
-- o hook roda como o Auth do Supabase
grant usage on schema public to supabase_auth_admin;
grant execute on function antes_de_criar_usuario(jsonb) to supabase_auth_admin;

-- ---------- RLS ----------

alter table empresas enable row level security;
alter table membros enable row level security;
alter table convites enable row level security;
alter table produtos enable row level security;
alter table itens_kit enable row level security;
alter table precificacoes enable row level security;
alter table config_canais enable row level security;
alter table historico enable row level security;

create policy ver_minhas_empresas on empresas for select to authenticated
  using (id in (select minhas_empresas()));

-- Equipe: todos da empresa se veem; só o dono tira alguém (e não tira a si mesmo).
create policy ver_equipe on membros for select to authenticated
  using (empresa_id in (select minhas_empresas()));
create policy dono_remove on membros for delete to authenticated
  using (sou_dono(empresa_id) and usuario_id <> auth.uid());

-- Convites: só o dono vê, convida e cancela.
create policy dono_convites on convites for all to authenticated
  using (sou_dono(empresa_id)) with check (sou_dono(empresa_id));

-- Histórico: só leitura, para todos da empresa (quem grava é o próprio banco).
create policy ver_historico on historico for select to authenticated
  using (empresa_id in (select minhas_empresas()));

-- Dados da calculadora: ler e gravar só na própria empresa.
create policy da_empresa on produtos for all to authenticated
  using (empresa_id in (select minhas_empresas())) with check (empresa_id in (select minhas_empresas()));
create policy da_empresa on itens_kit for all to authenticated
  using (empresa_id in (select minhas_empresas())) with check (empresa_id in (select minhas_empresas()));
create policy da_empresa on precificacoes for all to authenticated
  using (empresa_id in (select minhas_empresas())) with check (empresa_id in (select minhas_empresas()));
create policy da_empresa on config_canais for all to authenticated
  using (empresa_id in (select minhas_empresas())) with check (empresa_id in (select minhas_empresas()));

-- ---------- fotos (Storage) ----------
-- Bucket fechado; cada empresa só mexe na pasta com o próprio id (fotos/<empresa_id>/...).
insert into storage.buckets (id, name, public) values ('fotos', 'fotos', false);
create policy fotos_da_empresa on storage.objects for all to authenticated
  using (bucket_id = 'fotos' and (storage.foldername(name))[1] in (select e::text from minhas_empresas() e))
  with check (bucket_id = 'fotos' and (storage.foldername(name))[1] in (select e::text from minhas_empresas() e));
