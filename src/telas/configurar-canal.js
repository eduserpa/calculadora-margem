// Janela "Configurar <canal>": a regra do canal (fixa; o lápis libera para editar), depois impostos, custos por unidade e promoção.
// Aberta da Calculadora com um produto escolhido, o campo "Impostos (%)" é o desse produto neste canal (ex.: DIFAL no ML):
// já vem com o que vale hoje; mudar grava só nele (produto.impostosCanal); igual ao padrão não grava. Sem produto (Taxas dos
// Canais), o campo muda o padrão do canal para todos, como antes.
import { icone } from '../icones.js';
import { dados, salvar, canais, canaisDePadrao } from '../dados.js';
import { quadroDaRegra, notaDoMercadoLivre, tipoDeVenda, faixasEmTexto, data } from '../canais-texto.js';
import { lerNumero, campo, campoReais, esc } from '../formato.js';
import { comissoesProprias } from '../calculos/canal.js';
import { campoNumero } from './numero.js';
import { impostoDoProdutoNoCanal } from '../produtos.js';

const $ = (s, raiz = document) => raiz.querySelector(s);
const janela = () => $('#janela-canal');
let id = '';
let rasc = null;
let editando = false; // regra do canal liberada pelo lápis
let categorias = null; // lista oficial do ML, carregada quando a janela do ML abre
let produto = null; // escolhido na Calculadora: o imposto da janela é o dele neste canal
let impostoProprio = null; // o imposto só deste produto neste canal (null = o padrão do canal)

const REPUTACOES = { verde: 'Verde ou MercadoLíder', sem: 'Sem reputação', amarela: 'Amarela', laranja: 'Laranja', vermelha: 'Vermelha' };

export function iniciarConfigurarCanal() {
  const j = janela();
  j.addEventListener('input', aoDigitar);
  j.addEventListener('change', aoTrocar);
  j.addEventListener('click', aoClicar);
  j.addEventListener('submit', (e) => {
    e.preventDefault();
    if (rasc.faixas) rasc.faixas.sort((a, b) => (a.ate ?? Infinity) - (b.ate ?? Infinity));
    if (impostoProprio != null && !(impostoProprio >= 0 && impostoProprio <= 100)) { // NaN (letras) também cai aqui
      if (!Number.isNaN(impostoProprio)) mostrarErroImposto('Os impostos vão de 0 a 100%.');
      return $('#imposto-produto', j).focus();
    }
    dados.canais = { ...structuredClone(canais()), [id]: rasc };
    if (produto && impostoProprio !== impostoDoProdutoNoCanal(produto, id)) gravarImpostoDoProduto();
    salvar();
    j.close();
  });
}

// Só o imposto deste produto neste canal muda (os outros canais e produtos ficam como estão).
function gravarImpostoDoProduto() {
  dados.produtos = dados.produtos.map((p) => {
    if (p.id !== produto.id) return p;
    const impostosCanal = { ...(p.impostosCanal ?? {}) };
    if (impostoProprio == null) delete impostosCanal[id];
    else impostosCanal[id] = impostoProprio;
    return { ...p, impostosCanal, atualizadoEm: new Date().toISOString() };
  });
}

export async function abrirConfigurarCanal(idCanal, produtoEscolhido = null) {
  id = idCanal;
  rasc = structuredClone(canais()[id]);
  produto = produtoEscolhido;
  impostoProprio = impostoDoProdutoNoCanal(produto, id);
  if (rasc.tipo === 'mercadolivre') rasc.comissao_propria = comissoesProprias(rasc); // um valor por tipo de anúncio
  if (rasc.tipo_vendedor) rasc.tipo_vendedor = 'cnpj'; // a empresa vende como CNPJ
  editando = false;
  if (rasc.tipo === 'mercadolivre' && !categorias) {
    try {
      categorias = (await (await fetch('data/ml-categorias.json')).json()).categorias;
    } catch {
      categorias = [];
    }
  }
  desenhar();
  janela().showModal();
  // 1º campo da janela (no ML, a escolha marcada de Clássico/Premium, lá em cima)
  janela().querySelector('.janela-corpo input:checked[type="radio"], .janela-corpo input:not([type="radio"]):not([type="checkbox"]), .janela-corpo select')?.focus();
}

// ---------- pedaços de formulário ----------

