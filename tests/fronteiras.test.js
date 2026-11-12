// Viradas de faixa: comissão, taxa fixa e frete de cada lado da fronteira.
// Os valores esperados foram conferidos na tela, lado a lado, em 12/11/2026 (ver docs/ordem-das-taxas.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calcularMargem } from '../src/calculos/margem.js';
import { pesoParaFrete } from '../src/calculos/peso.js';

const { canais } = JSON.parse(readFileSync(new URL('../data/canais.json', import.meta.url), 'utf8'));
const centavos = (v) => Math.round(v * 100) / 100;

function parcelas(canal, preco, pesoG = 300) {
  const r = calcularMargem({ preco, cmv: 10, canal, pesoG });
  return [centavos(r.comissao), centavos(r.taxaFixa), centavos(r.freteCanal)];
}

test('Shopee: cada lado das 4 viradas de faixa', () => {
  const casos = [
    [79.99, 16, 4.5], [80, 11.2, 16], [99.99, 14, 16], [100, 14, 20],
    [199.99, 28, 20], [200, 28, 26], [499.99, 70, 26], [500, 70, 26],
  ];
  for (const [preco, comissao, fixa] of casos) assert.deepEqual(parcelas(canais.shopee, preco), [comissao, fixa, 0], `preço ${preco}`);
});

test('TikTok: virada de R$ 50 e teto da taxa de frete', () => {
  assert.deepEqual(parcelas(canais.tiktokshop, 49.99), [5, 4, 3]);
  assert.deepEqual(parcelas(canais.tiktokshop, 50), [3, 6, 3]);
  assert.deepEqual(parcelas(canais.tiktokshop, 900), [54, 6, 50]);
});

test('Mercado Livre: frete de cada lado das viradas de preço (300 g)', () => {
  const casos = [[18.99, 5.65], [19, 6.85], [78.99, 8.15], [79, 12.95], [149.99, 16.95], [150, 19.05], [699.99, 21.65], [700, 21.65]];
  for (const [preco, frete] of casos) assert.equal(parcelas(canais.mercadolivre, preco)[2], frete, `preço ${preco}`);
});

test('Mercado Livre: frete pelo peso (divisa, caixa maior que o real)', () => {
  assert.equal(parcelas(canais.mercadolivre, 99.9, pesoParaFrete(300))[2], 12.95); // exatamente 0,3 kg
  assert.equal(parcelas(canais.mercadolivre, 99.9, pesoParaFrete(500, 30, 16, 10))[2], 14.45); // caixa: 800 g
  assert.equal(parcelas(canais.mercadolivre, 99.9, pesoParaFrete(1200, 70, 5, 70))[2], 19.75); // caixa: 4,08 kg
  assert.equal(parcelas(canais.mercadolivre, 199.9, pesoParaFrete(4000))[2], 26.35); // exatamente 4 kg
  assert.equal(parcelas(canais.mercadolivre, 299.9, pesoParaFrete(2000, 30, 20, 20))[2], 25.55); // caixa = real = 2 kg
});

test('Mercado Livre Clássico e Premium nas viradas de R$ 150 e R$ 700', () => {
  const premium = { ...canais.mercadolivre, tipo_anuncio: 'premium' };
  assert.equal(parcelas(canais.mercadolivre, 149.99)[0], centavos(149.99 * 0.14));
  assert.equal(parcelas(canais.mercadolivre, 150)[0], 18);
  assert.equal(parcelas(canais.mercadolivre, 699.99)[0], centavos(699.99 * 0.12));
  assert.equal(parcelas(canais.mercadolivre, 700)[0], 98);
  assert.equal(parcelas(premium, 149.99)[0], centavos(149.99 * 0.19));
  assert.equal(parcelas(premium, 150)[0], 22.5);
  assert.equal(parcelas(premium, 699.99)[0], centavos(699.99 * 0.15));
  assert.equal(parcelas(premium, 700)[0], 133);
});

test('lucro usa as parcelas sem arredondar; só a tela arredonda', () => {
  const r = calcularMargem({ preco: 699.99, cmv: 10, canal: { ...canais.mercadolivre, comissao_propria: 16.5, impostos: 12 }, pesoG: 300 });
  // 699,99 − (115,49835 + 21,65 + 83,9988 + 10) = 468,84285
  assert.ok(Math.abs(r.lucro - 468.84285) < 1e-9);
});
