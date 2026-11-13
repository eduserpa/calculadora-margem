// Tela Calculadora: produto, canal, preço (DE/desconto/POR) de cada canal, resultado, preço mínimo,
// liquidação, análise e salvar a precificação do produto naquele canal.
import { icone } from '../icones.js';
import { dados, canais, salvar } from '../dados.js';
import { porId, custoDoProduto, pesoDoProduto } from '../produtos.js';
import { calcularMargem, precoMinimo } from '../calculos/margem.js';
import { precoPor, descontoPeloPor, descontoMaximo } from '../calculos/preco-de-por.js';
import { lerNumero, reais, numero, campo, campoReais, gramas, esc } from '../formato.js';
import { linhasDoCanal, sigla, tipoDeVenda, TITULO_DO_GRUPO, pct } from '../canais-texto.js';
import { abrirConfigurarCanal } from './configurar-canal.js';
import { capa } from '../fotos.js';

const $ = (s) => document.querySelector(s);
const CHAVE = 'calculadora-margem.tela';
const AVULSO = '__avulso';
const MARGEM_LIQUIDACAO = 5;
const semAcento = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const comReais = (v) => (v ? `R$ ${campoReais(v)}` : '');

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
}
const precoDoCanal = () => (estado.precos[estado.canal] ??= { de: 0, desconto: 0 });

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
    if (config) return abrirConfigurarCanal(config.dataset.config);
    const b = e.target.closest('[data-canal]');
    if (!b) return;
    estado.canal = b.dataset.canal;
    desenharCanais();
    preencherPrecos();
    atualizar();
  });
  $('#tela-calculadora').addEventListener('input', aoDigitar);
  $('#tela-calculadora').addEventListener('focusout', (e) => {
    if (['c-de', 'c-por'].includes(e.target.id)) preencherPrecos();
  });
  $('#c-usar-minimo').addEventListener('click', () => {
    const minimo = Number($('#c-usar-minimo').dataset.preco);
    if (!minimo) return;
    const p = precoDoCanal();
    if (!(p.de > 0) || minimo > p.de) Object.assign(p, { de: minimo, desconto: 0 });
    else p.desconto = descontoPeloPor(p.de, minimo);
    preencherPrecos();
    atualizar();
  });
  $('#c-salvar').addEventListener('click', salvarPrecificacao);

  $('#c-custo').value = campoReais(estado.custoAvulso);
  $('#c-peso').value = campo(estado.pesoAvulso);
  $('#c-margem').value = estado.margemDesejada;
  $('#c-margem-num').value = estado.margemDesejada;
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

function escolherProduto(id) {
  estado.produtoId = id;
  estado.canal = '';
  // Começa com os preços já salvos deste produto em cada canal.
  estado.precos = structuredClone(id && id !== AVULSO ? salvas(id) : {});
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
  return p ? `${p.nome}${p.sku ? ` (${p.sku})` : ''}` : '';
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
        <b>${esc(p.nome)}</b>
        <small>${p.sku ? `${esc(p.sku)} · ` : ''}CMV: ${reais(custoDoProduto(p, mapa))}</small>
        ${quantos(p) ? `<span class="etiqueta com">${quantos(p)} preço${quantos(p) > 1 ? 's' : ''}</span>` : '<span class="etiqueta sem">sem preço</span>'}
      </div>`).join('')}
    ${lista.length || !termo ? '' : '<p class="dica" role="presentation">Nenhum produto com esse nome ou SKU.</p>'}
    <div class="opcao" id="c-opcao-avulso" role="option" aria-selected="false" data-produto="${AVULSO}"><b>Sem cadastro: digitar o custo</b><small>para uma conta rápida</small></div>`;
  const indiceEscolhido = opcoes().findIndex((o) => o.dataset.produto === estado.produtoId);
  ativa = -1;
  if (!$('#c-seletor-lista').hidden) marcar(termo || indiceEscolhido < 0 ? 0 : indiceEscolhido);
}

