-- Correção 09 (13/11): foto (logo) da empresa. O admin sobe a imagem no cartão Empresa; aparece no selo e no menu de empresas.
-- Para quem JÁ rodou o schema.sql: cole este arquivo inteiro no SQL Editor e clique em Run. Pode rodar mais de uma vez.

-- Endereço público da foto no Storage (fotos/<empresa>/empresa/<hash>.webp) ou null (o app mostra as iniciais).
alter table empresas add column if not exists foto text;

-- Só uma foto da pasta da própria empresa, nunca um endereço qualquer de fora.
alter table empresas drop constraint if exists foto_da_empresa;
alter table empresas add constraint foto_da_empresa check (foto is null or foto ~ ('^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/fotos/' || id || '/empresa/[^/]+$'));

-- Trocar e tirar: só o admin (a regra dono_renomeia do UPDATE já vale para a coluna nova).
grant update (nome, foto) on empresas to authenticated;

-- A foto da empresa também conta como "em uso": o app não apaga um logo que ainda está no selo.
create or replace function foto_em_uso(url text) returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from produtos where url = any(fotos)) or exists (select 1 from empresas where foto = url) $$;

revoke execute on function foto_em_uso(text) from anon, public;
grant execute on function foto_em_uso(text) to authenticated;
