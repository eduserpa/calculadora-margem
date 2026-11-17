// Concorrentes: margem e lucro no preço de cada um (a mesma conta da Calculadora), resumo do cartão e a lista da Início.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calcularMargem } from '../src/calculos/margem.js';
import { mediana, margensDosConcorrentes, maisCaroQueConcorrencia, candidatosDoApify, qualidadeDoNome, candidatoSeguro, candidatosDaBusca, chaveDoCandidato } from '../src/concorrentes.js';

const { canais } = JSON.parse(readFileSync(new URL('../data/canais.json', import.meta.url), 'utf8'));
const ml = canais.mercadolivre;

test('mediana: ímpar, par e vazia', () => {
  assert.equal(mediana([30, 10, 20]), 20);
  assert.equal(mediana([10, 40, 20, 30]), 25);
  assert.equal(mediana([]), null);
});

test('margem e lucro de cada concorrente = calcularMargem no preço dele; resumo do cartão', () => {
  const lista = [{ vendedor: 'B', preco: 210 }, { vendedor: 'A', preco: 150 }, { vendedor: 'C', preco: 199.9 }];
  const r = margensDosConcorrentes({ concorrentes: lista, cmv: 79.07, canal: ml, pesoG: 3300, minimo: 200 });
  assert.deepEqual(r.itens.map((c) => c.vendedor), ['A', 'C', 'B'], 'do mais barato ao mais caro');
  for (const c of r.itens) {
    const esperado = calcularMargem({ preco: c.preco, cmv: 79.07, canal: ml, pesoG: 3300 });
    assert.equal(c.margem, esperado.margem);
    assert.equal(c.lucro, esperado.lucro);
  }
  assert.deepEqual([r.menor, r.mediana, r.maior, r.abaixoDoMinimo], [150, 199.9, 210, 2]);
  assert.equal(margensDosConcorrentes({ concorrentes: [], cmv: 1, canal: ml }).mediana, null);
});

test('mais caro que a concorrência: só no Mercado Livre, onde o nosso preço passa da mediana, maior diferença primeiro', () => {
  const p1 = { id: 'p1' };
  const p2 = { id: 'p2' };
  const ML = { tipo: 'mercadolivre' };
  const salvos = [
    { produto: p1, canalId: 'mercadolivre', canal: ML, preco: 250 }, // mediana 200: 25% mais caro
    { produto: p1, canalId: 'shopee', canal: { tipo: 'shopee' }, preco: 300 }, // mediana 100, mas fora do ML: não conta (1.2.2)
    { produto: p2, canalId: 'mercadolivre', canal: ML, preco: 110 }, // mediana 100: 10% mais caro
    { produto: p2, canalId: 'mercadolivre2', canal: ML, preco: 90 }, // 2ª conta do ML, mais barato: fica fora
  ];
  const conc = [
    { produtoId: 'p1', canal: 'mercadolivre', preco: 190 }, { produtoId: 'p1', canal: 'mercadolivre', preco: 210 },
    { produtoId: 'p1', canal: 'shopee', preco: 100 }, { produtoId: 'p2', canal: 'mercadolivre2', preco: 100 },
    { produtoId: 'p2', canal: 'mercadolivre', preco: 100 },
  ];
  const r = maisCaroQueConcorrencia(salvos, conc);
  assert.deepEqual(r.map((x) => [x.produto.id, x.canalId, x.mediana, x.diferenca, x.quantos]), [
    ['p1', 'mercadolivre', 200, 50, 2],
    ['p2', 'mercadolivre', 100, 10, 1],
  ]);
});