const porcento = (rotulo, chave, dica = '') => `
  <label class="campo"><span>${rotulo}</span>
    ${campoNumero(`<input type="text" inputmode="decimal" data-c="${chave}" data-num data-min="0" value="${valor(chave) ? campo(valor(chave)) : ''}" placeholder="0">`, '%', rotulo.replace(/\s*\([^)]*\)$/, '').toLowerCase())}
    ${dica ? `<small class="dica">${dica}</small>` : ''}
  </label>`;
const dinheiro = (rotulo, chave, dica = '') => `
  <label class="campo"><span>${rotulo}</span>
    ${campoNumero(`<input type="text" inputmode="decimal" data-c="${chave}" data-num value="${valor(chave) ? campoReais(valor(chave)) : ''}" placeholder="0,00">`, 'R$')}
    ${dica ? `<small class="dica">${dica}</small>` : ''}
  </label>`;
const radio = (nome, opcao, rotulo, marcado) =>
  `<label><input type="radio" name="${nome}" data-c="${nome}" value="${opcao}" ${marcado ? 'checked' : ''}><span>${rotulo}</span></label>`;
const ligar = (chave, rotulo) =>
  `<label class="ligar"><input type="checkbox" data-c="${chave}" ${valor(chave) ? 'checked' : ''}><span>${rotulo}</span></label>`;
// Fonte e data num "i" discreto (title), fora do meio da janela.
function info(...fontes) {
  const t = fontes.filter(([texto]) => texto).map(([texto, conferido]) => `Fonte: ${texto.replace(/[.!?]$/, '')}. ${conferido ? `Conferido em ${data(conferido)}` : 'A conferir'}.`).join(' ');
  return t ? `<span class="info" tabindex="0" role="img" aria-label="${esc(t)}" data-dica>${icone('info')}</span>` : '';
}
const fixo = (rotulo, texto) => `<div class="campo"><span>${rotulo}</span><strong class="fixo">${texto}</strong></div>`;
const pctFixo = (v) => `${campo(v) || '0'}%`;

// A regra fica fixa; o lápis (só ícone, ao lado do título do quadro) libera para editar. Editando, a barra mostra
// "Voltar ao padrão" e "Pronto". O "i" da fonte fica no rótulo que ele explica.
const lapis = (rotulo) => `<button type="button" class="engrenagem" data-acao="editar" title="${rotulo}" aria-label="${rotulo}">${icone('pencil')}</button>`;
const barraDaRegra = () => (editando ? `
  <div class="barra-regra"><button type="button" class="botao pequeno" data-acao="padrao">Voltar ao padrão</button><button type="button" class="botao pequeno" data-acao="pronto">${icone('check')} Pronto</button></div>` : '');

function valor(caminho) {
  return caminho.split('.').reduce((o, p) => (o == null ? undefined : o[p]), rasc);
}
function definir(caminho, v) {
  const partes = caminho.split('.');
  let alvo = rasc;
  partes.slice(0, -1).forEach((p) => (alvo = alvo[p] ??= {}));
  alvo[partes.at(-1)] = v;
}

function faixas() {
  const fontes = [[rasc.faixas_fonte, rasc.faixas_conferido_em], [rasc.frete_fonte, rasc.frete_conferido_em]];
  if (!editando) return quadroDaRegra(id, rasc, info(...fontes), lapis('Editar faixas'));
  const frete = rasc.frete_percentual != null ? `<div class="grade">${porcento('Taxa de frete (% do preço)', 'frete_percentual')}${dinheiro('Teto da taxa de frete (R$)', 'frete_teto')}</div>` : '';
  return `${barraDaRegra()}${faixasEditaveis(info(...fontes))}${frete}`;
}

