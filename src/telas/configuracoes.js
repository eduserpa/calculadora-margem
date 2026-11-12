// Tela Configurações: taxas de cada canal. Começa com data/canais.json; o que a empresa mudar fica guardado.
import { dados, salvar, canais, canaisDePadrao } from '../dados.js';
import { resumoDoCanal } from '../canais-texto.js';
import { lerNumero, campo, campoReais, esc } from '../formato.js';

const $ = (s, raiz = document) => raiz.querySelector(s);
let rasc = null; // cópia em edição
let mudou = false;

export function iniciarConfiguracoes() {
  if (!canais()) return;
  const tela = $('#tela-configuracoes');
  tela.addEventListener('input', aoDigitar);
  tela.addEventListener('change', aoDigitar);
  tela.addEventListener('click', aoClicar);
  recomecar();
}

// Chamado quando os dados mudam por fora (ex.: importação). Não apaga uma edição em andamento.
export function aoMudarDados() {
  if (!mudou) recomecar();
}

function recomecar() {
  if (!canais()) return;
  rasc = structuredClone(canais());
  mudou = false;
  desenhar();
}

const pct = (rotulo, caminho, valor, dica = '') => `
  <label class="campo"><span>${rotulo}</span>
    <input type="text" inputmode="decimal" data-c="${caminho}" data-num value="${campo(valor)}" placeholder="0">
    ${dica ? `<small class="dica">${dica}</small>` : ''}
  </label>`;
const rs = (rotulo, caminho, valor) => `
  <label class="campo"><span>${rotulo}</span>
    <input type="text" inputmode="decimal" data-c="${caminho}" data-num value="${campoReais(valor)}" placeholder="0,00">
  </label>`;

