-- Correção 04 (13/11): fotos dos produtos no Storage, com leitura pública (o app abre muito mais rápido).
-- Para quem JÁ rodou o schema.sql: cole este arquivo inteiro no SQL Editor e clique em Run. Pode rodar mais de uma vez.
-- Quem ainda não rodou o schema.sql não precisa deste arquivo (já está lá).
-- Leitura pública: endereço fixo, o navegador guarda em cache; o nome do arquivo é o hash da foto, impossível de adivinhar.
-- Gravar, trocar e apagar continuam só na pasta da própria empresa (fotos/<empresa_id>/...).

insert into storage.buckets (id, name, public) values ('fotos', 'fotos', true)
on conflict (id) do update set public = true;

drop policy if exists fotos_da_empresa on storage.objects;
create policy fotos_da_empresa on storage.objects for all to authenticated
  using (bucket_id = 'fotos' and (storage.foldername(name))[1] in (select e::text from minhas_empresas() e))
  with check (bucket_id = 'fotos' and (storage.foldername(name))[1] in (select e::text from minhas_empresas() e));
