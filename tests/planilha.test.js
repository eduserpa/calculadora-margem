// Importar produtos por planilha e exportar precificações.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lerCsv, decodificar, prepararImportacao, modelo, csvPrecificacoes } from '../src/planilha.js';
import { custoRevenda, custoFabricacao } from '../src/calculos/custo-produto.js';

let n = 0;
const novoId = () => `id${++n}`;
const existente = { id: 'a1', nome: 'Banco 45x70', sku: '1058', tipoCusto: 'revenda', revenda: { custoCompra: 300, freteFornecedor: 5, embalagem: 0, outros: 0 }, pesoG: 4000, comprimento: 45, largura: 70, altura: 40, fotos: ['https://x/1.jpg'] };

test('lê CSV com ; ou , e campos entre aspas', () => {
  assert.deepEqual(lerCsv('\uFEFFa;b\r\n"x;1";"di""z"\r\n\r\n'), [['a', 'b'], ['x;1', 'di"z']]);
  assert.deepEqual(lerCsv('a,b\n1,2'), [['a', 'b'], ['1', '2']]);
});

test('acentos do Excel antigo (windows-1252) e UTF-8', () => {
  assert.equal(decodificar(new Uint8Array([0x47, 0x61, 0x72, 0x72, 0x61, 0x66, 0x61, 0x20, 0x74, 0xe9, 0x72, 0x6d])), 'Garrafa térm');
  assert.equal(decodificar(new TextEncoder().encode('Lâmina')), 'Lâmina');
});

test('o modelo só tem o cabeçalho: nada vira produto sem querer', () => {
  assert.equal(modelo(), '\uFEFFnome;sku;tipo;custo;peso_g;comprimento_cm;largura_cm;altura_cm;foto_url\r\n');
  const r = prepararImportacao(modelo(), [], novoId);
  assert.deepEqual([r.novos.length, r.atualizados.length, r.erros.length], [0, 0, 0]);
});

test('linha completa vira produto com tudo preenchido', () => {
  const r = prepararImportacao(`${modelo()}Garrafa térmica 500 ml;GT-500;revenda;32,90;450;25;8;8;https://exemplo.com/foto.jpg`, [], novoId);
  assert.equal(r.erros.length, 0);
  const p = r.novos[0];
  assert.equal(p.nome, 'Garrafa térmica 500 ml');
  assert.equal(custoRevenda(p.revenda), 32.9);
  assert.deepEqual([p.pesoG, p.comprimento, p.largura, p.altura], [450, 25, 8, 8]);
  assert.deepEqual(p.fotos, ['https://exemplo.com/foto.jpg']);
});

test('SKU existente atualiza e mantém o que veio vazio', () => {
  const csv = 'nome;sku;tipo;custo;peso_g\n;1058;;309,45;\nSuporte;S-1;fabricante;18,5;600';
  const r = prepararImportacao(csv, [existente], novoId);
  assert.equal(r.erros.length, 0);
  assert.equal(r.atualizados.length, 1);
  const a = r.atualizados[0];
  assert.equal(a.id, 'a1');
  assert.equal(a.nome, 'Banco 45x70');
  assert.equal(a.revenda.custoCompra, 309.45);
  assert.equal(a.revenda.freteFornecedor, 5);
  assert.equal(a.pesoG, 4000);
  assert.equal(custoFabricacao(r.novos[0].fabricacao), 18.5);
  assert.equal(existente.revenda.custoCompra, 300, 'não mexe no produto antes de confirmar');
});

test('linhas com erro dizem o porquê e não entram', () => {
  const csv = ['nome;sku;tipo;custo;peso_g;foto_url', 'Sem custo;X1;;;;', ';X2;revenda;10;;', 'Tipo ruim;X3;kit;10;;', 'Peso ruim;X4;;10;abc;', 'Ok;X5;;10;;', 'Repetido;x5;;10;;', 'Foto;X6;;10;;ftp://a'].join('\n');
  const r = prepararImportacao(csv, [], novoId);
  assert.equal(r.novos.length, 1);
  assert.deepEqual(r.erros.map((e) => e.linha), [2, 3, 4, 5, 7, 8]);
  assert.match(r.erros[0].motivo, /custo/);
  assert.match(r.erros[3].motivo, /peso_g/);
  assert.match(r.erros[4].motivo, /repetido/);
});

test('planilha sem as colunas obrigatórias', () => {
  const r = prepararImportacao('produto;preco\nA;1', [], novoId);
  assert.equal(r.erros.length, 1);
  assert.match(r.erros[0].motivo, /nome, custo/);
});

test('exporta precificações com ; e vírgula decimal', () => {
  const csv = csvPrecificacoes([{ produto: 'Banco; inox', sku: '1058', canal: 'Shopee', preco: 735.2, margem: 14.94, lucro: 109.8, minimo: 801 }]);
  assert.equal(csv, '\uFEFFproduto;sku;canal;preco;margem_%;lucro_r$;preco_minimo_20%\r\n"Banco; inox";1058;Shopee;735,20;14,9;109,80;801,00\r\n');
});
