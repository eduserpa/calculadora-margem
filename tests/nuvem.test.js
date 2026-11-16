// Ida e volta entre os dados das telas e as linhas das tabelas, e o "só o que mudou" do envio.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paraLinhas, deLinhas, diferenca, CHAVES, fotosParaStorage, lembrarDoBanco, pendentesDeEnvio, apagarFotosOrfas, caminhoDaFoto, guardadoNaNuvem, tudo } from '../src/nuvem.js';
import { produtoVazio } from '../src/produtos.js';

const E = 'empresa-1';
const banco = { ...produtoVazio(), id: 'p1', nome: 'Banco', sku: '1058', revenda: { custoCompra: 309.45, freteFornecedor: 0, embalagem: 0, outros: 0 }, pesoG: 4000, comprimento: 45, largura: 70, altura: 40, fotos: ['data:image/webp;base64,AAA'], atualizadoEm: '2026-11-13T10:00:00Z' };
const kit = { ...produtoVazio(), id: 'k1', nome: 'Kit 2 bancos', sku: '', tipoCusto: 'kit', kit: [{ produtoId: 'p1', quantidade: 2 }, { produtoId: '', quantidade: 1 }], atualizadoEm: '2026-11-13T10:00:00Z' };
const dados = {
  produtos: [banco, kit],
  precificacoes: { p1: { mercadolivre: { de: 735.22, desconto: 0, salvoEm: '2026-11-13T10:00:00Z' }, shopee: { de: 0, desconto: 0 } } },
  canais: { shopee: { tipo: 'faixas', impostos: 12 } },
  empresa: { impostos: 8 },
};
const tabelas = (l) => Object.fromEntries(Object.entries(l).map(([t, v]) => [t, JSON.parse(JSON.stringify(v))]));

test('nuvem: dados -> linhas -> dados volta igual', () => {
  const l = paraLinhas(dados, E);
  assert.equal(l.produtos.length, 2);
  assert.equal(l.produtos[1].sku, null, 'SKU vazio vira null');
  assert.deepEqual(l.itens_kit, [{ empresa_id: E, kit_id: 'k1', produto_id: 'p1', quantidade: 2 }], 'item sem produto fica de fora');
  assert.equal(l.precificacoes.length, 1, 'preço zerado não vai');
  assert.deepEqual(l.config_canais.map((c) => c.canal), ['shopee', 'empresa']);
  assert.ok([...l.produtos, ...l.itens_kit, ...l.precificacoes, ...l.config_canais].every((r) => r.empresa_id === E));

  const volta = deLinhas(tabelas(l));
  assert.deepEqual(volta.produtos[0], banco);
  assert.deepEqual(volta.produtos[1].kit, [{ produtoId: 'p1', quantidade: 2 }]);
  assert.deepEqual(volta.precificacoes, { p1: { mercadolivre: dados.precificacoes.p1.mercadolivre } });
  assert.deepEqual(volta.canais, dados.canais);
  assert.deepEqual(volta.empresa, { impostos: 8 });
});

test('nuvem: empresa sem nada salvo volta com as taxas padrão', () => {
  assert.deepEqual(deLinhas({ produtos: [], itens_kit: [], precificacoes: [], config_canais: [] }), { produtos: [], precificacoes: {}, canais: null, empresa: null });
});

test('nuvem: só manda o que mudou e apaga o que saiu', () => {
  const l = paraLinhas(dados, E);
  const enviadas = Object.fromEntries(Object.entries(CHAVES).map(([t, chave]) => [t, new Map(l[t].map((r) => [chave(r), JSON.stringify(r)]))]));
  const depois = structuredClone(dados);
  depois.produtos[0].revenda.custoCompra = 320;
  depois.produtos.splice(1, 1); // tira o kit
  depois.precificacoes.p1.mercadolivre.de = 749.9;
  const d = diferenca(enviadas, paraLinhas(depois, E));
  assert.deepEqual(d.produtos.mandar.map((r) => r.id), ['p1']);
  assert.deepEqual(d.produtos.apagar, ['k1']);
  assert.deepEqual(d.itens_kit.apagar, ['k1|p1']);
  assert.deepEqual(d.precificacoes.mandar.map((r) => r.preco_de), [749.9]);
  assert.deepEqual([d.config_canais.mandar, d.config_canais.apagar], [[], []]);
});

