// Tela Plataforma (endereço /plataforma): só para os donos da plataforma (hoje, o Eduardo). Lista TODAS as empresas com metadados
// e uso (nunca produtos, preços ou margens), pessoas e convites de cada uma, suspender/reativar, limite de buscas, criar empresa
// e o registro (auditoria). Quem barra é o banco (correcao-17: cada função plataforma_* começa com sou_admin_plataforma(), que
// exige o login com código, aal2); aqui, sem acesso, nem o item do menu nem a tela existem na página.
import {
  acessoPlataforma, minhasEmpresas, gerarLink, fatorDoAutenticador, confirmarCodigo, plataformaEmpresas, plataformaPessoas, plataformaCriarEmpresa, plataformaConvidar,
  plataformaCancelarConvite, plataformaRemoverPessoa, plataformaSuspender, plataformaLimiteBuscas, plataformaRegistro, plataformaExcluirEmpresa,
} from '../nuvem.js';
import { esc } from '../formato.js';
import { icone } from '../icones.js';
import { telaAtual } from '../rotas.js';
import { mostrarErro } from './erro.js';
import { htmlVazio, htmlCarregando, imgMascote } from './mascote.js';
import { mostrarAviso } from './aviso.js';
import { PAPEL, lembrarPapel } from './equipe.js';
import { abrirLink } from './link.js';

const $ = (s) => document.querySelector(s);
const dia = (iso) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '');
const quando = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
const sem = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); // busca sem acento
const buscas = (e) => (e.limite == null ? `${e.buscasMes} (sem limite)` : `${e.buscasMes} de ${e.limite}`);
// Nome provisório da empresa nova (Eduardo 17/11): adjetivo + substantivo em inglês, com a mesma letra, minúsculo e junto
// ('bodaciousbluff'). Não quer dizer nada, então ninguém confunde com uma empresa de verdade; a pessoa troca depois em Empresa.
// Palavras fáceis, revisadas: nada ofensivo, de duplo sentido nem marca conhecida.
export const NOMES = {
  b: [['bold', 'brave', 'breezy', 'bright', 'bubbly', 'bouncy'], ['bay', 'brook', 'bluff', 'breeze', 'blossom', 'beacon']],
  c: [['calm', 'clever', 'cozy', 'crisp', 'cheerful', 'curious'], ['canyon', 'cedar', 'comet', 'cove', 'creek', 'cloud']],
  g: [['gentle', 'glad', 'golden', 'grand', 'graceful', 'gleaming'], ['garden', 'glade', 'grove', 'glacier', 'gull', 'gate']],
  j: [['jolly', 'jazzy', 'joyful', 'jaunty', 'jubilant', 'jovial'], ['juniper', 'jasmine', 'jungle', 'jetty', 'journey', 'jewel']],
  m: [['mellow', 'merry', 'mighty', 'misty', 'modest', 'mild'], ['meadow', 'maple', 'marble', 'moon', 'mesa', 'marsh']],
  q: [['quiet', 'quick', 'quaint', 'quirky', 'quizzical'], ['quartz', 'quail', 'quarry', 'quill', 'quilt', 'quest']],
  s: [['sunny', 'swift', 'serene', 'snug', 'sparkly', 'steady'], ['summit', 'spruce', 'stream', 'sparrow', 'shore', 'star']],
  w: [['warm', 'witty', 'wise', 'wavy', 'whimsical', 'wholesome'], ['willow', 'wave', 'wren', 'walnut', 'woods', 'whale']],
};
const sorteia = (lista) => lista[Math.floor(Math.random() * lista.length)];
export const nomeAleatorio = () => {
  const [adjetivos, substantivos] = NOMES[sorteia(Object.keys(NOMES))];
  return sorteia(adjetivos) + sorteia(substantivos);
};
let empresas = [];
let fator = null; // { id, qr?, chave? } da etapa do código: guardado entre visitas, para o QR já lido continuar valendo
let pedindoFator = null; // um pedido por vez (duas aberturas seguidas não cadastram 2 fatores)

