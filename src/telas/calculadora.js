// Tela Calculadora: produto, canal, preço (DE/desconto/POR) de cada canal, resultado, preço mínimo,
// liquidação, análise e salvar a precificação do produto naquele canal.
import { icone } from '../icones.js';
import { dados, canais, salvar } from '../dados.js';
import { porId, custoDoProduto, pesoDoProduto, canalDoProduto } from '../produtos.js';
import { calcularMargem, precoMinimo, margemMaxima, precoMelhorAbaixo } from '../calculos/margem.js';
import { margensDosConcorrentes, qualidadeDoNome, candidatosDaBusca, linkSeguro } from '../concorrentes.js';
import * as nuvem from '../nuvem.js';
import { campoNumero } from './numero.js';
import { mostrarAviso } from './aviso.js';
import { precoPor, descontoPeloPor, descontoMaximo } from '../calculos/preco-de-por.js';
import { lerNumero, reais, numero, campo, campoReais, gramas, peso, esc, margemPct } from '../formato.js';
import { irPara } from '../rotas.js';
import { linhasDoCanal, iconeDoCanal, tipoDeVenda, TITULO_DO_GRUPO, pct } from '../canais-texto.js';
import { abrirConfigurarCanal } from './configurar-canal.js';
import { capa } from '../fotos.js';

const $ = (s) => document.querySelector(s);
const CHAVE = 'calculadora-margem.tela';
const AVULSO = '__avulso';
const DICA_CAIXA = 'Caixa grande e leve ocupa espaço no caminhão, então o Mercado Livre cobra o frete pelo tamanho dela, como se pesasse mais. Por isso o frete usa este peso, e não o peso real da peça.';
const MARGEM_LIQUIDACAO = 5;
const semAcento = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const comReais = (v) => (v ? campoReais(v) : ''); // o R$ fica fora do valor, como prefixo da peça (.passo-numero)

// Estado da tela. Só o custo avulso fica lembrado neste navegador; a margem desejada abre sempre em 20%.
const estado = { produtoId: '', custoAvulso: 0, pesoAvulso: 300, canal: '', precos: {}, margemDesejada: 20 };
let pronta = false;

function lembrar() {
  try {
    const { custoAvulso, pesoAvulso } = estado;
    localStorage.setItem(CHAVE, JSON.stringify({ custoAvulso, pesoAvulso }));
  } catch {
    // sem armazenamento: só não lembra
  }
}

export function faixaDaMargem(m) {
  if (m < 0) return { rotulo: 'Prejuízo', faixa: 'abaixo de 0%', classe: 'ruim', frase: 'Cada venda neste preço dá prejuízo. Revise o preço ou os custos.' };
  if (m < 10) return { rotulo: 'Margem crítica', faixa: '0–10% – CRÍTICO', classe: 'ruim', frase: 'Sobra muito pouco. Qualquer devolução ou frete extra vira prejuízo.' };
  if (m < 15) return { rotulo: 'Margem baixa', faixa: '10–15% – BAIXO', classe: 'atencao', frase: 'Margem apertada: evite cupons e anúncios pagos neste preço.' };
  if (m < 20) return { rotulo: 'Margem razoável', faixa: '15–20% – ATENÇÃO', classe: 'atencao', frase: 'Dá para vender, mas sobra pouco espaço para promoções.' };
  if (m < 25) return { rotulo: 'Margem boa', faixa: '20–25% – BOM', classe: 'bom', frase: 'Boa margem: dá para crescer com segurança.' };
  if (m < 40) return { rotulo: 'Margem muito boa', faixa: '25–40% – MUITO BOM', classe: 'bom', frase: 'Margem forte: há espaço para promoções e anúncios.' };
  return { rotulo: 'Margem excelente', faixa: '40% ou mais – EXCELENTE', classe: 'bom', frase: 'Margem muito alta: confira se o preço não está acima do que o cliente aceita.' };
}

// As 7 faixas da Análise da margem, na ordem, com a classe que pinta cada uma.
export const FAIXAS = [
  ['Prejuízo', 'f-prejuizo'], ['Margem crítica', 'f-critica'], ['Margem baixa', 'f-baixa'], ['Margem razoável', 'f-razoavel'],
  ['Margem boa', 'f-boa'], ['Margem muito boa', 'f-muito-boa'], ['Margem excelente', 'f-excelente'],
];
export const classeDaFaixa = (m) => FAIXAS.find(([r]) => r === faixaDaMargem(m).rotulo)[1];

const salvas = (produtoId) => dados.precificacoes?.[produtoId] ?? {};

// Animação dos números: conta do valor anterior até o novo em ~250 ms. A conta não espera a animação,
// e o último quadro mostra sempre o valor exato. Desligada para quem pediu menos movimento.
const semMovimento = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const ultimos = new Map(); // valor mostrado da última vez, por campo
let posicaoMarcador = null;

function contar(id, chave, valor, formatar) {
  const el = document.getElementById(id);
  if (!el) return;
  const de = ultimos.get(chave);
  ultimos.set(chave, valor);
  el.textContent = formatar(valor);
  if (semMovimento() || de == null || de === valor || !Number.isFinite(de)) return;
  let inicio = null;
  const passo = (agora) => {
    if (ultimos.get(chave) !== valor) return; // chegou um valor mais novo: este para
    inicio ??= agora; // conta a partir do 1º quadro: se ele demorar, a animação não pula direto para o fim
    const t = Math.min(1, (agora - inicio) / 250);
    const suave = 1 - (1 - t) ** 3;
    const atual = document.getElementById(id); // o resultado pode ter sido redesenhado no meio
    if (atual) atual.textContent = formatar(t < 1 ? de + (valor - de) * suave : valor);
    if (t < 1) requestAnimationFrame(passo);
  };
  requestAnimationFrame(passo);
  // Sem quadros (aba em segundo plano, janela coberta) a animação parava no meio e mostrava centavos errados: o valor final chega de qualquer jeito.
  setTimeout(() => {
    const atual = document.getElementById(id);
    if (atual && ultimos.get(chave) === valor) atual.textContent = formatar(valor);
  }, 300);
}
const precoDoCanal = () => (estado.precos[estado.canal] ??= { de: 0, desconto: 0 });
// Último preço salvo do canal em uso ({ de: 0, desconto: 0 } se nunca salvou) e se o da tela é diferente dele.
function precoSalvo() {
  const s = (estado.produtoId && salvas(estado.produtoId)[estado.canal]) || {};
  return { de: Number(s.de) || 0, desconto: Number(s.desconto) || 0 };
}
const mudouPreco = () => {
  const p = precoDoCanal();
  const s = precoSalvo();
  return (Number(p.de) || 0) !== s.de || (Number(p.desconto) || 0) !== s.desconto;
};