function faixasEditaveis(infoFonte = '') {
  const ultima = rasc.faixas.length - 1;
  const textos = faixasEmTexto(rasc.faixas);
  return `
    <div class="regra laranja">
      <strong>Comissão por faixa de preço ${infoFonte}</strong>
      <table class="faixas editaveis">
        <thead><tr><th>Valor do item</th><th>Até (R$)</th><th>Comissão (%)</th><th>Taxa fixa (R$)</th><th><span hidden>Tirar</span></th></tr></thead>
        <tbody>${rasc.faixas.map((f, i) => `
          <tr>
            <td>${textos[i].valor}</td>
            <td>${i === ultima ? '—' : `<input type="text" inputmode="decimal" data-c="faixas.${i}.ate" data-num value="${campoReais(f.ate)}" aria-label="Até quanto vai a faixa ${i + 1}">`}</td>
            <td><input type="text" inputmode="decimal" data-c="faixas.${i}.comissao" data-num value="${campo(f.comissao)}" aria-label="Comissão da faixa ${i + 1}"></td>
            <td><input type="text" inputmode="decimal" data-c="faixas.${i}.taxa_fixa" data-num value="${campoReais(f.taxa_fixa)}" aria-label="Taxa fixa da faixa ${i + 1}"></td>
            <td>${i === ultima ? '' : `<button type="button" class="botao pequeno discreto" data-acao="tirar-faixa" data-i="${i}" aria-label="Tirar faixa">${icone('x')}</button>`}</td>
          </tr>`).join('')}
        </tbody>
      </table>
      <div><button type="button" class="botao pequeno discreto" data-acao="nova-faixa">${icone('plus')} Adicionar faixa</button></div>
    </div>`;
}

function opcoesMercadoLivre() {
  const tipo = rasc.tipo_anuncio === 'premium' ? 'premium' : 'classico';
  const nome = tipo === 'premium' ? 'Premium' : 'Clássico';
  const r = rasc.faixa_reduzida;
  const rep = rasc.reputacao || 'verde';
  const semTabela = !['verde', 'sem'].includes(rep) && !rasc.frete_por_reputacao?.[rep];
  return `
    <div class="secao">
      <p class="secao-titulo">Tipo de anúncio</p>
      <div class="alternar separado" role="radiogroup" aria-label="Tipo de anúncio">
        ${radio('tipo_anuncio', 'classico', 'Clássico', tipo === 'classico')}${radio('tipo_anuncio', 'premium', 'Premium', tipo === 'premium')}
      </div>
      <p class="dica" id="nota-ml">${esc(notaDoMercadoLivre(rasc))}</p>
    </div>
    ${barraDaRegra()}
    <div class="secao">
      <div class="regra-topo"><p class="secao-titulo">Comissão da categoria (${nome}) ${info([rasc.comissao_fonte, rasc.comissao_conferido_em])}</p>${editando ? '' : lapis('Editar comissões')}</div>
      <div class="grade">${editando ? porcento(`${nome} (%)`, `comissao.${tipo}`) : fixo(nome, pctFixo(rasc.comissao[tipo]))}</div>
    </div>
    ${porcento(`Comissão própria do ${nome} (opcional)`, `comissao_propria.${tipo}`, 'Se preencher, vale no lugar da comissão da categoria.')}
    ${campoImposto()}
    <div class="secao">
      <p class="secao-titulo">Comissão menor de R$ ${campoReais(r.de)} a R$ ${campoReais(r.ate)} ${info([rasc.faixa_reduzida_fonte, rasc.faixa_reduzida_conferido_em])}</p>
      <label class="campo"><span>Categoria do produto</span>
        <input type="text" list="lista-categorias-ml" id="categoria-ml" value="${esc(rasc.categoria)}" placeholder="Digite para buscar na lista oficial..." autocomplete="off">
        <datalist id="lista-categorias-ml"><option value="Outra categoria (sem redução)"></option>${(categorias ?? []).map((c) => `<option value="${esc(c[0])}"></option>`).join('')}</datalist>
      </label>
      <div class="grade">${editando
        ? `${dinheiro('De (R$)', 'faixa_reduzida.de')}${dinheiro('Até (R$)', 'faixa_reduzida.ate')}${porcento(`Redução ${nome} (pontos)`, `faixa_reduzida.reducao.${tipo}`)}`
        : fixo(`Redução ${nome}`, pctFixo(r.reducao[tipo]))}</div>
    </div>
    <label class="campo"><span>Reputação da conta</span>
      <select data-c="reputacao">${Object.entries(REPUTACOES).map(([v, t]) => `<option value="${v}" ${v === rep ? 'selected' : ''}>${t}</option>`).join('')}</select>
      ${semTabela ? '<small class="alerta">A tabela de frete desta reputação não está publicada. A conta usa a tabela verde. Confira no simulador do Mercado Livre.</small>' : ''}
    </label>
    ${quadroDaRegra(id, rasc)}`;
}

