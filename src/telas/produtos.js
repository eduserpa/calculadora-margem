// Tela Produtos: listar, buscar, cadastrar, editar e excluir.
import { dados, salvar, novoId } from '../dados.js';
import { TIPOS, porId, custoDoProduto, kitIncompleto, pesoDoProduto, kitsQueUsam, produtoVazio, exemplos } from '../produtos.js';
import { lerNumero, reais, campo, campoReais, gramas, esc } from '../formato.js';

const $ = (s, raiz = document) => raiz.querySelector(s);
const janela = () => $('#janela-produto');
const semAcento = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

let busca = '';
let rasc = null; // produto sendo editado
let confirmarExclusao = false;

export function iniciarProdutos() {
  $('#novo-produto').addEventListener('click', () => abrir());
  $('#busca').addEventListener('input', (e) => {
    busca = e.target.value;
    desenharLista();
  });
  $('#lista-produtos').addEventListener('click', (e) => {
    const editar = e.target.closest('[data-editar]');
    if (editar) abrir(editar.dataset.editar);
    if (e.target.closest('#primeiro-produto')) abrir();
    if (e.target.closest('#carregar-exemplos')) {
      dados.produtos.push(...exemplos(novoId));
      salvar();
    }
  });
  const j = janela();
  j.addEventListener('input', aoDigitar);
  j.addEventListener('change', aoTrocarTipo);
  j.addEventListener('click', aoClicar);
  j.addEventListener('submit', aoSalvar);
  desenharLista();
}

// ---------- lista ----------

