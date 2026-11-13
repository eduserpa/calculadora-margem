-- Correção 05 (13/11): Clonar de outra empresa deixa ESCOLHER os produtos (prévia com id e foto; cópia só dos escolhidos).
-- Para quem JÁ rodou o schema.sql (e as correções 01 a 04): cole este arquivo inteiro no SQL Editor e clique em Run.
-- Pode rodar mais de uma vez. Quem ainda não rodou o schema.sql não precisa deste arquivo (já está lá).
-- As funções mudam de forma, então saem as versões antigas antes (sem duas versões com o mesmo nome).

drop function if exists previa_copia(uuid, uuid);
drop function if exists copiar_produtos(uuid, uuid);
drop function if exists copiar_produtos(uuid, uuid, uuid[]);

-- Prévia: cada produto da origem (id e 1ª foto para a lista com caixinhas) e o que vai acontecer com ele.
create function previa_copia(origem uuid, destino uuid)
returns table (id uuid, nome text, sku text, foto text, situacao text)
language sql stable security definer set search_path = public
as $$
  select o.id, o.nome, o.sku, o.fotos[1],
    case when nullif(trim(o.sku), '') is null then 'novo'
      when sku_unico(origem, o.sku) and sku_unico(destino, o.sku) then 'atualizado'
      when exists (select 1 from produtos d where d.empresa_id = destino and lower(trim(d.sku)) = lower(trim(o.sku)))
        or not sku_unico(origem, o.sku) then 'repetido'
      else 'novo' end
  from produtos o
  where o.empresa_id = origem and o.tipo_custo <> 'kit'
    and origem in (select minhas_empresas()) and destino in (select minhas_empresas())
  order by o.nome
$$;

-- ids: só os produtos escolhidos na prévia (null = todos).
create function copiar_produtos(origem uuid, destino uuid, ids uuid[] default null) returns jsonb
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
  for o in select * from produtos where empresa_id = origem and tipo_custo <> 'kit' and (ids is null or id = any(ids)) loop
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

revoke execute on function previa_copia(uuid, uuid), copiar_produtos(uuid, uuid, uuid[]) from anon, public;
grant execute on function previa_copia(uuid, uuid), copiar_produtos(uuid, uuid, uuid[]) to authenticated;
