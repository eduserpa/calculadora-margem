// Arredonda para centavos. Corrige o erro do float antes (ex.: 1.005 * 100 = 100.49999…).
export function arredondarCentavo(valor) {
  return Math.round(Number((valor * 100).toPrecision(12))) / 100;
}
