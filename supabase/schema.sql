-- Banco do Calculéo (Supabase / Postgres). Rodar uma vez no SQL Editor do projeto.
-- Várias empresas do grupo, cada uma com os seus produtos, preços e taxas (a tributação muda de uma para outra).
-- Várias pessoas por empresa (dono e membro). Sem login, ninguém lê nada.
-- Só entra quem foi convidado: convite pendente + hook "antes de criar usuário" (sem chave secreta no site).
-- Feito para projeto com "Automatically expose new tables" DESLIGADO: as permissões estão aqui, explícitas.

-- ---------- empresas, pessoas e convites ----------

create table empresas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  -- foto (logo): endereço público no Storage (fotos/<empresa>/empresa/<hash>.webp) ou null (o app mostra as iniciais).
  -- Só uma foto da pasta da própria empresa, nunca um endereço qualquer de fora. Trocar e tirar: só o admin (RLS dono_renomeia).
  foto text constraint foto_da_empresa check (foto is null or foto ~ ('^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/fotos/' || id || '/empresa/[^/]+$')),
  criado_em timestamptz not null default now()
);

create table membros (
  empresa_id uuid not null references empresas on delete cascade,
  usuario_id uuid not null references auth.users on delete cascade,
  email text not null,
  papel text not null default 'membro' check (papel in ('dono', 'membro')),
  entrou_em timestamptz not null default now(),
  primary key (empresa_id, usuario_id)
);

-- Convite pendente: a pessoa entra na empresa no primeiro login com este e-mail.
create table convites (
  empresa_id uuid not null references empresas on delete cascade,
  email text not null check (email = lower(trim(email))),
  papel text not null default 'membro' check (papel in ('dono', 'membro')),
  convidado_em timestamptz not null default now(),
  primary key (empresa_id, email)
);

-- Empresas da pessoa logada (vazio sem login).
create function minhas_empresas() returns setof uuid
language sql stable security definer set search_path = public
as $$ select empresa_id from membros where usuario_id = auth.uid() $$;

create function sou_dono(empresa uuid) returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from membros where empresa_id = empresa and usuario_id = auth.uid() and papel = 'dono') $$;

-- E-mail de quem está logado (para o histórico e os convites).
create function meu_email() returns text
language sql stable security definer set search_path = public
as $$ select lower(email) from auth.users where id = auth.uid() $$;

-- Criar empresa pela tela: qualquer pessoa logada cria a sua e entra como dono (não vê as dos outros).
create function criar_empresa(nome_empresa text) returns uuid
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

-- Dono muda o papel de quem já está na empresa (membro <-> dono). A empresa nunca fica sem dono.
create function mudar_papel(empresa uuid, usuario uuid, novo_papel text) returns void
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

-- Chamado pelo app logo após o login: aceita os convites pendentes deste e-mail.
create function aceitar_convites() returns setof uuid
language plpgsql security definer set search_path = public
as $$
begin
  return query
    with aceitos as (
      delete from convites where email = meu_email() returning empresa_id, papel
    )
    insert into membros (empresa_id, usuario_id, email, papel)
    select a.empresa_id, auth.uid(), meu_email(), a.papel from aceitos a
    on conflict (empresa_id, usuario_id) do nothing
    returning membros.empresa_id;
end $$;

-- Hook do Supabase Auth "Before User Created": só cria conta para e-mail com convite pendente.
-- Ligar em Authentication > Hooks (ver docs/banco.md).
create function antes_de_criar_usuario(event jsonb) returns jsonb
language sql stable security definer set search_path = public
as $$
  select case
    when exists (select 1 from convites where email = lower(trim(event -> 'user' ->> 'email'))) then '{}'::jsonb
    else jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'Este e-mail não foi convidado.'))
  end
$$;

-- ---------- dados da calculadora (por empresa) ----------

create table produtos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas on delete cascade,
  nome text not null,
  sku text,
  tipo_custo text not null check (tipo_custo in ('revenda', 'fabricacao', 'kit')),
  custo jsonb not null default '{}', -- partes do custo: revenda {custoCompra, ...} ou fabricacao {materiais, maoDeObra, ...}
  peso_g numeric not null default 0 check (peso_g >= 0),
  comprimento_cm numeric not null default 0 check (comprimento_cm >= 0),
  largura_cm numeric not null default 0 check (largura_cm >= 0),
  altura_cm numeric not null default 0 check (altura_cm >= 0),
  fotos text[] not null default '{}',
  atualizado_em timestamptz not null default now(),
  unique (empresa_id, id) -- para kit e precificação apontarem só para produto da mesma empresa
);

