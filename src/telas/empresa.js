// Empresa: selo da empresa em uso no canto superior direito de todas as telas (abre o menu com todas as empresas, para trocar,
// e "+ Nova empresa"), cartão Empresa na tela Equipe (nova empresa; editar nome e foto), imposto da empresa em Taxas dos Canais (vale para todo canal
// sem imposto próprio; quem aplica é canais() do dados.js) e "Clonar de outra empresa" em Meus Produtos (com prévia).
import { minhasEmpresas, empresaAtual, trocarEmpresa, previaCopia, copiarProdutos, criarEmpresa, renomearEmpresa, trocarFotoEmpresa, tirarFotoEmpresa } from '../nuvem.js';
import { dados, salvar, carregar, aoMudar } from '../dados.js';
import { lerNumero, campo, esc } from '../formato.js';
import { icone } from '../icones.js';
import { capa } from '../fotos.js';
import { imgMascote, htmlCarregando } from './mascote.js';
import { iniciarEquipe } from './equipe.js';
import { iniciarHistorico } from './historico.js';
import { iniciarAviso } from './aviso.js';

const $ = (s) => document.querySelector(s);
let empresas = [];

// Chamado pelo app.js depois do login e dos dados carregados. Uma parte que falhar não derruba as outras.
export async function iniciarNuvemTelas() {
  document.querySelectorAll('[data-nuvem]').forEach((el) => (el.hidden = false));
  for (const [nome, fn] of [['aviso', iniciarAviso], ['empresa', iniciarEmpresa], ['equipe', iniciarEquipe], ['histórico', iniciarHistorico]]) {
    try {
      await fn();
    } catch (erro) {
      console.error(nome, erro);
    }
  }
}

const PAPEL = { dono: 'Admin', membro: 'Membro' };
// Avatar da empresa (Eduardo 13/11): iniciais das 2 primeiras palavras ("Conceito Metais" -> CM); cor pela posição na lista (lima, grafite claro, roxo suave)
const iniciais = (nome) => (String(nome).trim().split(/\s+/).slice(0, 2).map((p) => p[0] ?? '').join('') || '?').toUpperCase();
// Com foto (logo, correção 09), a foto no lugar das iniciais.
const avatar = (x, i) => (x.foto
  ? `<span class="avatar-empresa com-foto" aria-hidden="true"><img src="${esc(x.foto)}" alt=""></span>`
  : `<span class="avatar-empresa cor-${i % 3}" aria-hidden="true">${esc(iniciais(x.nome))}</span>`);
const CHAVE_AVISO = 'calculadora-margem.agora-em'; // nome da empresa, para o aviso depois de recarregar
const atualE = () => empresas.find((e) => e.id === empresaAtual()) ?? { nome: '', papel: '' };
const lembrarAviso = (nome) => {
  try {
    if (nome) sessionStorage.setItem(CHAVE_AVISO, nome);
    else sessionStorage.removeItem(CHAVE_AVISO);
  } catch {
    // sem armazenamento: troca sem o aviso
  }
};

// Troca de empresa: guarda o nome para o aviso "Agora você está em" e recarrega (trocarEmpresa).
function trocar(id) {
  if (id === empresaAtual()) return;
  lembrarAviso(empresas.find((e) => e.id === id)?.nome);
  trocarEmpresa(id);
}

function avisarTroca() {
  let nome = null;
  try {
    nome = sessionStorage.getItem(CHAVE_AVISO);
  } catch {
    return;
  }
  lembrarAviso(null);
  if (!nome) return;
  const a = $('#aviso-geral'); // role="status": o leitor de tela anuncia
  a.textContent = `Agora você está em ${nome}.`;
  a.classList.add('ok');
  a.dataset.mascote = 'trocar-empresa';
  a.hidden = false;
}