export function iniciarCalculadora() {
  if (!canais()) return; // sem as taxas não há conta a fazer (o aviso geral já explica)
  pronta = true;
  try {
    const lembrado = JSON.parse(localStorage.getItem(CHAVE) || '{}');
    for (const k of ['custoAvulso', 'pesoAvulso']) if (lembrado[k] != null) estado[k] = lembrado[k];
  } catch {
    // ignora
  }

  // Seletor de produto: um campo só (combobox). Clicou, já digita; a lista filtra logo abaixo.
  const campoProduto = $('#c-seletor');
  campoProduto.addEventListener('focus', () => {
    campoProduto.select();
    desenharProdutos('');
    abrirLista(true);
  });
  campoProduto.addEventListener('click', () => {
    if ($('#c-seletor-lista').hidden) {
      desenharProdutos('');
      abrirLista(true);
    }
  });
  campoProduto.addEventListener('input', () => {
    abrirLista(true);
    desenharProdutos(campoProduto.value);
  });
  campoProduto.addEventListener('keydown', aoTeclarNoProduto);
  $('#c-opcoes').addEventListener('mousedown', (e) => e.preventDefault()); // não tira o foco do campo
  $('#c-opcoes').addEventListener('click', (e) => {
    const o = e.target.closest('[data-produto]');
    if (o) escolherDaLista(o.dataset.produto);
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.seletor')) fecharLista();
  });
  campoProduto.addEventListener('blur', fecharLista);
  $('#c-canais').addEventListener('click', (e) => {
    const config = e.target.closest('[data-config]');
    // com produto escolhido, o imposto da janela vale só para ele nesse canal
    if (config) return abrirConfigurarCanal(config.dataset.config, custoEPeso().produto);
    const b = e.target.closest('[data-canal]');
    if (!b) return;
    escolherCanal(b.dataset.canal);
  });
  // Setas andam pelos canais e já escolhem (padrão de grupo de rádio).
  $('#c-canais').addEventListener('keydown', (e) => {
    const passo = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!passo || !e.target.matches('.canal')) return;
    e.preventDefault();
    const ids = Object.keys(canais());
    const id = ids[(ids.indexOf(e.target.dataset.canal) + passo + ids.length) % ids.length];
    escolherCanal(id);
    $(`#c-canais [data-canal="${id}"]`).focus();
  });
  $('#tela-calculadora').addEventListener('input', aoDigitar);
  $('#tela-calculadora').addEventListener('focusout', (e) => {
    if (['c-de', 'c-por'].includes(e.target.id)) preencherPrecos();
  });
  $('#c-usar-minimo').addEventListener('click', () => {
    const minimo = Number($('#c-usar-minimo').dataset.preco);
    if (!minimo) return;
    // vira o preço de venda, sem desconto (antes mantinha o DE e inventava um desconto até o mínimo)
    Object.assign(precoDoCanal(), { de: minimo, desconto: 0 });
    preencherPrecos();
    atualizar();
  });
  $('#c-salvar').addEventListener('click', salvarPrecificacao);
  // Preço logo abaixo de uma virada de faixa que dá mais lucro (aviso no Resultado): vira o preço de venda, sem desconto.
  $('#c-resultado').addEventListener('click', (e) => {
    const b = e.target.closest('[data-acao="usar-melhor"]');
    if (!b) return;
    Object.assign(precoDoCanal(), { de: Number(b.dataset.preco), desconto: 0 });
    preencherPrecos();
    atualizar();
  });
  iniciarConcorrentes();
  // Descartar: o preço do canal volta ao último salvo (ou vazio, se nunca salvou).
  $('#c-descartar').addEventListener('click', () => {
    const s = precoSalvo();
    estado.precos[estado.canal] = { de: s.de, desconto: s.desconto };
    preencherPrecos();
    $('#c-salvo').textContent = '';
    atualizar();
  });

  $('#c-custo').value = campoReais(estado.custoAvulso);
  $('#c-peso').value = campo(estado.pesoAvulso);
  $('#c-margem').value = estado.margemDesejada;
  $('#c-margem-num').value = campo(estado.margemDesejada); // 20,5 com vírgula
  desenharTudo();
}

// Chamado quando produtos, preços salvos ou taxas mudam em outra tela.
export function desenharTudo() {
  if (!pronta) return;
  desenharProdutos();
  desenharCanais();
  preencherPrecos();
  atualizar();
}

// Para outras telas (Início): abre a Calculadora já no produto e no canal.
export function abrirNaCalculadora(produtoId, canal) {
  irPara('calculadora');
  escolherProduto(produtoId);
  if (canal && canais()[canal]) escolherCanal(canal);
}

function escolherProduto(id) {
  estado.produtoId = id;
  // Começa com os preços já salvos deste produto em cada canal; com um canal só, já abre nele.
  estado.precos = structuredClone(id && id !== AVULSO ? salvas(id) : {});
  const comPreco = Object.keys(estado.precos).filter((c) => canais()[c]);
  estado.canal = comPreco.length === 1 ? comPreco[0] : '';
  desenharProdutos();
  desenharCanais();
  preencherPrecos();
  atualizar();
}

let ativa = -1; // opção destacada na lista (setas)
const opcoes = () => [...document.querySelectorAll('#c-opcoes [data-produto]')];

function nomeEscolhido() {
  if (estado.produtoId === AVULSO) return 'Sem cadastro: digitar o custo';
  const p = porId().get(estado.produtoId);
  return p ? p.nome : '';
}

function abrirLista(abrir) {
  $('#c-seletor-lista').hidden = !abrir;
  $('#c-seletor').setAttribute('aria-expanded', String(abrir));
  if (!abrir) $('#c-seletor').removeAttribute('aria-activedescendant');
}

// Fecha e volta o campo para o produto escolhido.
function fecharLista() {
  if ($('#c-seletor-lista').hidden) return;
  abrirLista(false);
  $('#c-seletor').value = nomeEscolhido();
}

function marcar(i) {
  const lista = opcoes();
  if (!lista.length) return;
  ativa = Math.max(0, Math.min(lista.length - 1, i));
  lista.forEach((o, k) => o.setAttribute('aria-selected', String(k === ativa)));
  $('#c-seletor').setAttribute('aria-activedescendant', lista[ativa].id);
  lista[ativa].scrollIntoView({ block: 'nearest' });
}

function escolherDaLista(id) {
  abrirLista(false);
  escolherProduto(id);
  $('#c-seletor').value = nomeEscolhido();
}

function aoTeclarNoProduto(e) {
  const aberta = !$('#c-seletor-lista').hidden;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (!aberta) {
      abrirLista(true);
      desenharProdutos('');
    }
    marcar(ativa + (e.key === 'ArrowDown' ? 1 : -1));
  } else if (e.key === 'Enter' && aberta && ativa >= 0) {
    e.preventDefault();
    escolherDaLista(opcoes()[ativa].dataset.produto);
  } else if (e.key === 'Escape' && aberta) {
    e.preventDefault();
    fecharLista();
  }
}