// Storage de mentira: guarda o que subiu; com `falhar`, recusa.
const storageFalso = (falhar = false) => {
  const subiu = [];
  return {
    subiu,
    storage: {
      from: () => ({
        upload: async (caminho, blob, opcoes) => (falhar ? { error: { message: 'sem rede' } } : (subiu.push({ caminho, tipo: blob.type, cache: opcoes.cacheControl }), { error: null })),
        getPublicUrl: (caminho) => ({ data: { publicUrl: `https://cdn/fotos/${caminho}` } }),
      }),
    },
  };
};
const PIXEL = 'data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==';

test('nuvem: foto em data URL sobe para o Storage e o produto guarda só o endereço', async () => {
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = (url, op) => (op?.method === 'HEAD' ? Promise.resolve({ ok: true }) : fetchOriginal(url, op));
  const s = storageFalso();
  const linhas = [{ id: 'p1', fotos: [PIXEL, 'https://ja/esta/no/storage.webp'] }, { id: 'p2', fotos: [] }];
  await fotosParaStorage(s, linhas);
  assert.equal(s.subiu.length, 1);
  assert.match(s.subiu[0].caminho, /^.+\/p1\/[0-9a-f]{24}\.webp$/, 'pasta do produto, nome pelo conteúdo');
  assert.equal(s.subiu[0].cache, '31536000');
  assert.deepEqual(linhas[0].fotos, [`https://cdn/fotos/${s.subiu[0].caminho}`, 'https://ja/esta/no/storage.webp']);
  await fotosParaStorage(s, [{ id: 'p3', fotos: [PIXEL] }]);
  assert.equal(s.subiu[1].caminho.split('/').pop(), s.subiu[0].caminho.split('/').pop(), 'mesma foto, mesmo nome (cache não erra)');
  globalThis.fetch = fetchOriginal;
});

test('nuvem: se o endereço público não abre (bucket ainda fechado), a foto não é trocada', async () => {
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = (url, op) => (op?.method === 'HEAD' ? Promise.resolve({ ok: false, status: 400 }) : fetchOriginal(url, op));
  try {
    const linhas = [{ id: 'p1', fotos: [PIXEL] }];
    await assert.rejects(fotosParaStorage(storageFalso(), linhas), /correcao-04/);
    assert.deepEqual(linhas[0].fotos, [PIXEL]);
  } finally {
    globalThis.fetch = fetchOriginal;
  }
});

test('nuvem: se a foto não sobe, nada se perde', async () => {
  const linhas = [{ id: 'p1', fotos: [PIXEL] }];
  await assert.rejects(fotosParaStorage(storageFalso(true), linhas), /foto não subiu/);
  assert.deepEqual(linhas[0].fotos, [PIXEL], 'continua com a foto original');
});

test('nuvem: abrir e salvar sem mexer em nada não reenvia nada (mesmo com o jsonb reordenado pelo banco)', () => {
  const l = paraLinhas(dados, E);
  // como o Postgres devolve: chaves do jsonb em outra ordem, mesmas informações
  const doBanco = tabelas(l);
  for (const r of doBanco.produtos) r.custo = { revenda: { outros: r.custo.revenda.outros, embalagem: r.custo.revenda.embalagem, custoCompra: r.custo.revenda.custoCompra, freteFornecedor: r.custo.revenda.freteFornecedor }, fabricacao: r.custo.fabricacao };
  const lidos = lembrarDoBanco(doBanco, E);
  const d = pendentesDeEnvio(lidos, E);
  for (const [tabela, { mandar, apagar }] of Object.entries(d)) assert.deepEqual([mandar.length, apagar.length], [0, 0], tabela);
});

// Banco e Storage de mentira para as fotos órfãs: `usos` diz quantos produtos ainda usam cada endereço.
const bancoFalso = (usos, { falharRemover = false } = {}) => {
  const removidos = [];
  return {
    removidos,
    rpc: async (_nome, { url }) => (usos === 'erro' ? { data: null, error: { message: 'função não existe' } } : { data: (usos[url] ?? 0) > 0, error: null }),
    storage: { from: () => ({ remove: async (caminhos) => { if (falharRemover) throw new Error('sem rede'); removidos.push(...caminhos); return { error: null }; } }) },
  };
};
const URL_FOTO = (empresa, nome) => `https://x.supabase.co/storage/v1/object/public/fotos/${empresa}/p1/${nome}.webp`;

