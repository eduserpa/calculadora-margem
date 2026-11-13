// Como cada canal aparece na tela: resumo do cartão, quadro da regra e nomes dos custos.
import { esc } from './formato.js';
import { icone } from './icones.js';
import { comissaoPropria } from './calculos/canal.js';

export const pct = (v) => `${(Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
const real = (v) =>
  `R$${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: Number.isInteger(Number(v)) ? 0 : 2, maximumFractionDigits: 2 })}`;
const reaisCheio = (v) => `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const data = (iso) => (iso ? iso.split('-').reverse().join('/') : '');

// marketplace: cobra comissão do vendedor · loja: site próprio, sem comissão · vendedor: atacado e loja física
export function tipoDeVenda(c) {
  if (c.rotulo_comissao) return 'vendedor';
  if (c.tipo === 'fixo' && !Number(c.comissao) && !Number(c.taxa_fixa)) return 'loja';
  return 'marketplace';
}

export const TITULO_DO_GRUPO = { marketplace: 'Taxa Marketplace', loja: 'Custos do Canal', vendedor: 'Custos de Venda' };

const SIGLA = { shopee: ['S', '#e8563a'], mercadolivre: ['ML', '#3a4a9c'], shein: ['SH', '#2b2b2b'], tiktokshop: ['TT', '#1f1f1f'], lojapropria: ['LP', '#7a4fe0'], atacado: ['AT', '#6b7280'], lojafisica: ['LF', '#2f7d70'] };
export const sigla = (id, c) => SIGLA[id] ?? [c.nome.slice(0, 2).toUpperCase(), '#6b6880'];

// Ícone de cada canal (assets/canais). Canal sem ícone (um criado depois) fica com as letras.
const ICONE_CANAL = {
  shopee: 'shopee', mercadolivre: 'mercado-livre', shein: 'shein', tiktokshop: 'tiktok',
  lojapropria: 'carrinho', atacado: 'caixas', lojafisica: 'lojinha',
};
// Ícones desenhados por nós vêm sem fundo: o quadrado colorido é a cor do canal (SIGLA), posta pelo CSS.
const SEM_FUNDO = new Set(['lojapropria', 'atacado', 'lojafisica']);
// Ícone do canal (cartões da Calculadora e de Taxas dos Canais): a imagem, ou as letras se não houver.
export function iconeDoCanal(id, c) {
  if (ICONE_CANAL[id]) {
    const fundo = SEM_FUNDO.has(id) ? ` com-fundo" style="--cor:${SIGLA[id][1]}` : '';
    return `<img class="canal-icone${fundo}" src="assets/canais/${ICONE_CANAL[id]}.webp" alt="" width="46" height="46">`;
  }
  const [letras, cor] = sigla(id, c);
  return `<span class="canal-sigla" style="--cor:${cor}" aria-hidden="true">${letras}</span>`;
}

function extras(c) {
  return (Number(c.frete_absorvido) || 0) + (Number(c.embalagem) || 0) + (Number(c.outros) || 0);
}

// Linhas do cartão do canal na calculadora (html).
// comIcones (tela Taxas dos Canais, Eduardo 13/11): cada linha ganha o ícone do seu tipo, sempre o mesmo em todos os cartões
const ICONE_LINHA = { Comissão: 'percent', 'Taxa fixa': 'coins', Impostos: 'receipt', Frete: 'truck', Vendedora: 'user', 'Taxa fin.': 'credit-card',
  'Taxa fin./plat.': 'credit-card', 'Custos extras': 'circle-plus', 'Vendedor CPF': 'user', Cupom: 'ticket', Afiliado: 'users' };
const comIcone = (html) => html.replace(/<span([^>]*)>([^:<]+?)(:|<\/span>)/g, (m, attrs, rotulo, fim) => `<span${attrs}>${icone(ICONE_LINHA[rotulo.trim()] ?? 'info')}${rotulo}${fim}`);