// Selo (topo direito) com o menu das empresas e o cartão Empresa: redesenhados juntos (também depois de editar).
// Menu no padrão ARIA (menu + menuitemradio): setas, Home/End, Enter/Espaço escolhem, Esc fecha e volta ao selo.
function desenharEmpresas() {
  const e = atualE();
  const papel = PAPEL[e.papel] ?? esc(e.papel);
  const item = (x, i) => `
    <li role="none"><button type="button" role="menuitemradio" tabindex="-1" aria-checked="${x.id === e.id}" data-empresa="${esc(x.id)}">
      ${avatar(x, i)}<span class="selo-nome">${esc(x.nome)}</span><span class="selo-papel">${PAPEL[x.papel] ?? esc(x.papel)}</span><span class="menu-marca" aria-hidden="true">${x.id === e.id ? icone('check') : ''}</span>
    </button></li>`;
  $('#barra-empresa').innerHTML = `
    <div class="selo-caixa">
      <button type="button" class="selo-empresa" id="selo-empresa" aria-haspopup="menu" aria-expanded="false" aria-controls="menu-empresas" aria-label="Empresa em uso: ${esc(e.nome)}, ${papel}. Abrir a lista de empresas">
        ${avatar(e, Math.max(0, empresas.indexOf(e)))}<span class="selo-nome">${esc(e.nome)}</span><span class="selo-papel">${papel}</span><span class="selo-seta" aria-hidden="true">${icone('chevron-down')}</span>
      </button>
      <ul class="menu-empresas" id="menu-empresas" role="menu" aria-label="Suas empresas" hidden>
        ${empresas.map(item).join('')}
        <li role="separator" class="menu-separador"></li>
        <li role="none"><a role="menuitem" tabindex="-1" href="#equipe" class="menu-nova">${icone('plus')} Nova empresa</a></li>
      </ul>
    </div>`;
  desenharCartaoEmpresa();
}

// Cartão Empresa (Eduardo 13/11): avatar + "Você está em …"; para o admin, "+ Nova empresa" (primário) e "Editar" (janela com foto e nome).
function desenharCartaoEmpresa() {
  const e = atualE();
  const papel = PAPEL[e.papel] ?? esc(e.papel);
  $('#empresa-cartao').innerHTML = `
    <h2>Empresa</h2>
    <div class="cartao-topo">
      <p class="empresa-quem">${avatar(e, Math.max(0, empresas.indexOf(e)))}<span>Você está em <strong>${esc(e.nome)}</strong> (${papel}).</span></p>
      ${e.papel === 'dono' ? `<div class="acoes-planilha">
        <button type="button" class="botao principal" data-acao="nova-empresa">${icone('plus')} Nova empresa</button>
        <button type="button" class="botao" data-acao="editar-empresa">${icone('pencil')} Editar</button>
      </div>` : ''}
    </div>
    <p class="dica" id="empresa-estado" role="status"></p>`;
}

function estadoEmpresa(t, erro = false) {
  $('#empresa-estado').textContent = t;
  $('#empresa-estado').classList.toggle('erro', erro);
}

// Janela "Nova empresa" (mesmo padrão da janela de Clonar).
function janelaNovaEmpresa() {
  const j = $('#janela-empresa');
  j.setAttribute('aria-labelledby', 'titulo-nova-empresa');
  j.onchange = null;
  j.innerHTML = `
    <form method="dialog" novalidate>
      <div class="janela-topo">
        <h3 id="titulo-nova-empresa">Nova empresa</h3>
        <button type="button" class="fechar" data-acao="fechar" aria-label="Fechar">${icone('x')}</button>
      </div>
      <div class="janela-corpo">
        <label class="campo"><span>Nome</span><input type="text" class="campo-texto" name="nome" maxlength="80" required autocomplete="off"></label>
        <p class="dica">Você vira admin da nova empresa e passa a usá-la. Os produtos não vão junto: depois use "Clonar de outra empresa".</p>
        <p class="erro" role="alert" hidden></p>
      </div>
      <div class="janela-base"><div class="direita">
        <button type="button" class="botao" data-acao="fechar">Cancelar</button>
        <button type="submit" class="botao principal">Criar</button>
      </div></div>
    </form>`;
  j.onclick = (ev) => ev.target.closest('[data-acao=fechar]') && j.close();
  j.onsubmit = async (ev) => {
    ev.preventDefault();
    const nome = j.querySelector('[name=nome]').value.trim();
    const erro = j.querySelector('.erro');
    try {
      lembrarAviso(nome);
      await criarEmpresa(nome); // cria, troca para ela e recarrega
    } catch (e) {
      lembrarAviso(null);
      erro.textContent = e.message;
      erro.hidden = false;
      j.querySelector('[name=nome]').focus();
    }
  };
  j.showModal();
  j.querySelector('[name=nome]').focus();
}

