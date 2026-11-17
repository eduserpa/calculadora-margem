-- Correção 18 (17/11): excluir empresa pela Plataforma (painel dos donos do Calculéo, correção 17).
-- Só empresa SUSPENSA; a confirmação é o código da empresa, conferido aqui no banco. Apaga tudo dela, sem volta; a linha da
-- auditoria fica e as contas das pessoas (Auth) ficam. Devolve as fotos órfãs para o app apagar do Storage, e duas regras do
-- Storage deixam o admin da plataforma (2 etapas) ver e apagar SÓ essas fotos.
-- O excluir_empresa do dono (correção 11) passa a usar a mesma função de apagar (o que ele faz não muda).
-- Cole este arquivo inteiro no SQL Editor e clique em Run, DEPOIS da correção 17. Pode rodar mais de uma vez.

-- Apaga a empresa e tudo dela, numa transação (se algo falhar, nada some). Sem conferir quem pede: quem chama confere
-- (excluir_empresa: o dono; plataforma_excluir_empresa: o admin da plataforma). Sem grant para ninguém.
-- Filhas de empresas, todas com "on delete cascade": membros, convites, produtos, itens_kit, precificacoes, config_canais e historico.
-- Mas a cascata sozinha não serve: o kit aponta para o produto com "restrict" (não apaga produto que está num kit) e os gatilhos
-- do histórico anotam a exclusão de cada produto e taxa numa empresa que está saindo. Por isso, em ordem:
-- itens de kit, preços, produtos e taxas (os gatilhos anotam), o histórico (com essas anotações) e, por fim, a empresa
-- (membros, convites, concorrentes e buscas vão pela cascata).
create or replace function apagar_dados_empresa(empresa uuid) returns void
language plpgsql security definer set search_path = public
as $$
begin
  delete from itens_kit where empresa_id = empresa;
  delete from precificacoes where empresa_id = empresa;
  delete from produtos where empresa_id = empresa;
  delete from config_canais where empresa_id = empresa;
  delete from historico where empresa_id = empresa;
  delete from empresas where id = empresa;
end $$;

-- Excluir empresa (janela Editar empresa): só o admin dela.
create or replace function excluir_empresa(empresa uuid) returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not sou_dono(empresa) then raise exception 'só o admin pode excluir a empresa'; end if;
  perform apagar_dados_empresa(empresa);
end $$;

-- ---------- excluir empresa pela plataforma (correção 18) ----------

-- Foto do bucket "fotos" que não é de mais ninguém: a pasta é de uma empresa que já não existe e nenhum produto nem logo de
-- outra empresa usa o endereço (o Clonar copia o endereço). Só essas o admin da plataforma pode ver e apagar no Storage.
create or replace function foto_orfa(caminho text) returns boolean
language sql stable security definer set search_path = public
as $$
  select not exists (select 1 from empresas e where e.id::text = (storage.foldername(caminho))[1])
    and not exists (select 1 from produtos p, unnest(p.fotos) f where f like '%/storage/v1/object/public/fotos/' || caminho)
    and not exists (select 1 from empresas e where e.foto like '%/storage/v1/object/public/fotos/' || caminho)
$$;

-- Exclui uma empresa SUSPENSA, com tudo dela, sem volta. A confirmação é o código da empresa, conferido aqui (não só na tela).
-- A linha da auditoria fica. As contas das pessoas (Auth) ficam (podem estar em outras empresas).
-- Devolve as fotos da pasta dela que ninguém mais usa (caminhos no bucket "fotos"), para o app apagar do Storage. Em lista
-- (text[]), não em linhas: a resposta do Supabase corta em 1000 linhas e esta função não pode ser chamada de novo.
create or replace function plataforma_excluir_empresa(empresa uuid, confirmacao text) returns text[]
language plpgsql security definer set search_path = public
as $$
declare e record;
begin
  if not sou_admin_plataforma() then raise exception 'sem permissão'; end if;
  select x.nome, x.codigo, x.suspensa into e from empresas x where x.id = empresa;
  if not found then raise exception 'empresa não encontrada'; end if;
  if not e.suspensa then raise exception 'suspenda a empresa antes de excluir'; end if;
  if upper(trim(coalesce(confirmacao, ''))) <> e.codigo then raise exception 'o código não confere'; end if;
  perform anotar_plataforma('Empresa excluída', e.nome || ' (' || e.codigo || ')');
  perform apagar_dados_empresa(empresa);
  return array(select o.name from storage.objects o
    where o.bucket_id = 'fotos' and o.name like empresa::text || '/%' and foto_orfa(o.name) order by 1);
end $$;

-- ---------- Storage ----------
drop policy if exists plataforma_ve_fotos_orfas on storage.objects;
drop policy if exists plataforma_apaga_fotos_orfas on storage.objects;
-- Admin da plataforma (2 etapas): vê e apaga só as fotos órfãs (de empresa excluída e sem uso em outra), para limpar o Storage
-- depois do plataforma_excluir_empresa. O Storage pede as duas (ver e apagar) para remover. (correção 18)
create policy plataforma_ve_fotos_orfas on storage.objects for select to authenticated
  using (bucket_id = 'fotos' and sou_admin_plataforma() and foto_orfa(name));
create policy plataforma_apaga_fotos_orfas on storage.objects for delete to authenticated
  using (bucket_id = 'fotos' and sou_admin_plataforma() and foto_orfa(name));

-- ---------- permissões ----------
-- O Supabase dá execute em função nova para anon e authenticated: tira e devolve só o que o app chama.
revoke execute on function apagar_dados_empresa(uuid), plataforma_excluir_empresa(uuid, text), foto_orfa(text) from public, anon, authenticated;
grant execute on function excluir_empresa(uuid), plataforma_excluir_empresa(uuid, text), foto_orfa(text) to authenticated; -- foto_orfa: as regras do Storage chamam com o login de quem pede
