// Tela Calculadora: produto, canal, preço (DE/desconto/POR), resultado e preço mínimo.
import { dados, canais } from '../dados.js';
import { porId, custoDoProduto, pesoDoProduto } from '../produtos.js';
import { calcularMargem, precoMinimo } from '../calculos/margem.js';
import { precoPor, descontoPeloPor } from '../calculos/preco-de-por.js';
import { lerNumero, reais, numero, campo, campoReais, gramas, esc } from '../formato.js';
import { linhasDoCanal, sigla, tipoDeVenda, TITULO_DO_GRUPO, pct } from '../canais-texto.js';
import { abrirConfigurarCanal } from './configurar-canal.js';

const $ = (s) => document.querySelector(s);
const CHAVE = 'calculadora-margem.tela';
const semAcento = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Estado da tela (lembrado neste navegador só por conveniência).
const estado = { produtoId: '', custoAvulso: 0, pesoAvulso: 300, canal: 'mercadolivre', de: 0, desconto: 0, margemDesejada: 20, exemplo: false };
let pronta = false;

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
    const config = e.target.closest('[data-config]');
    if (config) return abrirConfigurarCanal(config.dataset.config);
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
  if (estado.produtoId && !dados.produtos.some((p) => p.id === estado.produtoId)) estado.produtoId = '';
  const lista = dados.produtos
    .filter((p) => !termo || p.id === estado.produtoId || semAcento(p.nome).includes(termo) || semAcento(p.sku).includes(termo))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  $('#c-produto').innerHTML = `<option value="">${dados.produtos.length ? 'Selecionar produto... (ou digitar o custo)' : 'Sem produto: digitar o custo'}</option>${lista
    .map((p) => `<option value="${p.id}" ${p.id === estado.produtoId ? 'selected' : ''}>${esc(p.nome)}${p.sku ? ` (${esc(p.sku)})` : ''}</option>`)
    .join('')}`;
}

function desenharCanais() {
  $('#c-canais').innerHTML = Object.entries(canais())
    .map(([id, c]) => {
      const [letras, cor] = sigla(id, c);
      return `
        <div class="canal-caixa">
          <button type="button" class="canal" role="radio" aria-checked="${id === estado.canal}" data-canal="${id}">
            <span class="canal-sigla" style="--cor:${cor}" aria-hidden="true">${letras}</span>
            <span class="canal-nome">${esc(c.nome)}</span>
            <span class="canal-linhas">${linhasDoCanal(c)}</span>
          </button>
          <button type="button" class="engrenagem" data-config="${id}" title="Configurar ${esc(c.nome)}" aria-label="Configurar ${esc(c.nome)}">⚙</button>
        </div>`;
    })
    .join('');
}

function preencherPrecos(menos) {
  const por = precoPor(estado.de, estado.desconto);
  if (menos !== 'c-de') $('#c-de').value = campoReais(estado.de);
  if (menos !== 'c-desconto') $('#c-desconto').value = estado.desconto ? numero(estado.desconto, Number.isInteger(estado.desconto) ? 0 : 1) : '';
  if (menos !== 'c-desconto-barra') $('#c-desconto-barra').value = Math.min(70, estado.desconto);
  if (menos !== 'c-por') $('#c-por').value = campoReais(por);
  $('#c-desconto-rotulo').textContent = `${numero(estado.desconto, 0)}%`;
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
  preencherPrecos(id);
  atualizar();
}

function custoEPeso() {
  const p = estado.produtoId && porId().get(estado.produtoId);
  if (p) return { cmv: custoDoProduto(p), pesoG: pesoDoProduto(p), produto: p };
  return { cmv: estado.custoAvulso, pesoG: estado.pesoAvulso, produto: null };
}

const parte = (valor, preco) => `-${reais(valor)} (${numero((valor / preco) * 100, 1)}%)`;
const sub = (rotulo, valor) => (valor ? `<div class="res-linha res-sub"><span>${rotulo}:</span><span class="valor">${reais(valor)}</span></div>` : '');