function desenharProdutos(busca) {
  const campoProduto = $('#c-seletor');
  if (estado.produtoId && estado.produtoId !== AVULSO && !dados.produtos.some((p) => p.id === estado.produtoId)) estado.produtoId = '';
  if (busca === undefined) {
    // Redesenho vindo de fora: só troca o texto se a pessoa não estiver digitando.
    if (document.activeElement !== campoProduto) campoProduto.value = nomeEscolhido();
    busca = $('#c-seletor-lista').hidden ? '' : campoProduto.value;
  }
  const termo = semAcento(busca.trim());
  const mapa = porId();
  const lista = dados.produtos
    .filter((p) => !termo || semAcento(p.nome).includes(termo) || semAcento(p.sku).includes(termo))
    .sort((a, b) => String(b.atualizadoEm).localeCompare(String(a.atualizadoEm)));
  const quantos = (p) => Object.keys(salvas(p.id)).length;
  $('#c-opcoes').innerHTML = `
    ${lista.map((p, i) => `
      <div class="opcao" id="c-opcao-${i}" role="option" aria-selected="false" data-produto="${p.id}">
        <span class="miniatura mini">${capa(p)}</span>
        <b>${esc(p.nome)}</b>
        <small>${p.sku ? `${esc(p.sku)} · ` : ''}CMV: ${reais(custoDoProduto(p, mapa))}</small>
        ${quantos(p) ? `<span class="etiqueta com">${quantos(p)} preço${quantos(p) > 1 ? 's' : ''}</span>` : '<span class="etiqueta sem">sem preço</span>'}
      </div>`).join('')}
    ${lista.length || !termo ? '' : '<p class="dica" role="presentation">Nenhum produto com esse nome ou SKU.</p>'}
    <div class="opcao" id="c-opcao-avulso" role="option" aria-selected="false" data-produto="${AVULSO}"><span class="miniatura mini">${icone('percent')}</span><b>Sem cadastro: digitar o custo</b><small>para uma conta rápida</small></div>`;
  const indiceEscolhido = opcoes().findIndex((o) => o.dataset.produto === estado.produtoId);
  ativa = -1;
  if (!$('#c-seletor-lista').hidden) marcar(termo || indiceEscolhido < 0 ? 0 : indiceEscolhido);
}

function escolherCanal(id) {
  estado.canal = id;
  desenharCanais();
  preencherPrecos();
  atualizar();
}

function desenharCanais() {
  const produtoSalvo = estado.produtoId && estado.produtoId !== AVULSO ? salvas(estado.produtoId) : {};
  const { cmv, pesoG, produto } = custoEPeso();
  const primeiro = Object.keys(canais())[0];
  $('#c-canais').innerHTML = Object.entries(canais())
    .map(([id, doCanal]) => {
      const c = canalDoProduto(doCanal, produto, id);
      const s = produtoSalvo[id];
      const preco = s ? precoPor(s.de, s.desconto) : 0;
      const resumo = s && preco > 0 && cmv > 0 ? calcularMargem({ preco, cmv, canal: c, pesoG }) : null;
      return `
        <div class="canal-caixa">
          <button type="button" class="canal" role="radio" aria-checked="${id === estado.canal}" tabindex="${id === (estado.canal || primeiro) ? 0 : -1}" data-canal="${id}">
            ${iconeDoCanal(id, c)}
            <span class="canal-nome">${esc(c.nome)}</span>
            <span class="canal-linhas">${linhasDoCanal(c)}</span>
            ${resumo ? `<span class="canal-salvo">Preço: ${reais(preco)} · Margem: ${margemPct(resumo.margem)}</span>` : ''}
          </button>
          <button type="button" class="engrenagem" data-config="${id}" title="Configurar ${esc(c.nome)}" aria-label="Configurar ${esc(c.nome)}">${icone('settings')}</button>
        </div>`;
    })
    .join('');
}

const ateDuasCasas = (v) => (Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 });

function preencherPrecos(menos) {
  const p = estado.canal ? precoDoCanal() : { de: 0, desconto: 0 };
  const por = precoPor(p.de, p.desconto);
  if (menos !== 'c-de') $('#c-de').value = comReais(p.de);
  if (menos !== 'c-desconto') $('#c-desconto').value = p.desconto ? ateDuasCasas(p.desconto) : '';
  if (menos !== 'c-desconto-barra') $('#c-desconto-barra').value = Math.min(70, p.desconto);
  if (menos !== 'c-por') $('#c-por').value = comReais(por);
  $('#c-desconto-rotulo').textContent = `${ateDuasCasas(p.desconto)}%`; // 98,99% / 25% / 12,5%
}

function aoDigitar(e) {
  const id = e.target.id;
  const v = lerNumero(e.target.value);
  if (id === 'c-custo') estado.custoAvulso = v;
  else if (id === 'c-peso') estado.pesoAvulso = v;
  else if (id === 'c-margem' || id === 'c-margem-num') {
    estado.margemDesejada = Math.min(90, Math.max(1, v || 1));
    if (id === 'c-margem') $('#c-margem-num').value = campo(estado.margemDesejada);
    else $('#c-margem').value = estado.margemDesejada;
  } else if (estado.canal && ['c-de', 'c-desconto', 'c-desconto-barra', 'c-por'].includes(id)) {
    const p = precoDoCanal();
    if (id === 'c-de') p.de = v;
    else if (id === 'c-por') {
      if (!(p.de > 0) || v > p.de) Object.assign(p, { de: v, desconto: 0 });
      else p.desconto = Math.min(99, descontoPeloPor(p.de, v));
    } else {
      p.desconto = Math.min(99, Math.max(0, v)); // até 99%: com 100% o POR zera e o resultado some
      if (v > 99) e.target.value = 99;
    }
    preencherPrecos(id);
  } else return;
  if (id === 'c-custo' || id === 'c-peso') desenharCanais();
  $('#c-salvo').textContent = '';
  atualizar();
}

function custoEPeso() {
  const p = estado.produtoId && estado.produtoId !== AVULSO && porId().get(estado.produtoId);
  if (p) return { cmv: custoDoProduto(p), pesoG: pesoDoProduto(p), produto: p };
  return { cmv: estado.custoAvulso, pesoG: estado.pesoAvulso, produto: null };
}

const parte = (valor, preco) => `-${reais(valor)} (${numero((valor / preco) * 100, 1)}%)`;
const sub = (rotulo, valor) => (valor ? `<div class="res-linha res-sub"><span>${rotulo}:</span><span class="valor">${reais(valor)}</span></div>` : '');