export async function iniciarPlataforma() {
  const acesso = await acessoPlataforma();
  if (acesso === 'nao' || acesso === 'erro') { // sem a lista (ou sem resposta do banco): nada da plataforma na página
    if (telaAtual() === 'plataforma') history.replaceState(null, '', '/inicio'); // o Início, como endereço que não existe
    return;
  }
  $('.menu [data-aba="historico"]').insertAdjacentHTML('afterend', `<a href="/plataforma" class="aba" data-aba="plataforma">${icone('layout-grid')}Plataforma</a>`);
  $('#tela-novidades').insertAdjacentHTML('beforebegin', `
    <section id="tela-plataforma" class="tela" aria-labelledby="titulo-plataforma" hidden>
      <header class="titulo-tela">
        <h1 id="titulo-plataforma">Plataforma</h1>
        <p>Todas as empresas do Calculéo. Só os donos da plataforma veem esta tela.</p>
      </header>
      <p id="plataforma-estado" class="dica" role="status" tabindex="-1"></p>
      <div id="plataforma-corpo"></div>
    </section>`);
  const tela = $('#tela-plataforma');
  tela.addEventListener('click', aoClicar);
  tela.addEventListener('submit', aoEnviar);
  tela.addEventListener('input', (ev) => ev.target.id === 'plataforma-busca' && filtrar());
  tela.addEventListener('toggle', (ev) => ev.target.matches?.('details.plat-empresa') && ev.target.open && desenharPessoas(ev.target.dataset.empresa), true);
  // clicar fora ou Esc desfaz o "Confirmar ..." armado (remover, suspender), como na tela Empresa
  document.addEventListener('click', (ev) => !ev.composedPath().some((n) => n.hasAttribute?.('data-armavel')) && desarmar());
  document.addEventListener('keydown', (ev) => ev.key === 'Escape' && telaAtual() === 'plataforma' && desarmar());
  window.addEventListener('tela', () => telaAtual() === 'plataforma' && desenhar());
  window.dispatchEvent(new Event('tela')); // se a página abriu em /plataforma, a tela aparece agora
}

function estado(texto, erro = false) {
  const el = $('#plataforma-estado');
  el.textContent = texto;
  el.classList.toggle('erro', erro);
}

async function desenhar() {
  const corpo = $('#plataforma-corpo');
  estado('');
  corpo.innerHTML = htmlCarregando('Conferindo o seu acesso…');
  const acesso = await acessoPlataforma();
  if (acesso === 'erro') return mostrarErro(corpo, 'Não deu para falar com o banco.', () => desenhar(), 'Não deu para abrir a Plataforma');
  if (acesso === 'precisa_mfa') return desenharCodigo();
  if (acesso !== 'sim') {
    corpo.innerHTML = htmlVazio('erro', 'Sem acesso à Plataforma.', 'Entre de novo no Calculéo. Se continuar, a sua conta não está na lista dos donos da plataforma.');
    return;
  }
  return desenharPainel();
}

// ---------- 2 etapas: o código do Google Authenticator ----------

async function desenharCodigo() {
  const corpo = $('#plataforma-corpo');
  try {
    pedindoFator ??= fatorDoAutenticador(fator).finally(() => (pedindoFator = null));
    fator = await pedindoFator;
  } catch (erro) {
    mostrarErro(corpo, erro.message, () => desenhar(), 'Não deu para abrir a confirmação');
    return;
  }
  const passos = fator.qr
    ? `<ol class="plat-passos">
        <li>No celular, abra o <strong>Google Authenticator</strong> (ou outro app de código, como o Microsoft Authenticator).</li>
        <li>Toque em <strong>+</strong> e escolha <strong>Ler código QR</strong>. Aponte para o quadrado abaixo.</li>
        <li>Digite aqui os 6 números que aparecem em "Calculéo".</li>
      </ol>
      <figure class="plat-qr"><img src="${esc(fator.qr)}" alt="Código QR para cadastrar o Calculéo no app de autenticação" width="180" height="180">
        <figcaption class="dica">Não consegue ler? No app, escolha <strong>Inserir chave</strong> e digite: <code>${esc(fator.chave)}</code></figcaption></figure>`
    : '<p>Abra o <strong>Google Authenticator</strong> no celular e digite os 6 números que aparecem em "Calculéo".</p>';
  corpo.innerHTML = `
    <div class="cartao plat-codigo">
      ${imgMascote('equipe', 96)}
      <div>
        <h2>${fator.qr ? 'Proteja a Plataforma com o seu celular' : 'Confirme que é você'}</h2>
        <p class="dica">A Plataforma mexe em todas as empresas. Por isso, além da senha, ela pede um código que muda a cada 30 segundos.</p>
        ${passos}
        <form class="plat-codigo-form" data-form="codigo" novalidate>
          <label class="campo"><span>Código de 6 números</span>
            <input class="campo-texto" name="codigo" inputmode="numeric" autocomplete="one-time-code" maxlength="7" pattern="[0-9 ]*" required placeholder="000000"></label>
          <button type="submit" class="botao principal">Confirmar</button>
        </form>
        <p class="erro" role="alert" hidden></p>
      </div>
    </div>`;
  corpo.querySelector('[name=codigo]').focus();
}