function promocao() {
  return `
    <div class="secao promocao">
      <p class="secao-titulo">Promoção (opcional)</p>
      <div class="linha-opcao">${ligar('cupom_ativo', 'Cupom de desconto')}${valor('cupom_ativo') ? porcento('Cupom (%)', 'cupom', 'O cliente paga menos. Todas as taxas passam a ser sobre o preço com cupom.') : ''}</div>
      <div class="linha-opcao">${ligar('afiliado_ativo', 'Comissão de afiliado')}${valor('afiliado_ativo') ? porcento('Afiliado (%)', 'afiliado', 'Sobre o preço que o cliente paga.') : ''}</div>
    </div>`;
}

function camposDoCanal() {
  if (rasc.tipo === 'mercadolivre') return opcoesMercadoLivre();
  if (rasc.tipo === 'faixas') return faixas();
  const venda = tipoDeVenda(rasc);
  if (venda === 'loja') return quadroDaRegra(id, rasc);
  if (venda === 'vendedor') return `${quadroDaRegra(id, rasc)}${porcento('Comissão de vendedora (%)', 'comissao')}`;
  return `${quadroDaRegra(id, rasc)}<div class="grade">${porcento('Comissão (%)', 'comissao')}${dinheiro('Taxa fixa (R$)', 'taxa_fixa')}</div>`;
}

// Impostos logo depois da comissão (no ML, logo abaixo da comissão própria): do canal, ou do produto escolhido na Calculadora.
const campoImposto = () => (produto ? campoImpostoDoProduto() : porcento('Impostos (%)', 'impostos', 'Um número só, calculado sobre o preço de venda.'));

function desenhar() {
  const corpo = $('.janela-corpo', janela());
  const rolagem = corpo ? corpo.scrollTop : 0;
  const venda = tipoDeVenda(rasc);
  const dicaFin = venda === 'loja' ? 'Gateway de pagamento + plataforma da loja.' : venda === 'vendedor' ? 'Cartão de crédito, boleto etc. Deixe 0 se for Pix ou dinheiro.' : 'Se houver alguma taxa de pagamento além da comissão.';
  janela().innerHTML = `
    <form method="dialog" novalidate>
      <div class="janela-topo">
        <h3 id="titulo-canal">Configurar ${esc(rasc.nome)}</h3>
        <button type="button" class="fechar" data-acao="cancelar" aria-label="Fechar">${icone('x')}</button>
      </div>
      <div class="janela-corpo">
        ${camposDoCanal()}
        ${rasc.tipo === 'mercadolivre' ? '' : campoImposto()}
        ${porcento(venda === 'loja' ? 'Taxa financeira / plataforma (%)' : 'Taxa financeira (%)', 'taxa_financeira', dicaFin)}
        ${dinheiro('Frete absorvido (R$ por unidade)', 'frete_absorvido', 'Frete que você paga por pedido (Correios, transportadora).')}
        ${dinheiro('Pick & pack (R$ por unidade)', 'embalagem', 'Embalagem + manuseio + etiqueta por pedido.')}
        ${dinheiro('Outros custos (R$ por unidade)', 'outros')}
        ${promocao()}
      </div>
      <div class="janela-base">
        <div class="direita">
          <button type="button" class="botao" data-acao="cancelar">Cancelar</button>
          <button type="submit" class="botao principal">Salvar</button>
        </div>
      </div>
    </form>`;
  $('.janela-corpo', janela()).scrollTop = rolagem;
}

// O mesmo "Impostos (%)", com produto: o valor que vale para ele aqui e, se for só dele, "voltar ao padrão (12%)".
const padraoImposto = () => Number(rasc.impostos) || 0; // o do canal (ou da empresa), para todos os produtos
const pctCampo = (v) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 }); // 0 aparece como 0
const origemImposto = () => (Number.isNaN(impostoProprio) ? '' : impostoProprio == null
  ? `Mudar aqui vale só para “${esc(produto.nome)}” neste canal.`
  : `Só deste produto · <button type="button" class="link-botao" data-acao="imposto-padrao">voltar ao padrão (${pctCampo(padraoImposto())}%)</button>`);