function htmlResultado(r, canal, pesoG) {
  const venda = tipoDeVenda(canal);
  const ml = canal.tipo === 'mercadolivre';
  const rotuloComissao = venda === 'vendedor' ? 'Comissão vendedora' : canal.tipo === 'fixo' ? 'Comissão' : 'Comissão variável';
  const custosCanal = r.comissao + r.taxaFixa + r.freteCanal + r.taxaFinanceira + r.freteAbsorvido + r.embalagem + r.outros + r.afiliado + r.adicionalCpf;
  const f = faixaDaMargem(r.margem);
  return `
    ${r.cupom ? `<div class="res-linha res-sub"><span>Preço do anúncio:</span><span class="valor">${reais(r.precoAnuncio)}</span></div>
      <div class="res-linha res-sub"><span>Cupom (${pct(r.cupomPercentual)}):</span><span class="valor">-${reais(r.cupom)}</span></div>` : ''}
    <div class="res-linha receita"><span>Receita${r.cupom ? ' (com cupom)' : ''}:</span><span class="valor">${reais(r.preco)}</span></div>
    <div class="res-grupo vermelho"><div class="res-linha"><span>Custo do Produto (CMV):</span><span>${parte(r.cmv, r.preco)}</span></div></div>
    ${custosCanal ? `
      <div class="res-grupo vermelho">
        <div class="res-linha"><span>${TITULO_DO_GRUPO[venda]}:</span><span>${parte(custosCanal, r.preco)}</span></div>
        ${sub(`${rotuloComissao} (${pct(r.comissaoPercentual)})`, r.comissao)}
        ${sub('Taxa fixa', r.taxaFixa)}
        ${sub('Adicional CPF por item', r.adicionalCpf)}
        ${ml ? `${sub('Custo do frete grátis (você paga)', r.freteCanal)}<div class="res-detalhe">${reais(r.preco)} + ${gramas(pesoG)} = ${reais(r.freteCanal)}</div>` : sub(`SFP - frete subsidiado (${pct(canal.frete_percentual)})`, r.freteCanal)}
        ${sub(`${venda === 'loja' ? 'Taxa fin./plataforma' : 'Taxa financeira'} (${pct(r.taxaFinanceiraPercentual)})`, r.taxaFinanceira)}
        ${sub('Frete absorvido', r.freteAbsorvido)}
        ${sub('Pick & pack', r.embalagem)}
        ${sub('Outros custos', r.outros)}
        ${sub(`Comissão de afiliado (${pct(r.afiliadoPercentual)})`, r.afiliado)}
      </div>` : ''}
    <div class="res-grupo laranja">
      <div class="res-linha"><span>Impostos (${pct(r.impostosPercentual)})${canal.impostoDoProduto ? ' · deste produto' : ''}:</span><span>${parte(r.impostos, r.preco)}</span></div>
      <div class="res-sub">Tributos sobre vendas, calculados sobre o preço de venda</div>
    </div>
    <div class="res-total">
      <span class="rotulo">Margem de contribuição</span>
      <div class="numeros"><span class="${f.classe}" id="c-num-margem">${margemPct(r.margem)}</span><i></i><span class="${f.classe}" id="c-num-lucro">${reais(r.lucro)}</span></div>
      <small>lucro por unidade</small>
    </div>`;
}

// Um leão por faixa da margem, embaixo da barra, com uma dica curta. A entrada só anima quando a faixa muda,
// não a cada tecla (o cartão é redesenhado a cada número digitado).
let mascoteAntes = null;
// Arquivos 2x de 192 de altura, mostrados a 96 pelo CSS (leão nunca abaixo de 72 px); largura e altura = as do arquivo, só
// para a proporção.
const LEAO_DA_FAIXA = {
  'Prejuízo': ['prejuizo-192', 171, 192, 'Assim o leão passa fome! Suba o preço ou corte custos.'],
  'Margem crítica': ['margem-critica-192', 175, 192, 'Tá roendo as unhas: qualquer frete extra vira prejuízo.'],
  'Margem baixa': ['margem-baixa-192', 197, 192, 'Cada moedinha conta. Fuja de cupom neste preço.'],
  'Margem razoável': ['margem-razoavel-192', 207, 192, 'Dá pro gasto, mas dá pra melhorar.'],
  'Margem boa': ['margem-boa-192', 194, 192, 'Bom negócio! Dá pra crescer com segurança.'],
  'Margem muito boa': ['margem-muito-boa-192', 241, 192, 'Margem de leão: sobra espaço para anúncio.'],
  'Margem excelente': ['sucesso-192', 177, 192, 'Rugido de campeão! Só confira se o cliente aceita esse preço.'],
};
function mascoteDaAnalise(f) {
  const [img, largura, altura, dica] = LEAO_DA_FAIXA[f.rotulo];
  const entra = img !== mascoteAntes;
  mascoteAntes = img;
  return `<div class="mascote-analise"><img src="assets/mascote/${img}.webp" alt="" width="${largura}" height="${altura}" class="mascote-img${entra ? ' mascote-entra' : ''}" decoding="async"><p>${dica}</p></div>`;
}

function htmlAnalise(margem) {
  const f = faixaDaMargem(margem);
  const posicao = ((Math.max(-10, Math.min(50, margem)) + 10) / 60) * 100;
  return `
    <div class="analise-topo"><h2>Análise da margem</h2><span>${f.faixa}</span></div>
    <h3 class="${f.classe}">${f.frase}</h3>
    <div class="marcador" style="margin-top:28px; --x:${posicaoMarcador ?? posicao}%" data-alvo="${posicao}"><b>${margemPct(margem)}</b><i></i></div>
    <div class="barra-faixas" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span><span></span><span></span></div>
    <div class="escala">${[-10, 0, 10, 20, 25, 40, 50].map((v) => `<span style="left:${((v + 10) / 60) * 100}%">${v}%${v === 50 ? '+' : ''}</span>`).join('')}</div>
    ${mascoteDaAnalise(f)}`;
}

