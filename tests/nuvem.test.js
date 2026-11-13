// Ida e volta entre os dados das telas e as linhas das tabelas, e o "só o que mudou" do envio.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paraLinhas, deLinhas, diferenca, CHAVES } from '../src/nuvem.js';
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