function htmlResultado(r, canal, pesoG) {
  const venda = tipoDeVenda(canal);
  const ml = canal.tipo === 'mercadolivre';
  const rotuloComissao = venda === 'vendedor' ? 'Comissão vendedora' : canal.tipo === 'fixo' ? 'Comissão' : 'Comissão variável';
  const custosCanal = r.comissao + r.taxaFixa + r.freteCanal + r.taxaFinanceira + r.freteAbsorvido + r.embalagem + r.outros;
  const f = faixaDaMargem(r.margem);
  return `
    <div class="res-linha receita"><span>Receita:</span><span class="valor">${reais(r.preco)}</span></div>
    <div class="res-grupo vermelho"><div class="res-linha"><span>Custo do Produto (CMV):</span><span>${parte(r.cmv, r.preco)}</span></div></div>
    ${custosCanal ? `
      <div class="res-grupo vermelho">
        <div class="res-linha"><span>${TITULO_DO_GRUPO[venda]}:</span><span>${parte(custosCanal, r.preco)}</span></div>
        ${sub(`${rotuloComissao} (${pct(r.comissaoPercentual)})`, r.comissao)}
        ${sub('Taxa fixa', r.taxaFixa)}
        ${ml ? `${sub('Custo do frete grátis (você paga)', r.freteCanal)}<div class="res-detalhe">${reais(r.preco)} + ${gramas(pesoG)} = ${reais(r.freteCanal)}</div>` : sub(`Taxa de frete (${pct(canal.frete_percentual)})`, r.freteCanal)}
        ${sub(`${venda === 'loja' ? 'Taxa fin./plataforma' : 'Taxa financeira'} (${pct(r.taxaFinanceiraPercentual)})`, r.taxaFinanceira)}
        ${sub('Frete absorvido', r.freteAbsorvido)}
        ${sub('Pick & pack', r.embalagem)}
        ${sub('Outros custos', r.outros)}
      </div>` : ''}
    <div class="res-grupo laranja">
      <div class="res-linha"><span>Impostos (${pct(r.impostosPercentual)}):</span><span>${parte(r.impostos, r.preco)}</span></div>
      <div class="res-sub">sobre o preço de venda</div>
    </div>
    <div class="res-total">
      <span class="rotulo">Margem de contribuição</span>
      <div class="numeros"><span class="${f.classe}">${numero(r.margem, 1)}%</span><i></i><span class="${f.classe}">${reais(r.lucro)}</span></div>
      <small>lucro por unidade</small>
      <span class="selo ${f.classe}">${f.rotulo}</span>
    </div>`;
}

function atualizar() {
  lembrar();
  const canal = canais()[estado.canal];
  const { cmv, pesoG, produto } = custoEPeso();
  const ml = canal.tipo === 'mercadolivre';

  $('#c-produto-cartao').classList.toggle('ativo', Boolean(produto));
  $('#c-produto-titulo').innerHTML = produto ? `${esc(produto.nome)}${produto.sku ? ` <span class="sub">(${esc(produto.sku)})</span>` : ''}` : 'Selecione o Produto';
  $('#c-avulso').hidden = Boolean(produto);
  $('#c-peso-campo').hidden = !ml;
  const pelaCaixa = produto && pesoG > (Number(produto.pesoG) || 0);
  $('#c-info-produto').innerHTML = produto
    ? `<span>CMV: <strong>${reais(cmv)}</strong></span><span>Peso: <strong>${gramas(pesoG)}</strong>${pelaCaixa ? ' (pela caixa)' : ''}</span>`
    : '';
  $('#c-exemplo').hidden = !estado.exemplo;
  $('#c-por-rotulo').textContent = `Preço POR (Final) — ${canal.nome}`;
  $('#c-resultado-titulo').textContent = `Resultado — ${canal.nome}`;
  $('#c-data').textContent = new Date().toLocaleDateString('pt-BR');

  const preco = precoPor(estado.de, estado.desconto);
  const alvo = $('#c-resultado');
  if (!(preco > 0) || !(cmv > 0)) {
    alvo.innerHTML = `<div class="vazio-resultado"><b aria-hidden="true">▦</b>${!(cmv > 0) ? 'Selecione um produto ou digite o custo' : 'Preencha os campos para ver o resultado'}</div>`;
  } else {
    alvo.innerHTML = htmlResultado(calcularMargem({ preco, cmv, canal, pesoG }), canal, pesoG);
  }

  const minimo = cmv > 0 ? precoMinimo({ cmv, canal, pesoG, margemDesejada: estado.margemDesejada }) : 0;
  const botao = $('#c-usar-minimo');
  botao.dataset.preco = minimo;
  botao.hidden = !minimo;
  let aviso = '';
  if (!(cmv > 0)) aviso = 'Informe o custo para calcular.';
  else if (!minimo) aviso = `Com essas taxas não dá para chegar a ${estado.margemDesejada}% de margem.`;
  else if (preco > 0 && preco < minimo) aviso = 'Seu preço atual está abaixo do mínimo!';
  else if (preco > 0 && calcularMargem({ preco, cmv, canal, pesoG }).margem < estado.margemDesejada) {
    aviso = `Seu preço atual cai numa faixa de taxa ou frete mais cara e não chega a ${estado.margemDesejada}% de margem.`;
  }
  $('#c-minimo-valor').textContent = minimo ? reais(minimo) : '—';
  $('#c-minimo-sub').textContent = `para margem de ${estado.margemDesejada}%`;
  $('#c-minimo-aviso').textContent = aviso;
  $('#c-minimo-aviso').hidden = !aviso;
}