function atualizar() {
  lembrar();
  const temProduto = Boolean(estado.produtoId);
  const { cmv, pesoG, produto } = custoEPeso();
  $('#c-depois-produto').hidden = !temProduto;
  $('#c-produto-cartao').classList.toggle('ativo', Boolean(produto));
  $('#c-seletor-foto').hidden = !produto;
  $('#c-seletor-foto').innerHTML = produto ? capa(produto) : '';
  $('#c-seletor').classList.toggle('com-foto', Boolean(produto));
  $('#c-avulso').hidden = estado.produtoId !== AVULSO;
  const pelaCaixa = produto && pesoG > (Number(produto.pesoG) || 0);
  $('#c-info-produto').innerHTML = produto
    ? `<span class="pilula">CMV <strong>${reais(cmv)}</strong></span>${produto.sku ? `<span class="pilula">Ref <strong>${esc(produto.sku)}</strong></span>` : ''}${pelaCaixa
      ? `<span class="pilula">Frete ML: <strong>${peso(pesoG)}</strong> pela caixa <span class="info-pilula" tabindex="0" role="img" aria-label="${DICA_CAIXA}" data-dica>${icone('info')}</span></span>` : ''}`
    : '';
  $('#c-exemplo').hidden = true;
  $('#c-sem-canal').hidden = Boolean(estado.canal);
  $('#c-calc').hidden = !estado.canal;
  $('#c-acoes').hidden = !estado.canal || !produto;
  $('#c-descartar').hidden = !produto || !estado.canal || !mudouPreco();
  if (!temProduto || !estado.canal) return;

  const canal = canalDoProduto(canais()[estado.canal], produto, estado.canal);
  $('#c-peso-campo').hidden = canal.tipo !== 'mercadolivre';
  $('#c-por-rotulo').textContent = `Preço POR (Final) — ${canal.nome}`;
  $('#c-resultado-titulo').textContent = `Resultado — ${canal.nome}`;
  $('#c-data').textContent = new Date().toLocaleDateString('pt-BR');

  const p = precoDoCanal();
  const preco = precoPor(p.de, p.desconto);
  const alvo = $('#c-resultado');
  const r = preco > 0 && cmv > 0 ? calcularMargem({ preco, cmv, canal, pesoG }) : null;
  alvo.innerHTML = r ? htmlResultado(r, canal, pesoG) + htmlPrecoMelhor(preco, cmv, canal, pesoG) : `<div class="vazio-resultado"><b>${icone('percent')}</b>Preencha os campos para ver o resultado</div>`;
  $('#c-resultado-titulo').textContent = r ? `Resultado — ${canal.nome}` : 'Resultado';
  $('#c-data').hidden = !r;
  $('#c-analise').innerHTML = r ? htmlAnalise(r.margem) : '';
  if (r) {
    contar('c-num-margem', 'margem', r.margem, margemPct);
    contar('c-num-lucro', 'lucro', r.lucro, reais);
    const marcador = $('#c-analise .marcador');
    const alvo = Number(marcador.dataset.alvo);
    requestAnimationFrame(() => marcador.style.setProperty('--x', `${alvo}%`)); // o CSS posiciona b e i por left: var(--x)
    posicaoMarcador = alvo;
  } else {
    ultimos.delete('margem');
    ultimos.delete('lucro');
    posicaoMarcador = null;
  }

  const minimo = cmv > 0 ? precoMinimo({ cmv, canal, pesoG, margemDesejada: estado.margemDesejada }) : 0;
  const botao = $('#c-usar-minimo');
  botao.dataset.preco = minimo;
  botao.hidden = !minimo;
  let aviso = '';
  if (!(cmv > 0)) aviso = 'Informe o custo para calcular.';
  else if (!minimo) {
    const teto = margemMaxima({ canal, pesoG });
    aviso = estado.margemDesejada >= teto
      ? `Neste canal a margem máxima possível é ${numero(teto, 1)}%, porque as taxas levam ${numero(100 - teto, 1)}% do preço.`
      : `Com essas taxas não dá para chegar a ${campo(estado.margemDesejada)}% de margem.`; // raro: o custo fixo é que impede
  }
  if (minimo) contar('c-minimo-valor', 'minimo', minimo, reais);
  else {
    ultimos.delete('minimo');
    $('#c-minimo-valor').textContent = '—';
  }
  $('#c-minimo-sub').textContent = `para margem de ${campo(estado.margemDesejada)}%`;
  desenharConcorrentes({ produto, canal, cmv, pesoG, minimo });
  $('#c-minimo-aviso').textContent = aviso;
  $('#c-minimo-aviso').hidden = !aviso;

  // Preço de liquidação: menor preço que ainda deixa 5% de margem, e o desconto máximo sobre o preço DE.
  const liquidacao = cmv > 0 ? precoMinimo({ cmv, canal, pesoG, margemDesejada: MARGEM_LIQUIDACAO }) : 0;
  const descMax = liquidacao && p.de > 0 ? descontoMaximo(p.de, liquidacao) : null;
  $('#c-liquidacao').innerHTML = liquidacao
    ? `<div class="linha"><b>Preço de Liquidação</b><span class="dica">Margem alvo: ${MARGEM_LIQUIDACAO}%</span></div>
       <div class="linha"><strong>${reais(liquidacao)}</strong>${descMax != null && descMax > 0 ? `<span>Desconto máx: ${numero(descMax, 1)}%</span>` : ''}</div>
       <p class="dica">${descMax != null && descMax < 0 ? 'Margem de liquidação acima da margem atual.' : `Menor preço para recuperar os custos com margem mínima de ${MARGEM_LIQUIDACAO}%.`}</p>`
    : '';
}

// Uma linha discreta no Resultado quando um preço logo abaixo (antes de o frete, a comissão ou a taxa fixa subirem) dá mais lucro.
const PARTE = { freteCanal: (c) => `o frete do ${c.nome} fica`, taxaFixa: () => 'a taxa fixa fica', comissao: () => 'a comissão fica' };
function htmlPrecoMelhor(preco, cmv, canal, pesoG) {
  const m = precoMelhorAbaixo({ preco, cmv, canal, pesoG });
  if (!m) return '';
  return `<div class="aviso-tipo sucesso conc-aviso"><p class="aviso-texto">A ${reais(m.preco)} ${PARTE[m.motivo](canal)} ${reais(m.economia)} mais barato: margem ${margemPct(m.margem)} e lucro ${reais(m.lucro)}.</p>
    <button type="button" class="botao pequeno" data-acao="usar-melhor" data-preco="${m.preco}">Usar este preço</button></div>`;
}

// ---------- concorrentes (só com a nuvem; correções 12 e 13): busca no ML pelo Apify ou à mão ----------
// O cartão tem uma parte fixa (formulário e lista da busca, que não podem sumir enquanto a pessoa digita ou marca) e
// partes redesenhadas (corpo e ações). A busca só aparece no canal Mercado Livre: um botão busca pelo nome do produto; a
// última busca fica guardada por produto e volta ao abrir (sem gastar crédito), com "Atualizar" para buscar de novo.
// Os anúncios da busca entram TODOS no cálculo (resumo, margem, Início) junto com os anotados à mão; a pessoa desmarca os
// que não são o mesmo produto e eles ficam na lista, apagados. A escolha fica guardada e vale também depois do Atualizar.
let todosConc = null; // os da empresa, lidos na 1ª vez que um produto e um canal aparecem
let lendoConc = false;
let fecharNovoConc = () => {};
let ondeConc = ''; // produto|canal do cartão: mudou, o formulário aberto fecha (senão gravaria no canal novo sem a pessoa ver)
const buscas = new Map(); // produtoId -> última busca guardada (null: nunca buscou; undefined: lendo)
const buscando = new Set(); // produtoIds com busca em andamento

const LEAO_BUSCANDO = `<picture><source media="(prefers-reduced-motion: reduce)" srcset="assets/mascote/buscando-parado.webp"><img src="assets/mascote/buscando-anim.webp" alt="" width="66" height="72"></picture>`;
const quando = (iso) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
};

