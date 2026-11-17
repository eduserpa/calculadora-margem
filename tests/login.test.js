// Login sem o "Primeiro acesso" (1.2.1): o "Entrar" cria a conta do convidado quando ela ainda não existe.
// Supabase Auth de mentira com as mensagens de erro de verdade.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entrarComSenha, reenviarConfirmacao, esqueciSenha, trocarSenha } from '../src/nuvem.js';

const SESSAO = { data: { session: { user: {} } }, error: null };
const erro = (message) => ({ data: { session: null }, error: { message } });
// contas: e-mail -> senha; convidados: e-mails que o hook deixa criar
function authFalso(contas, convidados = []) {
  const chamou = [];
  return {
    chamou,
    async signInWithPassword({ email, password }) {
      chamou.push('login');
      return contas[email] === password ? SESSAO : erro('Invalid login credentials');
    },
    async signUp({ email, password }) {
      chamou.push('criar');
      if (email in contas) return erro('User already registered');
      if (!convidados.includes(email)) return erro('Error running hook URI: pg-functions://postgres/public/antes_de_criar_usuario: Este e-mail não foi convidado.');
      contas[email] = password;
      return SESSAO;
    },
  };
}

test('login: quem tem conta entra só com o login', async () => {
  const auth = authFalso({ 'ana@a.com': 'senha1234' });
  await entrarComSenha(' Ana@A.com ', 'senha1234', auth);
  assert.deepEqual(auth.chamou, ['login']);
});

test('login: 1º acesso do convidado cria a conta e entra direto', async () => {
  const auth = authFalso({}, ['bia@a.com']);
  await entrarComSenha('bia@a.com', 'nova-senha', auth);
  assert.deepEqual(auth.chamou, ['login', 'criar']);
  await entrarComSenha('bia@a.com', 'nova-senha', auth); // da 2ª vez em diante, só o login
  assert.deepEqual(auth.chamou, ['login', 'criar', 'login']);
});

test('login: senha errada de quem tem conta diz só "E-mail ou senha incorretos"', async () => {
  const auth = authFalso({ 'ana@a.com': 'senha1234' });
  await assert.rejects(entrarComSenha('ana@a.com', 'outra-senha', auth), { message: 'E-mail ou senha incorretos.' });
});

test('login: e-mail sem convite não cria conta', async () => {
  const contas = {};
  await assert.rejects(entrarComSenha('ze@x.com', 'senha1234', authFalso(contas)), { message: 'Este e-mail não tem acesso. Peça um convite ao admin.' });
  assert.deepEqual(contas, {});
});

test('login: senha curta nem chega no Supabase', async () => {
  const auth = authFalso({}, ['bia@a.com']);
  await assert.rejects(entrarComSenha('bia@a.com', '1234567', auth), /8 caracteres/);
  assert.deepEqual(auth.chamou, []);
});

test('login: outra falha do login (internet, limite) não tenta criar conta', async () => {
  const auth = authFalso({});
  auth.signInWithPassword = async () => erro('Request rate limit reached. Try again in 60 seconds');
  await assert.rejects(entrarComSenha('bia@a.com', 'senha1234', auth), /Espere 1 minuto/);
  assert.deepEqual(auth.chamou, []);
});

// ---------- confirmação de e-mail (Confirm email ligado no Supabase) e Esqueci a senha (Wednesday 17/11) ----------
const SEM_SESSAO = (identities = [{ id: 'i' }]) => ({ data: { session: null, user: { identities } }, error: null });

test('confirmação ligada: 1º acesso do convidado não entra; a tela diz "Enviamos um link" e o link volta para o site', async () => {
  const auth = authFalso({}, ['bia@a.com']);
  let opcoes;
  auth.signUp = async ({ options }) => (auth.chamou.push('criar'), (opcoes = options), SEM_SESSAO());
  assert.deepEqual(await entrarComSenha(' Bia@A.com ', 'nova-senha', auth), { confirmar: 'bia@a.com' });
  assert.deepEqual(auth.chamou, ['login', 'criar']);
  assert.ok('emailRedirectTo' in opcoes);
});

test('confirmação ligada: conta que já existe com senha errada diz só "E-mail ou senha incorretos" (não conta que existe)', async () => {
  const auth = authFalso({ 'ana@a.com': 'senha1234' });
  auth.signUp = async () => SEM_SESSAO([]); // o Supabase devolve um usuário sem identidades em vez de erro
  await assert.rejects(entrarComSenha('ana@a.com', 'outra-senha', auth), { message: 'E-mail ou senha incorretos.' });
});

test('confirmação ligada: quem volta sem ter confirmado vai para a mesma tela e pode pedir outro link na hora', async () => {
  const auth = authFalso({});
  auth.signInWithPassword = async () => erro('Email not confirmed');
  assert.deepEqual(await entrarComSenha('bia@a.com', 'nova-senha', auth), { confirmar: 'bia@a.com', jaPode: true });
});

test('reenviar: manda de novo o link de cadastro; limite do Supabase vira "Espere 1 minuto"', async () => {
  let pedido;
  await reenviarConfirmacao(' Bia@A.com ', { resend: async (p) => ((pedido = p), { error: null }) });
  assert.equal(pedido.type, 'signup');
  assert.equal(pedido.email, 'bia@a.com');
  await assert.rejects(reenviarConfirmacao('bia@a.com', { resend: async () => ({ error: { message: 'For security purposes, you can only request this after 52 seconds.' } }) }), /Espere 1 minuto/);
});

test('esqueci a senha: e-mail limpo e a mesma resposta para quem tem e quem não tem conta', async () => {
  let enviado;
  await esqueciSenha(' Ana@A.com ', { resetPasswordForEmail: async (e) => ((enviado = e), { error: null }) });
  assert.equal(enviado, 'ana@a.com');
  await assert.rejects(esqueciSenha('ana@a.com', { resetPasswordForEmail: async () => ({ error: { message: 'Request rate limit reached' } }) }), /Espere 1 minuto/);
});

test('senha nova: derruba as outras sessões depois de salvar (a de quem criou a conta com outra senha)', async () => {
  const chamou = [];
  await trocarSenha('senha1234', {}, { updateUser: async () => (chamou.push('senha'), { error: null }), signOut: async (o) => (chamou.push(o.scope), { error: null }) });
  assert.deepEqual(chamou, ['senha', 'others']);
});

test('senha nova: curta não sai; a mesma da antiga só vale na confirmação do cadastro', async () => {
  const mesma = { updateUser: async () => ({ error: { message: 'New password should be different from the old password.' } }), signOut: async () => ({ error: null }) };
  await assert.rejects(trocarSenha('1234567', {}, mesma), /8 caracteres/);
  await assert.rejects(trocarSenha('senha1234', {}, mesma), /diferente da antiga/);
  await trocarSenha('senha1234', { mesmaVale: true }, mesma);
});
