// Janela "Configurar <canal>": primeiro a regra do canal (editável), depois impostos, custos por unidade e promoção.
import { icone } from '../icones.js';
import { dados, salvar, canais, canaisDePadrao } from '../dados.js';
import { quadroDaRegra, notaDoMercadoLivre, tipoDeVenda, faixasEmTexto, data } from '../canais-texto.js';
import { lerNumero, campo, campoReais, esc } from '../formato.js';

const $ = (s, raiz = document) => raiz.querySelector(s);
const janela = () => $('#janela-canal');
let id = '';
let rasc = null;
let categorias = null; // lista oficial do ML, carregada quando a janela do ML abre

const REPUTACOES = { verde: 'Verde ou MercadoLíder', sem: 'Sem reputação', amarela: 'Amarela', laranja: 'Laranja', vermelha: 'Vermelha' };

export function iniciarConfigurarCanal() {
  const j = janela();
  j.addEventListener('input', aoDigitar);
  j.addEventListener('change', aoTrocar);
  j.addEventListener('click', aoClicar);
  j.addEventListener('submit', (e) => {
    e.preventDefault();
    if (rasc.faixas) rasc.faixas.sort((a, b) => (a.ate ?? Infinity) - (b.ate ?? Infinity));
    dados.canais = { ...structuredClone(canais()), [id]: rasc };
    salvar();
    j.close();
  });
}

export async function abrirConfigurarCanal(idCanal) {
  id = idCanal;
  rasc = structuredClone(canais()[id]);
  if (rasc.tipo === 'mercadolivre' && !categorias) {
    try {
      categorias = (await (await fetch('data/ml-categorias.json')).json()).categorias;
    } catch {
      categorias = [];
    }
  }
  desenhar();
  janela().showModal();
}

// ---------- pedaços de formulário ----------

const porcento = (rotulo, chave, dica = '') => `
  <label class="campo"><span>${rotulo}</span>
    <input type="text" inputmode="decimal" data-c="${chave}" data-num value="${valor(chave) ? `${campo(valor(chave))}%` : ''}" placeholder="0%">
    ${dica ? `<small class="dica">${dica}</small>` : ''}
  </label>`;
const dinheiro = (rotulo, chave, dica = '') => `
  <label class="campo"><span>${rotulo}</span>
    <input type="text" inputmode="decimal" data-c="${chave}" data-num value="${valor(chave) ? `R$ ${campoReais(valor(chave))}` : ''}" placeholder="0,00">
    ${dica ? `<small class="dica">${dica}</small>` : ''}
  </label>`;
const radio = (nome, opcao, rotulo, marcado) =>
  `<label><input type="radio" name="${nome}" data-c="${nome}" value="${opcao}" ${marcado ? 'checked' : ''}><span>${rotulo}</span></label>`;
const ligar = (chave, rotulo) =>
  `<label class="ligar"><input type="checkbox" data-c="${chave}" ${valor(chave) ? 'checked' : ''}><span>${rotulo}</span></label>`;
const fonte = (texto, conferido) =>
  texto ? `<p class="dica fonte">${esc(texto)}${/[.!?]$/.test(texto) ? '' : '.'}${conferido ? ` Conferido em ${data(conferido)}.` : ' A conferir.'}</p>` : '';

function valor(caminho) {
  return caminho.split('.').reduce((o, p) => (o == null ? undefined : o[p]), rasc);
}
function definir(caminho, v) {
  const partes = caminho.split('.');
  let alvo = rasc;
  partes.slice(0, -1).forEach((p) => (alvo = alvo[p] ??= {}));
  alvo[partes.at(-1)] = v;
}

function faixasEditaveis() {
  const ultima = rasc.faixas.length - 1;
  const textos = faixasEmTexto(rasc.faixas);
  return `
    <div class="regra laranja">
      <strong>Comissão por faixa de preço${id === 'shopee' ? ` (${rasc.tipo_vendedor === 'cpf' ? 'CPF' : 'CNPJ'})` : ''}</strong>
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
      <p class="pe">Calculada automaticamente pelo preço de venda.${id === 'shopee' ? ' Inclui taxa de transação.' : ''}${rasc.faixas_vigente_desde ? ` Tabela vigente desde ${data(rasc.faixas_vigente_desde)}.` : ''}</p>
    </div>
    ${fonte(rasc.faixas_fonte, rasc.faixas_conferido_em)}`;
}

function opcoesShopee() {
  const cpf = rasc.tipo_vendedor === 'cpf';
  return `
    <div class="secao">
      <p class="secao-titulo">Tipo de vendedor</p>
      <div class="alternar separado" role="radiogroup" aria-label="Tipo de vendedor">
        ${radio('tipo_vendedor', 'cnpj', 'CNPJ', !cpf)}${radio('tipo_vendedor', 'cpf', 'CPF', cpf)}
      </div>
      ${cpf ? `
        ${ligar('cpf_acima_limite', 'Mais de 450 pedidos nos últimos 90 dias')}
        ${dinheiro('Adicional por item vendido, para CPF (R$)', 'cpf_adicional')}
        ${fonte(rasc.cpf_fonte, rasc.cpf_conferido_em)}` : ''}
    </div>`;
}