function iniciarConcorrentes() {
  const caixa = $('#c-concorrentes');
  caixa.innerHTML = `
    <h2 id="c-conc-titulo">Concorrentes neste canal</h2>
    <div class="conc-trancado" hidden>
      <img src="assets/mascote/trancado-144.webp" alt="" width="129" height="144">
      <div><p class="conc-trancado-texto">Só o admin da empresa busca e edita concorrentes.</p><p class="dica">Peça ao admin para buscar os concorrentes deste produto.</p></div>
    </div>
    <div id="c-conc-corpo"></div>
    <div class="conc-nome-fraco" hidden>
      <div class="aviso-tipo atencao"><p class="aviso-texto">O nome deste produto é curto ou tem só código, então os concorrentes podem vir menos precisos.</p>
        <button type="button" class="botao pequeno" data-acao="corrigir-nome">Corrigir nome</button></div>
      <form class="conc-renomear" novalidate hidden>
        <label class="campo"><span>Nome do produto</span><input type="text" name="nome" autocomplete="off" required></label>
        <p class="erro" role="alert" hidden></p>
        <div class="direita"><button type="button" class="botao" data-acao="cancelar-nome">Cancelar</button><button type="submit" class="botao principal">Salvar</button></div>
      </form>
    </div>
    <div class="conc-acoes"></div>
    <p class="dica conc-aviso-apify">Cada busca usa créditos do Apify (cerca de 20 por mês no plano grátis).</p>
    <div class="conc-busca" hidden>
      <p class="dica conc-instrucao"></p>
      <div class="conc-topo-lista"><p class="dica conc-contador" role="status"></p>
        <label class="conc-ordem"><span>Ordenar por</span><select id="c-conc-ordem">
          <option value="">Relevância no Mercado Livre</option>
          <option value="preco:1">Preço: menor para maior</option><option value="preco:-1">Preço: maior para menor</option>
          <option value="margem:1">Margem: menor para maior</option><option value="margem:-1">Margem: maior para menor</option>
          <option value="lucro:1">Lucro: menor para maior</option><option value="lucro:-1">Lucro: maior para menor</option>
        </select></label></div>
      <ul class="conc-candidatos"></ul>
    </div>
    <form class="conc-novo" novalidate hidden>
      <label class="campo"><span>Vendedor</span><input type="text" name="vendedor" autocomplete="off" required></label>
      <label class="campo"><span>Preço</span>${campoNumero('<input type="text" inputmode="decimal" name="preco" placeholder="0,00" required>', 'R$')}</label>
      <label class="campo"><span>Link do anúncio (opcional)</span><input type="url" name="link" placeholder="https://" autocomplete="off"></label>
      <p class="erro" role="alert" hidden></p>
      <div class="direita"><button type="button" class="botao" data-acao="cancelar-conc">Cancelar</button><button type="submit" class="botao principal">Adicionar</button></div>
    </form>`;
  const form = caixa.querySelector('.conc-novo');
  const acoes = caixa.querySelector('.conc-acoes');
  const busca = caixa.querySelector('.conc-busca');
  const renomear = caixa.querySelector('.conc-renomear');
  const erro = (t) => Object.assign(form.querySelector('.erro'), { textContent: t, hidden: !t });
  const erroNome = (t) => Object.assign(renomear.querySelector('.erro'), { textContent: t, hidden: !t });
  const fecharNome = () => {
    erroNome('');
    renomear.hidden = true;
    caixa.querySelector('[data-acao="corrigir-nome"]').hidden = false;
  };
  const fechar = () => {
    form.reset();
    erro('');
    form.hidden = true;
    acoes.hidden = false;
    fecharNome();
  };
  fecharNovoConc = fechar;
  // Desmarcar tira o anúncio do cálculo (e marcar devolve). A tela muda na hora; a escolha é guardada logo depois.
  busca.addEventListener('change', async (e) => {
    if (e.target.id === 'c-conc-ordem') {
      ordemBusca = e.target.value;
      desenhoBusca = '';
      return atualizar();
    }
    const caixinha = e.target.closest('input[data-chave]');
    const id = estado.produtoId;
    const salva = buscas.get(id);
    if (!caixinha || !salva) return;
    const antes = salva.excluidos ?? [];
    const chave = caixinha.dataset.chave;
    const excluidos = caixinha.checked ? antes.filter((k) => k !== chave) : [...new Set([...antes, chave])];
    buscas.set(id, { ...salva, excluidos });
    caixinha.closest('li').classList.toggle('fora', !caixinha.checked);
    atualizar();
    try {
      await nuvem.salvarExcluidos(id, excluidos);
    } catch (falha) {
      buscas.set(id, { ...buscas.get(id), excluidos: antes });
      desenhoBusca = ''; // volta as caixinhas como estavam
      atualizar();
      mostrarAviso(falha.message, 'erro');
    }
  });
  // "Excluir?" armado: clicar fora ou Esc desfaz (composedPath: depois do 1º clique o ícone vira texto e o alvo pode sumir)
  const desarmar = () => caixa.querySelector('[data-excluir-conc][data-confirmar]') && atualizar();
  document.addEventListener('click', (e) => !e.composedPath().some((el) => el.dataset?.confirmar === 'sim') && desarmar());
  document.addEventListener('keydown', (e) => e.key === 'Escape' && desarmar());
  caixa.addEventListener('click', async (e) => {
    if (e.target.closest('[data-acao="novo-conc"]')) {
      form.hidden = false;
      acoes.hidden = true;
      return form.elements.vendedor.focus();
    }
    if (e.target.closest('[data-acao="cancelar-conc"]')) return fechar();
    if (e.target.closest('[data-acao="corrigir-nome"]')) {
      renomear.elements.nome.value = custoEPeso().produto?.nome ?? '';
      renomear.hidden = false;
      e.target.closest('button').hidden = true;
      return renomear.elements.nome.select();
    }
    if (e.target.closest('[data-acao="cancelar-nome"]')) {
      fecharNome();
      return caixa.querySelector('[data-acao="corrigir-nome"]').focus();
    }
    // Regra do Eduardo: o Apify (que custa) só é chamado aqui, no clique de verdade da pessoa em "Buscar concorrentes" ou
    // "Atualizar". Abrir a tela ou trocar de produto/canal só lê a busca guardada (tests/busca-so-no-clique.test.js).
    if (e.target.closest('[data-acao="buscar-ml"]')) return e.isTrusted && buscarNoML();
    const lixeira = e.target.closest('[data-excluir-conc]');
    if (!lixeira) return;
    // Mesmo padrão da lixeira dos produtos: o 1º clique pergunta no próprio botão, o 2º exclui.
    if (lixeira.dataset.confirmar !== 'sim') {
      lixeira.dataset.confirmar = 'sim';
      lixeira.classList.add('confirmar');
      lixeira.textContent = 'Excluir?';
      lixeira.setAttribute('aria-label', `Excluir? Clique de novo para excluir ${lixeira.dataset.vendedor}`);
      return;
    }
    try {
      await nuvem.removerConcorrente(lixeira.dataset.excluirConc);
      todosConc = todosConc.filter((c) => c.id !== lixeira.dataset.excluirConc);
      atualizar();
    } catch (falha) {
      mostrarAviso(falha.message, 'erro');
    }
  });

  // Busca pelo nome do produto e guarda (substitui a anterior). Trocar de produto no meio não atrapalha: fica no produto certo.
  async function buscarNoML() {
    const { produto } = custoEPeso();
    if (!produto || buscando.has(produto.id)) return;
    buscando.add(produto.id);
    atualizar();
    try {
      const nova = await nuvem.buscarConcorrentesNoML({ produtoId: produto.id, termo: qualidadeDoNome(produto.nome, produto.sku).termo });
      buscas.set(produto.id, nova);
      if (nova.naoGuardou) mostrarAviso('A busca não ficou guardada: da próxima vez que abrir o produto, ela não aparece.', 'erro');
    } catch (falha) {
      mostrarAviso(falha.message, 'erro');
    }
    buscando.delete(produto.id);
    atualizar();
    if (estado.produtoId === produto.id) (busca.querySelector('input[data-chave]') ?? acoes.querySelector('[data-acao="buscar-ml"]'))?.focus();
  }

  // Corrigir o nome ali mesmo: grava como a tela de produtos (dados + salvar, entra no histórico) e NÃO busca de novo.
  renomear.addEventListener('submit', (e) => {
    e.preventDefault();
    const nome = renomear.elements.nome.value.trim();
    if (!nome) return erroNome('Escreva o nome do produto.');
    const antes = dados.produtos;
    dados.produtos = dados.produtos.map((p) => (p.id === estado.produtoId ? { ...p, nome, atualizadoEm: new Date().toISOString() } : p));
    if (!salvar()) {
      dados.produtos = antes;
      salvar();
      return erroNome('Não deu para salvar o nome agora. Tente de novo.');
    }
    fecharNome();
    desenharProdutos(); // o seletor da Calculadora mostra o nome novo
    atualizar(); // reavalia o aviso
    mostrarAviso('Nome salvo.');
    (caixa.querySelector('.conc-nome-fraco:not([hidden]) [data-acao="corrigir-nome"]') ?? acoes.querySelector('[data-acao="buscar-ml"]'))?.focus();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const enviar = form.querySelector('[type=submit]');
    if (enviar.disabled) return;
    enviar.disabled = true;
    try {
      const c = await nuvem.adicionarConcorrente({
        produtoId: estado.produtoId, canal: estado.canal, vendedor: form.elements.vendedor.value,
        preco: lerNumero(form.elements.preco.value), link: form.elements.link.value,
      });
      todosConc = [...(todosConc ?? []), c];
      fechar();
      atualizar();
    } catch (falha) {
      erro(falha.message);
    } finally {
      enviar.disabled = false;
    }
  });
}