create table itens_kit (
  empresa_id uuid not null references empresas on delete cascade,
  kit_id uuid not null,
  produto_id uuid not null,
  quantidade numeric not null check (quantidade > 0),
  primary key (kit_id, produto_id),
  foreign key (empresa_id, kit_id) references produtos (empresa_id, id) on delete cascade,
  foreign key (empresa_id, produto_id) references produtos (empresa_id, id) on delete restrict -- não apaga produto que está num kit
);

create table precificacoes (
  empresa_id uuid not null references empresas on delete cascade,
  produto_id uuid not null,
  canal text not null,
  preco_de numeric not null check (preco_de > 0),
  desconto numeric not null default 0 check (desconto >= 0 and desconto < 100),
  salvo_em timestamptz not null default now(),
  primary key (produto_id, canal),
  foreign key (empresa_id, produto_id) references produtos (empresa_id, id) on delete cascade
);

-- Taxas de cada canal, por empresa (mesmo formato de data/canais.json).
-- A linha com canal = 'empresa' guarda o imposto da empresa, que vale para todo canal que não tiver o seu.
create table config_canais (
  empresa_id uuid not null references empresas on delete cascade,
  canal text not null,
  config jsonb not null,
  atualizado_em timestamptz not null default now(),
  primary key (empresa_id, canal)
);

-- ---------- histórico (gravado pelo próprio banco) ----------

create table historico (
  id bigint generated always as identity primary key,
  empresa_id uuid not null references empresas on delete cascade,
  quando timestamptz not null default now(),
  quem text not null,
  acao text not null,
  detalhe text not null default '',
  mudancas jsonb  -- o que mudou, campo a campo: [{campo, antes, depois}] (correção 08); linhas antigas sem
);
create index on historico (empresa_id, quando desc);

create function anotar(empresa uuid, acao text, detalhe text) returns void
language sql security definer set search_path = public
as $$ insert into historico (empresa_id, quem, acao, detalhe) values (empresa, coalesce(meu_email(), 'sistema'), acao, detalhe) $$;

-- Nome do canal como na tela: o que a empresa gravou nas taxas dela, senão o de data/canais.json.
create function nome_do_canal(empresa uuid, canal text) returns text
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select nullif(c.config ->> 'nome', '') from config_canais c where c.empresa_id = empresa and c.canal = nome_do_canal.canal),
    case canal when 'shopee' then 'Shopee' when 'mercadolivre' then 'Mercado Livre' when 'shein' then 'SHEIN'
      when 'tiktokshop' then 'TikTok Shop' when 'lojapropria' then 'Loja online' when 'atacado' then 'Atacado'
      when 'lojafisica' then 'Loja física' else canal end)
$$;

-- Número no jeito brasileiro: 1.234,56 (2 casas) ou 10,5 (casas = 0: sem zeros sobrando). Formato fixo, sem depender do locale.
create function numero_br(v numeric, casas int default 2) returns text
language sql immutable set search_path = public
as $$
  select translate(case when casas = 2 then to_char(v, 'FM999,999,999,990.00')
    else rtrim(rtrim(to_char(v, 'FM999,999,999,990.9999'), '0'), '.') end, ',.', '.,')
$$;


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


create trigger historico after insert or update or delete on produtos for each row execute function historico_produto();
create trigger historico after insert or update on precificacoes for each row execute function historico_preco();
create trigger historico after insert or update or delete on config_canais for each row execute function historico_canal();

-- O app anota a importação (um resumo); o resto vem dos gatilhos acima.
create function anotar_importacao(empresa uuid, detalhe text) returns void
language plpgsql security definer set search_path = public
as $$
begin
  if empresa not in (select minhas_empresas()) then raise exception 'sem acesso a esta empresa'; end if;
  perform anotar(empresa, 'Importação', detalhe);
end $$;

-- ---------- copiar produtos de outra empresa do grupo ----------
-- Só para quem é membro das duas. Copia nome, SKU, custo, peso, medidas e fotos; casa pelo SKU único (atualiza) ou cria.
-- Preços salvos e taxas NÃO vão: cada empresa tem a sua tributação. Kits ficam de fora (os itens são de cada empresa).

