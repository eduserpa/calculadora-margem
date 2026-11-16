// Login sem o "Primeiro acesso" (1.2.1): o "Entrar" cria a conta do convidado quando ela ainda não existe.
// Supabase Auth de mentira com as mensagens de erro de verdade.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entrarComSenha } from '../src/nuvem.js';

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
