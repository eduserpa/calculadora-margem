-- Correção 12 (16/11): concorrentes anotados à mão, por produto e canal (cartão "Concorrentes neste canal" na Calculadora).
-- Para quem JÁ rodou o schema.sql: cole este arquivo inteiro no SQL Editor e clique em Run. Pode rodar mais de uma vez.
-- Só a equipe da empresa lê e grava (RLS igual à dos produtos). Entra no histórico: "Concorrente adicionado/removido".

create table if not exists concorrentes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas on delete cascade,
  produto_id uuid not null,
  canal text not null,
  vendedor text not null check (length(trim(vendedor)) > 0),
  preco numeric not null check (preco > 0),
  link text check (link is null or link ~* '^https?://'), -- só endereço web (nada de javascript:)
  criado_em timestamptz not null default now(),
  criado_por text default meu_email(),
  foreign key (empresa_id, produto_id) references produtos (empresa_id, id) on delete cascade
);
create index if not exists concorrentes_produto on concorrentes (produto_id, canal);

-- "Concorrente adicionado/removido: Pia Inox · Mercado Livre · Loja X · R$ 199,90". Produto saindo (exclusão em cascata):
-- não anota, o "Produto excluído" já conta.
create or replace function historico_concorrente() returns trigger
language plpgsql security definer set search_path = public
as $$
declare c concorrentes := coalesce(new, old); p text;
begin
  select nome || coalesce(' (' || nullif(sku, '') || ')', '') into p from produtos where id = c.produto_id;
  if p is null then return null; end if;
  perform anotar(c.empresa_id, case tg_op when 'INSERT' then 'Concorrente adicionado' else 'Concorrente removido' end,
    p || ' · ' || nome_do_canal(c.empresa_id, c.canal) || ' · ' || c.vendedor || ' · R$ ' || numero_br(c.preco));
  return null;
end $$;
drop trigger if exists historico on concorrentes;
create trigger historico after insert or delete on concorrentes for each row execute function historico_concorrente();

revoke all on concorrentes from anon;
grant select, insert, delete on concorrentes to authenticated; -- mudar = remover e adicionar de novo

alter table concorrentes enable row level security;
drop policy if exists da_empresa on concorrentes;
create policy da_empresa on concorrentes for all to authenticated
  using (empresa_id in (select minhas_empresas())) with check (empresa_id in (select minhas_empresas()));