async function enviarCodigo(form) {
  const erro = form.parentElement.querySelector('.erro');
  const botao = form.querySelector('[type=submit]');
  botao.disabled = true;
  try {
    await confirmarCodigo(fator.id, form.codigo.value);
    fator = null;
    await desenhar();
    mostrarAviso('Pronto: a Plataforma está aberta.');
  } catch (x) {
    erro.textContent = x.message;
    erro.hidden = false;
    botao.disabled = false;
    form.codigo.select();
  }
}

// ---------- painel: empresas ----------

async function desenharPainel() {
  const corpo = $('#plataforma-corpo');
  if (!corpo.querySelector('.plat-painel')) corpo.innerHTML = htmlCarregando('Chamando todas as empresas…');
  let registro;
  try {
    [empresas, registro] = await Promise.all([plataformaEmpresas(), plataformaRegistro(100)]);
  } catch (erro) {
    mostrarErro(corpo, erro.message, () => desenhar(), 'Não deu para carregar a Plataforma');
    return;
  }
  const busca = $('#plataforma-busca')?.value ?? '';
  const abertas = new Set([...corpo.querySelectorAll('details.plat-empresa[open]')].map((d) => d.dataset.empresa));
  const suspensas = empresas.filter((e) => e.suspensa).length;
  corpo.innerHTML = `
    <div class="plat-painel">
      <div class="cartao">
        <div class="cartao-topo">
          <h2>Empresas <span class="dica">· ${empresas.length}${suspensas ? ` · ${suspensas} suspensa(s)` : ''}</span></h2>
          <button type="button" class="botao principal" data-acao="criar">${icone('plus')} Criar empresa</button>
        </div>
        <label class="campo plat-busca"><span>Buscar empresa</span><input type="search" id="plataforma-busca" class="campo-texto" placeholder="Nome ou código da empresa" autocomplete="off" value="${esc(busca)}"></label>
        <ul class="plat-empresas">${empresas.map((e) => linhaEmpresa(e, abertas.has(e.id))).join('')}</ul>
        <p class="dica plat-nenhuma" hidden>Nenhuma empresa com esse nome ou código.</p>
        ${empresas.length ? '' : htmlVazio('equipe', 'Nenhuma empresa ainda.', 'Crie a primeira em "Criar empresa".')}
      </div>
      <div class="cartao">
        <div class="cartao-topo"><h2>Registro</h2><span class="dica">${registro.length ? `${registro.length} ação(ões)${registro.length >= 100 ? ', as 100 mais recentes' : ''}` : ''}</span></div>
        ${registro.length
          ? `<ol class="lista-historico">${registro.map((l) => `
              <li><time datetime="${esc(l.quando)}">${quando(l.quando)}</time>
                <span><strong>${esc(l.acao)}</strong>${l.detalhe ? `: ${esc(l.detalhe)}` : ''}</span>
                <small class="dica">${esc(l.email)}</small></li>`).join('')}</ol>`
          : htmlVazio('historico', 'Nada registrado ainda.', 'Cada ação feita aqui (criar, convidar, suspender…) fica anotada.')}
      </div>
    </div>`;
  filtrar();
  abertas.forEach((id) => empresas.some((e) => e.id === id) && desenharPessoas(id));
}

