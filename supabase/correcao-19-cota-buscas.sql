-- Correção 19 (17/11): a tela mostra "x de y buscas este mês" e desliga o botão "Buscar concorrentes" no limite.
-- Rode DEPOIS da 17 (que criou o limite de buscas do mês). Cole este arquivo inteiro no SQL Editor e clique em Run.
-- Pode rodar mais de uma vez. Não muda nenhuma regra: quem recusa a busca continua sendo o registrar_busca.

-- Cota de buscas de concorrentes da empresa, para a tela mostrar "x de y buscas este mês" e desligar o botão no limite
-- (correção 19). Para quem é da empresa (e ela não está suspensa); para os outros, nada. limite null = sem limite.
-- Conta como o registrar_busca: buscas da empresa desde o começo do mês (horário de Brasília); no limite, ele devolve 'mes'.
create or replace function minha_cota_buscas(empresa uuid) returns table (limite int, usadas_mes int)
language plpgsql stable security definer set search_path = public
as $$
#variable_conflict use_column
begin
  if empresa is null or empresa not in (select minhas_empresas()) then return; end if;
  return query
    select e.limite_buscas_mes,
      (select count(*) from buscas_feitas b where b.empresa_id = e.id and b.feita_em >= inicio_do_mes())::int
    from empresas e where e.id = empresa;
end $$;

revoke execute on function minha_cota_buscas(uuid) from public, anon;
grant execute on function minha_cota_buscas(uuid) to authenticated;