// Foto (logo) da empresa: png, jpg ou webp até 2 MB; vira um quadrado de 256 px em WebP com o logo inteiro (sem cortar).
const TIPOS_FOTO = ['image/png', 'image/jpeg', 'image/webp'];
async function fotoQuadrada(arquivo) {
  const img = await createImageBitmap(arquivo);
  const escala = 256 / Math.max(img.width, img.height);
  const [l, a] = [img.width * escala, img.height * escala];
  const tela = Object.assign(document.createElement('canvas'), { width: 256, height: 256 });
  tela.getContext('2d').drawImage(img, (256 - l) / 2, (256 - a) / 2, l, a);
  return tela.toDataURL('image/webp', 0.85);
}

// Janela "Editar empresa" (só o admin): foto e nome. Trocar ou remover a foto só vale ao clicar em Salvar.
function janelaEditarEmpresa() {
  const e = atualE();
  const j = $('#janela-empresa');
  let foto = e.foto ?? null; // o que fica ao salvar: o endereço atual, uma imagem nova (data URL) ou null (iniciais)
  j.setAttribute('aria-labelledby', 'titulo-editar-empresa');
  j.innerHTML = `
    <form method="dialog" novalidate>
      <div class="janela-topo">
        <h3 id="titulo-editar-empresa">Editar empresa</h3>
        <button type="button" class="fechar" data-acao="fechar" aria-label="Fechar">${icone('x')}</button>
      </div>
      <div class="janela-corpo">
        <div class="editar-foto"></div>
        <label class="campo"><span>Nome da empresa</span><input type="text" class="campo-texto" name="nome" value="${esc(e.nome)}" maxlength="80" required autocomplete="off"></label>
        <p class="erro" role="alert" hidden></p>
      </div>
      <div class="janela-base"><div class="direita">
        <button type="button" class="botao" data-acao="fechar">Cancelar</button>
        <button type="submit" class="botao principal">Salvar</button>
      </div></div>
    </form>`;
  const erro = (t) => {
    j.querySelector('.erro').textContent = t;
    j.querySelector('.erro').hidden = !t;
  };
  const desenharFoto = () => {
    j.querySelector('.editar-foto').innerHTML = `
      ${avatar({ ...e, foto }, Math.max(0, empresas.indexOf(e)))}
      <div class="acoes-planilha">
        <button type="button" class="botao" data-acao="trocar-foto">${icone('image')} Trocar foto</button>
        ${foto ? `<button type="button" class="botao perigo" data-acao="remover-foto" aria-label="Remover foto" title="Remover foto">${icone('trash-2')}</button>` : ''}
        <input type="file" name="foto" accept="image/png,image/jpeg,image/webp" hidden>
      </div>
      <p class="dica">PNG, JPG ou WebP até 2 MB. Sem foto, aparecem as iniciais.</p>`;
  };
  desenharFoto();
  j.onclick = (ev) => {
    const acao = ev.target.closest('[data-acao]')?.dataset.acao;
    if (acao === 'fechar') j.close();
    if (acao === 'trocar-foto') j.querySelector('[name=foto]').click();
    if (acao === 'remover-foto') {
      foto = null;
      desenharFoto();
      j.querySelector('[data-acao=trocar-foto]').focus();
    }
  };
  j.onchange = async (ev) => {
    const arquivo = ev.target.name === 'foto' && ev.target.files[0];
    if (!arquivo) return;
    ev.target.value = ''; // escolher o mesmo arquivo de novo também conta
    if (!TIPOS_FOTO.includes(arquivo.type)) return erro('Use uma imagem PNG, JPG ou WebP.');
    if (arquivo.size > 2 * 1024 * 1024) return erro('A imagem passa de 2 MB. Escolha uma menor.');
    try {
      foto = await fotoQuadrada(arquivo);
    } catch {
      return erro('Não deu para abrir essa imagem. Tente outro arquivo.');
    }
    erro('');
    desenharFoto();
    j.querySelector('[data-acao=trocar-foto]').focus();
  };
  j.onsubmit = async (ev) => {
    ev.preventDefault();
    const nome = j.querySelector('[name=nome]').value.trim();
    const salvar = j.querySelector('[type=submit]');
    salvar.disabled = true;
    try {
      if (nome !== e.nome) {
        await renomearEmpresa(nome);
        e.nome = nome;
        empresas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
      }
      if (foto !== (e.foto ?? null)) e.foto = foto ? await trocarFotoEmpresa(foto) : (await tirarFotoEmpresa(), null);
      j.close();
      desenharEmpresas();
      estadoEmpresa('Pronto: empresa salva.');
      $('#empresa-cartao [data-acao=editar-empresa]').focus();
    } catch (x) {
      erro(x.message);
      salvar.disabled = false;
    }
  };
  j.showModal();
  j.querySelector('[name=nome]').focus();
}