const metrica = (rotulo, valor) => `<div><dt>${rotulo}</dt><dd>${valor}</dd></div>`;
function linhaEmpresa(e, aberta) {
  const situacao = e.suspensa ? '<span class="pilula perigo">Suspensa</span>' : '<span class="pilula ok">Ativa</span>';
  return `
    <li><details class="plat-empresa${e.suspensa ? ' suspensa' : ''}" data-empresa="${esc(e.id)}" data-nome="${esc(sem(`${e.nome} ${e.codigo}`))}"${aberta ? ' open' : ''}>
      <summary>
        <span class="plat-nome"><strong>${esc(e.nome)}</strong>${e.codigo ? `<code class="plat-cod" title="Código da empresa">${esc(e.codigo)}</code>` : ''}${situacao}</span>
        <small class="dica">${e.pessoas} pessoa(s) · ${e.produtos} produto(s) · buscas no mês: ${buscas(e)} · último acesso: ${e.ultimoAcesso ? dia(e.ultimoAcesso) : 'nunca'}</small>
      </summary>
      <div class="plat-detalhe">
        <dl class="plat-metricas">
          ${e.codigo ? metrica('Código', esc(e.codigo)) : ''}${metrica('Criada em', dia(e.criadaEm))}${metrica('Pessoas', e.pessoas)}${metrica('Convites pendentes', e.convites)}${metrica('Produtos', e.produtos)}
          ${metrica('Último acesso', e.ultimoAcesso ? quando(e.ultimoAcesso) : 'nunca')}${metrica('Buscas no mês', buscas(e))}
        </dl>
        <div class="plat-acoes">
          <form class="plat-limite" data-form="limite" data-empresa="${esc(e.id)}" novalidate>
            <label class="campo"><span>Limite de buscas por mês</span><input type="number" class="campo-texto" name="limite" min="0" step="1" inputmode="numeric" value="${e.limite ?? ''}" placeholder="Sem limite"></label>
            <button type="submit" class="botao pequeno">Salvar limite</button>
          </form>
          <span class="plat-acoes-botoes"><button type="button" class="botao pequeno${e.suspensa ? '' : ' perigo'}" data-armavel data-suspender="${e.suspensa ? 'nao' : 'sim'}" data-empresa="${esc(e.id)}" data-nome="${esc(e.nome)}">${e.suspensa ? 'Reativar empresa' : 'Suspender empresa'}</button>
          ${e.suspensa ? `<button type="button" class="botao pequeno perigo" data-excluir="${esc(e.id)}" data-empresa="${esc(e.id)}">Excluir empresa</button>` : ''}</span>
        </div>
        <div class="plat-pessoas" aria-live="polite"></div>
      </div>
    </details></li>`;
}

function filtrar() {
  const q = sem($('#plataforma-busca')?.value ?? '').trim();
  let vistas = 0;
  document.querySelectorAll('details.plat-empresa').forEach((d) => {
    const ve = !q || d.dataset.nome.includes(q);
    d.parentElement.hidden = !ve;
    vistas += ve;
  });
  const nenhuma = $('#tela-plataforma .plat-nenhuma');
  if (nenhuma) nenhuma.hidden = !(q && empresas.length && !vistas);
}

// ---------- pessoas e convites de uma empresa (ao abrir a linha) ----------