test('candidatosDoApify: tira os nossos, lê o preço brasileiro, Full, vendidos; sem repetir anúncio nem preço zerado', () => {
  const item = (Vendedor, novoPreco, extra = {}) => ({ Vendedor, novoPreco, eTituloProduto: ' Dispenser Inox ', idPublicacao: Vendedor + novoPreco, zProdutoLink: 'https://www.mercadolivre.com.br/x/up/MLBU1', ...extra });
  const r = candidatosDoApify([
    item('CONCEITO METAIS', '97,53'),
    item('CONCEITO METAIS Loja oficial', '90,00'),
    item('LORENMETAIS por CONCEITO METAIS Loja oficial', '99,00'),
    item('Loren Metais', '99,00'),
    item('LP METAIS', '80,00'),
    item('GADSTORE Loja oficial', '1.234,56', { envio: 'Amanhã | Grátis Enviado pelo FULL', freteGratis: true, quantidadeVendida: 500, imagemLink: 'https://http2.mlstatic.com/a.webp' }),
    item('GADSTORE Loja oficial', '1.234,56'), // mesmo anúncio de novo
    item('JSN', ''),
    item('', '50,10', { zProdutoLink: 'javascript:alert(1)' }),
  ]);
  assert.deepEqual(r.map((c) => [c.vendedor, c.preco, c.full, c.freteGratis, c.vendidos]), [
    ['GADSTORE', 1234.56, true, true, 500],
    ['Marca não informada', 50.1, false, false, 0],
  ]);
  assert.equal(r[0].titulo, 'Dispenser Inox');
  assert.equal(r[0].foto, 'https://http2.mlstatic.com/a.webp');
  assert.equal(r[1].link, null, 'link que não é endereço web fica de fora');
  assert.equal(candidatosDoApify(Array.from({ length: 30 }, (_, i) => item('Loja ' + i, '10,00'))).length, 20);
  assert.deepEqual(candidatosDoApify(undefined), []);
});

test('qualidadeDoNome: nome ruim avisa; o termo da busca sai sem SKU, Ref, nossas marcas, códigos e traços', () => {
  const q = (nome, sku) => qualidadeDoNome(nome, sku);
  // ruins
  assert.equal(q('', 'X').boa, false, 'vazio');
  assert.equal(q('15001', '').boa, false, 'só código');
  assert.equal(q('13807 - 40x102', '').boa, false, 'código e medida');
  assert.equal(q('PIA-50', 'pia-50').boa, false, 'igual ao SKU');
  assert.equal(q('Pia Inox', '').boa, false, 'menos de 3 palavras');
  assert.equal(q('Cuba Inox Pia 40x30 50x40 60x50 70x50', '').boa, false, 'quase todo medidas');
  assert.equal(q('Ref 15001 Loren', '15001').boa, false, 'só sobra nada');
  // bons, com o termo limpo
  assert.deepEqual(q('Dispenser Papel Higiênico Inox 400 metros', '15001'), { boa: true, termo: 'Dispenser Papel Higiênico Inox 400 metros' });
  assert.deepEqual(q('Ref 15001 - Dispenser Papel Higiênico Inox Loren Metais', '15001'), { boa: true, termo: 'Dispenser Papel Higiênico Inox' });
  assert.deepEqual(q('CM-1060 | Lixeira Conceito Inox 30 litros (LP)', 'CM-1060'), { boa: true, termo: 'Lixeira Inox 30 litros' });
  assert.equal(q('Lorenzo Pia Cozinha Inox', '').termo, 'Lorenzo Pia Cozinha Inox', 'Loren só como palavra inteira');
  // palavras de promoção saem do termo e não contam como palavra
  assert.deepEqual(q('Torneira de Mesa Bica Alta Queima de Estoque', ''), { boa: true, termo: 'Torneira de Mesa Bica Alta' });
  assert.deepEqual(q('PROMOÇÃO! Lixeira Inox Pedal 30 litros - Últimas unidades', ''), { boa: true, termo: 'Lixeira Inox Pedal 30 litros' });
  assert.equal(q('Oferta Liquidação Outlet Torneira', '').boa, false, 'só sobra 1 palavra: fraco');
  assert.equal(q('Torneira de mesa Queima de estoque', '').termo, 'Torneira de mesa');
  assert.equal(q('Torneira de mesa Queima de estoque', '').boa, false, 'sobram 2 palavras de verdade (de não conta): fraco');
  assert.equal(q('Ofertas de Natal Pia Inox Cozinha', '').termo, 'Ofertas de Natal Pia Inox Cozinha', 'só a palavra inteira');
  // nome que é só código: busca com o nome mesmo (nada sobra para buscar)
  assert.equal(q('15001', '').termo, '15001');
});