function data(iso) {
  if (!iso) return '';
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

function fonte(rotulo, texto, conferido) {
  if (!texto) return '';
  const link = (t) => esc(t).replace(/(https:\/\/\S+)/g, '<a href="$1" target="_blank" rel="noopener">página oficial</a>');
  return `<p class="dica fonte"><strong>${rotulo}:</strong> ${link(texto)}. ${conferido ? `Conferido em ${data(conferido)}.` : 'Ainda não conferido na página oficial.'}</p>`;
}

function faixas(id, c) {
  const ultima = c.faixas.length - 1;
  return `
    <div class="tabela-rolagem">
      <table class="faixas">
        <thead><tr><th>Preço de venda</th><th>Comissão (%)</th><th>Taxa fixa (R$)</th><th><span hidden>Ações</span></th></tr></thead>
        <tbody>
          ${c.faixas.map((f, i) => `
            <tr>
              <td>${i === ultima
                ? (c.faixas[i - 1] ? `Acima de R$ ${esc(campoReais(c.faixas[i - 1].ate))}` : 'Qualquer preço')
                : `até R$ <input type="text" inputmode="decimal" data-c="${id}.faixas.${i}.ate" data-num value="${campoReais(f.ate)}" aria-label="Até quanto vai a faixa ${i + 1}">`}</td>
              <td><input type="text" inputmode="decimal" data-c="${id}.faixas.${i}.comissao" data-num value="${campo(f.comissao)}" aria-label="Comissão da faixa ${i + 1}"></td>
              <td><input type="text" inputmode="decimal" data-c="${id}.faixas.${i}.taxa_fixa" data-num value="${campoReais(f.taxa_fixa)}" aria-label="Taxa fixa da faixa ${i + 1}"></td>
              <td>${i === ultima ? '' : `<button type="button" class="botao pequeno discreto" data-acao="tirar-faixa" data-canal="${id}" data-i="${i}">Tirar</button>`}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <div><button type="button" class="botao pequeno" data-acao="nova-faixa" data-canal="${id}">Adicionar faixa</button></div>
    ${fonte('Fonte das faixas', c.faixas_fonte, c.faixas_conferido_em)}`;
}

function mercadoLivre(id, c) {
  const f = c.frete;
  const colunas = f.precos_a_partir_de.map((p, i) => (f.precos_a_partir_de[i + 1] ? `R$ ${p} a ${f.precos_a_partir_de[i + 1] - 0.01}`.replace('.', ',') : `R$ ${p} ou mais`));
  const linhas = f.pesos_ate_g.map((g, i) => (g == null ? `acima de ${f.pesos_ate_g[i - 1] / 1000} kg` : `até ${g / 1000} kg`.replace('.', ',')));
  return `
    <div class="grade">
      <label class="campo"><span>Tipo de anúncio</span>
        <select data-c="${id}.tipo_anuncio">
          <option value="classico" ${c.tipo_anuncio !== 'premium' ? 'selected' : ''}>Clássico</option>
          <option value="premium" ${c.tipo_anuncio === 'premium' ? 'selected' : ''}>Premium</option>
        </select>
      </label>
      ${pct('Comissão Clássico (%)', `${id}.comissao.classico`, c.comissao.classico)}
      ${pct('Comissão Premium (%)', `${id}.comissao.premium`, c.comissao.premium)}
      ${pct('Comissão própria (%)', `${id}.comissao_propria`, c.comissao_propria, 'Opcional. Se preencher, vale em qualquer preço.')}
    </div>
    ${fonte('Fonte da comissão', c.comissao_fonte, c.comissao_conferido_em)}
    <div class="grade">
      ${rs('Comissão menor a partir de (R$)', `${id}.faixa_reduzida.de`, c.faixa_reduzida.de)}
      ${rs('até (R$)', `${id}.faixa_reduzida.ate`, c.faixa_reduzida.ate)}
      ${pct('Redução Clássico (pontos)', `${id}.faixa_reduzida.reducao.classico`, c.faixa_reduzida.reducao.classico)}
      ${pct('Redução Premium (pontos)', `${id}.faixa_reduzida.reducao.premium`, c.faixa_reduzida.reducao.premium)}
    </div>
    ${fonte('Fonte da redução', c.faixa_reduzida_fonte, c.faixa_reduzida_conferido_em)}
    <details class="tabela-frete">
      <summary>Ver a tabela de frete grátis pago pelo vendedor</summary>
      <div class="tabela-rolagem">
        <table>
          <thead><tr><th>Peso</th>${colunas.map((t) => `<th class="num">${t}</th>`).join('')}</tr></thead>
          <tbody>${f.custos.map((linha, i) => `<tr><td>${linhas[i]}</td>${linha.map((v) => `<td class="num">${campoReais(v)}</td>`).join('')}</tr>`).join('')}</tbody>
        </table>
      </div>
      <p class="dica">Abaixo de R$ ${f.abaixo_de}, o frete é no máximo metade do preço. Para mudar esta tabela, atualize data/canais.json.</p>
      ${fonte('Fonte do frete', c.frete_fonte, c.frete_conferido_em)}
    </details>`;
}

function cartao(id, c) {
  let especifico = '';
  if (c.tipo === 'faixas') especifico = faixas(id, c);
  else if (c.tipo === 'mercadolivre') especifico = mercadoLivre(id, c);
  else {
    especifico = `<div class="grade">
      ${pct(`${c.rotulo_comissao ?? 'Comissão'} (%)`, `${id}.comissao`, c.comissao)}
      ${rs('Taxa fixa por venda (R$)', `${id}.taxa_fixa`, c.taxa_fixa)}
    </div>${fonte('Fonte', c.comissao_fonte, c.comissao_conferido_em)}`;
  }
  const freteTiktok = c.frete_percentual != null
    ? `<div class="grade">${pct('Taxa de frete (% do preço)', `${id}.frete_percentual`, c.frete_percentual)}${rs('Teto da taxa de frete (R$)', `${id}.frete_teto`, c.frete_teto)}</div>${fonte('Fonte da taxa de frete', c.frete_fonte, c.frete_conferido_em)}`
    : '';
  return `
    <details class="painel canal-config" data-id="${id}">
      <summary><strong>${esc(c.nome)}</strong><span class="dica">${esc(resumoDoCanal(c))}</span></summary>
      <div class="canal-corpo">
        ${especifico}
        ${freteTiktok}
        <div class="grade">
          ${pct('Impostos (% do preço)', `${id}.impostos`, c.impostos, 'Um número só para todos os impostos da venda. É calculado sobre o preço de venda, não sobre o lucro.')}
          ${pct('Taxa financeira (%)', `${id}.taxa_financeira`, c.taxa_financeira, 'Cartão ou plataforma de pagamento.')}
          ${rs('Frete absorvido (R$/peça)', `${id}.frete_absorvido`, c.frete_absorvido)}
          ${rs('Pick & pack (R$/peça)', `${id}.embalagem`, c.embalagem)}
          ${rs('Outros custos (R$/peça)', `${id}.outros`, c.outros)}
        </div>
        <div><button type="button" class="botao pequeno discreto" data-acao="padrao" data-canal="${id}">Voltar este canal ao padrão</button></div>
      </div>
    </details>`;
}

function desenhar() {
  const abertos = new Set([...document.querySelectorAll('.canal-config[open]')].map((d) => d.dataset.id));
  $('#lista-canais').innerHTML = Object.entries(rasc).map(([id, c]) => cartao(id, c)).join('');
  abertos.forEach((id) => $(`.canal-config[data-id="${id}"]`)?.setAttribute('open', ''));
  barra();
}

function barra() {
  $('#cfg-salvar').disabled = !mudou;
  $('#cfg-descartar').hidden = !mudou;
  $('#cfg-estado').textContent = mudou ? 'Há mudanças não salvas.' : dados.canais ? 'Usando as taxas ajustadas pela empresa.' : 'Usando as taxas padrão.';
}

function definir(caminho, valor) {
  const partes = caminho.split('.');
  let alvo = rasc;
  partes.slice(0, -1).forEach((p) => (alvo = alvo[p]));
  alvo[partes.at(-1)] = valor;
}

function aoDigitar(e) {
  const el = e.target;
  if (!el.dataset?.c) return;
  definir(el.dataset.c, el.hasAttribute('data-num') ? lerNumero(el.value) : el.value);
  mudou = true;
  const id = el.dataset.c.split('.')[0];
  const resumo = $(`.canal-config[data-id="${id}"] summary .dica`);
  if (resumo) resumo.textContent = resumoDoCanal(rasc[id]);
  barra();
}

function aoClicar(e) {
  const b = e.target.closest('[data-acao], #cfg-salvar, #cfg-descartar, #cfg-padrao-tudo');
  if (!b) return;
  const id = b.dataset.canal;
  if (b.id === 'cfg-salvar') {
    rasc = Object.fromEntries(Object.entries(rasc).map(([k, c]) => [k, c.faixas ? { ...c, faixas: [...c.faixas].sort((a, b2) => (a.ate ?? Infinity) - (b2.ate ?? Infinity)) } : c]));
    dados.canais = rasc;
    salvar();
    return recomecar();
  }
  if (b.id === 'cfg-descartar') return recomecar();
  if (b.id === 'cfg-padrao-tudo') {
    if (b.dataset.confirmar !== 'sim') {
      b.dataset.confirmar = 'sim';
      b.textContent = 'Clique de novo para voltar tudo ao padrão';
      return;
    }
    dados.canais = null;
    salvar();
    b.dataset.confirmar = '';
    b.textContent = 'Voltar tudo ao padrão';
    return recomecar();
  }
  if (b.dataset.acao === 'padrao') rasc[id] = canaisDePadrao()[id];
  if (b.dataset.acao === 'nova-faixa') {
    const f = rasc[id].faixas;
    const anterior = f[f.length - 2];
    f.splice(f.length - 1, 0, { ate: (anterior?.ate ?? 0) + 50, comissao: f.at(-1).comissao, taxa_fixa: f.at(-1).taxa_fixa });
  }
  if (b.dataset.acao === 'tirar-faixa') rasc[id].faixas.splice(Number(b.dataset.i), 1);
  mudou = true;
  desenhar();
}
