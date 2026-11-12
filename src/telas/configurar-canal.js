// Janela "Configurar <canal>": primeiro a regra do canal, depois impostos e custos por unidade.
import { dados, salvar, canais } from '../dados.js';
import { quadroDaRegra, notaDoMercadoLivre, tipoDeVenda } from '../canais-texto.js';
import { lerNumero, campo, campoReais, esc } from '../formato.js';

const $ = (s, raiz = document) => raiz.querySelector(s);
const janela = () => $('#janela-canal');
let id = '';
let rasc = null;

export function iniciarConfigurarCanal() {
  const j = janela();
  j.addEventListener('input', aoDigitar);
  j.addEventListener('change', aoDigitar);
  j.addEventListener('click', (e) => {
    if (e.target.closest('[data-acao="cancelar"]')) j.close();
  });
  j.addEventListener('submit', (e) => {
    e.preventDefault();
    dados.canais = { ...structuredClone(canais()), [id]: rasc };
    salvar();
    j.close();
  });
}

export function abrirConfigurarCanal(idCanal) {
  id = idCanal;
  rasc = structuredClone(canais()[id]);
  desenhar();
  janela().showModal();
}

const porcento = (rotulo, chave, dica = '') => `
  <label class="campo"><span>${rotulo}</span>
    <input type="text" inputmode="decimal" data-c="${chave}" data-num value="${campo(rasc[chave])}" placeholder="0">
    ${dica ? `<small class="dica">${dica}</small>` : ''}
  </label>`;
const dinheiro = (rotulo, chave, dica = '') => `
  <label class="campo"><span>${rotulo}</span>
    <input type="text" inputmode="decimal" data-c="${chave}" data-num value="${campoReais(rasc[chave])}" placeholder="0,00">
    ${dica ? `<small class="dica">${dica}</small>` : ''}
  </label>`;

function camposDoCanal() {
  if (rasc.tipo === 'mercadolivre') {
    const tipo = rasc.tipo_anuncio === 'premium' ? 'premium' : 'classico';
    return `
      <div class="secao">
        <p class="secao-titulo">Tipo de anúncio</p>
        <div class="alternar separado" role="radiogroup" aria-label="Tipo de anúncio">
          <label><input type="radio" name="tipo_anuncio" data-c="tipo_anuncio" value="classico" ${tipo === 'classico' ? 'checked' : ''}><span>Clássico</span></label>
          <label><input type="radio" name="tipo_anuncio" data-c="tipo_anuncio" value="premium" ${tipo === 'premium' ? 'checked' : ''}><span>Premium</span></label>
        </div>
        <p class="dica" id="nota-ml">${esc(notaDoMercadoLivre(rasc))}</p>
      </div>
      ${porcento('Comissão própria (opcional)', 'comissao_propria', 'Deixe vazio para seguir a tabela do Mercado Livre.')}
      ${quadroDaRegra(id, rasc)}`;
  }
  if (rasc.tipo === 'faixas') return quadroDaRegra(id, rasc);
  const venda = tipoDeVenda(rasc);
  if (venda === 'loja') {
    return `${quadroDaRegra(id, rasc)}
      ${porcento('Taxa financeira / plataforma (%)', 'taxa_financeira', 'Gateway de pagamento + plataforma da loja.')}`;
  }
  if (venda === 'vendedor') {
    return `${quadroDaRegra(id, rasc)}
      ${porcento('Comissão de vendedora (%)', 'comissao')}
      ${porcento('Taxa financeira (%)', 'taxa_financeira', 'Cartão de crédito, boleto etc. Deixe 0 se for Pix ou dinheiro.')}`;
  }
  return `${quadroDaRegra(id, rasc)}
    ${porcento('Comissão (%)', 'comissao')}
    ${dinheiro('Taxa fixa (R$)', 'taxa_fixa')}`;
}

function desenhar() {
  janela().innerHTML = `
    <form method="dialog" novalidate>
      <div class="janela-topo">
        <h3 id="titulo-canal">Configurar ${esc(rasc.nome)}</h3>
        <button type="button" class="fechar" data-acao="cancelar" aria-label="Fechar">×</button>
      </div>
      <div class="janela-corpo">
        ${camposDoCanal()}
        ${porcento('Impostos (%)', 'impostos', 'Um número só, calculado sobre o preço de venda.')}
        ${dinheiro('Frete absorvido (R$ por unidade)', 'frete_absorvido', 'Frete que você paga por pedido (Correios, transportadora).')}
        ${dinheiro('Pick & pack (R$ por unidade)', 'embalagem', 'Embalagem + manuseio + etiqueta por pedido.')}
        ${dinheiro('Outros custos (R$ por unidade)', 'outros')}
      </div>
      <div class="janela-base"><div class="direita">
        <button type="button" class="botao" data-acao="cancelar">Cancelar</button>
        <button type="submit" class="botao principal">Salvar</button>
      </div></div>
    </form>`;
}

function aoDigitar(e) {
  const el = e.target;
  if (!el.dataset?.c) return;
  rasc[el.dataset.c] = el.hasAttribute('data-num') ? lerNumero(el.value) : el.value;
  const nota = $('#nota-ml', janela());
  if (nota) nota.textContent = notaDoMercadoLivre(rasc);
}
