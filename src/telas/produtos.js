// Tela Meus Produtos: cartões, busca, filtro, ordem, cadastro, edição e exclusão.
import { icone } from '../icones.js';
import { dados, salvar, novoId } from '../dados.js';
import { porId, custoDoProduto, kitIncompleto, pesoDoProduto, kitsQueUsam, produtoVazio, exemplos } from '../produtos.js';
import { lerNumero, reais, campo, campoReais, gramas, esc } from '../formato.js';
import { capa, prepararFoto, MAX_FOTOS } from '../fotos.js';

const $ = (s, raiz = document) => raiz.querySelector(s);
const janela = () => $('#janela-produto');
const semAcento = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const ETIQUETA = { revenda: 'Revenda', fabricacao: 'Fabricante', kit: 'Kit' };

let rasc = null; // produto sendo editado
let unidadePeso = 'g';
let confirmarExclusao = false;

export function iniciarProdutos() {
  $('#novo-produto').addEventListener('click', () => abrir());
  ['#busca', '#filtro-tipo', '#ordem'].forEach((s) => $(s).addEventListener('input', desenharLista));
  $('#lista-produtos').addEventListener('click', (e) => {
    const editar = e.target.closest('[data-editar]');
    if (editar) abrir(editar.dataset.editar);
    const lixeira = e.target.closest('[data-excluir]');
    if (lixeira) excluirDoCartao(lixeira);
    if (e.target.closest('#primeiro-produto')) abrir();
    if (e.target.closest('#carregar-exemplos')) {
      dados.produtos.push(...exemplos(novoId));
      salvar();
    }
  });
  const j = janela();
  j.addEventListener('input', aoDigitar);
  j.addEventListener('change', aoTrocar);
  j.addEventListener('click', aoClicar);
  j.addEventListener('submit', aoSalvar);
  desenharLista();
}

// ---------- lista ----------

const dataCurta = (iso) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '');
const precificacoes = (id) => Object.keys(dados.precificacoes?.[id] ?? {}).length;

function apagar(id) {
  dados.produtos = dados.produtos.filter((p) => p.id !== id);
  delete dados.precificacoes?.[id];
  salvar();
}

// Lixeira do cartão: o primeiro clique pede confirmação no próprio botão.
function excluirDoCartao(botao) {
  const id = botao.dataset.excluir;
  const kits = kitsQueUsam(id);
  if (kits.length) {
    botao.textContent = 'Está num kit';
    botao.disabled = true;
    return;
  }
  if (botao.dataset.confirmar !== 'sim') {
    botao.dataset.confirmar = 'sim';
    botao.textContent = 'Excluir?';
    botao.classList.add('confirmar');
    return;
  }
  apagar(id);
}

export function desenharLista() {
  const alvo = $('#lista-produtos');
  if (!dados.produtos.length) {
    alvo.innerHTML = `
      <div class="vazio">
        <img class="mascote" src="assets/calculeo-mascote.webp" alt="" width="180" height="163">
        <h2>Nenhum produto cadastrado ainda</h2>
        <p>Cadastre o primeiro produto com o custo dele. Se quiser só testar, carregue três produtos de exemplo.</p>
        <div class="acoes">
          <button type="button" class="botao principal" id="primeiro-produto">Cadastrar Primeiro Produto</button>
          <button type="button" class="botao" id="carregar-exemplos">Carregar exemplos</button>
        </div>
      </div>`;
    return;
  }
  const termo = semAcento($('#busca').value.trim());
  const tipo = $('#filtro-tipo').value;
  const mapa = porId();
  const custo = new Map(dados.produtos.map((p) => [p.id, custoDoProduto(p, mapa)]));
  const ordens = {
    recentes: (a, b) => String(b.atualizadoEm).localeCompare(String(a.atualizadoEm)),
    antigos: (a, b) => String(a.atualizadoEm).localeCompare(String(b.atualizadoEm)),
    nome: (a, b) => a.nome.localeCompare(b.nome, 'pt-BR'),
    'cmv-menor': (a, b) => custo.get(a.id) - custo.get(b.id),
    'cmv-maior': (a, b) => custo.get(b.id) - custo.get(a.id),
  };
  const lista = dados.produtos
    .filter((p) => tipo === 'todos' || p.tipoCusto === tipo)
    .filter((p) => !termo || semAcento(p.nome).includes(termo) || semAcento(p.sku).includes(termo))
    .sort(ordens[$('#ordem').value]);
  if (!lista.length) {
    alvo.innerHTML = '<div class="vazio"><p>Nenhum produto encontrado com esse filtro.</p></div>';
    return;
  }
  alvo.innerHTML = `<div class="lista-cartoes">${lista.map((p) => `
    <article class="cartao produto">
      <div class="produto-imagem">${capa(p)}</div>
      <div class="produto-corpo">
        <h2 title="${esc(p.nome)}">${esc(p.nome)}</h2>
        ${p.sku ? `<p class="ref">Ref: ${esc(p.sku)}</p>` : ''}
        <div class="linha-dado"><span>CMV:<span class="etiqueta ${p.tipoCusto}">${ETIQUETA[p.tipoCusto]}</span>${kitIncompleto(p, mapa) ? '<span class="etiqueta alerta">item excluído</span>' : ''}</span><strong>${reais(custo.get(p.id))}</strong></div>
        <div class="linha-dado"><span>Peso:</span><strong>${gramas(Number(p.pesoG) || 0)}</strong></div>
        <div class="linha-dado"><span>Precificações:</span>${precificacoes(p.id) ? `<strong class="bom">${precificacoes(p.id)} canal(is)</strong>` : '<span>Nenhuma</span>'}</div>
      </div>
      <div class="produto-base"><span>Atualizado em ${dataCurta(p.atualizadoEm)}</span>
        <span class="acoes-cartao"><button type="button" class="botao pequeno" data-editar="${p.id}">Editar</button><button type="button" class="botao pequeno perigo" data-excluir="${p.id}" aria-label="Excluir ${esc(p.nome)}" title="Excluir">${icone('trash-2')}</button></span></div>
    </article>`).join('')}</div>`;
}

