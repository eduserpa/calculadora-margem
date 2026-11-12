// Função 7: peso para o frete. Ver docs/07-peso-para-frete.md
export function pesoParaFrete(pesoG, comprimento, largura, altura) {
  const cubicoKg = comprimento && largura && altura ? (comprimento * largura * altura) / 6000 : 0;
  return Math.max(Number(pesoG) || 0, cubicoKg * 1000);
}
