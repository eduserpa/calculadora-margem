// Tela Calculadora: escolhe produto e canal, digita o preço, vê margem, lucro e preço mínimo.
import { dados, canais } from '../dados.js';
import { porId, custoDoProduto, pesoDoProduto } from '../produtos.js';
import { calcularMargem, precoMinimo } from '../calculos/margem.js';
import { precoPor, descontoPeloPor } from '../calculos/preco-de-por.js';
import { lerNumero, reais, numero, campo, campoReais, porcento, gramas, esc } from '../formato.js';

const $ = (s) => document.querySelector(s);
const CHAVE = 'calculadora-margem.tela';
const semAcento = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Estado da tela (lembrado neste navegador só por conveniência).
const estado = { produtoId: '', custoAvulso: 0, pesoAvulso: 300, canal: 'mercadolivre', de: 0, desconto: 0, margemDesejada: 20, exemplo: false };

function lembrar() {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(estado));
  } catch {
    // sem armazenamento: só não lembra
  }
}

export function faixaDaMargem(m) {
  if (m < 0) return { rotulo: 'Prejuízo', classe: 'ruim' };
  if (m < 10) return { rotulo: 'Margem crítica', classe: 'ruim' };
  if (m < 15) return { rotulo: 'Margem baixa', classe: 'atencao' };
  if (m < 20) return { rotulo: 'Margem razoável', classe: 'atencao' };
  if (m < 25) return { rotulo: 'Margem boa', classe: 'bom' };
  if (m < 40) return { rotulo: 'Margem muito boa', classe: 'bom' };
  return { rotulo: 'Margem excelente', classe: 'bom' };
}

let pronta = false;

export function iniciarCalculadora() {
  if (!canais()) return; // sem as taxas não há conta a fazer (o aviso geral já explica)
  pronta = true;
  try {
    Object.assign(estado, JSON.parse(localStorage.getItem(CHAVE) || '{}'));
  } catch {
    // ignora
  }
  if (!dados.produtos.length && !estado.produtoId && !estado.custoAvulso) {
    Object.assign(estado, { custoAvulso: 50, de: 129.9, desconto: 0, canal: 'mercadolivre', exemplo: true });
  }
  if (!canais()[estado.canal]) estado.canal = Object.keys(canais())[0];

  $('#c-busca').addEventListener('input', desenharProdutos);
  $('#c-produto').addEventListener('change', (e) => {
    estado.produtoId = e.target.value;
    estado.exemplo = false;
    atualizar();
  });
  $('#c-canais').addEventListener('click', (e) => {
    const b = e.target.closest('[data-canal]');
    if (!b) return;
    estado.canal = b.dataset.canal;
    desenharCanais();
    atualizar();
  });
  $('#tela-calculadora').addEventListener('input', aoDigitar);
  $('#c-usar-minimo').addEventListener('click', () => {
    const minimo = Number($('#c-usar-minimo').dataset.preco);
    if (!minimo) return;
    if (!(estado.de > 0) || minimo > estado.de) Object.assign(estado, { de: minimo, desconto: 0 });
    else estado.desconto = descontoPeloPor(estado.de, minimo);
    preencherPrecos();
    atualizar();
  });

  $('#c-custo').value = campoReais(estado.custoAvulso);
  $('#c-peso').value = campo(estado.pesoAvulso);
  $('#c-margem').value = estado.margemDesejada;
  $('#c-margem-num').value = estado.margemDesejada;
  preencherPrecos();
  desenharTudo();
}

// Chamado quando produtos ou taxas mudam em outra tela.
export function desenharTudo() {
  if (!pronta) return;
  desenharProdutos();
  desenharCanais();
  atualizar();
}

