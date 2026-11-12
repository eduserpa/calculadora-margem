# 6. Custo do produto (CMV)

**Para que serve:** montar o custo de cada produto no cadastro. Ele tem três jeitos de montar:

| Tipo | Fórmula |
|---|---|
| Revenda (compra pronto) | custo de compra + frete do fornecedor + embalagem + outros |
| Fabricação (produz) | soma(preço unitário da matéria-prima × quantidade usada) + soma(mão de obra) + embalagem + frete de insumos + outros |
| Kit (junta produtos) | soma(custo de cada produto do kit × quantidade) |

O kit só junta produtos que não são kit. Se um produto faz parte de algum kit, ele não pode ser excluído antes de sair do kit.

## Exemplos

- Revenda: 42,90 + 3,50 + 1,20 = **R$ 47,60**
- Fabricação: 18,50 × 1,2 + 0,35 × 4 + 6,00 + 2,50 + 1,20 + 0,80 = **R$ 34,10**
- Kit: 2 × 47,60 + 1 × 19,30 = **R$ 114,50**
