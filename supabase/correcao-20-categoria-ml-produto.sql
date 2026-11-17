-- Correção 20 (17/11): categoria do Mercado Livre POR PRODUTO. Cada produto guarda a sua (o caminho 'Pai > Sub' da lista
-- oficial); o app usa a redução de comissão dela. Produto sem categoria (null) usa a do canal, como antes: nada muda para quem
-- já usa. Mesma regra e permissões dos produtos (é uma coluna da tabela). O histórico anota a troca ("Categoria do Mercado
-- Livre") e o Clonar leva a categoria junto. Cole este arquivo inteiro no SQL Editor e clique em Run. Pode rodar mais de uma vez.

alter table produtos add column if not exists categoria_ml text check (categoria_ml is null or length(trim(categoria_ml)) between 1 and 300);

-- histórico: a troca da categoria entra no detalhe da alteração do produto
create or replace function mudancas_produto(a produtos, d produtos) returns jsonb
language sql stable set search_path = public
as $$
  select coalesce(jsonb_agg(case when campo = 'Foto trocada' then jsonb_build_object('campo', campo)
      else jsonb_build_object('campo', campo, 'antes', antes, 'depois', depois) end order by ordem, campo), '[]'::jsonb)
  from (values
    (1, 'Nome', valor_br('texto', to_jsonb(a.nome)), valor_br('texto', to_jsonb(d.nome))),
    (2, 'Referência / SKU', valor_br('texto', to_jsonb(nullif(a.sku, ''))), valor_br('texto', to_jsonb(nullif(d.sku, '')))),
    (3, 'Tipo do produto', valor_br('nome', to_jsonb(a.tipo_custo)), valor_br('nome', to_jsonb(d.tipo_custo))),
    (4, 'Custo de aquisição', valor_br('reais', a.custo #> '{revenda,custoCompra}'), valor_br('reais', d.custo #> '{revenda,custoCompra}')),
    (5, 'Frete do fornecedor', valor_br('reais', a.custo #> '{revenda,freteFornecedor}'), valor_br('reais', d.custo #> '{revenda,freteFornecedor}')),
    (6, 'Embalagem', valor_br('reais', a.custo #> '{revenda,embalagem}'), valor_br('reais', d.custo #> '{revenda,embalagem}')),
    (7, 'Outros custos', valor_br('reais', a.custo #> '{revenda,outros}'), valor_br('reais', d.custo #> '{revenda,outros}')),
    (8, 'Materiais (total)', valor_br('reais', soma_lista(a.custo #> '{fabricacao,materiais}', 'precoUnitario', 'quantidade')),
                             valor_br('reais', soma_lista(d.custo #> '{fabricacao,materiais}', 'precoUnitario', 'quantidade'))),
    (9, 'Mão de obra (total)', valor_br('reais', soma_lista(a.custo #> '{fabricacao,maoDeObra}', 'valor')), valor_br('reais', soma_lista(d.custo #> '{fabricacao,maoDeObra}', 'valor'))),
    (10, 'Embalagem', valor_br('reais', a.custo #> '{fabricacao,embalagem}'), valor_br('reais', d.custo #> '{fabricacao,embalagem}')),
    (11, 'Frete de insumos', valor_br('reais', a.custo #> '{fabricacao,freteInsumos}'), valor_br('reais', d.custo #> '{fabricacao,freteInsumos}')),
    (12, 'Outros custos', valor_br('reais', a.custo #> '{fabricacao,outros}'), valor_br('reais', d.custo #> '{fabricacao,outros}')),
    (13, 'Peso real', valor_br('peso', to_jsonb(a.peso_g)), valor_br('peso', to_jsonb(d.peso_g))),
    (14, 'Comprimento', valor_br('cm', to_jsonb(a.comprimento_cm)), valor_br('cm', to_jsonb(d.comprimento_cm))),
    (15, 'Largura', valor_br('cm', to_jsonb(a.largura_cm)), valor_br('cm', to_jsonb(d.largura_cm))),
    (16, 'Altura', valor_br('cm', to_jsonb(a.altura_cm)), valor_br('cm', to_jsonb(d.altura_cm))),
    (18, 'Categoria do Mercado Livre', coalesce(nullif(a.categoria_ml, ''), 'padrão do canal'), coalesce(nullif(d.categoria_ml, ''), 'padrão do canal')),
    (99, 'Foto trocada', case when a.fotos is distinct from d.fotos then 'sim' end, null)
    union all
    select 17, 'Imposto (' || nome_do_canal(d.empresa_id, k) || ')',
      coalesce(nullif(valor_br('pct', a.impostos_canal -> k), '—'), 'padrão'), coalesce(nullif(valor_br('pct', d.impostos_canal -> k), '—'), 'padrão')
    from (select jsonb_object_keys(coalesce(a.impostos_canal, '{}'::jsonb)) union select jsonb_object_keys(coalesce(d.impostos_canal, '{}'::jsonb))) t(k)
  ) m(ordem, campo, antes, depois)
  where antes is distinct from depois
$$;

-- Clonar: a categoria vai junto com o produto
create or replace function copiar_produtos(origem uuid, destino uuid, ids uuid[] default null) returns jsonb
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
        comprimento_cm = o.comprimento_cm, largura_cm = o.largura_cm, altura_cm = o.altura_cm, impostos_canal = o.impostos_canal, categoria_ml = o.categoria_ml, fotos = o.fotos, atualizado_em = now()
      where d.empresa_id = destino and lower(trim(d.sku)) = lower(trim(o.sku));
      atualizados := atualizados + 1;
    else
      insert into produtos (empresa_id, nome, sku, tipo_custo, custo, peso_g, comprimento_cm, largura_cm, altura_cm, impostos_canal, categoria_ml, fotos)
      values (destino, o.nome, o.sku, o.tipo_custo, o.custo, o.peso_g, o.comprimento_cm, o.largura_cm, o.altura_cm, o.impostos_canal, o.categoria_ml, o.fotos);
      novos := novos + 1;
    end if;
  end loop;
  perform anotar(destino, 'Cópia de produtos',
    'De ' || (select nome from empresas where id = origem) || ': ' || novos || ' novo(s), ' || atualizados || ' atualizado(s)');
  return jsonb_build_object('novos', novos, 'atualizados', atualizados);
end $$;