const pessoasDe = new Map(); // última lista de cada empresa aberta: o "Convidar" usa para achar um convite que já existe
const lendo = new Set(); // empresa aberta ao redesenhar: o toggle do <details> e o desenharPainel pediriam as pessoas 2 vezes
async function desenharPessoas(empresaId) {
  const onde = () => document.querySelector(`details.plat-empresa[data-empresa="${CSS.escape(empresaId)}"] .plat-pessoas`);
  let lugar = onde();
  if (!lugar || lendo.has(empresaId)) return;
  if (!lugar.children.length) lugar.innerHTML = htmlCarregando('Chamando as pessoas…');
  let pessoas;
  lendo.add(empresaId);
  try {
    pessoas = await plataformaPessoas(empresaId);
  } catch (erro) {
    if (onde()) mostrarErro(onde(), erro.message, () => desenharPessoas(empresaId), 'Não deu para carregar as pessoas');
    return;
  } finally {
    lendo.delete(empresaId);
  }
  pessoasDe.set(empresaId, pessoas);
  lugar = onde(); // o painel pode ter sido redesenhado enquanto as pessoas chegavam
  if (!lugar) return;
  const membros = pessoas.filter((p) => p.tipo === 'membro');
  const item = (p) => {
    const convite = p.tipo === 'convite';
    const linha2 = convite ? `Convite pendente · ${PAPEL[p.papel] ?? esc(p.papel)} · enviado em ${dia(p.desde)}`
      : `${PAPEL[p.papel] ?? esc(p.papel)} · na empresa desde ${dia(p.desde)} · último acesso: ${p.ultimoAcesso ? quando(p.ultimoAcesso) : 'nunca'}`;
    const acao = convite
      ? `<button type="button" class="botao pequeno" data-novo-link="${esc(p.email)}" data-papel="${esc(p.papel)}" data-empresa="${esc(empresaId)}">Gerar novo link</button>
         <button type="button" class="botao pequeno" data-cancelar="${esc(p.email)}" data-empresa="${esc(empresaId)}">Cancelar convite</button>`
      : `<button type="button" class="botao pequeno" data-senha-nova="${esc(p.usuarioId)}" data-email="${esc(p.email)}" data-empresa="${esc(empresaId)}">Gerar link de senha nova</button>
         <button type="button" class="botao pequeno perigo" data-armavel data-remover="${esc(p.usuarioId)}" data-empresa="${esc(empresaId)}" data-email="${esc(p.email)}" aria-label="Remover ${esc(p.email)}" title="Remover">${icone('trash-2')}</button>`;
    return `
      <li class="pessoa${convite ? ' convite' : ''}">
        <span class="avatar-pessoa" aria-hidden="true">${esc(p.email[0]?.toUpperCase() ?? '?')}</span>
        <span class="pessoa-nome"><strong>${esc(p.email)}</strong><small class="dica">${linha2}</small></span>
        <span class="pessoa-acoes">${acao}</span>
      </li>`;
  };
  lugar.innerHTML = `
    <div class="cartao-topo"><h3>Pessoas</h3>
      <button type="button" class="botao pequeno" data-acao="convidar" data-empresa="${esc(empresaId)}">${icone('plus')} Convidar pessoa</button></div>
    ${pessoas.length ? `<ul class="lista-pessoas">${pessoas.map(item).join('')}</ul>` : '<p class="dica">Ninguém nesta empresa, nem convite pendente.</p>'}
    ${membros.length && !membros.some((m) => m.papel === 'dono') ? '<p class="dica">Esta empresa está sem admin: convide alguém como Admin.</p>' : ''}`;
}

// ---------- ações ----------

// 1º clique arma ("Confirmar ..."), 2º faz: o mesmo padrão do Remover da tela Empresa
function desarmar(menos) {
  document.querySelectorAll('#tela-plataforma [data-armavel][data-confirmar]').forEach((b) => {
    if (b === menos) return;
    delete b.dataset.confirmar;
    b.classList.remove('confirmar');
    if (b.dataset.remover) {
      b.innerHTML = icone('trash-2');
      b.setAttribute('aria-label', `Remover ${b.dataset.email}`);
    } else b.textContent = b.dataset.suspender === 'sim' ? 'Suspender empresa' : 'Reativar empresa';
  });
}
function armar(b, texto) {
  if (b.dataset.confirmar) return false;
  desarmar(b);
  b.dataset.confirmar = 'sim';
  b.classList.add('confirmar');
  b.textContent = texto;
  b.removeAttribute('aria-label');
  return true;
}