export function linhasDoCanal(c, comIcones = false) {
  const html = linhasDoCanalTexto(c);
  return comIcones ? comIcone(html) : html;
}

function linhasDoCanalTexto(c) {
  const imp = `<span class="t-roxo">Impostos: ${pct(c.impostos)}</span>`;
  const linhas = [];
  const venda = tipoDeVenda(c);
  if (c.tipo === 'faixas') {
    linhas.push('<span class="t-laranja">Comissão: Variável*</span>', '<span class="t-laranja">Taxa fixa: Variável*</span>', imp);
    if (c.frete_percentual) linhas.push(`<span class="t-suave">Frete: ${pct(c.frete_percentual)} (até ${real(c.frete_teto)})</span>`);
  } else if (c.tipo === 'mercadolivre') {
    const propria = comissaoPropria(c);
    const tipo = c.tipo_anuncio === 'premium' ? 'premium' : 'classico';
    linhas.push(
      propria > 0
        ? `<span class="t-laranja">Comissão: Própria ${pct(propria)}</span>`
        : `<span class="t-laranja">Comissão: ${tipo === 'premium' ? 'Premium' : 'Clássico'} ${pct(c.comissao[tipo])}*</span>`,
      '<span class="t-azul">Taxa fixa: Automática*</span>',
      imp,
    );
  } else if (venda === 'loja') {
    linhas.push(imp, `<span>Taxa fin./plat.: ${pct(c.taxa_financeira)}</span>`);
  } else if (venda === 'vendedor') {
    linhas.push(`<span>Vendedora: ${pct(c.comissao)}</span>`, imp, `<span>Taxa fin.: ${pct(c.taxa_financeira)}</span>`);
  } else {
    linhas.push(`<span>Comissão: ${pct(c.comissao)}</span>`, `<span>Taxa fixa: ${reaisCheio(c.taxa_fixa)}</span>`, imp);
  }
  if (extras(c)) linhas.push(`<span class="t-suave">Custos extras: ${reaisCheio(extras(c))}</span>`);
  if (c.tipo_vendedor === 'cpf') linhas.push('<span class="t-suave">Vendedor CPF</span>');
  if (c.cupom_ativo && Number(c.cupom)) linhas.push(`<span class="t-azul">Cupom: ${pct(c.cupom)}</span>`);
  if (c.afiliado_ativo && Number(c.afiliado)) linhas.push(`<span class="t-azul">Afiliado: ${pct(c.afiliado)}</span>`);
  return linhas.join('');
}

// Resumo em uma linha (tela Taxas dos Canais).
export function resumoDoCanal(c) {
  let cobra;
  if (c.tipo === 'faixas') cobra = 'por faixa de preço';
  else if (c.tipo === 'mercadolivre') {
    const propria = comissaoPropria(c);
    cobra = `${propria > 0 ? pct(propria) : c.tipo_anuncio === 'premium' ? 'Premium' : 'Clássico'} + frete`;
  } else if (Number(c.comissao) || Number(c.taxa_fixa)) cobra = `${pct(c.comissao)}${Number(c.taxa_fixa) ? ` + ${reaisCheio(c.taxa_fixa)}` : ''}`;
  else cobra = 'sem comissão';
  const fin = Number(c.taxa_financeira) ? ` · taxa ${pct(c.taxa_financeira)}` : '';
  return `${cobra} · impostos ${pct(c.impostos)}${fin}`;
}

// Faixas como texto: "Até R$79,99", "R$80 – R$99,99", "A partir de R$500".
export function faixasEmTexto(faixas) {
  return faixas.map((f, i) => {
    const inicio = i === 0 ? null : Math.round(faixas[i - 1].ate * 100 + 1) / 100;
    const valor = f.ate == null ? `A partir de ${real(inicio)}` : inicio == null ? `Até ${real(f.ate)}` : `${real(inicio)} – ${real(f.ate)}`;
    return { valor, comissao: `${pct(f.comissao)}${Number(f.taxa_fixa) ? ` + ${real(f.taxa_fixa)}` : ''}` };
  });
}

