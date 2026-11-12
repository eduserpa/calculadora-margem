// Um teste por opção que dá para ligar ou mudar na janela "Configurar <canal>".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calcularMargem, precoMinimo } from '../src/calculos/margem.js';

const ler = (arquivo) => JSON.parse(readFileSync(new URL(arquivo, import.meta.url), 'utf8'));
const { canais } = ler('../data/canais.json');
const { categorias } = ler('../data/ml-categorias.json');
const canal = (id, ajustes = {}) => ({ ...structuredClone(canais[id]), ...ajustes });
const perto = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);

test('opções novas vêm desligadas: a conta continua igual', () => {
  for (const id of Object.keys(canais)) {
    const c = canais[id];
    assert.equal(c.cupom_ativo, false);
    assert.equal(c.afiliado_ativo, false);
  }
  assert.equal(canais.shopee.tipo_vendedor, 'cnpj');
});

test('cupom: o cliente paga menos e as taxas incidem sobre o preço com cupom', () => {
  const r = calcularMargem({ preco: 100, cmv: 30, canal: canal('lojapropria', { cupom_ativo: true, cupom: 10 }) });
  assert.equal(r.precoAnuncio, 100);
  assert.equal(r.preco, 90);
  perto(r.cupom, 10);
  perto(r.impostos, 9);
  perto(r.taxaFinanceira, 4.5);
  perto(r.lucro, 90 - 9 - 4.5 - 30);
  perto(r.margem, ((90 - 9 - 4.5 - 30) / 90) * 100);
});

test('cupom pode mudar a faixa do canal (Shopee: R$ 85 com 10% vira R$ 76,50)', () => {
  const r = calcularMargem({ preco: 85, cmv: 30, canal: canal('shopee', { cupom_ativo: true, cupom: 10 }) });
  assert.equal(r.preco, 76.5);
  assert.equal(r.comissaoPercentual, 20);
  assert.equal(r.taxaFixa, 4.5);
});

test('cupom desligado não conta, mesmo com % preenchido', () => {
  assert.equal(calcularMargem({ preco: 100, cmv: 30, canal: canal('shopee', { cupom: 10 }) }).preco, 100);
});

test('comissão de afiliado: % do preço cobrado, só quando ligada', () => {
  perto(calcularMargem({ preco: 200, cmv: 30, canal: canal('shein', { afiliado_ativo: true, afiliado: 8 }) }).afiliado, 16);
  assert.equal(calcularMargem({ preco: 200, cmv: 30, canal: canal('shein', { afiliado: 8 }) }).afiliado, 0);
  const comCupom = calcularMargem({ preco: 200, cmv: 30, canal: canal('shein', { cupom_ativo: true, cupom: 10, afiliado_ativo: true, afiliado: 8 }) });
  perto(comCupom.afiliado, 14.4);
});

test('Shopee CPF: adicional por item só acima do limite de pedidos', () => {
  const base = calcularMargem({ preco: 100, cmv: 30, canal: canal('shopee') }).lucro;
  perto(calcularMargem({ preco: 100, cmv: 30, canal: canal('shopee', { tipo_vendedor: 'cpf' }) }).lucro, base);
  const acima = calcularMargem({ preco: 100, cmv: 30, canal: canal('shopee', { tipo_vendedor: 'cpf', cpf_acima_limite: true }) });
  assert.equal(acima.adicionalCpf, 3);
  perto(acima.lucro, base - 3);
});

test('faixas da Shopee editáveis entram na conta', () => {
  const faixas = [{ ate: 99.99, comissao: 18, taxa_fixa: 5 }, { ate: null, comissao: 12, taxa_fixa: 10 }];
  const r = calcularMargem({ preco: 100, cmv: 30, canal: canal('shopee', { faixas }) });
  assert.equal(r.comissaoPercentual, 12);
  assert.equal(r.taxaFixa, 10);
});

