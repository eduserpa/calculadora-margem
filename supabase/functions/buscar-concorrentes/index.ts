// Edge Function "buscar-concorrentes": anúncios do Mercado Livre para uma palavra-chave, pelo Apify (quem lê o ML são os
// servidores do Apify; o Calculéo não acessa o ML). Sem segredo no código: APIFY_TOKEN vem dos Secrets do Supabase.
// Só para quem está logado e é da empresa pedida, e com limite de gasto: antes do Apify, registrar_busca (correção 13, com o
// JWT de quem pede) confere a empresa e recusa o mesmo produto há menos de 10 min e mais de 30 buscas da empresa em 24 h.
// Pedido: POST { empresa, produto, termo }   Resposta: { itens: [...] } como o Apify devolve; quem tira os nossos e monta os candidatos
// é o app (candidatosDoApify em src/concorrentes.js), igual na demo local (servidor_calculeo.py). Testes: tests/buscar-concorrentes.test.js.

// maxPages 1 (~50 anúncios) e teto de US$ 0,30 por busca. timeout 140 s: a Edge Function não pode passar de 150 s.
const ATOR = 'https://api.apify.com/v2/acts/karamelo~mercadolivre-scraper-brasil-portugues/run-sync-get-dataset-items?maxTotalChargeUsd=0.30&timeout=140';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Json = Record<string, any>;

class Falha extends Error {
  status: number;
  constructor(status: number, mensagem: string) {
    super(mensagem);
    this.status = status;
  }
}

// Conta a busca no banco (ou diz por que não pode). Falhou a chamada: não busca (sem limite, não gasta).
async function registrarBusca(empresa: string, produto: string, autorizacao: string) {
  const url = Deno.env.get('SUPABASE_URL');
  const chave = Deno.env.get('SUPABASE_ANON_KEY') ?? Object.values(JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}'))[0];
  const r = await fetch(`${url}/rest/v1/rpc/registrar_busca`, {
    method: 'POST',
    headers: { apikey: String(chave), authorization: autorizacao, 'content-type': 'application/json' },
    body: JSON.stringify({ empresa, produto }),
  });
  if (r.status === 401) throw new Falha(401, 'Entre no Calculéo de novo.');
  const motivo = r.ok ? await r.json().catch(() => null) : null;
  if (motivo === 'fora') throw new Falha(403, 'Você não é desta empresa.');
  if (motivo === 'so_admin') throw new Falha(403, 'Só o admin da empresa pode buscar concorrentes.');
  if (motivo === 'produto') throw new Falha(429, 'Este produto foi buscado há menos de 10 minutos. Use o resultado guardado.');
  if (motivo === 'dia') throw new Falha(429, 'A empresa já fez 30 buscas nas últimas 24 horas. Tente de novo amanhã.');
  if (motivo !== 'ok') throw new Falha(503, 'A busca de concorrentes ainda não foi ligada (falta rodar a correção 13 no Supabase).');
}

async function buscarNoApify(termo: string) {
  const token = Deno.env.get('APIFY_TOKEN');
  if (!token) throw new Falha(503, 'A busca de concorrentes ainda não foi ligada (falta o APIFY_TOKEN nos Secrets do Supabase).');
  const r = await fetch(ATOR, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ keyword: termo, maxPages: 1, sort: 'relevance', promoted: false }),
  });
  if (r.status === 401 || r.status === 403) throw new Falha(502, 'O Apify recusou a chave. Confira o APIFY_TOKEN nos Secrets do Supabase.');
  if (r.status === 402) throw new Falha(503, 'Acabaram os créditos do Apify deste mês.');
  if (!r.ok) throw new Falha(502, 'A busca no Apify falhou. Tente de novo em instantes.');
  const itens = await r.json().catch(() => null);
  return Array.isArray(itens) ? itens : [];
}

async function atender(req: Request) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const responder = (status: number, corpo: Json) => new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'content-type': 'application/json' } });
  try {
    if (req.method !== 'POST') throw new Falha(405, 'Use POST.');
    const autorizacao = req.headers.get('authorization') ?? '';
    const { empresa, produto, termo } = await req.json().catch(() => ({}));
    if (!autorizacao.startsWith('Bearer ') || !empresa) throw new Falha(401, 'Entre no Calculéo de novo.');
    const busca = String(termo ?? '').trim().slice(0, 120);
    if (busca.length < 3 || !produto) throw new Falha(400, 'O nome do produto é curto demais para buscar.');
    if (!Deno.env.get('APIFY_TOKEN')) throw new Falha(503, 'A busca de concorrentes ainda não foi ligada (falta o APIFY_TOKEN nos Secrets do Supabase).');
    await registrarBusca(String(empresa), String(produto), autorizacao);
    return responder(200, { itens: await buscarNoApify(busca) });
  } catch (erro) {
    if (erro instanceof Falha) return responder(erro.status, { erro: erro.message });
    console.error(erro);
    return responder(500, { erro: 'Não deu para buscar os concorrentes agora. Tente de novo.' });
  }
}

// No Supabase (Deno) atende os pedidos; no Node (testes) o Deno.serve falso recebe o atender.
const deno = (globalThis as any).Deno;
if (deno?.serve) deno.serve(atender);
