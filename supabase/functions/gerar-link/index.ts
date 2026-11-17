// Edge Function "gerar-link": link secreto de convite ou de senha nova, para mandar pelo WhatsApp, sem e-mail (correção 17).
// Quem pode é o banco que decide, com o JWT de quem pede: preparar_link_convite / preparar_link_senha (admin da plataforma
// com as 2 etapas ou dono da empresa, e nunca um link que entre na conta de quem é de outra empresa). Só depois a função usa
// a chave de serviço (SUPABASE_SERVICE_ROLE_KEY, que o Supabase já põe nas Edge Functions; nunca no repositório) para gerar o
// link no Auth, sem mandar e-mail. O link vale 1 vez, vence no "Email OTP Expiration" (24 h) e gerar outro invalida o anterior.
// O link é do próprio Calculéo, com o token depois do #: a prévia do WhatsApp (e antivírus de e-mail) abre o endereço, mas não
// roda o app, então não gasta o link; quem gasta é o app, no clique da pessoa (verifyOtp com token_hash e type).
// Pedido: POST { tipo: 'convite', empresa, email, papel } ou { tipo: 'senha', empresa, usuario }
// Resposta: { link, email }; link null = a pessoa já tem senha: o convite ficou salvo e ela entra com a senha dela.
// Testes: tests/gerar-link.test.js.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const NAO_LIGADO = 'O convite por link ainda não foi ligado no Supabase.';
// Erros do banco -> texto de tela (combinado com a Wednesday).
const ERROS: Record<string, [number, string]> = {
  'sem permissão': [403, 'Só o admin da empresa pode gerar links.'],
  'e-mail inválido': [400, 'Digite um e-mail válido, por exemplo nome@empresa.com.br.'],
  'papel inválido': [400, 'Escolha Membro ou Admin.'],
  'essa pessoa já está na empresa': [400, 'Essa pessoa já está na empresa.'],
  'essa pessoa não está na empresa': [400, 'Essa pessoa não está nesta empresa.'],
  'empresa não encontrada': [400, 'Empresa não encontrada.'], // 400, não 404: a tela trata 404 como "função não publicada"
  'link não permitido': [403, 'Este link não pode ser gerado por aqui. Fale com o suporte do Calculéo.'],
};

type Json = Record<string, any>;

class Falha extends Error {
  status: number;
  constructor(status: number, mensagem: string) {
    super(mensagem);
    this.status = status;
  }
}

// O banco confere quem pede e devolve { email, tipo } ('invite' | 'magiclink' | 'recovery' | null).
async function preparar(corpo: Json, autorizacao: string) {
  const url = Deno.env.get('SUPABASE_URL');
  const chave = Deno.env.get('SUPABASE_ANON_KEY') ?? Object.values(JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}'))[0];
  const [funcao, args] = corpo.tipo === 'convite'
    ? ['preparar_link_convite', { empresa: corpo.empresa, email: String(corpo.email ?? ''), papel: corpo.papel ?? 'membro' }]
    : ['preparar_link_senha', { empresa: corpo.empresa, usuario: corpo.usuario }];
  const r = await fetch(`${url}/rest/v1/rpc/${funcao}`, {
    method: 'POST',
    headers: { apikey: String(chave), authorization: autorizacao, 'content-type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (r.status === 401) throw new Falha(401, 'Entre no Calculéo de novo.');
  const dados = await r.json().catch(() => null);
  if (r.ok && dados?.email) return dados;
  const erro = ERROS[dados?.message];
  if (erro) throw new Falha(...erro);
  if (dados?.code === 'PGRST202') throw new Falha(503, NAO_LIGADO); // falta a correção 17
  throw new Falha(502, 'Não deu para gerar o link agora. Tente de novo.');
}

// Gera no Auth (sem e-mail) e monta o link do app com o token depois do #.
async function gerarNoAuth(tipo: string, email: string, volta: string) {
  const chave = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Object.values(JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}'))[0];
  if (!chave) throw new Falha(503, NAO_LIGADO);
  const r = await fetch(`${Deno.env.get('SUPABASE_URL')}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: { apikey: String(chave), authorization: `Bearer ${chave}`, 'content-type': 'application/json' },
    body: JSON.stringify({ type: tipo, email }),
  });
  const d = await r.json().catch(() => null);
  if (!r.ok || !d?.hashed_token) throw new Falha(502, 'Não deu para gerar o link agora. Tente de novo.');
  return `${volta}#link=${encodeURIComponent(d.hashed_token)}&tipo=${encodeURIComponent(d.verification_type ?? tipo)}`;
}

async function atender(req: Request) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const responder = (status: number, corpo: Json) => new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'content-type': 'application/json' } });
  try {
    if (req.method !== 'POST') throw new Falha(405, 'Use POST.');
    const autorizacao = req.headers.get('authorization') ?? '';
    const corpo = await req.json().catch(() => ({}));
    if (!autorizacao.startsWith('Bearer ')) throw new Falha(401, 'Entre no Calculéo de novo.');
    // O link volta para o endereço de onde o pedido veio (o navegador põe o Origin: 8090, Vercel, calculeo.com.br).
    const origem = req.headers.get('origin') ?? '';
    const pedidoOk = corpo.empresa && (corpo.tipo === 'convite' ? corpo.email : corpo.tipo === 'senha' && corpo.usuario);
    if (!pedidoOk || !/^https?:\/\/[^/\s]+$/.test(origem)) throw new Falha(400, 'Pedido inválido.');
    if (!Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') && !Deno.env.get('SUPABASE_SECRET_KEYS')) throw new Falha(503, NAO_LIGADO);
    const { email, tipo } = await preparar(corpo, autorizacao);
    if (!tipo) return responder(200, { link: null, email });
    return responder(200, { link: await gerarNoAuth(tipo, email, `${origem}/`), email });
  } catch (erro) {
    if (erro instanceof Falha) return responder(erro.status, { erro: erro.message });
    console.error(erro instanceof Error ? erro.name : 'erro'); // sem e-mail, token nem chave no log
    return responder(500, { erro: 'Não deu para gerar o link agora. Tente de novo.' });
  }
}

// No Supabase (Deno) atende os pedidos; no Node (testes) o Deno.serve falso recebe o atender.
const deno = (globalThis as any).Deno;
if (deno?.serve) deno.serve(atender);
