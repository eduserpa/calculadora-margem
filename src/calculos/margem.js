// Funções 1 e 2: margem por canal e preço mínimo. Ver docs/01 e docs/02.
import { arredondarCentavo } from './numeros.js';
import { comissaoETaxaFixa, freteDoCanal, pontosDeMudanca } from './canal.js';

const n = (v) => Number(v) || 0;

// Opções que só entram quando ligadas no canal (ver docs/ordem-das-taxas.md):
// cupom (o cliente paga menos; todas as taxas passam a incidir sobre o preço com cupom),
// comissão de afiliado (% do preço cobrado) e adicional por item de vendedor CPF.
const cupomDe = (canal) => (canal.cupom_ativo ? Math.min(100, Math.max(0, n(canal.cupom))) : 0);

export function calcularMargem({ preco, cmv, canal, pesoG = 300 }) {
  const precoAnuncio = arredondarCentavo(preco);
  const cupomPercentual = cupomDe(canal);
  preco = cupomPercentual ? arredondarCentavo(precoAnuncio * (1 - cupomPercentual / 100)) : precoAnuncio;
  const { comissao: comissaoPercentual, taxaFixa: taxaDoCanal } = comissaoETaxaFixa(canal, preco);
  const comissao = (preco * comissaoPercentual) / 100;
  const taxaFixa = canal.tipo === 'mercadolivre' ? 0 : n(taxaDoCanal);
  const freteCanal = freteDoCanal(canal, preco, pesoG);
  const impostos = (preco * n(canal.impostos)) / 100;
  const embalagem = n(canal.embalagem);
  const freteAbsorvido = n(canal.frete_absorvido);
  const outros = n(canal.outros);
  const taxaFinanceira = (preco * n(canal.taxa_financeira)) / 100;
  const afiliadoPercentual = canal.afiliado_ativo ? n(canal.afiliado) : 0;
  const afiliado = (preco * afiliadoPercentual) / 100;
  const adicionalCpf = canal.tipo_vendedor === 'cpf' && canal.cpf_acima_limite ? n(canal.cpf_adicional) : 0;
  const custoTotal = comissao + taxaFixa + freteCanal + impostos + embalagem + freteAbsorvido + outros + taxaFinanceira + cmv + afiliado + adicionalCpf;
  const lucro = preco - custoTotal;
  return {
    precoAnuncio, cupomPercentual, cupom: precoAnuncio - preco,
    preco, cmv, comissaoPercentual, comissao, taxaFixa, freteCanal,
    impostosPercentual: n(canal.impostos), impostos,
    taxaFinanceiraPercentual: n(canal.taxa_financeira), taxaFinanceira,
    afiliadoPercentual, afiliado, adicionalCpf,
    embalagem, freteAbsorvido, outros, custoTotal, lucro,
    margem: preco > 0 ? (lucro / preco) * 100 : 0,
  };
}

const MAIOR_PRECO_CENTAVOS = 100_000_000;

// Preço logo abaixo de uma virada de faixa (frete, comissão ou taxa fixa) que dá MAIS lucro que o preço atual, ou null.
// Ex.: no ML, R$ 199,99 em vez de R$ 205,00 quando o frete de R$ 200 em diante custa mais do que os R$ 5,01 a menos.
// motivo = a parte que mais baixou ('freteCanal', 'taxaFixa' ou 'comissao') e economia = quanto ela baixou, em R$.
export function precoMelhorAbaixo({ preco, cmv, canal, pesoG = 300 }) {
  const fator = 1 - cupomDe(canal) / 100;
  if (!(preco > 0) || !(fator > 0)) return null;
  const atual = calcularMargem({ preco, cmv, canal, pesoG });
  let melhor = null;
  for (const ponto of pontosDeMudanca(canal)) {
    const centavos = Math.ceil((ponto * 100) / fator) - 1; // último centavo do anúncio antes da virada (com cupom, o preço pago)
    if (centavos <= 0 || centavos >= Math.round(preco * 100)) continue;
    const r = calcularMargem({ preco: centavos / 100, cmv, canal, pesoG });
    if (r.lucro > atual.lucro + 0.005 && (!melhor || r.lucro > melhor.lucro)) melhor = r;
  }
  if (!melhor) return null;
  const queda = (parte) => atual[parte] - melhor[parte];
  const motivo = ['freteCanal', 'taxaFixa', 'comissao'].reduce((a, b) => (queda(b) > queda(a) ? b : a));
  return { preco: melhor.precoAnuncio, margem: melhor.margem, lucro: melhor.lucro, motivo, economia: queda(motivo) };
}

// Teto da margem no canal: num preço enorme e sem custo, o que é fixo (taxa fixa, frete com teto, embalagem) some e sobra
// 100% menos tudo o que é % do preço (comissão da faixa mais alta, impostos, taxa financeira, afiliado...). A mesma conta da
// margem, sem fórmula nova; 2 casas para não mostrar 75,9999.
export const margemMaxima = ({ canal, pesoG = 300 }) => Math.round(calcularMargem({ preco: 1e9, cmv: 0, canal, pesoG }).margem * 100) / 100;

// Menor preço do anúncio (em centavos) com margem >= margemDesejada. 0 = nenhum preço chega lá.
// Com cupom, as viradas de faixa acontecem num preço de anúncio maior (preço ÷ (1 − cupom)).
export function precoMinimo({ cmv, canal, pesoG = 300, margemDesejada }) {
  if (!(cmv > 0)) return 0;
  const chega = (centavos) => calcularMargem({ preco: centavos / 100, cmv, canal, pesoG }).margem >= margemDesejada;
  const fator = 1 - cupomDe(canal) / 100;
  if (!(fator > 0)) return 0;
  const inicios = [...new Set([1, ...pontosDeMudanca(canal).map((p) => Math.round((p * 100) / fator)).filter((c) => c > 1)])].sort((a, b) => a - b);
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