function aoClicarEmpresa(ev) {
  const acao = ev.target.closest('[data-acao]')?.dataset.acao;
  if (acao === 'nova-empresa') janelaNovaEmpresa();
  if (acao === 'editar-empresa') janelaEditarEmpresa();
}

function ligarSelo() {
  const barra = $('#barra-empresa');
  const itens = () => [...barra.querySelectorAll('[role=menuitemradio], [role=menuitem]')];
  const aberto = () => $('#selo-empresa')?.getAttribute('aria-expanded') === 'true';
  const abrir = (qual = 'ativa') => {
    $('#selo-empresa').setAttribute('aria-expanded', 'true');
    $('#menu-empresas').hidden = false;
    const l = itens();
    (qual === 'ultima' ? l.at(-1) : l.find((i) => i.getAttribute('aria-checked') === 'true') ?? l[0]).focus();
  };
  const fechar = (foco) => {
    if (!aberto()) return;
    $('#selo-empresa').setAttribute('aria-expanded', 'false');
    $('#menu-empresas').hidden = true;
    if (foco) $('#selo-empresa').focus();
  };
  const escolher = (el) => {
    if (el.dataset.empresa) {
      fechar(true);
      return trocar(el.dataset.empresa); // a ativa não faz nada; outra troca na hora (com o aviso)
    }
    fechar(false); // + Nova empresa: a mesma janela do cartão Empresa
    janelaNovaEmpresa();
  };
  barra.addEventListener('click', (ev) => {
    if (ev.target.closest('#selo-empresa')) return aberto() ? fechar(true) : abrir();
    const el = ev.target.closest('[role=menuitemradio], [role=menuitem]');
    if (el) {
      ev.preventDefault();
      escolher(el);
    }
  });
  barra.addEventListener('keydown', (ev) => {
    const noSelo = ev.target.id === 'selo-empresa';
    if (noSelo && (ev.key === 'ArrowDown' || ev.key === 'ArrowUp')) {
      ev.preventDefault();
      return abrir(ev.key === 'ArrowUp' ? 'ultima' : 'ativa');
    }
    if (!aberto() || noSelo) return ev.key === 'Escape' && fechar(true);
    const l = itens();
    const i = l.indexOf(document.activeElement);
    const ir = (n) => l[(n + l.length) % l.length].focus();
    if (ev.key === 'ArrowDown') ir(i + 1);
    else if (ev.key === 'ArrowUp') ir(i - 1);
    else if (ev.key === 'Home') ir(0);
    else if (ev.key === 'End') ir(l.length - 1);
    else if (ev.key === 'Enter' || ev.key === ' ') escolher(l[i]);
    else if (ev.key === 'Escape') fechar(true);
    else if (ev.key === 'Tab') return fechar(false);
    else return;
    ev.preventDefault();
  });
  document.addEventListener('click', (ev) => !ev.target.closest('#barra-empresa') && fechar(false));
  $('#empresa-cartao').addEventListener('click', aoClicarEmpresa);
}

