# Banco de dados (preparado, ainda sem conta)

Hoje os dados ficam no navegador de quem usa. Isso serve para testar, mas cada computador tem os seus. O próximo passo é guardar tudo num banco na nuvem (Supabase), para a equipe ver os mesmos produtos e preços.

## O que já está pronto

- **Uma porta só para os dados.** As telas não sabem onde os dados ficam. Tudo passa por `src/dados.js`. Para trocar o navegador pelo banco, muda-se só esse arquivo; as telas continuam iguais.
- **As tabelas** em `supabase/schema.sql`:
  - `produtos`: nome, SKU, tipo, custo, peso, medidas e fotos;
  - `itens_kit`: o que vai em cada kit;
  - `precificacoes`: o preço salvo de cada produto em cada canal;
  - `config_canais`: as taxas que a empresa ajustou em cada canal.

  Mais duas de apoio: `empresas` e `membros` (quem faz parte de qual empresa).

## Segurança

- **Sem login, ninguém lê nada.** A proteção por linha (RLS) está ligada em todas as tabelas, e o acesso de visitante foi retirado.
- **Cada empresa só vê os próprios dados.** Uma pessoa logada só enxerga e grava o que é da empresa dela.
- **Cadastro fechado.** Ninguém cria conta sozinho. Quem administra convida a pessoa e coloca na empresa pelo painel do Supabase.
- **Nenhuma chave no repositório.** O teste procura chaves e falha se achar alguma.

O teste `tests/banco.test.js` roda o `schema.sql` num Postgres de verdade, dentro do próprio teste, e confere:

- sem login, toda leitura e gravação é recusada;
- quem está logado mas não foi convidado para nenhuma empresa não vê nada;
- a empresa B não vê, não muda e não apaga dados da empresa A;
- ninguém se coloca sozinho numa empresa;
- um kit não pode usar produto de outra empresa.

## Quando for criar a conta (passo a passo)

1. Criar o projeto no Supabase (quem cria é o Eduardo).
2. No **SQL Editor**, colar e rodar `supabase/schema.sql`.
3. Em **Authentication › Sign In / Providers**, desligar **Allow new users to sign up** (cadastro fechado).
4. Criar a empresa e convidar as pessoas:
   - em **Authentication › Users › Invite**, convidar cada pessoa por e-mail;
   - na tabela `empresas`, criar a linha da empresa;
   - na tabela `membros`, ligar cada pessoa à empresa.
5. Para conferir a proteção no próprio projeto, rode no SQL Editor:

   ```sql
   set role anon;
   select * from produtos; -- deve dar "permission denied"
   reset role;
   ```

6. Na Vercel, cadastrar o endereço do projeto e a chave **publishable** (a pública) como variáveis de ambiente. A chave **secret** (`service_role`) nunca vai para o site nem para o repositório.
7. Trocar o armazenamento em `src/dados.js` pelo do banco (`usarGuardado`). Ao abrir pela primeira vez, oferecer subir o que já está no navegador.

## O que fica para depois

- **Fotos:** hoje vão dentro do produto. No banco, o melhor é guardar no Storage do Supabase e deixar só o endereço na tabela.
- **Edição ao mesmo tempo:** se duas pessoas mudarem o mesmo produto, vale a última gravação.