test('nuvem: foto que ninguém usa mais sai do Storage; a que ainda é usada (ou é de outra empresa) fica', async () => {
  const solta = URL_FOTO('emp-a', 'aaa');
  const emUso = URL_FOTO('emp-a', 'bbb'); // outro produto (ou um clone em outra empresa) ainda usa
  const deOutra = URL_FOTO('emp-b', 'ccc');
  assert.equal(caminhoDaFoto(solta), 'emp-a/p1/aaa.webp');
  assert.equal(caminhoDaFoto('data:image/webp;base64,AAA'), null);
  const s = bancoFalso({ [emUso]: 1 });
  const apagadas = await apagarFotosOrfas(s, [solta, emUso, deOutra, 'data:image/webp;base64,AAA', solta], 'emp-a');
  assert.deepEqual(apagadas, ['emp-a/p1/aaa.webp']);
  assert.deepEqual(s.removidos, ['emp-a/p1/aaa.webp']);
});

test('nuvem: sem como conferir o uso (correcao-07 não rodada), não apaga nada', async () => {
  const s = bancoFalso('erro');
  assert.deepEqual(await apagarFotosOrfas(s, [URL_FOTO('emp-a', 'aaa')], 'emp-a'), []);
  assert.deepEqual(s.removidos, []);
});

test('nuvem: se apagar a foto falha, não trava nem lança erro', async () => {
  const apagadas = await apagarFotosOrfas(bancoFalso({}, { falharRemover: true }), [URL_FOTO('emp-a', 'aaa')], 'emp-a');
  assert.deepEqual(apagadas, []);
});

// Supabase de mentira como o de verdade: no máximo 1000 linhas por pedido, na ordem pedida.
function bancoGrande(tabelas) {
  const pedidos = [];
  const consulta = (linhas) => {
    const ordem = [];
    const q = {
      select: () => q,
      eq: () => q,
      order: (c) => (ordem.push(c), q),
      range(de, ate) {
        pedidos.push([de, ate]);
        const chave = (r) => ordem.map((c) => String(r[c])).join('|');
        const todas = [...linhas].sort((a, b) => chave(a).localeCompare(chave(b)));
        return Promise.resolve({ data: todas.slice(de, Math.min(ate + 1, de + 1000)), error: null });
      },
    };
    return q;
  };
  return { pedidos, from: (t) => consulta(tabelas[t] ?? []), rpc: (nome) => consulta(tabelas[nome] ?? []) };
}

test('nuvem: lê tudo em blocos de 1000 (1.200 produtos, 2.500 preços), sem repetir nem pular', async () => {
  const produtos = Array.from({ length: 1200 }, (_, i) => ({ ...produtoVazio(), id: `p${String(i).padStart(4, '0')}`, nome: `Produto ${i}` }));
  const canais = ['mercadolivre', 'shopee', 'shein', 'tiktokshop', 'atacado'];
  const precificacoes = Object.fromEntries(produtos.slice(0, 500).map((p) => [p.id, Object.fromEntries(canais.map((c) => [c, { de: 100, desconto: 0, salvoEm: '2026-11-16T10:00:00Z' }]))]));
  const l = paraLinhas({ produtos, precificacoes, canais: null, empresa: null }, E);
  assert.equal(l.precificacoes.length, 2500);
  const s = bancoGrande(l);
  const volta = await guardadoNaNuvem.ler(s);
  assert.equal(volta.produtos.length, 1200);
  assert.equal(new Set(volta.produtos.map((p) => p.id)).size, 1200);
  assert.equal(Object.values(volta.precificacoes).reduce((n, p) => n + Object.keys(p).length, 0), 2500);
  assert.deepEqual(s.pedidos.filter(([de]) => de === 2000), [[2000, 2999]], 'só os preços chegam ao 3º bloco');
});

test('nuvem: tudo() junta os blocos de uma função do banco e para no erro', async () => {
  const s = bancoGrande({ previa_copia: Array.from({ length: 2500 }, (_, i) => ({ id: `x${String(i).padStart(4, '0')}`, nome: 'Pia' })) });
  const r = await tudo(() => s.rpc('previa_copia').order('nome').order('id'));
  assert.equal(r.data.length, 2500);
  assert.equal(new Set(r.data.map((x) => x.id)).size, 2500);
  let n = 0;
  const erro = await tudo(() => ({ range: async () => (++n === 2 ? { data: null, error: { message: 'caiu' } } : { data: Array(1000).fill({}), error: null }) }));
  assert.equal(erro.error.message, 'caiu');
});