// ---------- formulário ----------

function abrir(id) {
  const original = id ? dados.produtos.find((p) => p.id === id) : null;
  const base = produtoVazio();
  rasc = original
    ? { ...base, ...structuredClone(original), revenda: { ...base.revenda, ...original.revenda }, fabricacao: { ...base.fabricacao, ...original.fabricacao } }
    : base;
  rasc.ultimoIndividual = rasc.tipoCusto === 'kit' ? 'revenda' : rasc.tipoCusto;
  confirmarExclusao = false;
  desenharJanela();
  janela().showModal();
  $('[data-c="nome"]', janela()).focus();
}

const dinheiro = (rotulo, caminho, valor, extra = '') => `
  <label class="campo"><span>${rotulo}</span>
    <input type="text" inputmode="decimal" data-c="${caminho}" data-num value="${campoReais(valor)}" placeholder="0,00" ${extra}>
  </label>`;
const opcao = (nome, valor, rotulo, marcado) =>
  `<label><input type="radio" name="${nome}" value="${valor}" ${marcado ? 'checked' : ''}><span>${rotulo}</span></label>`;

function desenharJanela() {
  const kit = rasc.tipoCusto === 'kit';
  janela().innerHTML = `
    <form method="dialog" novalidate>
      <div class="janela-topo">
        <h3 id="titulo-janela">${rasc.id ? 'Editar Produto' : 'Novo Produto'}</h3>
        <button type="button" class="fechar" data-acao="cancelar" aria-label="Fechar">${icone('x')}</button>
      </div>
      <div class="janela-corpo">
        <div class="secao">
          <p class="secao-titulo">Tipo do Produto</p>
          <div class="alternar" role="radiogroup" aria-label="Tipo do produto">
            ${opcao('tipoProduto', 'individual', 'Individual', !kit)}${opcao('tipoProduto', 'kit', 'Kit', kit)}
          </div>
        </div>
        <div class="grade">
          <label class="campo"><span>${kit ? 'Nome do Kit' : 'Nome do produto'}</span><input type="text" data-c="nome" value="${esc(rasc.nome)}" placeholder="${kit ? 'Ex: Kit 2 garrafas' : 'Ex: Garrafa 500 ml'}" autocomplete="off"></label>
          <label class="campo"><span>Referência / SKU</span><input type="text" data-c="sku" value="${esc(rasc.sku)}" placeholder="Ex: GT-500" autocomplete="off"></label>
          <label class="campo"><span>Grade</span><input type="text" data-c="grade" value="${esc(rasc.grade ?? '')}" placeholder="Ex: P-GG" autocomplete="off"></label>
        </div>
        <div class="secao">
          <p class="secao-titulo">Fotos (até ${MAX_FOTOS})</p>
          <div id="bloco-fotos">${blocoFotos()}</div>
        </div>
        <div class="secao">
          <p class="secao-titulo">Peso e Dimensões</p>
          <div class="linha-peso">
            <label class="campo"><span>Peso real</span><input type="text" inputmode="decimal" id="peso-real" value="${campo(unidadePeso === 'kg' ? (Number(rasc.pesoG) || 0) / 1000 : rasc.pesoG)}"></label>
            <div class="alternar compacto" role="radiogroup" aria-label="Unidade do peso">${opcao('unidadePeso', 'g', 'g', unidadePeso === 'g')}${opcao('unidadePeso', 'kg', 'kg', unidadePeso === 'kg')}</div>
          </div>
          <p class="dica">Dimensões (opcional), em cm</p>
          <div class="grade">
            <label class="campo"><span>Comprimento</span><input type="text" inputmode="decimal" data-c="comprimento" data-num value="${campo(rasc.comprimento)}" placeholder="0"></label>
            <label class="campo"><span>Largura</span><input type="text" inputmode="decimal" data-c="largura" data-num value="${campo(rasc.largura)}" placeholder="0"></label>
            <label class="campo"><span>Altura</span><input type="text" inputmode="decimal" data-c="altura" data-num value="${campo(rasc.altura)}" placeholder="0"></label>
          </div>
          <div class="info-peso" id="peso-frete"></div>
        </div>
        <div class="secao">
          ${kit
            ? '<p class="secao-titulo">Composição do Kit</p>'
            : `<div class="cmv-cabeca"><p class="secao-titulo">Custo do Produto (CMV)</p>
                 <div class="alternar compacto" role="radiogroup" aria-label="Como o custo é formado">
                   ${opcao('tipoCusto', 'revenda', 'Revendedor', rasc.tipoCusto === 'revenda')}${opcao('tipoCusto', 'fabricacao', 'Fabricante', rasc.tipoCusto === 'fabricacao')}
                 </div></div>`}
          <div id="bloco-custo">${blocoCusto()}</div>
        </div>
        <div class="total"><span>${kit ? 'CMV Total do Kit:' : 'CMV Total:'}</span><strong id="total-custo"></strong></div>
        <p class="erro" id="erro-produto" role="alert" hidden></p>
      </div>
      <div class="janela-base">
        ${rasc.id ? '<button type="button" class="botao perigo" data-acao="excluir">Excluir produto</button>' : ''}
        <div class="direita">
          <button type="button" class="botao" data-acao="cancelar">Cancelar</button>
          <button type="submit" class="botao principal">${rasc.id ? 'Salvar Alterações' : 'Cadastrar Produto'}</button>
        </div>
      </div>
    </form>`;
  atualizarTotais();
}