function desenharProdutos() {
  const termo = semAcento($('#c-busca').value.trim());
  const lista = dados.produtos
    .filter((p) => !termo || p.id === estado.produtoId || semAcento(p.nome).includes(termo) || semAcento(p.sku).includes(termo))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  if (estado.produtoId && !dados.produtos.some((p) => p.id === estado.produtoId)) estado.produtoId = '';
  $('#c-produto').innerHTML = `<option value="">Sem produto: digitar o custo</option>${lista
    .map((p) => `<option value="${p.id}" ${p.id === estado.produtoId ? 'selected' : ''}>${esc(p.nome)}${p.sku ? ` (${esc(p.sku)})` : ''}</option>`)
    .join('')}`;
}

const pct = (v) => `${(Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;

export function resumoDoCanal(c) {
  let cobra;
  if (c.tipo === 'faixas') cobra = 'por faixa de preço';
  else if (c.tipo === 'mercadolivre') {
    const propria = Number(c.comissao_propria);
    cobra = `${propria > 0 ? pct(propria) : c.tipo_anuncio === 'premium' ? 'Premium' : 'Clássico'} + frete`;
  } else if (Number(c.comissao) || Number(c.taxa_fixa)) cobra = `${pct(c.comissao)}${Number(c.taxa_fixa) ? ` + ${reais(c.taxa_fixa)}` : ''}`;
  else cobra = 'sem comissão';
  const fin = Number(c.taxa_financeira) ? ` · taxa ${pct(c.taxa_financeira)}` : '';
  return `${cobra} · impostos ${pct(c.impostos)}${fin}`;
}

function desenharCanais() {
  $('#c-canais').innerHTML = Object.entries(canais())
    .map(([id, c]) => `
      <button type="button" class="canal" role="radio" aria-checked="${id === estado.canal}" data-canal="${id}">
        <strong>${esc(c.nome)}</strong><span>${esc(resumoDoCanal(c))}</span>
      </button>`)
    .join('');
}

function preencherPrecos(menos) {
  const por = precoPor(estado.de, estado.desconto);
  if (menos !== 'c-de') $('#c-de').value = campoReais(estado.de);
  if (menos !== 'c-desconto') $('#c-desconto').value = estado.desconto ? numero(estado.desconto, Number.isInteger(estado.desconto) ? 0 : 1) : '';
  $('#c-desconto-barra').value = Math.min(70, estado.desconto);
  if (menos !== 'c-por') $('#c-por').value = campoReais(por);
}

function aoDigitar(e) {
  const id = e.target.id;
  const v = lerNumero(e.target.value);
  if (id === 'c-custo') estado.custoAvulso = v;
  else if (id === 'c-peso') estado.pesoAvulso = v;
  else if (id === 'c-de') estado.de = v;
  else if (id === 'c-desconto' || id === 'c-desconto-barra') estado.desconto = Math.min(100, Math.max(0, v));
  else if (id === 'c-por') {
    if (!(estado.de > 0) || v > estado.de) Object.assign(estado, { de: v, desconto: 0 });
    else estado.desconto = descontoPeloPor(estado.de, v);
  } else if (id === 'c-margem' || id === 'c-margem-num') {
    estado.margemDesejada = Math.min(90, Math.max(1, v || 1));
    if (id === 'c-margem') $('#c-margem-num').value = estado.margemDesejada;
    else $('#c-margem').value = estado.margemDesejada;
  } else return;
  estado.exemplo = false;
  preencherPrecos(id === 'c-desconto-barra' ? '' : id);
  atualizar();
}

function custoEPeso() {
  const p = estado.produtoId && porId().get(estado.produtoId);
  if (p) return { cmv: custoDoProduto(p), pesoG: pesoDoProduto(p), produto: p };
  return { cmv: estado.custoAvulso, pesoG: estado.pesoAvulso, produto: null };
}

const linha = (rotulo, valor, preco, classe = '') =>
  `<tr class="${classe}"><td>${rotulo}</td><td class="num">${reais(valor)}</td><td class="num suave">${preco > 0 ? porcento((valor / preco) * 100) : ''}</td></tr>`;

function atualizar() {
  lembrar();
  const canal = canais()[estado.canal];
  const { cmv, pesoG, produto } = custoEPeso();
  const ml = canal.tipo === 'mercadolivre';

  $('#c-avulso').hidden = Boolean(produto);
  $('#c-peso-campo').hidden = !ml;
  $('#c-info-produto').innerHTML = produto
    ? `Custo do produto <strong>${reais(cmv)}</strong>${ml ? ` · peso para frete <strong>${gramas(pesoG)}</strong>` : ''}`
    : '';
  $('#c-exemplo').hidden = !estado.exemplo;

  const preco = precoPor(estado.de, estado.desconto);
  const alvo = $('#c-resultado');
  if (!(preco > 0) || !(cmv > 0)) {
    alvo.innerHTML = `<div class="vazio"><p>${!(cmv > 0) ? 'Escolha um produto ou digite o custo.' : 'Digite o preço de venda para ver a margem.'}</p></div>`;
  } else {
    const r = calcularMargem({ preco, cmv, canal, pesoG });
    const f = faixaDaMargem(r.margem);
    alvo.innerHTML = `
      <div class="placar">
        <div><span class="rotulo">Margem</span><strong class="grande ${f.classe}">${porcento(r.margem)}</strong></div>
        <div><span class="rotulo">Lucro por peça</span><strong class="grande ${f.classe}">${reais(r.lucro)}</strong></div>
        <span class="selo ${f.classe}">${f.rotulo}</span>
      </div>
      <div class="tabela-rolagem">
        <table class="detalhe">
          <thead><tr><th>${esc(canal.nome)}</th><th class="num">R$</th><th class="num">% do preço</th></tr></thead>
          <tbody>
            ${linha('Preço de venda', r.preco, r.preco, 'forte')}
            ${linha(`Comissão (${numero(r.comissaoPercentual, 1)}%)`, -r.comissao, r.preco)}
            ${r.taxaFixa ? linha('Taxa fixa por venda', -r.taxaFixa, r.preco) : ''}
            ${r.freteCanal ? linha(ml ? `Frete grátis pago por você (${gramas(pesoG)})` : `Taxa de frete (${numero(canal.frete_percentual, 0)}%)`, -r.freteCanal, r.preco) : ''}
            ${linha(`Impostos (${numero(r.impostosPercentual, 1)}% sobre o preço)`, -r.impostos, r.preco)}
            ${r.taxaFinanceira ? linha(`Taxa financeira (${numero(r.taxaFinanceiraPercentual, 1)}%)`, -r.taxaFinanceira, r.preco) : ''}
            ${r.embalagem ? linha('Embalagem e manuseio', -r.embalagem, r.preco) : ''}
            ${r.freteAbsorvido ? linha('Frete absorvido', -r.freteAbsorvido, r.preco) : ''}
            ${r.outros ? linha('Outros custos', -r.outros, r.preco) : ''}
            ${linha('Custo do produto (CMV)', -r.cmv, r.preco)}
            ${linha('Lucro por peça', r.lucro, r.preco, 'forte')}
          </tbody>
        </table>
      </div>`;
  }

  const minimo = cmv > 0 ? precoMinimo({ cmv, canal, pesoG, margemDesejada: estado.margemDesejada }) : 0;
  const botao = $('#c-usar-minimo');
  botao.dataset.preco = minimo;
  botao.hidden = !minimo;
  let aviso = '';
  if (!(cmv > 0)) aviso = 'Informe o custo para calcular.';
  else if (!minimo) aviso = `Com essas taxas não dá para chegar a ${estado.margemDesejada}% de margem.`;
  else if (preco > 0 && preco < minimo) aviso = 'O preço digitado está abaixo do mínimo.';
  else if (preco > 0 && calcularMargem({ preco, cmv, canal, pesoG }).margem < estado.margemDesejada) {
    aviso = `O preço digitado cai numa faixa com taxa ou frete mais caro e não chega a ${estado.margemDesejada}%.`;
  }
  $('#c-minimo-valor').textContent = minimo ? reais(minimo) : '—';
  $('#c-minimo-aviso').textContent = aviso;
  $('#c-minimo-aviso').hidden = !aviso;
}
