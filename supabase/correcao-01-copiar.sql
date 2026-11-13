-- Correção 01 (13/11): a cópia entre empresas não sobrescreve produto quando o SKU é repetido.
-- Para quem JÁ rodou o schema.sql: cole este arquivo inteiro no SQL Editor e clique em Run. Pode rodar mais de uma vez.
-- Quem ainda não rodou o schema.sql não precisa deste arquivo (a correção já está lá).

-- Casa pelo SKU só quando ele aparece uma vez na origem e uma vez no destino; SKU vazio ou repetido vira produto novo.
create or replace function sku_unico(_empresa uuid, _sku text) returns boolean
language sql stable security definer set search_path = public
as $$ select nullif(trim(_sku), '') is not null
  and (select count(*) from produtos p where p.empresa_id = _empresa and lower(trim(p.sku)) = lower(trim(_sku))) = 1 $$;

drop function if exists previa_copia(uuid, uuid);
create function previa_copia(origem uuid, destino uuid)
returns table (nome text, sku text, situacao text)
language sql stable security definer set search_path = public
as $$
  select o.nome, o.sku,
    case when sku_unico(origem, o.sku) and sku_unico(destino, o.sku) then 'atualizado' else 'novo' end
  from produtos o
  where o.empresa_id = origem and o.tipo_custo <> 'kit'
    and origem in (select minhas_empresas()) and destino in (select minhas_empresas())
  order by o.nome
$$;

create or replace function copiar_produtos(origem uuid, destino uuid) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  o produtos;
  novos int := 0;
  atualizados int := 0;
begin
  if origem not in (select minhas_empresas()) or destino not in (select minhas_empresas()) or origem = destino then
    raise exception 'só dá para copiar entre duas empresas suas';
  end if;
  for o in select * from produtos where empresa_id = origem and tipo_custo <> 'kit' loop
    if sku_unico(origem, o.sku) and sku_unico(destino, o.sku) then
      update produtos d set nome = o.nome, tipo_custo = o.tipo_custo, custo = o.custo, peso_g = o.peso_g,
        comprimento_cm = o.comprimento_cm, largura_cm = o.largura_cm, altura_cm = o.altura_cm, fotos = o.fotos, atualizado_em = now()
      where d.empresa_id = destino and lower(trim(d.sku)) = lower(trim(o.sku));
      atualizados := atualizados + 1;
    else
      insert into produtos (empresa_id, nome, sku, tipo_custo, custo, peso_g, comprimento_cm, largura_cm, altura_cm, fotos)
      values (destino, o.nome, o.sku, o.tipo_custo, o.custo, o.peso_g, o.comprimento_cm, o.largura_cm, o.altura_cm, o.fotos);
      novos := novos + 1;
    end if;
  end loop;
  perform anotar(destino, 'Cópia de produtos',
    'De ' || (select nome from empresas where id = origem) || ': ' || novos || ' novo(s), ' || atualizados || ' atualizado(s)');
  return jsonb_build_object('novos', novos, 'atualizados', atualizados);
end $$;

revoke execute on function sku_unico(uuid, text) from anon, public;
revoke execute on function previa_copia(uuid, uuid) from anon, public;
grant execute on function previa_copia(uuid, uuid), copiar_produtos(uuid, uuid) to authenticated;