function blocoFotos() {
  const fotos = rasc.fotos ?? [];
  const cheio = fotos.length >= MAX_FOTOS;
  return `<div class="fotos">
    ${fotos.map((f, i) => `<div class="foto"><img src="${esc(f)}" alt="Foto ${i + 1}"><button type="button" class="fechar" data-acao="tirar-foto" data-i="${i}" aria-label="Tirar foto ${i + 1}">${icone('x')}</button></div>`).join('')}
  </div>
  ${cheio ? '' : `<div class="linha-foto">
    <button type="button" class="botao pequeno" data-acao="foto-escolher">${icone('upload')} Escolher arquivo</button><input type="file" id="foto-arquivo" accept="image/*" multiple hidden>
    <input type="url" id="foto-url" class="campo-texto" placeholder="ou cole o endereço da imagem (https://...)" aria-label="Endereço da imagem">
    <button type="button" class="botao pequeno" data-acao="foto-url">${icone('plus')} Adicionar</button>
  </div>`}`;
}

async function adicionarFotos(origens) {
  mostrarErro('');
  rasc.fotos = rasc.fotos ?? [];
  for (const origem of origens.slice(0, MAX_FOTOS - rasc.fotos.length)) {
    try {
      rasc.fotos.push(await prepararFoto(origem));
    } catch (erro) {
      mostrarErro(erro.message);
    }
  }
  $('#bloco-fotos', janela()).innerHTML = blocoFotos();
}