// Suspender a ÚNICA empresa ativa de quem está usando a Plataforma tira dele o resto do Calculéo; a Plataforma continua abrindo pela
// tela de entrada (app.js, abrirSoPlataforma). Avisa enquanto o botão pede a confirmação.
async function avisarSeTrancaFora(empresa, nome) {
  const minhas = await minhasEmpresas().catch(() => []);
  if (minhas.some((e) => e.id === empresa) && !minhas.some((e) => e.id !== empresa))
    estado(`Atenção: ${nome} é a sua única empresa ativa. Suspensa, o Calculéo abre só com a Plataforma (botão "Abrir a Plataforma" na entrada), de onde dá para reativar.`, true);
}

async function aoClicar(ev) {
  const b = ev.target.closest('button');
  if (!b) return;
  const empresa = b.dataset.empresa;
  const nome = empresas.find((e) => e.id === empresa)?.nome ?? '';
  try {
    if (b.dataset.acao === 'criar') return janelaCriar();
    if (b.dataset.acao === 'convidar') return janelaConvidar(empresa, nome);
    if (b.dataset.excluir) return janelaExcluir(empresas.find((e) => e.id === b.dataset.excluir));
    if (b.dataset.novoLink || b.dataset.senhaNova) {
      const senha = Boolean(b.dataset.senhaNova), email = b.dataset.novoLink || b.dataset.email;
      return abrirLink($('#janela-plataforma'), () => gerarLink(senha ? { tipo: 'senha', empresa, usuario: b.dataset.senhaNova } : { tipo: 'convite', empresa, email, papel: b.dataset.papel }),
        { tipo: senha ? 'senha' : 'convite', email, empresa: nome });
    }
    if (b.dataset.cancelar) {
      await plataformaCancelarConvite(empresa, b.dataset.cancelar);
      estado(`Convite de ${b.dataset.cancelar} em ${nome} cancelado.`);
    } else if (b.dataset.remover) {
      if (armar(b, 'Confirmar remoção')) return;
      await plataformaRemoverPessoa(empresa, b.dataset.remover);
      estado(`${b.dataset.email} saiu de ${nome}.`);
    } else if (b.dataset.suspender) {
      const suspender = b.dataset.suspender === 'sim';
      if (armar(b, suspender ? `Confirmar: suspender ${nome}?` : `Confirmar: reativar ${nome}?`)) {
        if (suspender) avisarSeTrancaFora(empresa, nome);
        return;
      }
      await plataformaSuspender(empresa, suspender);
      estado(suspender ? `${nome} suspensa: ninguém dela vê nem grava nada até você reativar.` : `${nome} reativada.`);
    } else return;
    await desenharPainel();
    $('#plataforma-estado').focus(); // o botão clicado foi redesenhado: o foco não se perde
  } catch (erro) {
    desarmar();
    estado(erro.message, true);
  }
}

async function aoEnviar(ev) {
  const form = ev.target.closest('[data-form]');
  if (!form) return;
  ev.preventDefault();
  if (form.dataset.form === 'codigo') return enviarCodigo(form);
  if (form.dataset.form !== 'limite') return;
  const texto = form.limite.value.trim();
  const limite = texto === '' ? null : Number(texto);
  const nome = empresas.find((e) => e.id === form.dataset.empresa)?.nome ?? '';
  if (limite !== null && !(Number.isInteger(limite) && limite >= 0)) return estado('O limite é um número inteiro, 0 ou mais. Deixe em branco para sem limite.', true);
  try {
    await plataformaLimiteBuscas(form.dataset.empresa, limite);
    estado(limite === null ? `${nome}: buscas sem limite.` : `${nome}: limite de ${limite} busca(s) por mês.`);
    await desenharPainel();
  } catch (erro) {
    estado(erro.message, true);
  }
}