export function desenharLista() {
  const alvo = $('#lista-produtos');
  if (!dados.produtos.length) {
    alvo.innerHTML = `
      <div class="vazio">
        <h3>Nenhum produto ainda</h3>
        <p>Cadastre o primeiro produto com o custo dele. Se quiser só testar, carregue três produtos de exemplo.</p>
        <div class="acoes">
          <button type="button" class="botao principal" id="primeiro-produto">Cadastrar produto</button>
          <button type="button" class="botao" id="carregar-exemplos">Carregar exemplos</button>
        </div>
      </div>`;
    return;
  }
  const termo = semAcento(busca.trim());
  const mapa = porId();
  const lista = dados.produtos
    .filter((p) => !termo || semAcento(p.nome).includes(termo) || semAcento(p.sku).includes(termo))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  if (!lista.length) {
    alvo.innerHTML = `<div class="vazio"><p>Nenhum produto com “${esc(busca)}”.</p></div>`;
    return;
  }
  alvo.innerHTML = `
    <div class="tabela-rolagem">
      <table>
        <thead><tr><th>Produto</th><th>Custo formado por</th><th class="num">Custo (CMV)</th><th class="num">Peso para frete</th><th><span hidden>Ações</span></th></tr></thead>
        <tbody>
          ${lista.map((p) => `
            <tr>
              <td><div class="nome-produto">${esc(p.nome)}</div>${p.sku ? `<div class="sku">SKU ${esc(p.sku)}</div>` : ''}</td>
              <td><span class="selo">${TIPOS[p.tipoCusto]}</span>${kitIncompleto(p, mapa) ? ' <span class="selo alerta">item excluído</span>' : ''}</td>
              <td class="num">${reais(custoDoProduto(p, mapa))}</td>
              <td class="num">${gramas(pesoDoProduto(p))}</td>
              <td class="num"><button type="button" class="botao pequeno" data-editar="${p.id}">Editar</button></td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

// ---------- formulário ----------

function abrir(id) {
  const original = id ? dados.produtos.find((p) => p.id === id) : null;
  const base = produtoVazio();
  rasc = original
    ? { ...base, ...structuredClone(original), revenda: { ...base.revenda, ...original.revenda }, fabricacao: { ...base.fabricacao, ...original.fabricacao } }
    : base;
  confirmarExclusao = false;
  desenharJanela();
  janela().showModal();
  $('[data-c="nome"]', janela()).focus();
}

const dinheiro = (rotulo, caminho, valor) => `
  <label class="campo"><span>${rotulo}</span>
    <input type="text" inputmode="decimal" data-c="${caminho}" data-num value="${campoReais(valor)}" placeholder="0,00">
  </label>`;

function desenharJanela() {
  const tipos = Object.entries(TIPOS).map(([valor, rotulo]) => `
    <label><input type="radio" name="tipoCusto" value="${valor}" ${rasc.tipoCusto === valor ? 'checked' : ''}><span>${rotulo}</span></label>`).join('');
  janela().innerHTML = `
    <form method="dialog" novalidate>
      <div class="janela-topo"><h3 id="titulo-janela">${rasc.id ? 'Editar produto' : 'Novo produto'}</h3></div>
      <div class="janela-corpo">
        <div class="grade">
          <label class="campo"><span>Nome do produto</span><input type="text" data-c="nome" value="${esc(rasc.nome)}" autocomplete="off"></label>
          <label class="campo"><span>SKU / código</span><input type="text" data-c="sku" value="${esc(rasc.sku)}" autocomplete="off"></label>
        </div>
        <fieldset>
          <legend>Como o custo é formado</legend>
          <div class="segmentos" role="radiogroup" aria-label="Tipo de custo">${tipos}</div>
          <div id="bloco-custo">${blocoCusto()}</div>
          <div class="total"><span>Custo do produto (CMV)</span><strong id="total-custo"></strong></div>
        </fieldset>
        <fieldset>
          <legend>Peso e medidas da embalagem</legend>
          <p class="dica">Só o Mercado Livre usa: o frete grátis que o vendedor paga depende do peso. Caixa grande e leve paga pelo tamanho.</p>
          <div class="grade">
            <label class="campo"><span>Peso real (g)</span><input type="text" inputmode="decimal" data-c="pesoG" data-num value="${campo(rasc.pesoG)}"></label>
            <label class="campo"><span>Comprimento (cm)</span><input type="text" inputmode="decimal" data-c="comprimento" data-num value="${campo(rasc.comprimento)}"></label>
            <label class="campo"><span>Largura (cm)</span><input type="text" inputmode="decimal" data-c="largura" data-num value="${campo(rasc.largura)}"></label>
            <label class="campo"><span>Altura (cm)</span><input type="text" inputmode="decimal" data-c="altura" data-num value="${campo(rasc.altura)}"></label>
          </div>
          <p class="dica" id="peso-frete"></p>
        </fieldset>
        <p class="erro" id="erro-produto" role="alert" hidden></p>
      </div>
      <div class="janela-base">
        ${rasc.id ? '<button type="button" class="botao perigo" data-acao="excluir">Excluir</button>' : ''}
        <div class="direita">
          <button type="button" class="botao" data-acao="cancelar">Cancelar</button>
          <button type="submit" class="botao principal">Salvar</button>
        </div>
      </div>
    </form>`;
  atualizarTotais();
}

function blocoCusto() {
  if (rasc.tipoCusto === 'revenda') {
    const r = rasc.revenda;
    return `<div class="grade">
      ${dinheiro('Custo de compra (R$)', 'revenda.custoCompra', r.custoCompra)}
      ${dinheiro('Frete do fornecedor (R$)', 'revenda.freteFornecedor', r.freteFornecedor)}
      ${dinheiro('Embalagem (R$)', 'revenda.embalagem', r.embalagem)}
      ${dinheiro('Outros (R$)', 'revenda.outros', r.outros)}
    </div>`;
  }
  if (rasc.tipoCusto === 'fabricacao') {
    const f = rasc.fabricacao;
    return `
      <div class="linhas">
        <strong>Matérias-primas</strong>
        ${f.materiais.map((m, i) => `
          <div class="linha-item">
            <label class="campo"><span>Material</span><input type="text" data-c="fabricacao.materiais.${i}.descricao" value="${esc(m.descricao)}"></label>
            ${dinheiro('Preço por unidade (R$)', `fabricacao.materiais.${i}.precoUnitario`, m.precoUnitario)}
            <label class="campo"><span>Quantidade usada</span><input type="text" inputmode="decimal" data-c="fabricacao.materiais.${i}.quantidade" data-num value="${campo(m.quantidade)}"></label>
            <button type="button" class="botao pequeno discreto" data-acao="remover" data-lista="fabricacao.materiais" data-i="${i}" aria-label="Remover material">Remover</button>
          </div>`).join('')}
        <div><button type="button" class="botao pequeno" data-acao="adicionar" data-lista="fabricacao.materiais">Adicionar material</button></div>
      </div>
      <div class="linhas">
        <strong>Mão de obra</strong>
        ${f.maoDeObra.map((m, i) => `
          <div class="linha-item duas">
            <label class="campo"><span>Etapa</span><input type="text" data-c="fabricacao.maoDeObra.${i}.descricao" value="${esc(m.descricao)}"></label>
            ${dinheiro('Valor (R$)', `fabricacao.maoDeObra.${i}.valor`, m.valor)}
            <button type="button" class="botao pequeno discreto" data-acao="remover" data-lista="fabricacao.maoDeObra" data-i="${i}" aria-label="Remover etapa">Remover</button>
          </div>`).join('')}
        <div><button type="button" class="botao pequeno" data-acao="adicionar" data-lista="fabricacao.maoDeObra">Adicionar etapa</button></div>
      </div>
      <div class="grade">
        ${dinheiro('Embalagem (R$)', 'fabricacao.embalagem', f.embalagem)}
        ${dinheiro('Frete de insumos (R$)', 'fabricacao.freteInsumos', f.freteInsumos)}
        ${dinheiro('Outros (R$)', 'fabricacao.outros', f.outros)}
      </div>`;
  }
  const opcoes = dados.produtos.filter((p) => p.tipoCusto !== 'kit' && p.id !== rasc.id).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  if (!opcoes.length) return '<p class="dica">Cadastre antes os produtos que entram no kit. Depois volte aqui para montar o kit.</p>';
  const mapa = porId();
  return `
    <div class="linhas">
      ${rasc.kit.map((item, i) => `
        <div class="linha-item">
          <label class="campo"><span>Produto</span>
            <select data-c="kit.${i}.produtoId">
              <option value="">Escolha…</option>
              ${opcoes.map((p) => `<option value="${p.id}" ${p.id === item.produtoId ? 'selected' : ''}>${esc(p.nome)}${p.sku ? ` (${esc(p.sku)})` : ''}</option>`).join('')}
              ${item.produtoId && !mapa.has(item.produtoId) ? '<option value="" selected>(produto excluído)</option>' : ''}
            </select>
          </label>
          <label class="campo"><span>Quantidade</span><input type="text" inputmode="decimal" data-c="kit.${i}.quantidade" data-num value="${campo(item.quantidade)}"></label>
          <div class="subtotal" id="sub-kit-${i}"></div>
          <button type="button" class="botao pequeno discreto" data-acao="remover" data-lista="kit" data-i="${i}" aria-label="Tirar do kit">Remover</button>
        </div>`).join('')}
      <div><button type="button" class="botao pequeno" data-acao="adicionar" data-lista="kit">Adicionar produto ao kit</button></div>
    </div>`;
}

function atualizarTotais() {
  const j = janela();
  $('#total-custo', j).textContent = reais(custoDoProduto(rasc));
  if (rasc.tipoCusto === 'kit') {
    const mapa = porId();
    rasc.kit.forEach((item, i) => {
      const alvo = $(`#sub-kit-${i}`, j);
      const p = mapa.get(item.produtoId);
      if (alvo) alvo.textContent = p ? reais(custoDoProduto(p, mapa) * (Number(item.quantidade) || 0)) : '';
    });
  }
  const peso = pesoDoProduto(rasc);
  const pelaCaixa = peso > (Number(rasc.pesoG) || 0);
  $('#peso-frete', j).innerHTML = `Peso usado no frete: <strong>${gramas(peso)}</strong> ${pelaCaixa ? '(pelo tamanho da caixa)' : '(peso real)'}`;
}

function definir(caminho, valor) {
  const partes = caminho.split('.');
  let alvo = rasc;
  partes.slice(0, -1).forEach((p) => (alvo = alvo[p]));
  alvo[partes.at(-1)] = valor;
}

function aoDigitar(e) {
  const el = e.target;
  if (!el.dataset.c) return;
  definir(el.dataset.c, el.hasAttribute('data-num') ? lerNumero(el.value) : el.value);
  atualizarTotais();
}

function aoTrocarTipo(e) {
  if (e.target.name !== 'tipoCusto') return;
  rasc.tipoCusto = e.target.value;
  if (rasc.tipoCusto === 'kit' && !rasc.kit.length) rasc.kit.push({ produtoId: '', quantidade: 1 });
  $('#bloco-custo', janela()).innerHTML = blocoCusto();
  atualizarTotais();
}

const LINHA_NOVA = {
  'fabricacao.materiais': () => ({ descricao: '', precoUnitario: 0, quantidade: 0 }),
  'fabricacao.maoDeObra': () => ({ descricao: '', valor: 0 }),
  kit: () => ({ produtoId: '', quantidade: 1 }),
};

function lista(caminho) {
  return caminho.split('.').reduce((o, p) => o[p], rasc);
}

function aoClicar(e) {
  const botao = e.target.closest('[data-acao]');
  if (!botao) return;
  const acao = botao.dataset.acao;
  if (acao === 'cancelar') return janela().close();
  if (acao === 'excluir') return excluir(botao);
  if (acao === 'adicionar') lista(botao.dataset.lista).push(LINHA_NOVA[botao.dataset.lista]());
  if (acao === 'remover') lista(botao.dataset.lista).splice(Number(botao.dataset.i), 1);
  $('#bloco-custo', janela()).innerHTML = blocoCusto();
  atualizarTotais();
}

function mostrarErro(texto) {
  const el = $('#erro-produto', janela());
  el.textContent = texto;
  el.hidden = !texto;
}

function excluir(botao) {
  const kits = kitsQueUsam(rasc.id);
  if (kits.length) {
    return mostrarErro(`Este produto está no kit ${kits.map((k) => `“${k.nome}”`).join(', ')}. Tire ele do kit antes de excluir.`);
  }
  if (!confirmarExclusao) {
    confirmarExclusao = true;
    botao.textContent = 'Clique de novo para excluir';
    botao.classList.add('confirmar');
    return;
  }
  dados.produtos = dados.produtos.filter((p) => p.id !== rasc.id);
  salvar();
  janela().close();
}

function aoSalvar(e) {
  e.preventDefault();
  rasc.nome = rasc.nome.trim();
  rasc.sku = rasc.sku.trim();
  if (!rasc.nome) return mostrarErro('Dê um nome ao produto.');
  const skuRepetido = rasc.sku && dados.produtos.find((p) => p.id !== rasc.id && semAcento(p.sku) === semAcento(rasc.sku));
  if (skuRepetido) return mostrarErro(`O SKU ${rasc.sku} já está no produto “${skuRepetido.nome}”.`);
  if (rasc.tipoCusto === 'kit') {
    rasc.kit = rasc.kit.filter((i) => i.produtoId && i.quantidade > 0);
    if (!rasc.kit.length) {
      $('#bloco-custo', janela()).innerHTML = blocoCusto();
      return mostrarErro('Escolha pelo menos um produto para o kit, com quantidade.');
    }
  }
  const produto = { ...structuredClone(rasc), atualizadoEm: new Date().toISOString() };
  if (produto.id) dados.produtos = dados.produtos.map((p) => (p.id === produto.id ? produto : p));
  else dados.produtos.push({ ...produto, id: novoId() });
  salvar();
  janela().close();
}
