-- Correção 08 (13/11): histórico DETALHADO. Cada linha nova guarda o que mudou, campo a campo, em linguagem de tela:
-- mudancas = [{"campo": "Custo de aquisição", "antes": "R$ 26,00", "depois": "R$ 28,50"}, {"campo": "Foto trocada"}, ...].
-- Produto, preço e taxa do canal; só os campos que mudaram (atualizado_em, ids e as fontes das taxas não contam).
-- Alteração em que nada mudou não vira linha. As linhas antigas ficam sem detalhe (mudancas vazio).
-- Para quem JÁ rodou o schema.sql (e as correções até a 07): cole este arquivo inteiro no SQL Editor e clique em Run.
-- Pode rodar mais de uma vez. Quem ainda não rodou o schema.sql não precisa deste arquivo (já está lá).

alter table historico add column if not exists mudancas jsonb;

-- ---- início do bloco igual ao schema.sql ----

-- Grava a linha com o detalhe (lista vazia ou nula = sem detalhe).
create or replace function anotar_mudancas(empresa uuid, acao text, detalhe text, mudancas jsonb) returns void
language sql security definer set search_path = public
as $$ insert into historico (empresa_id, quem, acao, detalhe, mudancas)
  values (empresa, coalesce(meu_email(), 'sistema'), acao, detalhe, nullif(mudancas, '[]'::jsonb)) $$;

-- Número de dentro do jsonb (número ou texto numérico); qualquer outra coisa vira null, sem erro (o gatilho nunca barra a gravação).
create or replace function num_json(v jsonb) returns numeric
language sql immutable set search_path = public
as $$ select case when jsonb_typeof(v) = 'number' then (v #>> '{}')::numeric
  when jsonb_typeof(v) = 'string' and v #>> '{}' ~ '^-?[0-9]+(\.[0-9]+)?$' then (v #>> '{}')::numeric end $$;

-- Valor como a tela mostra: R$ 1.234,50 · 12,5% · 300 g / 1,5 kg · 25 cm · sim/não · Revendedor, Clássico, CNPJ...; vazio = —
create or replace function valor_br(tipo text, v jsonb) returns text
language sql immutable set search_path = public
as $$ select case
  when v is null or v = 'null'::jsonb or v #>> '{}' = '' then '—'
  when tipo = 'reais' and num_json(v) is not null then 'R$ ' || numero_br(num_json(v))
  when tipo = 'pct' and num_json(v) is not null then numero_br(num_json(v), 0) || '%'
  when tipo = 'peso' and num_json(v) is not null then case when num_json(v) < 1000 then numero_br(num_json(v), 0) || ' g' else numero_br(num_json(v) / 1000, 0) || ' kg' end
  when tipo = 'cm' and num_json(v) is not null then numero_br(num_json(v), 0) || ' cm'
  when tipo = 'simnao' then case when v = 'true'::jsonb then 'sim' else 'não' end
  when tipo = 'nome' then case v #>> '{}' when 'revenda' then 'Revendedor' when 'fabricacao' then 'Fabricante' when 'kit' then 'Kit'
    when 'classico' then 'Clássico' when 'premium' then 'Premium' when 'cpf' then 'CPF' when 'cnpj' then 'CNPJ' else v #>> '{}' end
  else v #>> '{}' end $$;

-- Soma de uma lista do custo (materiais: preço unit. x qtd; mão de obra: valor).
create or replace function soma_lista(lista jsonb, valor text, qtd text default null) returns jsonb
language sql immutable set search_path = public
as $$ select to_jsonb(coalesce(sum(coalesce(num_json(e -> valor), 0) * case when qtd is null then 1 else coalesce(num_json(e -> qtd), 0) end), 0))
  from jsonb_array_elements(case when jsonb_typeof(lista) = 'array' then lista else '[]'::jsonb end) e $$;

-- O que mudou num produto, com os rótulos do cadastro.
create or replace function mudancas_produto(a produtos, d produtos) returns jsonb
language sql stable set search_path = public
as $$
  select coalesce(jsonb_agg(case when campo = 'Foto trocada' then jsonb_build_object('campo', campo)
      else jsonb_build_object('campo', campo, 'antes', antes, 'depois', depois) end order by ordem), '[]'::jsonb)
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
    (17, 'Foto trocada', case when a.fotos is distinct from d.fotos then 'sim' end, null)
  ) m(ordem, campo, antes, depois)
  where antes is distinct from depois
