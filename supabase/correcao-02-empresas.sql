-- Correção 02 (13/11): criar empresa pela tela e o dono renomear a sua.
-- Para quem JÁ rodou o schema.sql: cole este arquivo inteiro no SQL Editor e clique em Run. Pode rodar mais de uma vez.
-- Quem ainda não rodou o schema.sql não precisa deste arquivo (já está lá).

-- Criar empresa pela tela: qualquer pessoa logada cria a sua e entra como dono (não vê as dos outros).
create or replace function criar_empresa(nome_empresa text) returns uuid
language plpgsql security definer set search_path = public
as $$
declare nova uuid;
begin
  if auth.uid() is null then raise exception 'entre no Calculéo primeiro'; end if;
  if nullif(trim(nome_empresa), '') is null then raise exception 'dê um nome à empresa'; end if;
  insert into empresas (nome) values (trim(nome_empresa)) returning id into nova;
  insert into membros (empresa_id, usuario_id, email, papel) values (nova, auth.uid(), meu_email(), 'dono');
  return nova;
end $$;

revoke execute on function criar_empresa(text) from anon, public;
grant execute on function criar_empresa(text) to authenticated;
grant update (nome) on empresas to authenticated;

drop policy if exists dono_renomeia on empresas;
create policy dono_renomeia on empresas for update to authenticated
  using (sou_dono(id)) with check (sou_dono(id));