function desenharCanais() {
  const produtoSalvo = estado.produtoId && estado.produtoId !== AVULSO ? salvas(estado.produtoId) : {};
  const { cmv, pesoG } = custoEPeso();
  $('#c-canais').innerHTML = Object.entries(canais())
    .map(([id, c]) => {
      const [letras, cor] = sigla(id, c);
      const s = produtoSalvo[id];
      const preco = s ? precoPor(s.de, s.desconto) : 0;
      const resumo = s && preco > 0 && cmv > 0 ? calcularMargem({ preco, cmv, canal: c, pesoG }) : null;
      return `
        <div class="canal-caixa">
          <button type="button" class="canal" role="radio" aria-checked="${id === estado.canal}" data-canal="${id}">
            <span class="canal-sigla" style="--cor:${cor}" aria-hidden="true">${letras}</span>
            <span class="canal-nome">${esc(c.nome)}</span>
            <span class="canal-linhas">${linhasDoCanal(c)}</span>
            ${resumo ? `<span class="canal-salvo">Preço: ${reais(preco)} · Margem: ${numero(resumo.margem, 1)}%</span>` : ''}
          </button>
          <button type="button" class="engrenagem" data-config="${id}" title="Configurar ${esc(c.nome)}" aria-label="Configurar ${esc(c.nome)}">${icone('settings')}</button>
        </div>`;
    })
    .join('');
}

function preencherPrecos(menos) {
  const p = estado.canal ? precoDoCanal() : { de: 0, desconto: 0 };
  const por = precoPor(p.de, p.desconto);
  if (menos !== 'c-de') $('#c-de').value = comReais(p.de);
  if (menos !== 'c-desconto') $('#c-desconto').value = p.desconto ? numero(p.desconto, Number.isInteger(p.desconto) ? 0 : 1) : '';
  if (menos !== 'c-desconto-barra') $('#c-desconto-barra').value = Math.min(70, p.desconto);
  if (menos !== 'c-por') $('#c-por').value = comReais(por);
  $('#c-desconto-rotulo').textContent = `${numero(p.desconto, 0)}%`;
}