// Janela no padrão das da tela Empresa (topo, corpo, base; erro dentro da janela)
function janela(titulo, corpo, botao, aoConfirmar) {
  const j = $('#janela-plataforma');
  j.innerHTML = `
    <form method="dialog" novalidate>
      <div class="janela-topo">
        <h3 id="titulo-plataforma-janela">${titulo}</h3>
        <button type="button" class="fechar" data-acao="fechar" aria-label="Fechar">${icone('x')}</button>
      </div>
      <div class="janela-corpo">${corpo}<p class="erro" role="alert" hidden></p></div>
      <div class="janela-base"><div class="direita">
        <button type="button" class="botao" data-acao="fechar">Cancelar</button>
        <button type="submit" class="botao principal">${botao}</button>
      </div></div>
    </form>`;
  const erro = j.querySelector('.erro');
  j.onclick = (ev) => ev.target.closest('[data-acao=fechar]') && j.close();
  j.onsubmit = async (ev) => {
    ev.preventDefault();
    const enviar = j.querySelector('[type=submit]');
    enviar.disabled = true;
    try {
      const depois = await aoConfirmar(j.querySelector('form'));
      await desenharPainel();
      if (depois) return depois(j); // a mesma janela vira a do link (criar empresa, convidar)
      j.close();
    } catch (x) {
      erro.textContent = x.message;
      erro.hidden = false;
      enviar.disabled = false;
    }
  };
  j.showModal();
  j.querySelector('input').focus();
}

const campoPapel = `
  <div class="campo"><span id="plat-papel-rotulo">Papel</span>
    <div class="alternar" role="radiogroup" aria-labelledby="plat-papel-rotulo"><label><input type="radio" name="papel" value="membro" checked><span>Membro</span></label><label><input type="radio" name="papel" value="dono"><span>Admin</span></label></div>
  </div>`;
const AVISAR = 'No 1º acesso, a pessoa abre o Calculéo, digita este e-mail e cria uma senha com pelo menos 8 caracteres em "Entrar".';
const DEPOIS_LINK = 'Depois você recebe um link para mandar à pessoa (WhatsApp ou como preferir). Ele vale 24 horas e uma vez só.';
// Convite pelo link secreto: { link } (null = já tem conta com senha); sem a gerar-link publicada no Supabase, o convite de antes
// (a pessoa entra pelo "Entrar") e { semFuncao: true }
async function convidarComLink(empresa, email, papel, convidarSemLink) {
  try {
    return { link: await gerarLink({ tipo: 'convite', empresa, email, papel }) };
  } catch (x) {
    if (!x.semFuncao) throw x;
    await convidarSemLink();
    return { semFuncao: true };
  }
}

function janelaCriar() {
  janela('Criar empresa', `
    <label class="campo"><span>Nome da empresa</span><span class="plat-nome-campo"><input class="campo-texto" name="nome" autocomplete="off" required maxlength="120" value="${nomeAleatorio()}"><button type="button" class="botao pequeno" data-sortear aria-label="Sortear outro nome" title="Sortear outro nome">${icone('sparkles')}</button></span></label>
    <label class="campo"><span>E-mail do admin</span><input type="email" class="campo-texto" name="email" autocomplete="off" required placeholder="nome@empresa.com.br"></label>
    <label class="campo"><span>Limite de buscas por mês</span><input type="number" class="campo-texto" name="limite" min="0" step="1" inputmode="numeric" value="20" placeholder="Sem limite"></label>
    <p class="dica">O nome é provisório: a empresa troca depois, na tela Empresa. Limite em branco = sem limite. ${DEPOIS_LINK}</p>`, 'Criar empresa', async (f) => {
    const texto = f.limite.value.trim();
    const limite = texto === '' ? null : Number(texto);
    if (!f.nome.value.trim()) throw new Error('Dê um nome à empresa.');
    if (limite !== null && !(Number.isInteger(limite) && limite >= 0)) throw new Error('O limite é um número inteiro, 0 ou mais. Deixe em branco para sem limite.');
    const id = await plataformaCriarEmpresa({ nome: f.nome.value, email: f.email.value, limite });
    const nomeE = f.nome.value.trim(), email = f.email.value.trim().toLowerCase();
    estado(`Empresa ${nomeE} criada.`);
    // a empresa já existe: daqui em diante só o link do admin; falhou -> a janela fica aberta com o erro e "Tentar de novo"
    const pedir = async () => {
      const r = await convidarComLink(id, email, 'dono', async () => {}); // o convite do admin já foi feito pelo criar
      return r.semFuncao ? undefined : r.link;
    };
    return (j) => abrirLink(j, pedir, {
      tipo: 'convite', email, empresa: nomeE, texto: `A empresa ${nomeE} foi criada. Falta o link do convite de ${email}.`,
      aoSemLink: () => estado(`Empresa ${nomeE} criada. Avise ${email}: é só abrir o Calculéo, digitar este e-mail e criar uma senha com pelo menos 8 caracteres em "Entrar".`),
    });
  });
  const nome = $('#janela-plataforma [name=nome]');
  nome.select(); // digitar já troca o nome sorteado
  $('#janela-plataforma [data-sortear]').addEventListener('click', () => {
    let novo = nomeAleatorio();
    while (novo === nome.value) novo = nomeAleatorio();
    nome.value = novo;
    nome.focus();
    nome.select();
  });
}

