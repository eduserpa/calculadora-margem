// Funções 1 e 2: margem por canal e preço mínimo. Ver docs/01 e docs/02.
import { arredondarCentavo } from './numeros.js';
import { comissaoETaxaFixa, freteDoCanal, pontosDeMudanca } from './canal.js';

const n = (v) => Number(v) || 0;

export function calcularMargem({ preco, cmv, canal, pesoG = 300 }) {
  preco = arredondarCentavo(preco);
  const { comissao: comissaoPercentual, taxaFixa: taxaDoCanal } = comissaoETaxaFixa(canal, preco);
  const comissao = (preco * comissaoPercentual) / 100;
  const taxaFixa = canal.tipo === 'mercadolivre' ? 0 : n(taxaDoCanal);
  const freteCanal = freteDoCanal(canal, preco, pesoG);
  const impostos = (preco * n(canal.impostos)) / 100;
  const embalagem = n(canal.embalagem);
  const freteAbsorvido = n(canal.frete_absorvido);
  const outros = n(canal.outros);
  const taxaFinanceira = (preco * n(canal.taxa_financeira)) / 100;
  const custoTotal = comissao + taxaFixa + freteCanal + impostos + embalagem + freteAbsorvido + outros + taxaFinanceira + cmv;
  const lucro = preco - custoTotal;
  return {
    preco, cmv, comissaoPercentual, comissao, taxaFixa, freteCanal,
    impostosPercentual: n(canal.impostos), impostos,
    taxaFinanceiraPercentual: n(canal.taxa_financeira), taxaFinanceira,
    embalagem, freteAbsorvido, outros, custoTotal, lucro,
    margem: preco > 0 ? (lucro / preco) * 100 : 0,
  };
}

const MAIOR_PRECO_CENTAVOS = 100_000_000;

// Menor preço (em centavos) com margem >= margemDesejada. 0 = nenhum preço chega lá.
export function precoMinimo({ cmv, canal, pesoG = 300, margemDesejada }) {
  if (!(cmv > 0)) return 0;
  const chega = (centavos) => calcularMargem({ preco: centavos / 100, cmv, canal, pesoG }).margem >= margemDesejada;
  const inicios = [...new Set([1, ...pontosDeMudanca(canal).map((p) => Math.round(p * 100)).filter((c) => c > 1)])].sort((a, b) => a - b);
  for (let i = 0; i < inicios.length; i++) {
    let menor = inicios[i];
    let maior = i + 1 < inicios.length ? inicios[i + 1] - 1 : MAIOR_PRECO_CENTAVOS;
    if (chega(menor)) return menor / 100;
    if (!chega(maior)) continue;
    while (menor < maior) {
      const meio = Math.floor((menor + maior) / 2);
      if (chega(meio)) maior = meio;
      else menor = meio + 1;
    }
    return menor / 100;
  }
  return 0;
}