function aoDigitar(e) {
  const id = e.target.id;
  const v = lerNumero(e.target.value);
  if (id === 'c-custo') estado.custoAvulso = v;
  else if (id === 'c-peso') estado.pesoAvulso = v;
  else if (id === 'c-margem' || id === 'c-margem-num') {
    estado.margemDesejada = Math.min(90, Math.max(1, v || 1));
    if (id === 'c-margem') $('#c-margem-num').value = estado.margemDesejada;
    else $('#c-margem').value = estado.margemDesejada;
  } else if (estado.canal && ['c-de', 'c-desconto', 'c-desconto-barra', 'c-por'].includes(id)) {
    const p = precoDoCanal();
    if (id === 'c-de') p.de = v;
    else if (id === 'c-por') {
      if (!(p.de > 0) || v > p.de) Object.assign(p, { de: v, desconto: 0 });
      else p.desconto = descontoPeloPor(p.de, v);
    } else p.desconto = Math.min(100, Math.max(0, v));
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
      <div class="res-linha"><span>Impostos (${pct(r.impostosPercentual)}):</span><span>${parte(r.impostos, r.preco)}</span></div>
      <div class="res-sub">Tributos sobre vendas, calculados sobre o preço de venda</div>
    </div>
    <div class="res-total">
      <span class="rotulo">Margem de contribuição</span>
      <div class="numeros"><span class="${f.classe}" id="c-num-margem">${numero(r.margem, 1)}%</span><i></i><span class="${f.classe}" id="c-num-lucro">${reais(r.lucro)}</span></div>
      <small>lucro por unidade</small>
    </div>`;
}

function htmlAnalise(margem) {
  const f = faixaDaMargem(margem);
  const posicao = ((Math.max(-10, Math.min(50, margem)) + 10) / 60) * 100;
  return `
    <div class="analise-topo"><h2>Análise da margem</h2><span>${f.faixa}</span></div>
    <h3 class="${f.classe}">${f.frase}</h3>
    <div class="marcador" style="margin-top:28px" data-alvo="${posicao}"><b style="left:${posicaoMarcador ?? posicao}%">${numero(margem, 1)}%</b><i style="left:${posicaoMarcador ?? posicao}%"></i></div>
    <div class="barra-faixas" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span><span></span><span></span></div>
    <div class="escala">${[-10, 0, 10, 20, 25, 40, 50].map((v) => `<span style="left:${((v + 10) / 60) * 100}%">${v}%${v === 50 ? '+' : ''}</span>`).join('')}</div>`;
}

function atualizar() {
  lembrar();
  const temProduto = Boolean(estado.produtoId);
  const { cmv, pesoG, produto } = custoEPeso();
  $('#c-depois-produto').hidden = !temProduto;
  $('#c-produto-cartao').classList.toggle('ativo', Boolean(produto));
  $('#c-produto-titulo').innerHTML = produto ? `<span class="miniatura">${capa(produto)}</span>${esc(produto.nome)}${produto.sku ? ` <span class="sub">(${esc(produto.sku)})</span>` : ''}` : 'Selecione o Produto';
  $('#c-avulso').hidden = estado.produtoId !== AVULSO;
  const pelaCaixa = produto && pesoG > (Number(produto.pesoG) || 0);
  $('#c-info-produto').innerHTML = produto
    ? `<span>CMV: <strong>${reais(cmv)}</strong></span><span>Peso: <strong>${gramas(Number(produto.pesoG) || 0)}</strong></span>${pelaCaixa ? `<span>Frete do ML calculado como <strong>${gramas(pesoG)}</strong> (caixa grande)</span>` : ''}`
    : '';
  $('#c-exemplo').hidden = true;
  $('#c-sem-canal').hidden = Boolean(estado.canal);
  $('#c-calc').hidden = !estado.canal;
  $('#c-acoes').hidden = !estado.canal || !produto;
  if (!temProduto || !estado.canal) return;

  const canal = canais()[estado.canal];
  $('#c-peso-campo').hidden = canal.tipo !== 'mercadolivre';
  $('#c-por-rotulo').textContent = `Preço POR (Final) — ${canal.nome}`;
  $('#c-resultado-titulo').textContent = `Resultado — ${canal.nome}`;
  $('#c-data').textContent = new Date().toLocaleDateString('pt-BR');

  const p = precoDoCanal();
  const preco = precoPor(p.de, p.desconto);
  const alvo = $('#c-resultado');
  const r = preco > 0 && cmv > 0 ? calcularMargem({ preco, cmv, canal, pesoG }) : null;
  alvo.innerHTML = r ? htmlResultado(r, canal, pesoG) : `<div class="vazio-resultado"><b>${icone('percent')}</b>Preencha os campos para ver o resultado</div>`;
  $('#c-resultado-titulo').textContent = r ? `Resultado — ${canal.nome}` : 'Resultado';
  $('#c-data').hidden = !r;
  $('#c-analise').innerHTML = r ? htmlAnalise(r.margem) : '';
  if (r) {
    contar('c-num-margem', 'margem', r.margem, (v) => `${numero(v, 1)}%`);
    contar('c-num-lucro', 'lucro', r.lucro, reais);
    const marcador = $('#c-analise .marcador');
    const alvo = Number(marcador.dataset.alvo);
    requestAnimationFrame(() => marcador.querySelectorAll('b, i').forEach((el) => (el.style.left = `${alvo}%`)));
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
  else if (!minimo) aviso = `Com essas taxas não dá para chegar a ${estado.margemDesejada}% de margem.`;
  else if (r && preco < minimo) aviso = 'Seu preço atual está abaixo do mínimo!';
  else if (r && r.margem < estado.margemDesejada) aviso = `Seu preço atual cai numa faixa de taxa ou frete mais cara e não chega a ${estado.margemDesejada}% de margem.`;
  if (minimo) contar('c-minimo-valor', 'minimo', minimo, reais);
  else {
    ultimos.delete('minimo');
    $('#c-minimo-valor').textContent = '—';
  }
  $('#c-minimo-sub').textContent = `para margem de ${estado.margemDesejada}%`;
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
  $('#c-salvo').textContent = `Precificação ${canais()[estado.canal].nome} salva!`;
}