test('candidatoSeguro: busca guardada adulterada não vira HTML nem javascript: (revisão da Ellie)', () => {
  const c = candidatoSeguro({
    titulo: { toString: () => '<b>x</b>' }, vendedor: ['<img src=x onerror=alert(1)>'], preco: '100abc',
    vendidos: '<img src=x onerror="window.__xss=1">', link: 'javascript:alert(1)', full: 'sim', freteGratis: 1,
    foto: 'https://exemplo.com/x.webp',
  });
  assert.deepEqual(c, { produtoCatalogo: null, itemId: null, titulo: '', foto: null, vendedor: 'Marca não informada', preco: 0, full: false, freteGratis: false, link: null, vendidos: 0 });
  assert.equal(candidatoSeguro({ link: 'https://www.mercadolivre.com.br/x" onmouseover="alert(1)' }).link, null, 'aspas no link');
  assert.equal(candidatoSeguro({ foto: 'https://http2.mlstatic.com/D_NQ.webp' }).foto, 'https://http2.mlstatic.com/D_NQ.webp');
  assert.equal(candidatoSeguro({ foto: 'http://http2.mlstatic.com/D_NQ.webp' }).foto, null, 'foto só https');
  assert.equal(candidatoSeguro({ foto: 'https://mlstatic.com.mal.io/x.webp' }).foto, null, 'foto só do mlstatic.com');
  assert.equal(candidatoSeguro({ vendidos: '500', preco: 97.53 }).vendidos, 500);
  assert.equal(candidatoSeguro(null).preco, 0);
});

test('busca guardada: todos entram no cálculo; os desmarcados (excluidos) ficam fora; a Início conta só no Mercado Livre', () => {
  const busca = {
    produtoId: 'p1',
    resultados: [
      { itemId: 'MLB1', vendedor: 'A', preco: 150 },
      { itemId: 'MLB2', vendedor: 'B', preco: 160 },
      { vendedor: 'C', preco: 170, link: 'https://www.mercadolivre.com.br/c' }, // sem itemId: a chave é o link
      { itemId: 'MLB4', vendedor: 'D', preco: 0 }, // sem preço: nem aparece
    ],
    excluidos: ['MLB2', 'https://www.mercadolivre.com.br/c', 'MLB-que-sumiu'],
  };
  const c = candidatosDaBusca(busca);
  assert.deepEqual(c.map((x) => [x.vendedor, x.fora]), [['A', false], ['B', true], ['C', true]]);
  assert.equal(chaveDoCandidato({ vendedor: 'E', preco: 9 }), 'E|9');
  assert.deepEqual(candidatosDaBusca(null), []);
  assert.deepEqual(candidatosDaBusca({ resultados: 'x', excluidos: 'y' }), [], 'formato estranho não quebra');
  // Início: produto a R$ 200 no ML; só "A" (150) está no cálculo -> mais caro; na Shopee a busca do ML não conta
  const ml = { produto: { id: 'p1' }, canalId: 'mercadolivre', canal: { tipo: 'mercadolivre' }, preco: 200 };
  const shopee = { produto: { id: 'p1' }, canalId: 'shopee', canal: { tipo: 'shopee' }, preco: 200 };
  const r = maisCaroQueConcorrencia([ml, shopee], [], [busca]);
  assert.deepEqual(r.map((x) => [x.canalId, x.mediana, x.quantos]), [['mercadolivre', 150, 1]]);
  // anotados à mão somam junto: mediana de 150 e 250 = 200, não passa
  assert.equal(maisCaroQueConcorrencia([ml], [{ produtoId: 'p1', canal: 'mercadolivre', preco: 250 }], [busca]).length, 0);
});