async function lerConcorrentes() {
  if (lendoConc) return;
  lendoConc = true;
  try {
    todosConc = await nuvem.concorrentes();
  } catch (falha) {
    todosConc = [];
    mostrarAviso(falha.message, 'erro');
  }
  lendoConc = false;
  atualizar();
}

// Ações (Buscar / Buscado em + Atualizar / Buscando) e a lista da última busca guardada do produto, com a caixinha de cada
// anúncio (marcada = no cálculo). Só redesenha a lista quando a busca, o custo, o peso ou o canal mudam: desmarcar não a
// redesenha (o foco fica na caixinha). -> os anúncios da busca, com { fora }, para o resumo do cartão.
let desenhoAcoes = '';
let desenhoBusca = '';
let ordemBusca = ''; // '' = relevância do ML; 'preco:1', 'margem:-1'... (só a tela; não muda o que entra no cálculo)
function desenharBusca({ produto, canal, cmv, pesoG }) {
  const caixa = $('#c-concorrentes');
  const acoes = caixa.querySelector('.conc-acoes');
  const lista = caixa.querySelector('.conc-busca');
  if (!buscas.has(produto.id)) {
    buscas.set(produto.id, undefined); // lendo
    nuvem.ultimaBusca(produto.id).then((b) => {
      buscas.set(produto.id, b);
      atualizar();
    });
  }
  const salva = buscas.get(produto.id);
  const mao = `<button type="button" class="botao pequeno" data-acao="novo-conc">${icone('plus')} Adicionar à mão</button>`;
  const html = salva === undefined ? mao
    : buscando.has(produto.id) ? `<p class="conc-buscando" role="status">${LEAO_BUSCANDO}<span>Buscando concorrentes…</span></p>${mao}`
    : salva ? `<p class="conc-buscado"><span>Buscado em ${esc(quando(salva.buscadoEm))}</span><button type="button" class="botao pequeno" data-acao="buscar-ml">Atualizar</button></p>${mao}`
    : `<button type="button" class="botao principal" data-acao="buscar-ml">Buscar concorrentes</button>${mao}`;
  if (html !== desenhoAcoes) acoes.innerHTML = desenhoAcoes = html;
  caixa.querySelector('.conc-nome-fraco').hidden = qualidadeDoNome(produto.nome, produto.sku).boa;

  // a busca guardada vem do banco, gravada por qualquer membro: candidatosDaBusca devolve cada campo ao tipo certo
  const daBusca = candidatosDaBusca(salva);
  lista.hidden = !salva || buscando.has(produto.id);
  if (lista.hidden) {
    desenhoBusca = '';
    return daBusca;
  }
  const chave = JSON.stringify([produto.id, salva.buscadoEm, cmv, pesoG, estado.canal, ordemBusca]);
  if (chave === desenhoBusca) return daBusca;
  desenhoBusca = chave;
  lista.querySelector('.conc-instrucao').textContent = daBusca.length
    ? `Anúncios do Mercado Livre para "${salva.termo}": todos entram no cálculo. Desmarque os que não são o mesmo produto que o seu.`
    : `Nada encontrado no Mercado Livre para "${salva.termo}". Use "Adicionar à mão".`;
  const comConta = daBusca.map((c) => ({ c, r: cmv > 0 ? calcularMargem({ preco: c.preco, cmv, canal, pesoG }) : null }));
  if (ordemBusca) {
    const [campo, sentido] = ordemBusca.split(':');
    const valor = ({ c, r }) => (campo === 'preco' ? c.preco : r ? (campo === 'margem' ? r.margem : r.lucro) : -Infinity);
    comConta.sort((a, b) => (valor(a) - valor(b)) * Number(sentido));
  }
  lista.querySelector('#c-conc-ordem').value = ordemBusca;
  lista.querySelector('.conc-candidatos').innerHTML = comConta.map(({ c, r }) => {
    return `<li class="conc-candidato${c.fora ? ' fora' : ''}">
      <label><input type="checkbox" data-chave="${esc(c.chave)}" ${c.fora ? '' : 'checked'}>
        <span class="miniatura">${c.foto ? `<img src="${esc(c.foto)}" alt="" loading="lazy">` : icone('package')}</span>
        <span class="conc-cand-info">
          <span class="conc-cand-titulo">${esc(c.titulo)}</span>
          <span class="conc-cand-meta"><span class="conc-vendedor">Marca: ${esc(c.vendedor)}</span>${c.full ? '<span class="etiqueta conc-selo">Full</span>' : ''}${c.freteGratis ? '<span class="etiqueta conc-selo">Frete grátis</span>' : ''}${c.vendidos ? `<span class="conc-vendidos">+${Number(c.vendidos).toLocaleString('pt-BR')} vendidos</span>` : ''}</span>
        </span>
        <span class="conc-num conc-preco"><small>preço</small>${reais(c.preco)}</span>
        ${r ? `<span class="conc-num conc-margem ${classeDaFaixa(r.margem)}"><small>margem</small>${margemPct(r.margem)}</span>
        <span class="conc-num conc-lucro"><small>lucro</small>${reais(r.lucro)}</span>` : ''}
      </label>
      ${linkSeguro(c.link) ? `<a class="botao conc-link" href="${esc(c.link)}" target="_blank" rel="noopener noreferrer" title="Ver anúncio no Mercado Livre" aria-label="Ver anúncio (marca ${esc(c.vendedor)}) no Mercado Livre (abre em nova aba)">${icone('external-link')}</a>` : ''}
    </li>`;
  }).join('');
  return daBusca;
}