function blocoCusto() {
  if (rasc.tipoCusto === 'revenda') {
    const r = rasc.revenda;
    return `<div class="grade">
      ${dinheiro('Custo de aquisição (R$)', 'revenda.custoCompra', r.custoCompra)}
      ${dinheiro('Frete do fornecedor (R$)', 'revenda.freteFornecedor', r.freteFornecedor)}
      ${dinheiro('Embalagem (R$)', 'revenda.embalagem', r.embalagem)}
      ${dinheiro('Outros custos (R$)', 'revenda.outros', r.outros)}
    </div>`;
  }
  if (rasc.tipoCusto === 'fabricacao') {
    const f = rasc.fabricacao;
    return `
      <div class="secao">
        <div class="linhas">
          <div class="linhas-cabeca"><strong>Matérias-primas</strong><button type="button" class="botao pequeno discreto" data-acao="adicionar" data-lista="fabricacao.materiais">${icone('plus')} Adicionar</button></div>
          ${f.materiais.map((m, i) => `
            <div class="linha-item">
              <label class="campo"><span>Material</span><input type="text" data-c="fabricacao.materiais.${i}.descricao" value="${esc(m.descricao)}" placeholder="Ex: Chapa, Parafuso, Tinta..."></label>
              ${dinheiro('Preço unit. (R$)', `fabricacao.materiais.${i}.precoUnitario`, m.precoUnitario)}
              <label class="campo"><span>Qtd</span><input type="text" inputmode="decimal" data-c="fabricacao.materiais.${i}.quantidade" data-num value="${campo(m.quantidade)}" placeholder="0"></label>
              <div class="subtotal" id="sub-m-${i}"></div>
              <button type="button" class="botao pequeno discreto" data-acao="remover" data-lista="fabricacao.materiais" data-i="${i}" aria-label="Remover material">${icone('x')}</button>
            </div>`).join('')}
          <p class="subtotal-linha" id="sub-mp"></p>
        </div>
        <div class="linhas">
          <div class="linhas-cabeca"><strong>Mão de obra</strong><button type="button" class="botao pequeno discreto" data-acao="adicionar" data-lista="fabricacao.maoDeObra">${icone('plus')} Adicionar</button></div>
          ${f.maoDeObra.map((m, i) => `
            <div class="linha-item duas">
              <label class="campo"><span>Etapa</span><input type="text" data-c="fabricacao.maoDeObra.${i}.descricao" value="${esc(m.descricao)}" placeholder="Ex: Corte, Solda, Acabamento..."></label>
              ${dinheiro('Valor (R$)', `fabricacao.maoDeObra.${i}.valor`, m.valor)}
              <button type="button" class="botao pequeno discreto" data-acao="remover" data-lista="fabricacao.maoDeObra" data-i="${i}" aria-label="Remover etapa">${icone('x')}</button>
            </div>`).join('')}
          <p class="subtotal-linha" id="sub-mdo"></p>
        </div>
        <div class="grade">
          ${dinheiro('Embalagem (R$)', 'fabricacao.embalagem', f.embalagem)}
          ${dinheiro('Frete de insumos (R$)', 'fabricacao.freteInsumos', f.freteInsumos)}
          ${dinheiro('Outros custos (R$)', 'fabricacao.outros', f.outros)}
        </div>
      </div>`;
  }
  const opcoes = dados.produtos.filter((p) => p.tipoCusto !== 'kit' && p.id !== rasc.id).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  if (!opcoes.length) return '<p class="dica">Cadastre antes os produtos que entram no kit. Depois volte aqui para montar o kit.</p>';
  const mapa = porId();
  return `
    <div class="linhas">
      ${rasc.kit.length ? '' : '<p class="dica">Adicione produtos ao kit usando o seletor abaixo</p>'}
      ${rasc.kit.map((item, i) => `
        <div class="linha-item kit">
          <label class="campo"><span>Produto</span>
            <select data-c="kit.${i}.produtoId">
              <option value="">Selecionar produto...</option>
              ${opcoes.map((p) => `<option value="${p.id}" ${p.id === item.produtoId ? 'selected' : ''}>${esc(p.nome)}${p.sku ? ` (${esc(p.sku)})` : ''}</option>`).join('')}
              ${item.produtoId && !mapa.has(item.produtoId) ? '<option value="" selected>(produto excluído)</option>' : ''}
            </select>
          </label>
          <label class="campo"><span>Qtd</span><input type="text" inputmode="decimal" data-c="kit.${i}.quantidade" data-num value="${campo(item.quantidade)}"></label>
          <div class="subtotal" id="sub-kit-${i}"></div>
          <button type="button" class="botao pequeno discreto" data-acao="remover" data-lista="kit" data-i="${i}" aria-label="Tirar do kit">${icone('x')}</button>
        </div>`).join('')}
      <div><button type="button" class="botao pequeno contorno" data-acao="adicionar" data-lista="kit">${icone('plus')} Adicionar Produto ao Kit</button></div>
    </div>`;
}

const n = (v) => Number(v) || 0;

