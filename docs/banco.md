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

## Painel da plataforma (correção 17)

Tela só para quem administra o Calculéo (hoje só o Eduardo). Ela gerencia todas as empresas e pessoas. Usuário comum não vê o menu, e o banco recusa tudo a ele mesmo que alguém chame as funções direto.

- **Quem entra:** quem está na tabela `admins_plataforma` **e** entrou com as 2 etapas (código do Google Authenticator). Sem as 2 etapas, toda função responde "sem permissão". A tabela só se preenche pelo SQL Editor.
- **O que vê:** de cada empresa:
  - nome e data de criação;
  - pessoas, convites e quantos produtos tem;
  - último acesso;
  - buscas de concorrentes no mês (horário de Brasília) e o limite.

  Nunca vê produtos, preços nem margens.
- **O que faz:**
  - criar empresa, já com o convite do dono;
  - convidar, cancelar convite e tirar pessoa (a empresa nunca fica sem dono);
  - suspender e reativar empresa;
  - mudar o limite de buscas do mês.
- **Registro:** cada uma dessas ações fica gravada em `auditoria_plataforma` (quem, quando, o quê).
- **Empresa suspensa:** ninguém dela lê nem grava nada, nem o dono; os dados ficam guardados. Reativar devolve tudo como estava. A pessoa vê "A empresa X está suspensa. Fale com o suporte." (função `minhas_empresas_suspensas()`, que só dá o nome das empresas dela).
- **Limite de buscas:** ao chegar no limite do mês, a busca de concorrentes é recusada com "A empresa chegou ao limite de buscas deste mês". As empresas que já existiam ficam sem limite; toda empresa nova começa com 20, criada pela tela ou pelo painel (senão alguém de fora criava outra empresa e buscava à vontade). Pelo painel dá para criar com outro limite ou sem limite. A contagem é da empresa: apagar e recriar o produto não zera o limite (a busca fica guardada sem o produto).
- **Ninguém lê direto:** as tabelas `admins_plataforma` e `auditoria_plataforma` não têm permissão para ninguém. Só as funções do painel leem e gravam.

O teste `tests/plataforma.test.js` confere tudo isso nos dois caminhos: instalação nova (`schema.sql`) e projeto que já existe (`schema.sql` + a correção, rodada 2 vezes).

**Para ligar:**
1. No SQL Editor, rodar `supabase/correcao-17-plataforma.sql`.
2. Em **Authentication › Multi-Factor**, deixar o **TOTP** ligado.
3. Entrar no Calculéo uma vez com o seu e-mail.
4. Rodar o trecho do fim da correção, com o seu e-mail, para entrar na lista.
5. Publicar de novo a Edge Function `buscar-concorrentes`, para aparecer a mensagem do limite do mês. Até lá, a busca acima do limite é recusada do mesmo jeito, só que com a mensagem genérica.

## Código da empresa (correção 17)

Toda empresa tem um código de 6 letras e números, por exemplo `K7QP9M`, para o suporte achar a empresa mesmo se o nome mudar.
- Ele não usa os caracteres que confundem (0/O e 1/I/L).
- É sorteado, então não revela quantas empresas existem.
- Nunca se repete e nunca muda: o banco recusa a troca, até pelo SQL Editor.
- As empresas que já existiam recebem um código quando a correção roda.
- O painel da plataforma mostra o código, e a auditoria escreve "Nome (CÓDIGO)".

## Convite por link secreto (correção 17)

Conta nova só nasce por um link que o admin gera na tela e manda pelo WhatsApp. O cadastro aberto fica desligado. O link vale uma vez, vence em 24 horas, e gerar outro cancela o anterior.

- **Quem gera:** o admin da empresa, para a própria equipe, e o admin da plataforma (com as 2 etapas). Quem decide é o banco, com o login de quem pede (`pode_gerar_link`, `preparar_link_convite` e `preparar_link_senha`). Só depois a Edge Function `gerar-link` usa a chave de serviço para criar o link. Essa chave fica só no Supabase.
- **Sem roubo de conta:** o link entra na conta da pessoa. Por isso:
  - quem já tem senha não recebe link: o convite fica salvo, e a pessoa entra com a senha dela;
  - o admin da empresa só gera link para quem não tem empresa nem convite fora das empresas em que ele é admin;
  - para um admin da plataforma, só ele mesmo gera o link, com as 2 etapas.
- **A prévia do WhatsApp não gasta o link:** o link é do próprio Calculéo, com o código depois do `#`. Quem usa o código é o app, quando a pessoa abre.
- **Registro:** o admin da empresa fica no histórico da empresa. O admin da plataforma fica na auditoria.

Os testes estão em `tests/plataforma.test.js` (quem pode e para quem) e em `tests/gerar-link.test.js` (a função). O passo a passo para ligar fica no PASSOS-SUPABASE.

## O que fica para depois

- **Fotos:** hoje vão dentro do produto. No banco, o melhor é guardar no Storage do Supabase e deixar só o endereço na tabela.
- **Edição ao mesmo tempo:** se duas pessoas mudarem o mesmo produto, vale a última gravação.
