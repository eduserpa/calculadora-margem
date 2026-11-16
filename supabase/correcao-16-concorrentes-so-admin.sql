-- Correção 16 (1.2.3, Eduardo): concorrentes só o ADMIN (papel dono) mexe. Buscar no Mercado Livre (gasta crédito do Apify),
-- desmarcar anúncio da busca e anotar ou excluir concorrente à mão: só o admin. Os membros continuam VENDO a busca guardada e
-- os anotados (o app mostra os botões bloqueados, com cadeado).
-- Cole este arquivo inteiro no SQL Editor e clique em Run. Pode rodar mais de uma vez. Pode rodar antes ou depois de publicar
-- a 1.2.3 (o app novo já bloqueia na tela; o banco garante).

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
  if (select count(*) from buscas_feitas where empresa_id = empresa and feita_em > now() - interval '24 hours') >= 30 then
    return 'dia';
  end if;
  insert into buscas_feitas (empresa_id, produto_id) values (empresa, produto);
  return 'ok';
end $$;

drop policy if exists da_empresa on concorrentes;
drop policy if exists ver_concorrentes on concorrentes;
drop policy if exists admin_concorrentes on concorrentes;
drop policy if exists da_empresa on buscas_concorrentes;
drop policy if exists ver_buscas on buscas_concorrentes;
drop policy if exists admin_buscas on buscas_concorrentes;
-- Concorrentes e busca guardada: todos da empresa leem; anotar, excluir, buscar e desmarcar, só o admin (correção 16).
create policy ver_concorrentes on concorrentes for select to authenticated
  using (empresa_id in (select minhas_empresas()));
create policy admin_concorrentes on concorrentes for all to authenticated
  using (sou_dono(empresa_id)) with check (sou_dono(empresa_id));
create policy ver_buscas on buscas_concorrentes for select to authenticated
  using (empresa_id in (select minhas_empresas()));
create policy admin_buscas on buscas_concorrentes for all to authenticated
  using (sou_dono(empresa_id)) with check (sou_dono(empresa_id));
