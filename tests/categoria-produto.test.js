// Categoria do Mercado Livre POR PRODUTO (Eduardo 17/11; banco na correção 20, tests/categoria-ml.test.js): a redução da comissão
// de R$ 150 a R$ 700 vem da categoria do produto; sem categoria, a do canal (como antes). Conta, troca de produto, Início/planilha
// e a ida e volta da nuvem.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { comissaoETaxaFixa } from '../src/calculos/canal.js';
import { calcularMargem } from '../src/calculos/margem.js';
import { canalDoProduto, precosSalvos, produtoVazio } from '../src/produtos.js';
import { usarCategoriasMl, reducaoDaCategoria, OUTRA } from '../src/categorias-ml.js';
import { dados } from '../src/dados.js';
import { paraLinhas, deLinhas } from '../src/nuvem.js';

const { canais } = JSON.parse(readFileSync(new URL('../data/canais.json', import.meta.url), 'utf8'));
const { categorias } = JSON.parse(readFileSync(new URL('../data/ml-categorias.json', import.meta.url), 'utf8'));
const ml = { ...canais.mercadolivre, tipo_anuncio: 'premium', comissao_propria: 0 };
const DOBRADICAS = 'Aberturas > Dobradiças'; // 3 pontos no Premium, 1 no Clássico
const comissao = (canal, preco = 300) => comissaoETaxaFixa(canal, preco).comissao;

test('a redução vem da categoria do produto; sem categoria, a do canal; fora da faixa, nada', () => {
  usarCategoriasMl(categorias);
  assert.deepEqual(reducaoDaCategoria(DOBRADICAS), { premium: 3, classico: 1 });
  assert.deepEqual(reducaoDaCategoria(OUTRA), { premium: 0, classico: 0 }, 'Outra categoria: sem redução');
  const cheia = ml.comissao.premium;
  const comCat = canalDoProduto(ml, { categoriaMl: DOBRADICAS }, 'mercadolivre');
  assert.equal(comissao(comCat), cheia - 3);
  assert.equal(comCat.categoriaDoProduto, true);
  assert.equal(comissao(comCat, 100), cheia, 'abaixo de R$ 150 não tem redução');
  assert.equal(canalDoProduto(ml, { categoriaMl: null }, 'mercadolivre'), ml, 'sem categoria: o canal como está');
  assert.equal(comissao(canalDoProduto(ml, {}, 'mercadolivre')), cheia - ml.faixa_reduzida.reducao.premium, 'produto antigo: a do canal');
  assert.equal(comissao(canalDoProduto(ml, { categoriaMl: OUTRA }, 'mercadolivre')), cheia);
  assert.equal(comissao(canalDoProduto({ ...ml, tipo_anuncio: 'classico' }, { categoriaMl: DOBRADICAS }, 'mercadolivre')), ml.comissao.classico - 1);
  assert.equal(canalDoProduto(canais.shopee, { categoriaMl: DOBRADICAS }, 'shopee'), canais.shopee, 'outros canais não têm categoria do ML');
});

test('troca de produto: cada um com a sua categoria, na mesma conta', () => {
  usarCategoriasMl(categorias);
  const conta = (p) => calcularMargem({ preco: 300, cmv: 100, canal: canalDoProduto(ml, p, 'mercadolivre'), pesoG: 300 }).lucro;
  const semReducao = conta({ categoriaMl: OUTRA }), dobradica = conta({ categoriaMl: DOBRADICAS }), padrao = conta({});
  assert.equal(Math.round((dobradica - semReducao) * 100) / 100, 9, '3 pontos de R$ 300');
  assert.notEqual(padrao, dobradica);
  assert.equal(conta({ categoriaMl: DOBRADICAS, impostosCanal: { mercadolivre: 15 } }) < dobradica, true, 'imposto do produto e categoria juntos');
});

test('lista ainda não carregada: a categoria do produto não muda a conta (fica a do canal)', () => {
  usarCategoriasMl(null);
  assert.equal(canalDoProduto(ml, { categoriaMl: DOBRADICAS }, 'mercadolivre'), ml);
  usarCategoriasMl(categorias);
});

test('Início e planilha (precosSalvos) usam a categoria do produto', () => {
  usarCategoriasMl(categorias);
  const antes = { ...dados };
  try {
    const p = (id, categoriaMl) => ({ ...produtoVazio(), id, nome: id, categoriaMl, revenda: { custoCompra: 100, freteFornecedor: 0, embalagem: 0, outros: 0 } });
    Object.assign(dados, {
      canais: { mercadolivre: ml }, empresa: null, produtos: [p('a', DOBRADICAS), p('b', null)],
      precificacoes: { a: { mercadolivre: { de: 300, desconto: 0 } }, b: { mercadolivre: { de: 300, desconto: 0 } } },
    });
    const [a, b] = precosSalvos();
    assert.equal(a.canal.faixa_reduzida.reducao.premium, 3);
    assert.equal(b.canal.faixa_reduzida.reducao.premium, ml.faixa_reduzida.reducao.premium);
  } finally {
    Object.assign(dados, antes);
  }
});

test('nuvem: categoria_ml vai e volta; sem categoria (ou vazia) grava null', () => {
  const d = { produtos: [{ ...produtoVazio(), id: 'a', nome: 'A', categoriaMl: DOBRADICAS }, { ...produtoVazio(), id: 'b', nome: 'B' }, { ...produtoVazio(), id: 'c', nome: 'C', categoriaMl: '' }], precificacoes: {}, canais: null, empresa: null };
  const l = paraLinhas(d, 'E');
  assert.deepEqual(l.produtos.map((p) => p.categoria_ml), [DOBRADICAS, null, null]);
  const volta = deLinhas({ ...JSON.parse(JSON.stringify(l)), itens_kit: [], precificacoes: [], config_canais: [] });
  assert.deepEqual(volta.produtos.map((p) => p.categoriaMl), [DOBRADICAS, null, null]);
});