function atualizarTotais() {
  const j = janela();
  $('#total-custo', j).textContent = reais(custoDoProduto(rasc));
  if (rasc.tipoCusto === 'fabricacao') {
    const f = rasc.fabricacao;
    f.materiais.forEach((m, i) => ($(`#sub-m-${i}`, j).textContent = reais(n(m.precoUnitario) * n(m.quantidade))));
    $('#sub-mp', j).textContent = `Subtotal MP: ${reais(f.materiais.reduce((s, m) => s + n(m.precoUnitario) * n(m.quantidade), 0))}`;
    $('#sub-mdo', j).textContent = `Subtotal MDO: ${reais(f.maoDeObra.reduce((s, m) => s + n(m.valor), 0))}`;
  }
  if (rasc.tipoCusto === 'kit') {
    const mapa = porId();
    rasc.kit.forEach((item, i) => {
      const alvo = $(`#sub-kit-${i}`, j);
      const p = mapa.get(item.produtoId);
      if (alvo) alvo.textContent = p ? reais(custoDoProduto(p, mapa) * n(item.quantidade)) : '';
    });
  }
  const peso = pesoDoProduto(rasc);
  const pelaCaixa = peso > n(rasc.pesoG);
  $('#peso-frete', j).innerHTML = pelaCaixa ? `Peso usado no frete: <strong>${gramas(peso)}</strong> (pelo tamanho da caixa, que conta mais que o peso real)` : `Peso usado no frete: <strong>${gramas(peso)}</strong>`;
}

function definir(caminho, valor) {
  const partes = caminho.split('.');
  let alvo = rasc;
  partes.slice(0, -1).forEach((p) => (alvo = alvo[p]));
  alvo[partes.at(-1)] = valor;
}

function aoDigitar(e) {
  const el = e.target;
  if (el.id === 'peso-real') {
    rasc.pesoG = lerNumero(el.value) * (unidadePeso === 'kg' ? 1000 : 1);
    return atualizarTotais();
  }
  if (!el.dataset.c) return;
  definir(el.dataset.c, el.hasAttribute('data-num') ? lerNumero(el.value) : el.value);
  atualizarTotais();
}

function aoTrocar(e) {
  if (e.target.id === 'foto-arquivo') return adicionarFotos([...e.target.files]);
  if (e.target.name === 'unidadePeso') {
    unidadePeso = e.target.value;
    return desenharJanela();
  }
  if (e.target.name === 'tipoProduto') {
    rasc.tipoCusto = e.target.value === 'kit' ? 'kit' : rasc.ultimoIndividual;
    return desenharJanela();
  }
  if (e.target.name === 'tipoCusto') {
    rasc.tipoCusto = rasc.ultimoIndividual = e.target.value;
    $('#bloco-custo', janela()).innerHTML = blocoCusto();
    atualizarTotais();
  }
}

const LINHA_NOVA = {
  'fabricacao.materiais': () => ({ descricao: '', precoUnitario: 0, quantidade: 0 }),
  'fabricacao.maoDeObra': () => ({ descricao: '', valor: 0 }),
  kit: () => ({ produtoId: '', quantidade: 1 }),
};

const lista = (caminho) => caminho.split('.').reduce((o, p) => o[p], rasc);

function aoClicar(e) {
  const botao = e.target.closest('[data-acao]');
  if (!botao) return;
  const acao = botao.dataset.acao;
  if (acao === 'cancelar') return janela().close();
  if (acao === 'excluir') return excluir(botao);
  if (acao === 'foto-escolher') return $('#foto-arquivo', janela()).click();
  if (acao === 'foto-url') {
    const url = $('#foto-url', janela()).value.trim();
    return url && adicionarFotos([url]);
  }
  if (acao === 'tirar-foto') {
    rasc.fotos.splice(Number(botao.dataset.i), 1);
    return ($('#bloco-fotos', janela()).innerHTML = blocoFotos());
  }
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
  apagar(rasc.id);
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
  const { ultimoIndividual, ...limpo } = rasc;
  const produto = { ...structuredClone(limpo), atualizadoEm: new Date().toISOString() };
  const antes = dados.produtos;
  if (produto.id) dados.produtos = dados.produtos.map((p) => (p.id === produto.id ? produto : p));
  else dados.produtos = [...dados.produtos, { ...produto, id: novoId() }];
  if (!salvar()) {
    dados.produtos = antes;
    salvar();
    return mostrarErro('O espaço do navegador acabou (as fotos ocupam mais). Tire uma foto ou exporte os dados e apague produtos antigos.');
  }
  janela().close();
}
