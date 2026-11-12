// Função 3: preço DE, desconto e preço POR. Ver docs/03-preco-de-por.md
import { arredondarCentavo } from './numeros.js';

export function precoPor(precoDe, descontoPercentual) {
  return precoDe > 0 ? arredondarCentavo(precoDe * (1 - (descontoPercentual || 0) / 100)) : 0;
}

export function descontoPeloPor(precoDe, precoPorDigitado) {
  if (!(precoDe > 0) || !Number.isFinite(precoPorDigitado)) return 0;
  return Math.min(100, Math.max(0, ((precoDe - precoPorDigitado) / precoDe) * 100));
}