test('TikTok: % e teto da taxa de frete editáveis', () => {
  perto(calcularMargem({ preco: 100, cmv: 30, canal: canal('tiktokshop', { frete_percentual: 5, frete_teto: 30 }) }).freteCanal, 5);
  perto(calcularMargem({ preco: 1000, cmv: 30, canal: canal('tiktokshop', { frete_percentual: 5, frete_teto: 30 }) }).freteCanal, 30);
});

test('taxa financeira editável também nos marketplaces', () => {
  perto(calcularMargem({ preco: 100, cmv: 30, canal: canal('shopee', { taxa_financeira: 2 }) }).taxaFinanceira, 2);
});

test('ML: comissão Clássico/Premium da categoria editável', () => {
  const ml = canal('mercadolivre', { comissao: { classico: 11.5, premium: 16.5 } });
  assert.equal(calcularMargem({ preco: 100, cmv: 30, canal: ml }).comissaoPercentual, 11.5);
  assert.equal(calcularMargem({ preco: 100, cmv: 30, canal: { ...ml, tipo_anuncio: 'premium' } }).comissaoPercentual, 16.5);
});

test('ML: categoria da lista oficial define a redução de R$ 150 a R$ 700', () => {
  const [nome, premium, classico] = categorias.find((c) => c[0].startsWith('Banheiros >'));
  const ml = canal('mercadolivre', { categoria: nome, faixa_reduzida: { de: 150, ate: 699.99, reducao: { premium, classico } } });
  assert.equal(calcularMargem({ preco: 200, cmv: 30, canal: ml }).comissaoPercentual, 14 - classico);
  assert.equal(calcularMargem({ preco: 200, cmv: 30, canal: { ...ml, tipo_anuncio: 'premium' } }).comissaoPercentual, 19 - premium);
  assert.ok(categorias.length > 4000);
});

test('ML: faixa da redução editável', () => {
  const ml = canal('mercadolivre', { faixa_reduzida: { de: 100, ate: 199.99, reducao: { premium: 4, classico: 2 } } });
  assert.equal(calcularMargem({ preco: 120, cmv: 30, canal: ml }).comissaoPercentual, 12);
  assert.equal(calcularMargem({ preco: 200, cmv: 30, canal: ml }).comissaoPercentual, 14);
});

test('ML: reputação usa a tabela dela quando existe; senão a padrão', () => {
  const tabelaAmarela = { ...canais.mercadolivre.frete, custos: canais.mercadolivre.frete.custos.map((l) => l.map((v) => v + 10)) };
  const ml = canal('mercadolivre', { reputacao: 'amarela', frete_por_reputacao: { amarela: tabelaAmarela } });
  perto(calcularMargem({ preco: 99.9, cmv: 30, canal: ml, pesoG: 300 }).freteCanal, 22.95);
  perto(calcularMargem({ preco: 99.9, cmv: 30, canal: canal('mercadolivre', { reputacao: 'vermelha' }), pesoG: 300 }).freteCanal, 12.95);
});

test('preço mínimo com cupom ligado continua sendo o menor preço que chega na margem', () => {
  const sh = canal('shopee', { cupom_ativo: true, cupom: 10 });
  const minimo = precoMinimo({ cmv: 30, canal: sh, margemDesejada: 20 });
  assert.ok(calcularMargem({ preco: minimo, cmv: 30, canal: sh }).margem >= 20);
  assert.ok(calcularMargem({ preco: minimo - 0.01, cmv: 30, canal: sh }).margem < 20);
});

test('liquidação: desconto máximo sobre o preço DE, 1 casa, sempre para baixo', async () => {
  const { descontoMaximo } = await import('../src/calculos/preco-de-por.js');
  assert.equal(descontoMaximo(199.9, 140), 29.9); // 29,96% vira 29,9
  assert.equal(descontoMaximo(199.9, 144.29), 27.8);
  assert.equal(descontoMaximo(100, 61.54), 38.4);
  assert.equal(descontoMaximo(0, 50), 0);
  assert.ok(descontoMaximo(100, 120) < 0); // liquidação acima do preço atual
});