$$;

-- O que mudou na taxa de um canal (config jsonb), com os rótulos da tela Taxas dos Canais / Configurar.
create or replace function mudancas_canal(antes jsonb, depois jsonb) returns jsonb
language plpgsql immutable set search_path = public
as $$
declare r jsonb := '[]'::jsonb; k text; s text; a jsonb; d jsonb; rot text; tipo text;
begin
  for k in select key from (select jsonb_object_keys(coalesce(antes, '{}'::jsonb)) as key
                             union select jsonb_object_keys(coalesce(depois, '{}'::jsonb))) t order by 1 loop
    continue when k ~ '_(fonte|conferido_em|vigente_desde)$' or k in ('nome', 'tipo', 'rotulo_comissao', 'impostosProprio', 'frete', 'frete_por_reputacao', 'categoria_id');
    a := antes -> k; d := depois -> k;
    continue when a is not distinct from d;
    -- comissão por tipo de anúncio (Mercado Livre): uma linha por tipo
    if k in ('comissao', 'comissao_propria') and jsonb_typeof(coalesce(d, a)) = 'object' then
      for s in select key from (select jsonb_object_keys(case when jsonb_typeof(a) = 'object' then a else '{}'::jsonb end) as key
                                 union select jsonb_object_keys(case when jsonb_typeof(d) = 'object' then d else '{}'::jsonb end)) t order by 1 loop
        continue when a -> s is not distinct from d -> s;
        r := r || jsonb_build_array(jsonb_build_object('campo', case k when 'comissao' then 'Comissão ' else 'Comissão própria ' end || valor_br('nome', to_jsonb(s)),
          'antes', valor_br('pct', a -> s), 'depois', valor_br('pct', d -> s)));
      end loop;
      continue;
    end if;
    rot := null; tipo := null;
    select l.rot, l.tipo into rot, tipo from (values
      ('comissao', 'Comissão', 'pct'), ('taxa_fixa', 'Taxa fixa', 'reais'), ('impostos', 'Impostos', 'pct'), ('taxa_financeira', 'Taxa financeira', 'pct'),
      ('frete_absorvido', 'Frete absorvido', 'reais'), ('embalagem', 'Pick & pack', 'reais'), ('outros', 'Outros custos', 'reais'),
      ('cupom', 'Cupom', 'pct'), ('cupom_ativo', 'Cupom ligado', 'simnao'), ('afiliado', 'Afiliado', 'pct'), ('afiliado_ativo', 'Afiliado ligado', 'simnao'),
      ('frete_percentual', 'Taxa de frete', 'pct'), ('frete_teto', 'Teto da taxa de frete', 'reais'), ('tipo_anuncio', 'Tipo de anúncio', 'nome'),
      ('reputacao', 'Reputação da conta', 'nome'), ('categoria', 'Categoria do produto', 'texto'), ('tipo_vendedor', 'Vende como', 'nome'),
      ('cpf_adicional', 'Adicional de CPF', 'reais'), ('cpf_acima_limite', 'CPF acima do limite', 'simnao'),
      ('faixas', 'Faixas de preço alteradas', 'lista'), ('faixa_reduzida', 'Faixa da comissão reduzida alterada', 'lista')
    ) l(chave, rot, tipo) where l.chave = k;
    if rot is null then rot := k; tipo := 'texto'; end if;
    r := r || jsonb_build_array(case when tipo = 'lista' then jsonb_build_object('campo', rot)
      else jsonb_build_object('campo', rot, 'antes', valor_br(tipo, a), 'depois', valor_br(tipo, d)) end);
  end loop;
  return r;
end $$;

