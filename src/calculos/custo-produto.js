// Função 6: custo do produto (CMV). Ver docs/06-custo-do-produto.md
const n = (v) => Number(v) || 0;

export function custoRevenda({ custoCompra, freteFornecedor, embalagem, outros } = {}) {
  return n(custoCompra) + n(freteFornecedor) + n(embalagem) + n(outros);
}

export function custoFabricacao({ materiais = [], maoDeObra = [], embalagem, freteInsumos, outros } = {}) {
  const totalMateriais = materiais.reduce((soma, m) => soma + n(m.precoUnitario) * n(m.quantidade), 0);
  const totalMaoDeObra = maoDeObra.reduce((soma, m) => soma + n(m.valor), 0);
  return totalMateriais + totalMaoDeObra + (n(embalagem) + n(freteInsumos) + n(outros));
}

// itens: [{ custo, quantidade }], com o custo de cada produto do kit já calculado
export function custoKit(itens = []) {
  return itens.reduce((soma, i) => soma + n(i.custo) * n(i.quantidade), 0);
}