// Faixa de custo do frete do ML abaixo e a partir de R$ 79.
function faixaDoFrete(frete, abaixoDe79) {
  const cols = frete.precos_a_partir_de.map((p, i) => [p, i]).filter(([p]) => (abaixoDe79 ? p < 79 : p >= 79)).map(([, i]) => i);
  const valores = frete.custos.flatMap((linha) => cols.map((i) => linha[i]));
  return `de ${reaisCheio(Math.min(...valores))} a ${reaisCheio(Math.max(...valores))}`;
}

// Quadro com a regra do canal, no topo da janela "Configurar".
export function quadroDaRegra(id, c, extraTitulo = '', botao = '') {
  if (c.tipo === 'faixas') {
    const linhas = faixasEmTexto(c.faixas).map((f) => `<tr><td>${f.valor}</td><td>${f.comissao}</td></tr>`).join('');
    return `
      <div class="regra laranja">
        <div class="regra-topo"><strong>Comissão por faixa de preço${id === 'shopee' ? ' (CNPJ)' : ''} ${extraTitulo}</strong>${botao}</div>
        <table><thead><tr><th>Valor do item</th><th>Comissão</th></tr></thead><tbody>${linhas}</tbody></table>
        <p class="pe">Calculada automaticamente pelo preço de venda.${id === 'shopee' ? ' Inclui taxa de transação.' : ''}${c.faixas_vigente_desde ? ` Tabela vigente desde ${data(c.faixas_vigente_desde)}.` : ''}</p>
        ${c.frete_percentual ? `<p class="pe">Mais a taxa de frete: ${pct(c.frete_percentual)} do preço, no máximo ${reaisCheio(c.frete_teto)} por produto.</p>` : ''}
      </div>`;
  }
  if (c.tipo === 'mercadolivre') {
    return `
      <div class="regra azul">
        <strong>Frete pago pelo vendedor</strong>
        <p>Calculado pelo preço final e pelo peso.</p>
        <p class="pe">Abaixo de R$ 79: ${faixaDoFrete(c.frete, true)}</p>
        <p class="pe">A partir de R$ 79: ${faixaDoFrete(c.frete, false)}</p>
        ${c.frete_conferido_em ? `<p class="pe">Tabela do Mercado Livre conferida em ${data(c.frete_conferido_em)}</p>` : ''}
      </div>`;
  }
  const venda = tipoDeVenda(c);
  if (venda === 'loja') return '<div class="regra"><strong>Sem comissão de plataforma</strong><p class="pe">A taxa financeira cobre o meio de pagamento e a plataforma da loja.</p></div>';
  if (venda === 'vendedor') return `<div class="regra"><strong>Comissão de vendedora</strong><p class="pe">${esc(pct(c.comissao))} sobre o preço de venda, mais a taxa do meio de pagamento.</p></div>`;
  return `<div class="regra"><strong>Comissão fixa</strong><p class="pe">${pct(c.comissao)} + ${reaisCheio(c.taxa_fixa)} por venda, em qualquer preço.</p></div>`;
}

// Nota do Mercado Livre embaixo de Clássico/Premium.
export function notaDoMercadoLivre(c) {
  const propria = comissaoPropria(c);
  const r = c.faixa_reduzida;
  const faixa = `de ${reaisCheio(r.de)} a ${reaisCheio(r.ate)}`;
  if (propria > 0) return `Com comissão própria, vale ${pct(propria)} em qualquer preço, sem o desconto ${faixa}.`;
  const tipo = c.tipo_anuncio === 'premium' ? 'premium' : 'classico';
  return `Comissão de ${pct(c.comissao[tipo])} (${pct(c.comissao[tipo] - r.reducao[tipo])} ${faixa}). Segue a tabela do Mercado Livre.`;
}