create or replace function historico_produto() returns trigger
language plpgsql security definer set search_path = public
as $$
declare p produtos := coalesce(new, old); m jsonb;
begin
  -- só a foto mudou, de data URL para o endereço do Storage (mesmo número de fotos, menos data URLs): é a migração, não anota
  if tg_op = 'UPDATE' and (to_jsonb(new) - 'fotos' - 'atualizado_em') = (to_jsonb(old) - 'fotos' - 'atualizado_em')
     and cardinality(new.fotos) = cardinality(old.fotos)
     and (select count(*) from unnest(new.fotos) f where f like 'data:%') < (select count(*) from unnest(old.fotos) f where f like 'data:%') then
    return null;
  end if;
  if tg_op = 'UPDATE' then
    m := mudancas_produto(old, new);
    if m = '[]'::jsonb then return null; end if;  -- nada mudou (só atualizado_em): sem linha
  end if;
  perform anotar_mudancas(p.empresa_id,
    case tg_op when 'INSERT' then 'Produto criado' when 'UPDATE' then 'Produto alterado' else 'Produto excluído' end,
    p.nome || coalesce(' (' || nullif(p.sku, '') || ')', ''), m);
  return null;
end $$;

create or replace function historico_preco() returns trigger
language plpgsql security definer set search_path = public
as $$
declare c text := nome_do_canal(new.empresa_id, new.canal); m jsonb := '[]'::jsonb;
begin
  if tg_op = 'UPDATE' and new.preco_de = old.preco_de and new.desconto = old.desconto then return null; end if;
  if tg_op = 'INSERT' or new.preco_de <> old.preco_de then
    m := m || jsonb_build_array(jsonb_build_object('campo', 'Preço no ' || c, 'antes', case when tg_op = 'INSERT' then '—' else 'R$ ' || numero_br(old.preco_de) end, 'depois', 'R$ ' || numero_br(new.preco_de)));
  end if;
  if (tg_op = 'INSERT' and new.desconto > 0) or (tg_op = 'UPDATE' and new.desconto <> old.desconto) then
    m := m || jsonb_build_array(jsonb_build_object('campo', 'Desconto no ' || c, 'antes', case when tg_op = 'INSERT' then '—' else numero_br(old.desconto, 0) || '%' end, 'depois', numero_br(new.desconto, 0) || '%'));
  end if;
  perform anotar_mudancas(new.empresa_id, 'Preço salvo',
    (select nome from produtos where id = new.produto_id) || ' · ' || c || ' · R$ ' || numero_br(new.preco_de)
    || case when new.desconto > 0 then ' com ' || numero_br(new.desconto, 0) || '% de desconto' else '' end, m);
  return null;
end $$;

-- "Taxa do canal alterada" com o nome do canal como na tela; o imposto da empresa com vírgula (8,5%)
create or replace function historico_canal() returns trigger
language plpgsql security definer set search_path = public
as $$
declare c config_canais := coalesce(new, old); m jsonb;
begin
  if tg_op = 'UPDATE' then
    m := mudancas_canal(old.config, new.config);
    if m = '[]'::jsonb then return null; end if;  -- nada que a tela mostre mudou: sem linha
    if c.canal = 'empresa' then m := (select jsonb_agg(case when x ->> 'campo' = 'Impostos' then x || '{"campo": "Imposto da empresa"}'::jsonb else x end) from jsonb_array_elements(m) x); end if;
  end if;
  perform anotar_mudancas(c.empresa_id, case when c.canal = 'empresa' then 'Imposto da empresa alterado' else 'Taxa do canal alterada' end,
    case when c.canal <> 'empresa' then nome_do_canal(c.empresa_id, c.canal)  -- nome como na tela
      when (new).config ->> 'impostos' ~ '^[0-9]+(\.[0-9]+)?$' then numero_br(((new).config ->> 'impostos')::numeric, 0) || '%'  -- 8,5%
      else 'sem imposto da empresa' end, m);
  return null;
end $$;

-- ---- fim do bloco igual ao schema.sql ----

-- as funções novas são de uso interno dos gatilhos (como no schema.sql: ninguém de fora chama)
revoke execute on function anotar_mudancas(uuid, text, text, jsonb), num_json(jsonb), valor_br(text, jsonb), soma_lista(jsonb, text, text),
  mudancas_produto(produtos, produtos), mudancas_canal(jsonb, jsonb) from anon, public;