const dataCurta = (iso) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

function desenharConcorrentes({ produto, canal, cmv, pesoG, minimo }) {
  const caixa = $('#c-concorrentes');
  // Só no Mercado Livre (Eduardo, 1.2.2): nos outros canais o cartão some inteiro e nada é lido; o que foi anotado à mão
  // neles continua guardado no banco.
  caixa.hidden = !produto || !nuvem.empresaAtual() || canal.tipo !== 'mercadolivre';
  if (caixa.hidden) return;
  // Membro (não admin): a feature inteira fica trancada (Eduardo, 1.2.3; o banco também recusa, correção 16). Só o título, o
  // leão e a frase; nada é lido do banco. O leão nunca fica menor que 72 px: o arquivo 2x (144) aparece na metade.
  if (!nuvem.souDono()) {
    for (const parte of caixa.children) parte.hidden = !parte.matches('h2, .conc-trancado');
    return;
  }
  const corpo = $('#c-conc-corpo');
  if (ondeConc !== `${produto.id}|${estado.canal}`) fecharNovoConc();
  ondeConc = `${produto.id}|${estado.canal}`;
  const daBusca = desenharBusca({ produto, canal, cmv, pesoG });
  if (todosConc === null) {
    corpo.innerHTML = '<p class="dica">Carregando…</p>';
    lerConcorrentes();
    return;
  }
  const lista = todosConc.filter((c) => c.produtoId === produto.id && c.canal === estado.canal); // anotados à mão
  const noCalculo = [...lista, ...daBusca.filter((c) => !c.fora)];
  const total = lista.length + daBusca.length;
  caixa.querySelector('.conc-contador').textContent = daBusca.length
    ? `${total} concorrente${total === 1 ? '' : 's'}, ${daBusca.filter((c) => c.fora).length} fora do cálculo` : '';
  if (!noCalculo.length) {
    corpo.innerHTML = daBusca.length
      ? '<p class="dica conc-vazio">Todos os anúncios da busca estão fora do cálculo. Marque os que são o mesmo produto que o seu.</p>'
      : `<p class="dica conc-vazio">Nenhum concorrente anotado no ${esc(canal.nome)}. Busque no Mercado Livre ou anote o preço de quem vende o mesmo produto e veja a margem e o lucro que você teria no preço dele.</p>`;
    return;
  }
  const m = margensDosConcorrentes({ concorrentes: noCalculo, cmv, canal, pesoG, minimo });
  const manuais = m.itens.filter((c) => c.id); // os da busca aparecem na lista dela, com a caixinha
  const comCusto = cmv > 0; // sem custo, a margem no preço deles seria inventada
  // mini-cartões: o preço e, com custo, a margem que teríamos vendendo nele
  const subMargem = (preco) => {
    if (!comCusto) return '';
    const r = calcularMargem({ preco, cmv, canal, pesoG });
    return `<span class="conc-num-sub ${classeDaFaixa(r.margem)}">margem ${margemPct(r.margem)}</span>`;
  };
  const numCartao = (rotulo, preco) =>
    `<div class="conc-num-cartao"><span class="conc-num-rotulo">${rotulo}</span><strong class="conc-num-valor">${reais(preco)}</strong>${subMargem(preco)}</div>`;
  const n = noCalculo.length;
  // "abaixo do mínimo" só quando há preço mínimo (com custo); sem ele, um 0 enganaria
  const abaixo = minimo > 0 ? `<div class="conc-num-cartao ${m.abaixoDoMinimo ? 'conc-abaixo' : 'conc-abaixo-zero'}"><span class="conc-num-rotulo">Abaixo do seu mínimo</span><strong class="conc-num-valor">${m.abaixoDoMinimo}</strong><span class="conc-num-sub">de ${n} concorrente${n === 1 ? '' : 's'}</span></div>` : '';
  corpo.innerHTML = `
    <div class="conc-resumo">${numCartao('Menor', m.menor)}${numCartao('Mediana', m.mediana)}${numCartao('Maior', m.maior)}${abaixo}</div>
    ${comCusto ? '' : '<p class="dica">Informe o custo do produto para ver a margem e o lucro no preço de cada um.</p>'}
    ${manuais.length ? `<ul class="conc-lista">${manuais.map((c) => `
      <li class="conc-item">
        <span class="conc-item-info"><span class="conc-vendedor">${esc(c.vendedor)}</span><time class="conc-data" datetime="${esc(c.criadoEm)}">${dataCurta(c.criadoEm)}</time></span>
        <span class="conc-num conc-preco"><small>preço</small>${reais(c.preco)}</span>
        ${comCusto ? `<span class="conc-num conc-margem ${classeDaFaixa(c.margem)}"><small>margem</small>${margemPct(c.margem)}</span>
        <span class="conc-num conc-lucro"><small>lucro</small>${reais(c.lucro)}</span>` : ''}
        ${linkSeguro(c.link) ? `<a class="botao conc-link" href="${esc(c.link)}" target="_blank" rel="noopener noreferrer" title="Ver anúncio" aria-label="Ver anúncio de ${esc(c.vendedor)} (abre em nova aba)">${icone('external-link')}</a>` : ''}
        <button type="button" class="botao perigo" data-excluir-conc="${esc(c.id)}" data-vendedor="${esc(c.vendedor)}" aria-label="Excluir ${esc(c.vendedor)}" title="Excluir">${icone('trash-2')}</button>
      </li>`).join('')}
    </ul>` : ''}`;
}

function salvarPrecificacao() {
  const { produto } = custoEPeso();
  if (!produto || !estado.canal) return;
  const p = precoDoCanal();
  if (!(precoPor(p.de, p.desconto) > 0)) {
    $('#c-salvo').textContent = 'Digite o preço antes de salvar.';
    return;
  }
  dados.precificacoes[produto.id] = { ...salvas(produto.id), [estado.canal]: { de: p.de, desconto: p.desconto, salvoEm: new Date().toISOString() } };
  salvar();
  $('#c-descartar').hidden = true;
  $('#c-salvo').textContent = `Precificação ${canais()[estado.canal].nome} salva!`;
}
