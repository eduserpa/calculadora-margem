// Função 3: preço DE, desconto e preço POR. Ver docs/03-preco-de-por.md
import { arredondarCentavo } from './numeros.js';

export function precoPor(precoDe, descontoPercentual) {
  return precoDe > 0 ? arredondarCentavo(precoDe * (1 - (descontoPercentual || 0) / 100)) : 0;
}

export function descontoPeloPor(precoDe, precoPorDigitado) {
  if (!(precoDe > 0) || !Number.isFinite(precoPorDigitado)) return 0;
  return Math.min(100, Math.max(0, ((precoDe - precoPorDigitado) / precoDe) * 100));
}

// Desconto máximo sobre o preço DE para chegar no preço de liquidação: 1 casa, sempre para baixo.
export function descontoMaximo(precoDe, precoLiquidacao) {
  if (!(precoDe > 0) || !Number.isFinite(precoLiquidacao)) return 0;
  const r = ((precoDe - precoLiquidacao) / precoDe) * 100;
  return Math.floor(Number((r * 10).toPrecision(12))) / 10;
}
