-- Correção 15 (1.2.1). Cole este arquivo inteiro no SQL Editor e clique em Run. Pode rodar mais de uma vez.
-- Não muda coluna nem o que o app manda: pode rodar antes ou depois de publicar a 1.2.1.
-- 1) Histórico sem erro de gênero: "Imposto (Mercado Livre): 12% → 15%" no lugar de "Imposto no Loja física / no SHEIN".
--    As linhas já gravadas ficam como estão (o texto é guardado na hora).
-- 2) impostos_canal só aceita chave de canal de verdade (letras minúsculas, como mercadolivre, lojafisica): nada de {"x y": 5}.
--    Vale para as próximas gravações; os dados de hoje já passam (as chaves são os ids dos canais).
-- 3) Escala (muita gente usando): índices no que o app e a RLS procuram por empresa, por pessoa e por e-mail, e as fotos
--    em uso conferidas pelo índice (antes lia todos os produtos de todas as empresas a cada foto).

create or replace function impostos_validos(m jsonb) returns boolean
language sql immutable set search_path = public
as $$ select jsonb_typeof(m) = 'object' and not exists (select 1 from jsonb_each(m) e
  where e.key !~ '^[a-z]{2,30}$' or jsonb_typeof(e.value) <> 'number' or (e.value #>> '{}')::numeric not between 0 and 100) $$;

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
    (99, 'Foto trocada', case when a.fotos is distinct from d.fotos then 'sim' end, null)
    union all
    select 17, 'Imposto (' || nome_do_canal(d.empresa_id, k) || ')',
      coalesce(nullif(valor_br('pct', a.impostos_canal -> k), '—'), 'padrão'), coalesce(nullif(valor_br('pct', d.impostos_canal -> k), '—'), 'padrão')
    from (select jsonb_object_keys(coalesce(a.impostos_canal, '{}'::jsonb)) union select jsonb_object_keys(coalesce(d.impostos_canal, '{}'::jsonb))) t(k)
  ) m(ordem, campo, antes, depois)
  where antes is distinct from depois
$$;

-- ---------- índices (escala) ----------
-- A RLS (minhas_empresas) procura as empresas de quem está logado a cada pedido: membros por usuario_id.
create index if not exists membros_usuario on membros (usuario_id);
-- O porteiro do cadastro e o aceitar_convites procuram o convite pelo e-mail.
create index if not exists convites_email on convites (email);
-- Ler a empresa (app) e as chaves estrangeiras (empresa, produto): apagar produto não varre a tabela.
create index if not exists itens_kit_empresa_produto on itens_kit (empresa_id, produto_id);
create index if not exists precificacoes_empresa_produto on precificacoes (empresa_id, produto_id);
create index if not exists concorrentes_empresa_produto on concorrentes (empresa_id, produto_id);
-- SKU repetido (importar, clonar, prévia): procura por empresa e SKU sem ler todos os produtos.
create index if not exists produtos_empresa_sku on produtos (empresa_id, lower(trim(sku)));
-- Foto ainda em uso (ao apagar foto ou excluir empresa).
create index if not exists produtos_fotos on produtos using gin (fotos);

create or replace function foto_em_uso(url text) returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from produtos where fotos @> array[url]) or exists (select 1 from empresas where foto = url) $$;

-- Em ordem, para o app ler em blocos de 1000 sem repetir nem pular.
create or replace function fotos_usadas_fora(empresa uuid) returns setof text
language sql stable security definer set search_path = public
as $$
  select distinct substring(f from '/storage/v1/object/public/fotos/([^?#]+)')
  from produtos, unnest(fotos) f
  where sou_dono(empresa) and empresa_id <> empresa and f like '%/storage/v1/object/public/fotos/' || empresa || '/%'
  order by 1
$$;
