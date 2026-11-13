// Função 8: como cada canal cobra. O formato do canal é o de data/canais.json.

// Mercado Livre: cada tipo de anúncio guarda a sua comissão própria ({ classico, premium }).
// Config antiga (um número só) vale para o tipo que estava escolhido: é a migração, sem mudar a conta.
export const tipoDoAnuncio = (canal) => (canal.tipo_anuncio === 'premium' ? 'premium' : 'classico');
export function comissoesProprias(canal) {
  const p = canal.comissao_propria;
  if (p && typeof p === 'object') return { classico: Number(p.classico) || 0, premium: Number(p.premium) || 0 };
  return { classico: 0, premium: 0, [tipoDoAnuncio(canal)]: Number(p) || 0 };
}
export const comissaoPropria = (canal) => comissoesProprias(canal)[tipoDoAnuncio(canal)];

export function comissaoETaxaFixa(canal, preco) {
  if (canal.tipo === 'faixas') {
    const faixa = canal.faixas.find((f) => f.ate == null || preco <= f.ate) ?? canal.faixas.at(-1);
    return { comissao: faixa.comissao, taxaFixa: faixa.taxa_fixa };
  }
  if (canal.tipo === 'mercadolivre') {
    const propria = comissaoPropria(canal);
    if (propria > 0) return { comissao: propria, taxaFixa: 0 };
    const tipo = tipoDoAnuncio(canal);
    const r = canal.faixa_reduzida;
    const reducao = r && preco >= r.de && preco <= r.ate ? r.reducao[tipo] : 0;
    return { comissao: canal.comissao[tipo] - reducao, taxaFixa: 0 };
  }
  return { comissao: canal.comissao, taxaFixa: canal.taxa_fixa };
}

// Frete grátis pago pelo vendedor no Mercado Livre: tabela por preço e peso.
export function freteMercadoLivre(frete, preco, pesoG) {
  let coluna = 0;
  frete.precos_a_partir_de.forEach((inicio, i) => {
    if (preco >= inicio) coluna = i;
  });
  let linha = frete.pesos_ate_g.findIndex((limite) => limite == null || pesoG <= limite);
  if (linha === -1) linha = frete.custos.length - 1;
  const custo = frete.custos[linha][coluna];
  return preco < frete.abaixo_de ? Math.min(custo, preco * frete.maximo_do_preco) : custo;
}

// Frete que entra na conta: tabela do ML, ou % do preço com teto (TikTok), ou nada.
export function freteDoCanal(canal, preco, pesoG) {
  // Tabela da reputação escolhida, quando existir; senão a tabela padrão (MercadoLíder/verde/sem reputação).
  if (canal.tipo === 'mercadolivre') return freteMercadoLivre(canal.frete_por_reputacao?.[canal.reputacao] ?? canal.frete, preco, pesoG);
  if (canal.frete_percentual) return Math.min((preco * canal.frete_percentual) / 100, canal.frete_teto ?? Infinity);
  return 0;
}

// Primeiro centavo de cada faixa nova (onde comissão, taxa ou frete mudam).
export function pontosDeMudanca(canal) {
  const depoisDe = (ate) => Math.round(ate * 100 + 1) / 100;
  if (canal.tipo === 'faixas') return canal.faixas.filter((f) => f.ate != null).map((f) => depoisDe(f.ate));
  if (canal.tipo === 'mercadolivre') {
    const r = canal.faixa_reduzida;
    return [...canal.frete.precos_a_partir_de.slice(1), ...(r ? [r.de, depoisDe(r.ate)] : [])];
  }
  return [];
}