function opcoesMercadoLivre() {
  const tipo = rasc.tipo_anuncio === 'premium' ? 'premium' : 'classico';
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
    <div class="secao">
      <p class="secao-titulo">Comissão da categoria</p>
      <div class="grade">${porcento('Clássico (%)', 'comissao.classico')}${porcento('Premium (%)', 'comissao.premium')}</div>
      <p class="dica">O Mercado Livre cobra entre 10% e 14% no Clássico e entre 15% e 19% no Premium, conforme a categoria. A % exata aparece no simulador de custos da sua conta.</p>
      ${fonte(rasc.comissao_fonte, rasc.comissao_conferido_em)}
    </div>
    ${porcento('Comissão própria (opcional)', 'comissao_propria', 'Se preencher, vale em qualquer preço e no lugar das comissões acima.')}
    <div class="secao">
      <p class="secao-titulo">Comissão menor de R$ ${campoReais(r.de)} a R$ ${campoReais(r.ate)}</p>
      <label class="campo"><span>Categoria do produto</span>
        <input type="text" list="lista-categorias-ml" id="categoria-ml" value="${esc(rasc.categoria)}" placeholder="Digite para buscar na lista oficial..." autocomplete="off">
        <datalist id="lista-categorias-ml"><option value="Outra categoria (sem redução)"></option>${(categorias ?? []).map((c) => `<option value="${esc(c[0])}"></option>`).join('')}</datalist>
        <small class="dica">${(categorias ?? []).length.toLocaleString('pt-BR')} categorias da lista oficial. Ao escolher, a redução abaixo é preenchida.</small>
      </label>
      <div class="grade">
        ${dinheiro('De (R$)', 'faixa_reduzida.de')}${dinheiro('Até (R$)', 'faixa_reduzida.ate')}
        ${porcento('Redução Clássico (pontos)', 'faixa_reduzida.reducao.classico')}${porcento('Redução Premium (pontos)', 'faixa_reduzida.reducao.premium')}
      </div>
      ${fonte(rasc.faixa_reduzida_fonte, rasc.faixa_reduzida_conferido_em)}
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
  if (rasc.tipo === 'faixas') {
    const frete = rasc.frete_percentual != null
      ? `<div class="grade">${porcento('Taxa de frete (% do preço)', 'frete_percentual')}${dinheiro('Teto da taxa de frete (R$)', 'frete_teto')}</div>${fonte(rasc.frete_fonte, rasc.frete_conferido_em)}`
      : '';
    return `${id === 'shopee' ? opcoesShopee() : ''}${faixasEditaveis()}${frete}`;
  }
  const venda = tipoDeVenda(rasc);
  if (venda === 'loja') return quadroDaRegra(id, rasc);
  if (venda === 'vendedor') return `${quadroDaRegra(id, rasc)}${porcento('Comissão de vendedora (%)', 'comissao')}`;
  return `${quadroDaRegra(id, rasc)}<div class="grade">${porcento('Comissão (%)', 'comissao')}${dinheiro('Taxa fixa (R$)', 'taxa_fixa')}</div>`;
}

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
        ${porcento('Impostos (%)', 'impostos', 'Um número só, calculado sobre o preço de venda.')}
        ${porcento(venda === 'loja' ? 'Taxa financeira / plataforma (%)' : 'Taxa financeira (%)', 'taxa_financeira', dicaFin)}
        ${dinheiro('Frete absorvido (R$ por unidade)', 'frete_absorvido', 'Frete que você paga por pedido (Correios, transportadora).')}
        ${dinheiro('Pick & pack (R$ por unidade)', 'embalagem', 'Embalagem + manuseio + etiqueta por pedido.')}
        ${dinheiro('Outros custos (R$ por unidade)', 'outros')}
        ${promocao()}
      </div>
      <div class="janela-base">
        <button type="button" class="botao discreto" data-acao="padrao">Voltar ao padrão</button>
        <div class="direita">
          <button type="button" class="botao" data-acao="cancelar">Cancelar</button>
          <button type="submit" class="botao principal">Salvar</button>
        </div>
      </div>
    </form>`;
  $('.janela-corpo', janela()).scrollTop = rolagem;
}

// ---------- eventos ----------

function aoDigitar(e) {
  const el = e.target;
  if (el.id === 'categoria-ml') return escolherCategoria(el.value, false);
  if (!el.dataset?.c || el.type === 'checkbox' || el.type === 'radio' || el.tagName === 'SELECT') return;
  definir(el.dataset.c, el.hasAttribute('data-num') ? lerNumero(el.value) : el.value);
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
  if (acao === 'padrao') rasc = canaisDePadrao()[id];
  if (acao === 'nova-faixa') {
    const f = rasc.faixas;
    const anterior = f[f.length - 2];
    f.splice(f.length - 1, 0, { ate: (anterior?.ate ?? 0) + 50, comissao: f.at(-1).comissao, taxa_fixa: f.at(-1).taxa_fixa });
  }
  if (acao === 'tirar-faixa') rasc.faixas.splice(Number(b.dataset.i), 1);
  desenhar();
}