function janelaConvidar(empresa, nome) {
  janela(`Convidar para ${esc(nome)}`, `
    <label class="campo"><span>E-mail</span><input type="email" class="campo-texto" name="email" autocomplete="off" required placeholder="nome@empresa.com.br"></label>
    ${campoPapel}
    <p class="dica">${DEPOIS_LINK} Se o e-mail já tinha convite, o papel é atualizado e o link antigo deixa de valer.</p>`, 'Convidar', async (f) => {
    const email = f.email.value.trim().toLowerCase(), papel = f.querySelector('[name=papel]:checked').value;
    // erro do link (rede, 401, 5xx): aparece no formulário, que fica aberto; "Convidar" de novo tenta de novo
    const r = await convidarComLink(empresa, email, papel, () => plataformaConvidar(empresa, email, papel));
    estado(r.semFuncao ? `Convite para ${email} em ${nome} feito. ${AVISAR}` : `Convite para ${email} em ${nome} feito (${PAPEL[papel]}).`);
    return (j) => abrirLink(j, async () => (r.semFuncao ? undefined : r.link), { tipo: 'convite', email, empresa: nome }); // o link, ou "já tem conta" (fica aberta)
  });
  lembrarPapel($('#janela-plataforma'), () => pessoasDe.get(empresa) ?? []);
}


// Excluir empresa (Eduardo 17/11): só a suspensa (suspender antes = dá para se arrepender) e digitando o código, que o banco também
// confere. Sem volta: apaga produtos, preços, histórico e fotos; as contas das pessoas continuam (podem estar em outras empresas).
function janelaExcluir(e) {
  janela(`Excluir ${esc(e.nome)}`, `
    <p>Isto apaga a empresa <strong>${esc(e.nome)}</strong> e <strong>todos os dados dela</strong> (produtos, preços, histórico, fotos). <strong>Não dá para desfazer.</strong></p>
    <p class="dica">As contas das pessoas continuam: elas podem estar em outras empresas.</p>
    <label class="campo"><span>Digite o código da empresa (${esc(e.codigo)}) para confirmar</span><input class="campo-texto" name="codigo" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="12"></label>`,
  'Excluir empresa', async (f) => {
    const { fotos, ficaram } = await plataformaExcluirEmpresa(e.id, f.codigo.value);
    if (ficaram) estado(`A empresa ${e.nome} (${e.codigo}) foi excluída, mas ${ficaram} foto(s) ficaram no armazenamento. Avise o suporte para limpar.`, true);
    else estado(`Empresa ${e.nome} (${e.codigo}) excluída${fotos ? `, com ${fotos} foto(s)` : ''}. Fica só o registro.`);
  });
  const j = $('#janela-plataforma'), excluir = j.querySelector('[type=submit]'), campo = j.querySelector('[name=codigo]');
  excluir.className = 'botao perigo';
  // só com o código certo (sem diferença de maiúscula e espaço); empresa sem código (banco sem a correção 17 nova) não exclui por aqui
  const confere = () => (excluir.disabled = !e.codigo || campo.value.trim().toUpperCase() !== e.codigo);
  campo.addEventListener('input', confere);
  confere();
}
