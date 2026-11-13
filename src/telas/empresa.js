// Empresa: seletor no topo da lateral (só com 2+ empresas), imposto da empresa em Taxas dos Canais (vale para todo canal sem
// imposto próprio; quem aplica é canais() do dados.js) e "Copiar produtos de outra empresa" em Meus Produtos (com prévia).
import { minhasEmpresas, empresaAtual, trocarEmpresa, previaCopia, copiarProdutos } from '../nuvem.js';
import { dados, salvar, carregar, aoMudar } from '../dados.js';
import { lerNumero, campo, esc } from '../formato.js';
import { icone } from '../icones.js';
import { iniciarEquipe } from './equipe.js';
import { iniciarHistorico } from './historico.js';

const $ = (s) => document.querySelector(s);
let empresas = [];

// Chamado pelo app.js depois do login e dos dados carregados. Uma parte que falhar não derruba as outras.
export async function iniciarNuvemTelas() {
  document.querySelectorAll('[data-nuvem]').forEach((el) => (el.hidden = false));
  for (const [nome, fn] of [['empresa', iniciarEmpresa], ['equipe', iniciarEquipe], ['histórico', iniciarHistorico]]) {
    try {
      await fn();
    } catch (erro) {
      console.error(nome, erro);
    }
  }
}

export async function iniciarEmpresa() {
  empresas = await minhasEmpresas();
  const atual = empresaAtual();
  // seletor
  const sel = $('#seletor-empresa');
  if (empresas.length > 1) {
    sel.innerHTML = `<label for="empresa-sel">Empresa</label>
      <select id="empresa-sel">${empresas.map((e) => `<option value="${esc(e.id)}"${e.id === atual ? ' selected' : ''}>${esc(e.nome)}</option>`).join('')}</select>`;
    sel.hidden = false;
    $('#empresa-sel').addEventListener('change', (e) => trocarEmpresa(e.target.value));
  }
  // imposto da empresa
  desenharImposto();
  aoMudar(() => document.activeElement?.id !== 'imposto-valor' && desenharImposto());
  $('#imposto-empresa').addEventListener('change', guardarImposto);
  // copiar produtos
  const outras = empresas.filter((e) => e.id !== atual);
  if (outras.length) {
    $('#copiar-produtos').hidden = false;
    $('#copiar-produtos').addEventListener('click', () => janelaCopiar(outras));
  }
}

function desenharImposto() {
  const v = dados.empresa?.impostos;
  $('#imposto-empresa').innerHTML = `
    <label class="campo" for="imposto-valor"><span>Imposto da empresa (%)</span></label>
    <div class="linha-imposto">
      <input type="text" inputmode="decimal" id="imposto-valor" class="campo-texto" value="${v == null ? '' : campo(v)}" placeholder="Sem imposto da empresa" aria-describedby="imposto-dica">
      <span id="imposto-estado" class="dica" role="status"></span>
    </div>
    <p class="dica" id="imposto-dica">Vale para todos os canais. Um canal com imposto próprio (digitado nele) usa o dele. Deixe vazio para cada canal usar o seu.</p>`;
}

function guardarImposto(e) {
  if (e.target.id !== 'imposto-valor') return;
  const texto = e.target.value.trim();
  dados.empresa = texto ? { impostos: lerNumero(texto) } : null;
  const ok = salvar();
  $('#imposto-estado').textContent = ok ? (texto ? `Salvo: ${campo(dados.empresa.impostos)}% em todos os canais sem imposto próprio.` : 'Salvo: cada canal usa o próprio imposto.') : 'Não deu para salvar.';
}

// ---------- copiar produtos de outra empresa ----------

function janelaCopiar(outras) {
  const j = $('#janela-copiar');
  j.innerHTML = `
    <div class="janela-topo">
      <h3 id="titulo-copiar">Copiar produtos de outra empresa</h3>
      <button type="button" class="fechar" data-acao="fechar" aria-label="Fechar">${icone('x')}</button>
    </div>
    <div class="janela-corpo">
      <label class="campo"><span>Copiar de</span>
        <select id="copiar-origem" class="campo-texto">${outras.map((e) => `<option value="${esc(e.id)}">${esc(e.nome)}</option>`).join('')}</select>
      </label>
      <p class="dica">Produto com o mesmo SKU é atualizado; os outros entram como novos. Preços, taxas e kits não são copiados.</p>
      <div id="copiar-previa" role="status"></div>
    </div>
    <div class="janela-base"><div class="direita">
      <button type="button" class="botao" data-acao="previa">Ver prévia</button>
      <button type="button" class="botao principal" data-acao="copiar" hidden>Copiar</button>
    </div></div>`;
  j.onclick = (e) => {
    const acao = e.target.closest('[data-acao]')?.dataset.acao;
    if (acao === 'fechar') j.close();
    if (acao === 'previa') mostrarPrevia();
    if (acao === 'copiar') copiar();
  };
  $('#copiar-origem').onchange = () => {
    $('#copiar-previa').innerHTML = '';
    $('[data-acao=copiar]').hidden = true;
  };
  j.showModal();
}

const listar = (titulo, itens) => (itens.length
  ? `<p><strong>${titulo} (${itens.length})</strong></p><ul class="lista-previa">${itens.map((p) => `<li>${esc(p.nome)}${p.sku ? ` (${esc(p.sku)})` : ''}</li>`).join('')}</ul>`
  : '');

async function mostrarPrevia() {
  const caixa = $('#copiar-previa');
  const botao = $('[data-acao=copiar]');
  caixa.innerHTML = '<p class="dica">Conferindo…</p>';
  try {
    const p = await previaCopia($('#copiar-origem').value);
    const total = p.novos.length + p.atualizados.length;
    caixa.innerHTML = total
      ? `<p><strong>${p.novos.length}</strong> novo(s) · <strong>${p.atualizados.length}</strong> atualizado(s) pelo SKU</p>${listar('Novos', p.novos)}${listar('Atualizados', p.atualizados)}`
      : '<p>Essa empresa não tem produtos para copiar (kits ficam de fora).</p>';
    botao.textContent = `Copiar ${total} produto(s)`;
    botao.hidden = !total;
  } catch (erro) {
    caixa.innerHTML = `<p class="erro">${esc(erro.message)}</p>`;
    botao.hidden = true;
  }
}

async function copiar() {
  const botao = $('[data-acao=copiar]');
  botao.disabled = true;
  try {
    const r = await copiarProdutos($('#copiar-origem').value);
    await carregar(); // traz da nuvem o que entrou
    salvar(); // nada a enviar (a nuvem acabou de ser lida); só redesenha as telas
    $('#janela-copiar').close();
    const aviso = $('#aviso-geral');
    aviso.textContent = `Produtos copiados: ${r.novos} novo(s), ${r.atualizados} atualizado(s).`;
    aviso.classList.add('ok');
    aviso.hidden = false;
  } catch (erro) {
    $('#copiar-previa').innerHTML = `<p class="erro">${esc(erro.message)}</p>`;
    botao.disabled = false;
  }
}