function mostrarErroImposto(texto) {
  Object.assign($('#imposto-erro', janela()), { textContent: texto, hidden: !texto });
  const entrada = $('#imposto-produto', janela());
  if (texto) entrada.setAttribute('aria-invalid', 'true');
  else entrada.removeAttribute('aria-invalid');
}
const campoImpostoDoProduto = () => `
  <div class="campo-imposto">
    <label class="campo"><span>Impostos (%)</span>
      ${campoNumero(`<input type="text" inputmode="decimal" id="imposto-produto" data-min="0" data-max="100" value="${pctCampo(impostoProprio ?? padraoImposto())}" placeholder="0" aria-describedby="imposto-origem">`, '%', 'impostos')}
    </label>
    <small class="dica imposto-origem" id="imposto-origem">${origemImposto()}</small>
    <small class="erro" id="imposto-erro" role="alert" hidden></small>
  </div>`;

// ---------- eventos ----------

function aoDigitar(e) {
  const el = e.target;
  if (el.id === 'categoria-ml') return escolherCategoria(el.value, false);
  if (el.id === 'imposto-produto') {
    // só número (15, 12,5, 15%); letras ("abc", "1O") não viram 0% nem 1%: ficam NaN e o Salvar mostra o erro no campo
    const t = el.value.replace(/\s/g, '');
    const v = !t ? null : /^\d+([.,]\d+)?%?$/.test(t) ? lerNumero(t) : NaN;
    impostoProprio = v == null || Math.abs(v - padraoImposto()) < 0.005 ? null : v; // igual ao padrão: não grava
    mostrarErroImposto(Number.isNaN(v) ? 'Digite só o número (ex.: 15 ou 12,5).' : '');
    return void ($('#imposto-origem', janela()).innerHTML = origemImposto());
  }
  if (!el.dataset?.c || el.type === 'checkbox' || el.type === 'radio' || el.tagName === 'SELECT') return;
  definir(el.dataset.c, el.hasAttribute('data-num') ? lerNumero(el.value) : el.value);
  if (el.dataset.c === 'impostos') rasc.impostosProprio = el.value.trim() !== ''; // vazio: vale o imposto da empresa
  const nota = $('#nota-ml', janela());
  if (nota) nota.textContent = notaDoMercadoLivre(rasc);
}

// Troca que muda o formulário (opção ligada, tipo, reputação): redesenha.
function aoTrocar(e) {
  const el = e.target;
  if (el.id === 'categoria-ml') return escolherCategoria(el.value, true);
  if (!el.dataset?.c) return;
  if (el.type === 'checkbox') definir(el.dataset.c, el.checked);
  else if (el.type === 'radio' || el.tagName === 'SELECT') definir(el.dataset.c, el.value);
  else return;
  desenhar();
}

function escolherCategoria(nome, redesenhar) {
  rasc.categoria = nome;
  const achada = (categorias ?? []).find((c) => c[0] === nome);
  if (achada) rasc.faixa_reduzida.reducao = { premium: achada[1], classico: achada[2] };
  else if (nome === 'Outra categoria (sem redução)') rasc.faixa_reduzida.reducao = { premium: 0, classico: 0 };
  else return;
  if (redesenhar || achada || nome.startsWith('Outra')) desenhar();
}

function aoClicar(e) {
  const b = e.target.closest('[data-acao]');
  if (!b) return;
  const acao = b.dataset.acao;
  if (acao === 'cancelar') return janela().close();
  if (acao === 'imposto-padrao') {
    impostoProprio = null;
    desenhar();
    return $('#imposto-produto', janela()).focus();
  }
  if (acao === 'editar') editando = true;
  if (acao === 'pronto') editando = false;
  if (acao === 'padrao') {
    // só a regra do canal volta ao padrão; impostos, custos e promoção ficam
    const padrao = canaisDePadrao()[id];
    ['faixas', 'frete_percentual', 'frete_teto', 'comissao', 'faixa_reduzida', 'categoria'].forEach((k) => {
      if (k in padrao) rasc[k] = structuredClone(padrao[k]);
    });
  }
  if (acao === 'nova-faixa') {
    const f = rasc.faixas;
    const anterior = f[f.length - 2];
    f.splice(f.length - 1, 0, { ate: (anterior?.ate ?? 0) + 50, comissao: f.at(-1).comissao, taxa_fixa: f.at(-1).taxa_fixa });
  }
  if (acao === 'tirar-faixa') rasc.faixas.splice(Number(b.dataset.i), 1);
  desenhar();
}
