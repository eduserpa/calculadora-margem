// Um teste por parâmetro que entra na margem (ver a auditoria em docs/08-taxas-dos-canais.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calcularMargem, precoMinimo } from '../src/calculos/margem.js';
import { comissaoETaxaFixa, freteMercadoLivre } from '../src/calculos/canal.js';
import { pesoParaFrete } from '../src/calculos/peso.js';

const { canais } = JSON.parse(readFileSync(new URL('../data/canais.json', import.meta.url), 'utf8'));
const canal = (id, ajustes = {}) => ({ ...structuredClone(canais[id]), ...ajustes });
const perto = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);

test('preço é arredondado para centavos antes da conta', () => {
  assert.equal(calcularMargem({ preco: 100.005, cmv: 10, canal: canal('lojapropria') }).preco, 100.01);
});

test('Shopee: comissão e taxa fixa mudam na virada da faixa (79,99 → 80,00)', () => {
  assert.deepEqual(comissaoETaxaFixa(canal('shopee'), 79.99), { comissao: 20, taxaFixa: 4.5 });
  assert.deepEqual(comissaoETaxaFixa(canal('shopee'), 80), { comissao: 14, taxaFixa: 16 });
  assert.deepEqual(comissaoETaxaFixa(canal('shopee'), 600), { comissao: 14, taxaFixa: 26 });
});

test('Shopee e TikTok: comissão digitada fora da tabela não vale (a tabela manda)', () => {
  assert.equal(calcularMargem({ preco: 100, cmv: 10, canal: canal('shopee', { comissao: 5 }) }).comissaoPercentual, 14);
});

test('TikTok: faixa vira em R$ 50 e a taxa de frete tem teto de R$ 50', () => {
  assert.deepEqual(comissaoETaxaFixa(canal('tiktokshop'), 49.99), { comissao: 10, taxaFixa: 4 });
  assert.deepEqual(comissaoETaxaFixa(canal('tiktokshop'), 50), { comissao: 6, taxaFixa: 6 });
  perto(calcularMargem({ preco: 100, cmv: 10, canal: canal('tiktokshop') }).freteCanal, 6);
  perto(calcularMargem({ preco: 1000, cmv: 10, canal: canal('tiktokshop') }).freteCanal, 50);
});

test('Mercado Livre: Clássico x Premium e redução de R$ 150 a R$ 699,99', () => {
  assert.equal(comissaoETaxaFixa(canal('mercadolivre'), 149.99).comissao, 14);
  assert.equal(comissaoETaxaFixa(canal('mercadolivre'), 150).comissao, 12);
  assert.equal(comissaoETaxaFixa(canal('mercadolivre'), 699.99).comissao, 12);
  assert.equal(comissaoETaxaFixa(canal('mercadolivre'), 700).comissao, 14);
  assert.equal(comissaoETaxaFixa(canal('mercadolivre', { tipo_anuncio: 'premium' }), 100).comissao, 19);
  assert.equal(comissaoETaxaFixa(canal('mercadolivre', { tipo_anuncio: 'premium' }), 200).comissao, 15);
});

test('Mercado Livre: comissão própria vale em qualquer preço, sem a redução', () => {
  const ml = canal('mercadolivre', { comissao_propria: 16.5 });
  assert.equal(comissaoETaxaFixa(ml, 100).comissao, 16.5);
  assert.equal(comissaoETaxaFixa(ml, 300).comissao, 16.5);
});

test('Mercado Livre: frete pela tabela de preço e peso, sem taxa fixa', () => {
  const frete = canais.mercadolivre.frete;
  assert.equal(freteMercadoLivre(frete, 99.9, 300), 12.95);
  assert.equal(freteMercadoLivre(frete, 99.9, 301), 13.85); // passou de 0,3 kg
  assert.equal(freteMercadoLivre(frete, 100, 300), 14.95); // passou de R$ 99,99
  assert.equal(freteMercadoLivre(frete, 99.9, 200000), 167.05); // acima de 150 kg
  assert.equal(calcularMargem({ preco: 100, cmv: 10, canal: canal('mercadolivre', { taxa_fixa: 9 }) }).taxaFixa, 0);
});

test('Mercado Livre: abaixo de R$ 19 o frete é no máximo metade do preço', () => {
  assert.equal(freteMercadoLivre(canais.mercadolivre.frete, 10, 300), 5);
  assert.equal(freteMercadoLivre(canais.mercadolivre.frete, 18.99, 300), 5.65);
});

test('peso pela caixa entra no frete quando é maior que o peso real', () => {
  const peso = pesoParaFrete(1200, 70, 5, 70); // 4,08 kg pela caixa
  assert.equal(freteMercadoLivre(canais.mercadolivre.frete, 99.9, peso), 19.75);
  assert.equal(freteMercadoLivre(canais.mercadolivre.frete, 99.9, 1200), 14.75);
});

test('SHEIN: comissão e taxa fixa ajustáveis', () => {
  const r = calcularMargem({ preco: 100, cmv: 10, canal: canal('shein', { comissao: 18, taxa_fixa: 4 }) });
  perto(r.comissao, 18);
  assert.equal(r.taxaFixa, 4);
});

test('impostos são % do preço de venda', () => {
  perto(calcularMargem({ preco: 200, cmv: 10, canal: canal('lojapropria', { impostos: 8 }) }).impostos, 16);
});

test('taxa financeira (cartão/plataforma) é % do preço', () => {
  perto(calcularMargem({ preco: 200, cmv: 10, canal: canal('atacado', { taxa_financeira: 3 }) }).taxaFinanceira, 6);
});

test('frete absorvido, pick & pack e outros custos entram em R$ por peça', () => {
  const r = calcularMargem({ preco: 100, cmv: 10, canal: canal('lojapropria', { frete_absorvido: 12, embalagem: 2.5, outros: 6.73 }) });
  perto(r.custoTotal, 10 + 10 + 5 + 12 + 2.5 + 6.73);
});

test('comissão de vendedor no atacado e na loja física', () => {
  perto(calcularMargem({ preco: 120, cmv: 79, canal: canal('lojafisica') }).comissao, 1.2);
});

test('preço mínimo respeita a troca de faixa (não fica num preço que não chega na margem)', () => {
  const minimo = precoMinimo({ cmv: 30, canal: canal('shopee'), margemDesejada: 25 });
  assert.ok(calcularMargem({ preco: minimo, cmv: 30, canal: canal('shopee') }).margem >= 25);
  assert.ok(calcularMargem({ preco: minimo - 0.01, cmv: 30, canal: canal('shopee') }).margem < 25);
});
