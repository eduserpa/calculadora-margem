-- Correção 07 (13/11): antes de apagar uma foto do Storage, o app confere se algum produto de QUALQUER empresa ainda a usa
-- (o Clonar copia o endereço da foto). Sem esta correção o app simplesmente não apaga foto nenhuma (fica do lado seguro).
-- Para quem JÁ rodou o schema.sql: cole este arquivo inteiro no SQL Editor e clique em Run. Pode rodar mais de uma vez.

-- Se algum produto (de QUALQUER empresa) ainda usa este endereço de foto. O "Clonar" copia o endereço, e quem apaga
-- a foto órfã pode não enxergar a outra empresa; por isso a conferência é aqui, devolvendo só sim/não.
create or replace function foto_em_uso(url text) returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from produtos where url = any(fotos)) $$;

revoke execute on function foto_em_uso(text) from anon, public;
grant execute on function foto_em_uso(text) to authenticated;
