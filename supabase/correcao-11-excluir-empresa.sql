-- Correção 11 (13/11): o admin exclui a empresa (janela Editar empresa). Apaga tudo dela e não volta.
-- Para quem JÁ rodou o schema.sql: cole este arquivo inteiro no SQL Editor e clique em Run. Pode rodar mais de uma vez.
-- As fotos (Storage, pasta fotos/<empresa>/) o app apaga antes de chamar excluir_empresa, menos as que outras empresas usam (fotos_usadas_fora).

-- Só o admin da empresa. Tudo numa transação: se algo falhar, nada some.
-- Filhas de empresas, todas com "on delete cascade": membros, convites, produtos, itens_kit, precificacoes, config_canais e historico.
-- Mas a cascata sozinha não serve: o kit aponta para o produto com "restrict" (não apaga produto que está num kit) e os gatilhos
-- do histórico anotam a exclusão de cada produto e taxa numa empresa que está saindo. Por isso, em ordem:
-- itens de kit, preços, produtos e taxas (os gatilhos anotam), o histórico (com essas anotações) e, por fim, a empresa
-- (membros e convites vão pela cascata).
create or replace function excluir_empresa(empresa uuid) returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not sou_dono(empresa) then raise exception 'só o admin pode excluir a empresa'; end if;
  delete from itens_kit where empresa_id = empresa;
  delete from precificacoes where empresa_id = empresa;
  delete from produtos where empresa_id = empresa;
  delete from config_canais where empresa_id = empresa;
  delete from historico where empresa_id = empresa;
  delete from empresas where id = empresa;
end $$;

-- Fotos da pasta fotos/<empresa>/ que produtos de OUTRAS empresas ainda usam (o "Clonar" copia o endereço): o app não apaga
-- essas ao excluir a empresa. Devolve o caminho no bucket. Só para o admin da empresa (para os outros, vazio).
create or replace function fotos_usadas_fora(empresa uuid) returns setof text
language sql stable security definer set search_path = public
as $$
  select distinct substring(f from '/storage/v1/object/public/fotos/([^?#]+)')
  from produtos, unnest(fotos) f
  where sou_dono(empresa) and empresa_id <> empresa and f like '%/storage/v1/object/public/fotos/' || empresa || '/%'
$$;

revoke execute on function excluir_empresa(uuid), fotos_usadas_fora(uuid) from anon, public;
grant execute on function excluir_empresa(uuid), fotos_usadas_fora(uuid) to authenticated;
