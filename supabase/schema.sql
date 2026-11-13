-- Banco do Calculéo (Supabase / Postgres). Rodar uma vez no SQL Editor do projeto.
-- Cada empresa só enxerga os próprios dados. Sem login, ninguém lê nada (RLS ligada em todas as tabelas).
-- Cadastro fechado: só entra quem for convidado (ver docs/banco.md).

-- Empresas e quem faz parte de cada uma. Só o administrador (painel do Supabase) cria e convida.
create table empresas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  criado_em timestamptz not null default now()
);

create table membros (
  empresa_id uuid not null references empresas on delete cascade,
  usuario_id uuid not null references auth.users on delete cascade,
  primary key (empresa_id, usuario_id)
);

-- Empresas da pessoa logada (vazio sem login).
create function minhas_empresas() returns setof uuid
language sql stable security definer set search_path = public
as $$ select empresa_id from membros where usuario_id = auth.uid() $$;

-- As 4 tabelas da calculadora.
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
  unique (empresa_id, sku),
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

create table config_canais (
  empresa_id uuid not null references empresas on delete cascade,
  canal text not null,
  config jsonb not null, -- taxas ajustadas do canal (mesmo formato de data/canais.json)
  atualizado_em timestamptz not null default now(),
  primary key (empresa_id, canal)
);

-- Ninguém sem login tem acesso a nada.
revoke all on all tables in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
revoke execute on function minhas_empresas() from anon, public;
grant execute on function minhas_empresas() to authenticated;

-- RLS ligada em todas as tabelas.
alter table empresas enable row level security;
alter table membros enable row level security;
alter table produtos enable row level security;
alter table itens_kit enable row level security;
alter table precificacoes enable row level security;
alter table config_canais enable row level security;

-- Empresas e membros: só leitura, e só os da própria pessoa.
create policy ver_minhas_empresas on empresas for select to authenticated
  using (id in (select minhas_empresas()));
create policy ver_meus_vinculos on membros for select to authenticated
  using (usuario_id = auth.uid());

-- Dados da calculadora: ler e gravar só na própria empresa.
create policy da_empresa on produtos for all to authenticated
  using (empresa_id in (select minhas_empresas())) with check (empresa_id in (select minhas_empresas()));
create policy da_empresa on itens_kit for all to authenticated
  using (empresa_id in (select minhas_empresas())) with check (empresa_id in (select minhas_empresas()));
create policy da_empresa on precificacoes for all to authenticated
  using (empresa_id in (select minhas_empresas())) with check (empresa_id in (select minhas_empresas()));
create policy da_empresa on config_canais for all to authenticated
  using (empresa_id in (select minhas_empresas())) with check (empresa_id in (select minhas_empresas()));
