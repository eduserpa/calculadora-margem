-- Correção 10 (13/11): o canal "Loja própria (site)" agora se chama "Loja online" também no histórico.
-- Empresa que salvou as taxas antes guardou o nome antigo na configuração do canal: ele é ignorado (vale o nome novo),
-- sem mexer em nenhum dado. Para quem JÁ rodou o schema.sql: cole este arquivo inteiro no SQL Editor e clique em Run.
-- Pode rodar mais de uma vez. As linhas antigas do histórico ficam como foram escritas.

create or replace function nome_do_canal(empresa uuid, canal text) returns text
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select nullif(nullif(c.config ->> 'nome', ''), 'Loja própria (site)') from config_canais c where c.empresa_id = empresa and c.canal = nome_do_canal.canal),
    case canal when 'shopee' then 'Shopee' when 'mercadolivre' then 'Mercado Livre' when 'shein' then 'SHEIN'
      when 'tiktokshop' then 'TikTok Shop' when 'lojapropria' then 'Loja online' when 'atacado' then 'Atacado'
      when 'lojafisica' then 'Loja física' else canal end)
$$;
