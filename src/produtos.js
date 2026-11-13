// Custo e peso de um produto cadastrado (usa as funções de src/calculos).
import { custoRevenda, custoFabricacao, custoKit } from './calculos/custo-produto.js';
import { pesoParaFrete } from './calculos/peso.js';
import { dados, canais } from './dados.js';
import { calcularMargem } from './calculos/margem.js';
import { precoPor } from './calculos/preco-de-por.js';

export const porId = () => new Map(dados.produtos.map((p) => [p.id, p]));

// Itens de kit que apontam para produto excluído contam como custo 0 e marcam o kit como incompleto.
export function custoDoProduto(p, mapa = porId()) {
  if (p.tipoCusto === 'kit') {
    const itens = (p.kit ?? []).map((i) => {
      const item = mapa.get(i.produtoId);
      return { custo: item && item.tipoCusto !== 'kit' ? custoDoProduto(item, mapa) : 0, quantidade: i.quantidade };
    });
    return custoKit(itens);
  }
  if (p.tipoCusto === 'fabricacao') return custoFabricacao(p.fabricacao);
  return custoRevenda(p.revenda);
}

export const kitIncompleto = (p, mapa = porId()) =>
  p.tipoCusto === 'kit' && (p.kit ?? []).some((i) => !mapa.has(i.produtoId));

export const pesoDoProduto = (p) => pesoParaFrete(p.pesoG, p.comprimento, p.largura, p.altura);

// Cada preço salvo na Calculadora (produto × canal) com a conta feita: { produto, canalId, canal, preco, cmv, pesoG, r }.
// Usado pela Início e pela planilha de preços.
export function precosSalvos() {
  const mapa = porId();
  return dados.produtos.flatMap((produto) => {
    const cmv = custoDoProduto(produto, mapa);
    const pesoG = pesoDoProduto(produto);
    return Object.entries(dados.precificacoes?.[produto.id] ?? {}).flatMap(([canalId, salvo]) => {
      const canal = canais()?.[canalId];
      const preco = precoPor(salvo.de, salvo.desconto);
      if (!canal || !(preco > 0)) return [];
      return [{ produto, canalId, canal, preco, cmv, pesoG, r: calcularMargem({ preco, cmv, canal, pesoG }) }];
    });
  });
}

export const kitsQueUsam = (id) => dados.produtos.filter((p) => p.tipoCusto === 'kit' && (p.kit ?? []).some((i) => i.produtoId === id));

export function produtoVazio() {
  return {
    nome: '',
    sku: '',
    tipoCusto: 'revenda',
    revenda: { custoCompra: 0, freteFornecedor: 0, embalagem: 0, outros: 0 },
    fabricacao: { materiais: [{ descricao: '', precoUnitario: 0, quantidade: 0 }], maoDeObra: [{ descricao: '', valor: 0 }], embalagem: 0, freteInsumos: 0, outros: 0 },
    kit: [],
    pesoG: 300,
    comprimento: 0,
    largura: 0,
    altura: 0,
  };
}

// Produtos fictícios para testar a ferramenta.
export function exemplos(novoId) {
  const garrafa = { ...produtoVazio(), id: novoId(), nome: 'Garrafa térmica 500 ml (exemplo)', sku: 'EX-001', pesoG: 450, comprimento: 25, largura: 8, altura: 8,
    revenda: { custoCompra: 32.9, freteFornecedor: 2.5, embalagem: 1.2, outros: 0 } };
  const suporte = { ...produtoVazio(), id: novoId(), nome: 'Suporte de parede (exemplo)', sku: 'EX-002', tipoCusto: 'fabricacao', pesoG: 600,
    fabricacao: { materiais: [{ descricao: 'Chapa', precoUnitario: 18.5, quantidade: 1.2 }, { descricao: 'Parafusos', precoUnitario: 0.35, quantidade: 4 }],
      maoDeObra: [{ descricao: 'Corte e dobra', valor: 6 }, { descricao: 'Acabamento', valor: 2.5 }], embalagem: 1.2, freteInsumos: 0.8, outros: 0 } };
  const kit = { ...produtoVazio(), id: novoId(), nome: 'Kit 2 garrafas + suporte (exemplo)', sku: 'EX-003', tipoCusto: 'kit', pesoG: 1600, comprimento: 30, largura: 20, altura: 12,
    kit: [{ produtoId: garrafa.id, quantidade: 2 }, { produtoId: suporte.id, quantidade: 1 }] };
  const agora = new Date().toISOString();
  return [garrafa, suporte, kit].map((p) => ({ ...p, atualizadoEm: agora }));
}
