import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calcularMargem, precoMinimo, margemMaxima, precoMelhorAbaixo } from '../src/calculos/margem.js';
import { precoPor, descontoPeloPor } from '../src/calculos/preco-de-por.js';
import { custoRevenda, custoFabricacao, custoKit } from '../src/calculos/custo-produto.js';
import { pesoParaFrete } from '../src/calculos/peso.js';

const ler = (arquivo) => JSON.parse(readFileSync(new URL(arquivo, import.meta.url), 'utf8'));
const { canais } = ler('../data/canais.json');
const { casos } = ler('./casos.json');

// Os resultados esperados estão com 4 casas.
const perto = (obtido, esperado, nome) =>
  assert.ok(Math.abs(obtido - esperado) < 0.0001, `${nome}: deu ${obtido}, esperado ${esperado}`);

const canalCom = (id, ajustes = {}) => ({ ...structuredClone(canais[id]), ...ajustes });

const conferir = {
  margem: ({ canal, preco, cmv, peso_g, ajustes }, esp) => {
    const r = calcularMargem({ preco, cmv, canal: canalCom(canal, ajustes), pesoG: peso_g });
    perto(r.lucro, esp.lucro, 'lucro');
    perto(r.margem, esp.margem, 'margem');
    perto(r.comissaoPercentual, esp.comissao_percentual, 'comissão %');
    perto(r.freteCanal, esp.frete_canal, 'frete do canal');
  },
  preco_minimo: ({ canal, cmv, margem_desejada, peso_g }, esp) =>
    assert.equal(precoMinimo({ cmv, canal: canalCom(canal), pesoG: peso_g, margemDesejada: margem_desejada }), esp.preco),
  preco_por: ({ preco_de, desconto_pct }, esp) => assert.equal(precoPor(preco_de, desconto_pct), esp.preco_por),
  cmv_revenda: (e, esp) =>
    perto(custoRevenda({ custoCompra: e.custo_aquisicao, freteFornecedor: e.frete_fornecedor, embalagem: e.embalagem, outros: e.outros }), esp.cmv, 'custo'),
  cmv_fabricante: (e, esp) =>
    perto(custoFabricacao({
      materiais: e.materias.map(([precoUnitario, quantidade]) => ({ precoUnitario, quantidade })),
      maoDeObra: e.maos_de_obra.map((valor) => ({ valor })),
      embalagem: e.embalagem, freteInsumos: e.frete_insumos, outros: e.outros,
    }), esp.cmv, 'custo'),
  cmv_kit: (e, esp) => perto(custoKit(e.itens.map(([custo, quantidade]) => ({ custo, quantidade }))), esp.cmv, 'custo'),
  peso_considerado: (e, esp) => perto(pesoParaFrete(e.peso_g, e.comprimento, e.largura, e.altura), esp.peso_g, 'peso'),
};

for (const [i, caso] of casos.entries()) {
  test(`${i + 1}. ${caso.funcao} ${JSON.stringify(caso.entrada)}`, () => conferir[caso.funcao](caso.entrada, caso.esperado));
}

test('desconto calculado a partir do preço POR volta no mesmo POR', () => {
  for (const [de, por] of [[199.9, 139.93], [89.9, 76.42], [100, 67]]) {
    assert.equal(precoPor(de, descontoPeloPor(de, por)), por);
  }
  assert.equal(descontoPeloPor(100, 120), 0);
  assert.equal(descontoPeloPor(0, 50), 0);
});

test('margem máxima do canal: 100% menos o que é % do preço (custo fixo não conta)', () => {
  // Loja online: sem comissão; impostos 10% + taxa financeira 5% + afiliado 3% = 18% do preço; embalagem fixa não entra
  assert.equal(margemMaxima({ canal: canalCom('lojapropria', { afiliado_ativo: true, afiliado: 3, embalagem: 4 }) }), 82);
  // passar do teto não tem preço; abaixo dele tem
  assert.equal(precoMinimo({ cmv: 10, canal: canalCom('lojapropria'), margemDesejada: 85.5 }), 0);
  assert.ok(precoMinimo({ cmv: 10, canal: canalCom('lojapropria'), margemDesejada: 84.5 }) > 0);
});

test('preço mínimo: a margem nele nunca fica abaixo do alvo, e 1 centavo a menos já não chega', () => {
  for (const [id, cmv, pesoG] of [['mercadolivre', 79.07, 3300], ['shopee', 79.07, 300], ['lojapropria', 33.33, 300]]) {
    for (const alvo of [10, 15, 20.5, 33.33]) {
      const minimo = precoMinimo({ cmv, canal: canais[id], pesoG, margemDesejada: alvo });
      assert.ok(calcularMargem({ preco: minimo, cmv, canal: canais[id], pesoG }).margem >= alvo, `${id} ${alvo}%: ${minimo}`);
      assert.ok(calcularMargem({ preco: minimo - 0.01, cmv, canal: canais[id], pesoG }).margem < alvo, `${id} ${alvo}%: ${minimo} não é o menor`);
    }
  }
});

test('preço menor com mais lucro: só logo abaixo de uma virada de faixa, e só se o lucro for maior', () => {
  // ML, 5,4 kg: de R$ 200 em diante o frete é R$ 4,40 mais caro; a R$ 202,90 compensa descer para R$ 199,99
  const ml = { cmv: 89.08, canal: canais.mercadolivre, pesoG: 5400 };
  const r = precoMelhorAbaixo({ preco: 202.9, ...ml });
  assert.equal(r.preco, 199.99);
  assert.equal(r.motivo, 'freteCanal');
  perto(r.economia, 4.4, 'frete mais barato');
  assert.ok(r.lucro > calcularMargem({ preco: 202.9, ...ml }).lucro);
  perto(r.lucro, calcularMargem({ preco: 199.99, ...ml }).lucro, 'lucro sugerido = a conta da margem');
  // a R$ 210 os R$ 10,01 a menos já não compensam: nada a sugerir
  assert.equal(precoMelhorAbaixo({ preco: 210, ...ml }), null);
  // canal sem faixas, ou preço abaixo de todas as viradas: nada
  assert.equal(precoMelhorAbaixo({ preco: 100, cmv: 30, canal: canais.lojapropria }), null);
  assert.equal(precoMelhorAbaixo({ preco: 79, cmv: 30, canal: canais.shopee }), null);
});

test('preço mínimo devolve 0 quando as taxas não deixam chegar na margem', () => {
  assert.equal(precoMinimo({ cmv: 10, canal: canalCom('lojapropria', { impostos: 70 }), margemDesejada: 30 }), 0);
});
