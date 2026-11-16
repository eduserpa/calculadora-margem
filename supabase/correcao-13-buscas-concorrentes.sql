-- Correção 13 (16/11): a última busca de concorrentes no ML de cada produto fica guardada (botão "Buscar concorrentes" da
-- Calculadora). Ao abrir o produto, o app mostra essa busca sem gastar crédito do Apify; "Atualizar" busca de novo e substitui.
-- Os anúncios entram todos no cálculo; os que a pessoa desmarca ficam em excluidos e continuam fora depois do Atualizar.
-- Para quem JÁ rodou o schema.sql: cole este arquivo inteiro no SQL Editor e clique em Run. Pode rodar mais de uma vez.
-- Só a equipe da empresa lê e grava (RLS igual à dos produtos). Produto ou empresa excluídos levam a busca junto.

create table if not exists buscas_concorrentes (
  empresa_id uuid not null references empresas on delete cascade,
  produto_id uuid not null,
  termo text not null,
  resultados jsonb not null default '[]',
  buscado_em timestamptz not null default now(),
  primary key (empresa_id, produto_id),
  foreign key (empresa_id, produto_id) references produtos (empresa_id, id) on delete cascade
);

-- Os anúncios que a pessoa tirou do cálculo (chaves dos candidatos). Ficam no Atualizar: o app não reenvia esta coluna.
alter table buscas_concorrentes add column if not exists excluidos jsonb not null default '[]' check (jsonb_typeof(excluidos) = 'array');

revoke all on buscas_concorrentes from anon;
grant select, insert, update, delete on buscas_concorrentes to authenticated;

alter table buscas_concorrentes enable row level security;
drop policy if exists da_empresa on buscas_concorrentes;
create policy da_empresa on buscas_concorrentes for all to authenticated
  using (empresa_id in (select minhas_empresas())) with check (empresa_id in (select minhas_empresas()));

-- Limite de gasto do Apify (revisão da Ellie): a Edge Function chama registrar_busca ANTES do Apify. Recusa o mesmo produto
-- buscado há menos de 10 minutos e mais de 30 buscas da empresa em 24 horas. Ninguém grava nem apaga essa contagem direto
-- (sem grant na tabela): só por esta função, que também confere se quem pede é da empresa.
create table if not exists buscas_feitas (
  id bigint generated always as identity primary key,
  empresa_id uuid not null references empresas on delete cascade,
  produto_id uuid not null,
  feita_em timestamptz not null default now(),
  foreign key (empresa_id, produto_id) references produtos (empresa_id, id) on delete cascade
);
create index if not exists buscas_feitas_empresa on buscas_feitas (empresa_id, feita_em);
revoke all on buscas_feitas from anon, authenticated;
alter table buscas_feitas enable row level security;

-- 'ok' (contou a busca) | 'fora' (não é da empresa) | 'produto' (buscado há menos de 10 min) | 'dia' (30 em 24 h)
create or replace function registrar_busca(empresa uuid, produto uuid) returns text
language plpgsql security definer set search_path = public
as $$
begin
  if empresa is null or empresa not in (select minhas_empresas()) then return 'fora'; end if;
  perform pg_advisory_xact_lock(hashtext('busca:' || empresa)); -- 2 cliques ao mesmo tempo contam um depois do outro
  if exists (select 1 from buscas_feitas where empresa_id = empresa and produto_id = produto and feita_em > now() - interval '10 minutes') then
    return 'produto';
  end if;
  if (select count(*) from buscas_feitas where empresa_id = empresa and feita_em > now() - interval '24 hours') >= 30 then
    return 'dia';
  end if;
  insert into buscas_feitas (empresa_id, produto_id) values (empresa, produto);
  return 'ok';
end $$;
revoke execute on function registrar_busca(uuid, uuid) from anon, public;
grant execute on function registrar_busca(uuid, uuid) to authenticated;
