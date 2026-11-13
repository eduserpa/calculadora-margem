-- Correção 06 (13/11): histórico mais limpo.
-- (1) Trocar só a foto de data URL para o endereço do Storage (a migração das fotos) não vira "Produto alterado".
-- (2) "Preço salvo" com o nome do canal como na tela e o valor com vírgula: "Pia · Mercado Livre · R$ 119,90".
--     "Taxa do canal alterada" também com o nome ("Mercado Livre", não "mercadolivre") e o imposto da empresa com vírgula.
-- Para quem JÁ rodou o schema.sql (e as correções 01 a 05): cole este arquivo inteiro no SQL Editor e clique em Run.
-- Pode rodar mais de uma vez. Quem ainda não rodou o schema.sql não precisa deste arquivo (já está lá).
-- O bloco OPCIONAL do fim (apagar as linhas da migração de hoje) está comentado: não roda junto.

create or replace function historico_produto() returns trigger
language plpgsql security definer set search_path = public
as $$
declare p produtos := coalesce(new, old);
begin
  -- só a foto mudou, de data URL para o endereço do Storage (mesmo número de fotos, menos data URLs): é a migração, não anota
  if tg_op = 'UPDATE' and (to_jsonb(new) - 'fotos' - 'atualizado_em') = (to_jsonb(old) - 'fotos' - 'atualizado_em')
     and cardinality(new.fotos) = cardinality(old.fotos)
     and (select count(*) from unnest(new.fotos) f where f like 'data:%') < (select count(*) from unnest(old.fotos) f where f like 'data:%') then
    return null;
  end if;
  perform anotar(p.empresa_id,
    case tg_op when 'INSERT' then 'Produto criado' when 'UPDATE' then 'Produto alterado' else 'Produto excluído' end,
    p.nome || coalesce(' (' || nullif(p.sku, '') || ')', ''));
  return null;
end $$;

-- Nome do canal como na tela: o que a empresa gravou nas taxas dela, senão o de data/canais.json.
create or replace function nome_do_canal(empresa uuid, canal text) returns text
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select nullif(c.config ->> 'nome', '') from config_canais c where c.empresa_id = empresa and c.canal = nome_do_canal.canal),
    case canal when 'shopee' then 'Shopee' when 'mercadolivre' then 'Mercado Livre' when 'shein' then 'SHEIN'
      when 'tiktokshop' then 'TikTok Shop' when 'lojapropria' then 'Loja online' when 'atacado' then 'Atacado'
      when 'lojafisica' then 'Loja física' else canal end)
$$;

-- Número no jeito brasileiro: 1.234,56 (2 casas) ou 10,5 (casas = 0: sem zeros sobrando). Formato fixo, sem depender do locale.
create or replace function numero_br(v numeric, casas int default 2) returns text
language sql immutable set search_path = public
as $$
  select translate(case when casas = 2 then to_char(v, 'FM999,999,999,990.00')
    else rtrim(rtrim(to_char(v, 'FM999,999,999,990.9999'), '0'), '.') end, ',.', '.,')
$$;

create or replace function historico_preco() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.preco_de = old.preco_de and new.desconto = old.desconto then return null; end if;
  perform anotar(new.empresa_id, 'Preço salvo',
    (select nome from produtos where id = new.produto_id) || ' · ' || nome_do_canal(new.empresa_id, new.canal) || ' · R$ ' || numero_br(new.preco_de)
    || case when new.desconto > 0 then ' com ' || numero_br(new.desconto, 0) || '% de desconto' else '' end);
  return null;
end $$;

-- "Taxa do canal alterada" também com o nome do canal como na tela; o imposto da empresa com vírgula (8,5%)
create or replace function historico_canal() returns trigger
language plpgsql security definer set search_path = public
as $$
declare c config_canais := coalesce(new, old);
begin
  perform anotar(c.empresa_id, case when c.canal = 'empresa' then 'Imposto da empresa alterado' else 'Taxa do canal alterada' end,
    case when c.canal <> 'empresa' then nome_do_canal(c.empresa_id, c.canal)  -- nome como na tela
      when (new).config ->> 'impostos' ~ '^[0-9]+(\.[0-9]+)?$' then numero_br(((new).config ->> 'impostos')::numeric, 0) || '%'  -- 8,5%
      else 'sem imposto da empresa' end);
  return null;
end $$;

-- as funções novas são de uso interno dos gatilhos (como no schema.sql: ninguém de fora chama)
revoke execute on function nome_do_canal(uuid, text), numero_br(numeric, int) from anon, public;

/* ---------- OPCIONAL, decisão do Eduardo: apagar da Loren as ~135 "Produto alterado" que a migração das fotos gerou hoje ----------
   A migração gravou cada produto com a foto nova, e o gatilho antigo anotou cada gravação como "Produto alterado".
   1) Selecione só a PRÉVIA, rode e veja em que minutos (horário de Brasília) as linhas se concentram e quem aparece
      (deve ser 1 pessoa, num intervalo curto, somando ~135).
   2) No APAGAR, troque o início, o fim e o e-mail pelos da prévia, selecione e rode. Sai só a linha "Produto alterado" de HOJE,
      da Loren, dentro desse intervalo, dessa pessoa, e de produto que hoje tem a foto no Storage e nenhuma data URL.
      Se o intervalo ficar sem trocar, o comando dá erro e não apaga nada.

-- PRÉVIA
select to_char(h.quando at time zone 'America/Sao_Paulo', 'HH24:MI') as minuto, h.quem, count(*) as linhas
from historico h join empresas e on e.id = h.empresa_id
where e.nome ilike 'Loren%' and h.acao = 'Produto alterado'
  and (h.quando at time zone 'America/Sao_Paulo')::date = date '2026-11-13'
group by 1, 2 order by 1;

-- APAGAR
delete from historico h using empresas e
where e.id = h.empresa_id and e.nome ilike 'Loren%' and h.acao = 'Produto alterado'
  and (h.quando at time zone 'America/Sao_Paulo') between timestamp '2026-11-13 HH:MM' and timestamp '2026-11-13 HH:MM'  -- troque
  and h.quem = 'email-de-quem-migrou@lorenmetais.com.br'                                                                    -- troque
  and exists (select 1 from produtos p where p.empresa_id = h.empresa_id
    and h.detalhe = p.nome || coalesce(' (' || nullif(p.sku, '') || ')', '')
    and exists (select 1 from unnest(p.fotos) f where f like '%/storage/v1/object/%')
    and not exists (select 1 from unnest(p.fotos) f where f like 'data:%'));
*/
