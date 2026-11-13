-- Correção 03 (13/11): o dono muda o papel de quem já está na empresa (membro <-> dono), sem deixar a empresa sem dono.
-- Para quem JÁ rodou o schema.sql: cole este arquivo inteiro no SQL Editor e clique em Run. Pode rodar mais de uma vez.
-- Quem ainda não rodou o schema.sql não precisa deste arquivo (já está lá).

-- Dono muda o papel de quem já está na empresa (membro <-> dono). A empresa nunca fica sem dono.
create or replace function mudar_papel(empresa uuid, usuario uuid, novo_papel text) returns void
language plpgsql security definer set search_path = public
as $$
declare
  atual text;
  alvo text;
begin
  if not sou_dono(empresa) then raise exception 'só o dono da empresa muda papéis'; end if;
  if novo_papel not in ('dono', 'membro') then raise exception 'papel inválido'; end if;
  perform 1 from membros where empresa_id = empresa and papel = 'dono' for update; -- trava os donos: duas trocas ao mesmo tempo não zeram
  select m.papel, m.email into atual, alvo from membros m where m.empresa_id = empresa and m.usuario_id = usuario;
  if not found then raise exception 'essa pessoa não está na empresa'; end if;
  if atual = novo_papel then return; end if;
  if atual = 'dono' and (select count(*) from membros m where m.empresa_id = empresa and m.papel = 'dono') = 1 then
    raise exception 'a empresa precisa de pelo menos um dono';
  end if;
  update membros m set papel = novo_papel where m.empresa_id = empresa and m.usuario_id = usuario;
  perform anotar(empresa, 'Papel alterado', 'Papel de ' || alvo || ': ' || atual || ' → ' || novo_papel);
end $$;

revoke execute on function mudar_papel(uuid, uuid, text) from anon, public;
grant execute on function mudar_papel(uuid, uuid, text) to authenticated;