-- Casa pelo SKU só quando ele aparece uma vez na origem e uma vez no destino. SKU vazio vira produto novo;
-- SKU repetido (numa das duas) também vira novo, sem sobrescrever nada, e a prévia avisa: 'repetido'.
create function sku_unico(_empresa uuid, _sku text) returns boolean
language sql stable security definer set search_path = public
as $$ select nullif(trim(_sku), '') is not null
  and (select count(*) from produtos p where p.empresa_id = _empresa and lower(trim(p.sku)) = lower(trim(_sku))) = 1 $$;

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

-- Se algum produto (de QUALQUER empresa) ainda usa este endereço de foto. O "Clonar" copia o endereço, e quem apaga
-- a foto órfã pode não enxergar a outra empresa; por isso a conferência é aqui, devolvendo só sim/não.
-- A foto da empresa também conta: o app não apaga um logo que ainda está no selo.
create function foto_em_uso(url text) returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from produtos where url = any(fotos)) or exists (select 1 from empresas where foto = url) $$;

-- ---------- permissões ----------
-- anon (sem login): nada. authenticated: só o que o app usa, sempre filtrado pela RLS abaixo.

revoke all on all tables in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
revoke execute on all functions in schema public from anon, public;
grant usage on schema public to authenticated;
grant execute on function minhas_empresas(), sou_dono(uuid), meu_email(), aceitar_convites(), criar_empresa(text), mudar_papel(uuid, uuid, text), foto_em_uso(text),
  anotar_importacao(uuid, text), previa_copia(uuid, uuid), copiar_produtos(uuid, uuid, uuid[]) to authenticated;
grant select on empresas, historico to authenticated;
grant update (nome, foto) on empresas to authenticated; -- renomear e trocar a foto: só o dono (RLS abaixo)
grant select, delete on membros to authenticated;
grant select, insert, delete on convites to authenticated;
grant select, insert, update, delete on produtos, itens_kit, precificacoes, config_canais to authenticated;
-- o hook roda como o Auth do Supabase
grant usage on schema public to supabase_auth_admin;
grant execute on function antes_de_criar_usuario(jsonb) to supabase_auth_admin;

-- ---------- RLS ----------

alter table empresas enable row level security;
alter table membros enable row level security;
alter table convites enable row level security;
alter table produtos enable row level security;
alter table itens_kit enable row level security;
alter table precificacoes enable row level security;
alter table config_canais enable row level security;
alter table historico enable row level security;

create policy ver_minhas_empresas on empresas for select to authenticated
  using (id in (select minhas_empresas()));
create policy dono_renomeia on empresas for update to authenticated
  using (sou_dono(id)) with check (sou_dono(id));

-- Equipe: todos da empresa se veem; só o dono tira alguém (e não tira a si mesmo).
create policy ver_equipe on membros for select to authenticated
  using (empresa_id in (select minhas_empresas()));
create policy dono_remove on membros for delete to authenticated
  using (sou_dono(empresa_id) and usuario_id <> auth.uid());

-- Convites: só o dono vê, convida e cancela.
create policy dono_convites on convites for all to authenticated
  using (sou_dono(empresa_id)) with check (sou_dono(empresa_id));

-- Histórico: só leitura, para todos da empresa (quem grava é o próprio banco).
create policy ver_historico on historico for select to authenticated
  using (empresa_id in (select minhas_empresas()));

-- Dados da calculadora: ler e gravar só na própria empresa.
create policy da_empresa on produtos for all to authenticated
  using (empresa_id in (select minhas_empresas())) with check (empresa_id in (select minhas_empresas()));
create policy da_empresa on itens_kit for all to authenticated
  using (empresa_id in (select minhas_empresas())) with check (empresa_id in (select minhas_empresas()));
create policy da_empresa on precificacoes for all to authenticated
  using (empresa_id in (select minhas_empresas())) with check (empresa_id in (select minhas_empresas()));
create policy da_empresa on config_canais for all to authenticated
  using (empresa_id in (select minhas_empresas())) with check (empresa_id in (select minhas_empresas()));

-- ---------- fotos (Storage) ----------
-- Leitura pública (endereço fixo, o navegador guarda em cache; o nome do arquivo é o hash da foto, impossível de adivinhar).
-- Gravar, trocar e apagar: só na pasta da própria empresa (fotos/<empresa_id>/...).
insert into storage.buckets (id, name, public) values ('fotos', 'fotos', true);
create policy fotos_da_empresa on storage.objects for all to authenticated
  using (bucket_id = 'fotos' and (storage.foldername(name))[1] in (select e::text from minhas_empresas() e))
  with check (bucket_id = 'fotos' and (storage.foldername(name))[1] in (select e::text from minhas_empresas() e));