export async function iniciarEmpresa() {
  empresas = await minhasEmpresas();
  const atual = empresaAtual();
  desenharEmpresas();
  ligarSelo();
  avisarTroca();
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

// ---------- clonar produtos de outra empresa ----------
// A pessoa escolhe o que clonar: lista da origem com caixinha em cada produto (todos marcados de início).

const SITUACAO = { novo: ['Novo', 'novo'], atualizado: ['Atualiza', 'atualiza'], repetido: ['SKU repetido', 'repetido'] };
let previa = [];

function janelaCopiar(outras) {
  const j = $('#janela-copiar');
  j.innerHTML = `
    <div class="janela-topo">
      <h3 id="titulo-copiar">Clonar produtos de outra empresa</h3>
      <button type="button" class="fechar" data-acao="fechar" aria-label="Fechar">${icone('x')}</button>
    </div>
    <div class="janela-corpo">
      <label class="campo"><span>Copiar de</span>
        <select id="copiar-origem" class="campo-texto">${outras.map((e) => `<option value="${esc(e.id)}">${esc(e.nome)}</option>`).join('')}</select>
      </label>
      <div class="intro-mascote">${imgMascote('copiar', 72)}<p class="dica">Produto com o mesmo SKU é atualizado; os outros entram como novos. Preços, taxas e kits não são copiados.</p></div>
      <div id="copiar-previa" role="status"></div>
    </div>
    <div class="janela-base"><div class="direita">
      <button type="button" class="botao" data-acao="fechar">Cancelar</button>
      <button type="button" class="botao principal" data-acao="copiar" hidden>Clonar</button>
    </div></div>`;
  j.onclick = (e) => {
    const acao = e.target.closest('[data-acao]')?.dataset.acao;
    if (acao === 'fechar') j.close();
    if (acao === 'copiar') copiar();
  };
  j.onchange = (e) => {
    if (e.target.id === 'copiar-origem') return mostrarPrevia();
    if (e.target.id === 'copiar-todos') j.querySelectorAll('[data-clonar]').forEach((c) => (c.checked = e.target.checked));
    contarEscolhidos();
  };
  j.showModal();
  $('#copiar-origem').focus();
  mostrarPrevia();
}

const escolhidos = () => [...$('#janela-copiar').querySelectorAll('[data-clonar]:checked')].map((c) => c.value);

function contarEscolhidos() {
  const n = escolhidos().length;
  const todos = $('#copiar-todos');
  if (todos) {
    todos.checked = n === previa.length;
    todos.indeterminate = n > 0 && n < previa.length;
  }
  const botao = $('[data-acao=copiar]');
  botao.textContent = `Clonar ${n} selecionado(s)`;
  botao.disabled = !n;
}

async function mostrarPrevia() {
  const caixa = $('#copiar-previa');
  const botao = $('[data-acao=copiar]');
  botao.hidden = true;
  caixa.innerHTML = htmlCarregando('Conferindo os produtos…');
  try {
    const p = await previaCopia($('#copiar-origem').value);
    previa = p.itens;
    if (!previa.length) {
      caixa.innerHTML = '<p>Essa empresa não tem produtos para clonar (kits ficam de fora).</p>';
      return;
    }
    const linha = (x) => {
      const [rotulo, classe] = SITUACAO[x.situacao] ?? SITUACAO.novo;
      return `<li><label class="item-clonar"><input type="checkbox" data-clonar value="${esc(x.id)}" checked>
        <span class="miniatura mini">${capa({ fotos: x.foto ? [x.foto] : [] })}</span>
        <span class="item-clonar-nome">${esc(x.nome)}${x.sku ? ` <small class="dica">${esc(x.sku)}</small>` : ''}</span>
        <span class="etiqueta ${classe}">${rotulo}</span></label></li>`;
    };
    caixa.innerHTML = `
      <p><strong>${p.novos.length}</strong> novo(s) · <strong>${p.atualizados.length}</strong> atualiza(m) pelo SKU${p.repetidos.length ? ` · <strong>${p.repetidos.length}</strong> com SKU repetido` : ''}</p>
      ${p.repetidos.length ? '<p class="dica aviso-repetido">SKU repetido, revise antes: entram como produtos novos, sem mudar os que já existem.</p>' : ''}
      <label class="item-clonar todos"><input type="checkbox" id="copiar-todos" checked> <strong>Selecionar todos</strong></label>
      <ul class="lista-clonar">${previa.map(linha).join('')}</ul>`;
    botao.hidden = false;
    contarEscolhidos();
  } catch (erro) {
    caixa.innerHTML = `<p class="erro">${esc(erro.message)}</p>`;
  }
}

async function copiar() {
  const botao = $('[data-acao=copiar]');
  const ids = escolhidos();
  if (!ids.length) return;
  botao.disabled = true;
  try {
    const r = await copiarProdutos($('#copiar-origem').value, ids.length === previa.length ? null : ids);
    await carregar(); // traz da nuvem o que entrou
    salvar(); // nada a enviar (a nuvem acabou de ser lida); só redesenha as telas
    $('#janela-copiar').close();
    const aviso = $('#aviso-geral');
    aviso.textContent = `Produtos clonados: ${r.novos} novo(s), ${r.atualizados} atualizado(s).`;
    aviso.classList.add('ok');
    aviso.dataset.mascote = 'salvo';
    aviso.hidden = false;
  } catch (erro) {
    $('#copiar-previa').insertAdjacentHTML('afterbegin', `<p class="erro">${esc(erro.message)}</p>`);
    botao.disabled = false;
  }
}
