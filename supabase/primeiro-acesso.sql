-- Primeiro acesso: cria a empresa e convida você como dono. Rodar UMA vez no SQL Editor, depois do schema.sql.
-- Troque os dois textos entre aspas: o nome da empresa e o seu e-mail (em minúsculas).
-- Depois é só abrir o Calculéo, pôr o seu e-mail e clicar no link que chegar: você entra já como dono.
-- As outras pessoas você convida pela tela Equipe, dentro do próprio Calculéo.
with nova as (
  insert into empresas (nome) values ('NOME DA EMPRESA') returning id
)
insert into convites (empresa_id, email, papel)
select id, 'seu-email@exemplo.com', 'dono' from nova
returning empresa_id, email, papel;
