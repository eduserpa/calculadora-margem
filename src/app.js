import { carregar, aoMudar, paraArquivo, lerArquivo, substituirTudo, dados, usarGuardado, lerDoNavegador } from './dados.js';
import * as nuvem from './nuvem.js';
import { ligarRotas, telaAtual } from './rotas.js';
import { VERSAO, ESQUECI_SENHA } from './config.js';
import { iniciarProdutos, desenharLista } from './telas/produtos.js';
import { iniciarCalculadora, desenharTudo } from './telas/calculadora.js';
import { iniciarConfiguracoes, aoMudarDados } from './telas/configuracoes.js';
import { iniciarConfigurarCanal } from './telas/configurar-canal.js';
import { iniciarPlanilhas } from './telas/planilhas.js';
import { iniciarInicio } from './telas/inicio.js';
import { iniciarNovidades } from './telas/novidades.js';
import './telas/dica.js'; // balão dos (i): um listener só, no document
import { iniciarNuvemTelas } from './telas/empresa.js'; // equipe, histórico e empresa: chamar depois do login e dos dados carregados

const $ = (s) => document.querySelector(s);

function mostrarTela() {
  const telas = [...document.querySelectorAll('.tela')].map((t) => t.id.replace('tela-', ''));
  const atual = telas.includes(telaAtual()) ? telaAtual() : telas[0];
  telas.forEach((t) => ($(`#tela-${t}`).hidden = t !== atual));
  scrollTo(0, 0); // tela nova sempre abre no topo (senão herdava a rolagem da anterior)
  document.querySelectorAll('.aba').forEach((a) =>
    a.dataset.aba === atual ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'),
  );
}

// Menu lateral: ocultar e mostrar. No computador a escolha fica lembrada; no celular começa oculto e abre por cima.
const CHAVE_LATERAL = 'calculadora-margem.lateral';
const celular = () => matchMedia('(max-width: 760px)').matches;

function mostrarLateral(aberta, { lembrar = true, foco = false } = {}) {
  $('.app').classList.toggle('sem-lateral', !aberta);
  $('#lateral-fechar').setAttribute('aria-expanded', String(aberta));
  $('#lateral-abrir').setAttribute('aria-expanded', String(aberta));
  $('#lateral-abrir').hidden = aberta;
  if (foco) (aberta ? $('#lateral-fechar') : $('#lateral-abrir')).focus();
  if (lembrar && !celular()) {
    try {
      localStorage.setItem(CHAVE_LATERAL, aberta ? 'aberta' : 'oculta');
    } catch {
      // sem armazenamento: vale só nesta visita
    }
  }
}

function iniciarLateral() {
  let salva = null;
  try {
    salva = localStorage.getItem(CHAVE_LATERAL);
  } catch {
    // ignora
  }
  mostrarLateral(!celular() && salva !== 'oculta', { lembrar: false });
  $('#lateral-fechar').addEventListener('click', () => mostrarLateral(false, { foco: true }));
  $('#lateral-abrir').addEventListener('click', () => mostrarLateral(true, { foco: true }));
  // No celular: escolher uma tela, tocar fora ou apertar Esc fecha o menu.
  $('#menu-lateral').addEventListener('click', (e) => {
    if (celular() && e.target.closest('.aba')) mostrarLateral(false, { lembrar: false });
  });
  document.addEventListener('click', (e) => {
    const aberta = !$('.app').classList.contains('sem-lateral');
    if (celular() && aberta && !e.target.closest('#menu-lateral, #lateral-abrir')) mostrarLateral(false, { lembrar: false });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && celular() && !$('.app').classList.contains('sem-lateral')) mostrarLateral(false, { lembrar: false, foco: true });
  });
}

export function aviso(texto, ok = false) {
  const el = $('#aviso-geral');
  el.textContent = texto;
  el.classList.toggle('ok', ok);
  el.dataset.mascote = !ok ? 'erro' : /(\.\.\.|…)$/.test(texto) ? 'calculando' : 'salvo'; // "Levando para a nuvem..." ainda está fazendo as contas
  el.hidden = !texto;
}

function exportar() {
  const url = URL.createObjectURL(new Blob([paraArquivo()], { type: 'application/json' }));
  const link = Object.assign(document.createElement('a'), { href: url, download: `calculadora-margem-${new Date().toISOString().slice(0, 10)}.json` });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function janelaImportar(conteudo, erro) {
  const j = $('#janela-importar');
  j.innerHTML = `
    <form method="dialog">
      <div class="janela-topo"><h3 id="titulo-importar">Importar dados</h3></div>
      <div class="janela-corpo">
        ${erro
          ? `<p class="erro">${erro}</p>`
          : `<p>O arquivo tem <strong>${conteudo.produtos.length} produto(s)</strong>${conteudo.canais ? ' e as taxas dos canais' : ''}.</p>
             <p class="dica">Ele substitui tudo o que está neste navegador agora (${dados.produtos.length} produto(s)). Se quiser guardar o que está aqui, exporte antes.</p>`}
      </div>
      <div class="janela-base"><div class="direita">
        <button type="submit" class="botao" value="cancelar">${erro ? 'Fechar' : 'Cancelar'}</button>
        ${erro ? '' : '<button type="submit" class="botao principal" value="substituir">Substituir tudo</button>'}
      </div></div>
    </form>`;
  j.onclose = async () => {
    if (j.returnValue !== 'substituir') return;
    aviso('Gravando os produtos e os preços…', true);
    try {
      if (!(await nuvem.gravarImportacao(() => substituirTudo(conteudo)))) return;
      await nuvem.anotarImportacao(`Arquivo com ${conteudo.produtos.length} produto(s)`);
      aviso('Dados importados e salvos na nuvem.', true);
      await levarFotosParaStorage(); // depois dos dados: mostra "N de M" e, se a aba fechar, continua na próxima abertura
    } catch (e) {
      aviso(e.message);
    }
  };
  j.returnValue = '';
  j.showModal();
  j.querySelector('[value="cancelar"]').focus(); // substituir tudo pede escolha, não Enter
}

async function importar(e) {
  const arquivo = e.target.files[0];
  e.target.value = '';
  if (!arquivo) return;
  try {
    janelaImportar(lerArquivo(await arquivo.text()));
  } catch (erro) {
    janelaImportar(null, erro.message);
  }
}

// Liga uma parte da página; se der erro, avisa e deixa as outras funcionando.
function ligar(nome, fn) {
  try {
    fn();
  } catch (erro) {
    console.error(nome, erro);
    aviso(`Uma parte da página (${nome}) não carregou. Recarregue a página; se continuar, exporte os dados e avise.`);
  }
}

// ---------- login (só ele aparece até a pessoa entrar) ----------

function mostrarLogin(texto = '', logada = false) {
  $('#abrindo').hidden = true;
  $('#login').hidden = false;
  $('#login-form').hidden = logada;
  $('#login-sair').hidden = !logada;
  $('#login-msg').textContent = texto;
}

function iniciarLogin() {
  let criar = false; // primeiro acesso: cria a senha
  const msg = (texto) => ($('#login-msg').textContent = texto);
  $('#login-sair').addEventListener('click', nuvem.sair);
  $('#login-modo').addEventListener('click', () => {
    criar = !criar;
    $('#login-entrar').textContent = criar ? 'Criar senha e entrar' : 'Entrar';
    $('#login-modo').textContent = criar ? 'Já tenho senha' : 'Primeiro acesso? Crie sua senha';
    $('#login-senha').autocomplete = criar ? 'new-password' : 'current-password';
    msg(criar ? 'Use o e-mail em que você foi convidado e uma senha com pelo menos 8 caracteres.' : '');
  });
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#login-entrar').disabled = true;
    msg(criar ? 'Criando sua senha...' : 'Entrando...');
    try {
      await nuvem.entrarComSenha($('#login-email').value, $('#login-senha').value, criar);
      location.reload();
    } catch (erro) {
      msg(erro.message);
      $('#login-entrar').disabled = false;
    }
  });
  $('#login-esqueci').hidden = !ESQUECI_SENHA;
  $('#login-esqueci').addEventListener('click', async () => {
    if (!$('#login-email').value.trim()) return msg('Digite o seu e-mail primeiro.');
    msg('Mandando...');
    try {
      await nuvem.esqueciSenha($('#login-email').value);
      $('#login-mascote').src = 'assets/mascote/email.webp';
      $('#login-frase').textContent = 'Link enviado! Confira seu e-mail.';
      msg('Abra o e-mail e clique no link para criar uma senha nova.');
      $('#login-form').hidden = true;
    } catch (erro) {
      msg(erro.message);
    }
  });
  $('#nova-senha-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    msg('Salvando...');
    try {
      await nuvem.trocarSenha($('#nova-senha').value);
      history.replaceState(null, '', location.pathname);
      location.reload();
    } catch (erro) {
      msg(erro.message);
    }
  });
  $('#login-link').addEventListener('click', async () => {
    if (!$('#login-email').value.trim()) return msg('Digite o seu e-mail primeiro.');
    msg('Mandando...');
    try {
      await nuvem.mandarLink($('#login-email').value);
      $('#login-mascote').src = 'assets/mascote/email.webp';
      $('#login-frase').textContent = 'Link enviado! Confira seu e-mail.';
      msg('Abra o e-mail neste aparelho e clique no link para entrar.');
      $('#login-form').hidden = true;
    } catch (erro) {
      msg(erro.message);
    }
  });
}

// 1º login com a nuvem vazia e dados neste navegador: oferece levar (a não ser que a pessoa tenha pedido para não ver mais).
const CHAVE_NAO_LEVAR = 'calculadora-margem.nao-oferecer-levar';
function oferecerLevarDados() {
  const local = lerDoNavegador();
  if (dados.produtos.length || !local?.produtos?.length) return;
  try {
    if (localStorage.getItem(CHAVE_NAO_LEVAR)) return;
  } catch {
    // sem armazenamento: oferece
  }
  const j = $('#janela-importar');
  j.innerHTML = `
    <form method="dialog">
      <div class="janela-topo"><h3 id="titulo-importar">Levar meus dados para a nuvem</h3></div>
      <div class="janela-corpo">
        <p>Este navegador tem <strong>${local.produtos.length} produto(s)</strong> guardados só nele. Levando para a nuvem, a equipe vê também.</p>
        <p class="dica">A cópia neste navegador continua guardada.</p>
        <label class="ligar"><input type="checkbox" id="nao-oferecer-levar"><span>Não mostrar de novo neste navegador</span></label>
      </div>
      <div class="janela-base"><div class="direita">
        <button type="submit" class="botao" value="nao">Agora não</button>
        <button type="submit" class="botao principal" value="levar">Levar meus dados para a nuvem</button>
      </div></div>
    </form>`;
  j.onclose = async () => {
    if (j.returnValue !== 'levar') {
      // "Agora não" (ou Esc) com a caixinha marcada: não oferece mais neste navegador; os dados locais ficam como estão.
      if (j.querySelector('#nao-oferecer-levar').checked) {
        try {
          localStorage.setItem(CHAVE_NAO_LEVAR, '1');
        } catch {
          // sem armazenamento: volta a oferecer na próxima vez
        }
      }
      return;
    }
    aviso('Levando para a nuvem…', true);
    try {
      await nuvem.gravarImportacao(() => substituirTudo({ produtos: local.produtos, canais: local.canais ?? null, precificacoes: local.precificacoes ?? {}, empresa: local.empresa ?? null }));
      await nuvem.anotarImportacao(`Dados do navegador: ${local.produtos.length} produto(s)`);
      aviso('Pronto: seus dados estão na nuvem.', true);
      await levarFotosParaStorage();
    } catch (e) {
      aviso(e.message);
    }
  };
  j.returnValue = '';
  j.showModal();
  j.querySelector('[value="levar"]').focus();
}

// Fotos que ainda estão dentro do banco vão para o Storage (só o dono dispara; uma vez, depois some sozinho).
async function levarFotosParaStorage() {
  const pendentes = dados.produtos.filter((p) => (p.fotos ?? []).some((f) => String(f).startsWith('data:'))).length;
  if (!pendentes) return;
  const sobrou = await nuvem.migrarFotos((feitas, total) => aviso(`Guardando as fotos na nuvem: ${feitas} de ${total}…`, true));
  if (sobrou) aviso(`${sobrou} foto(s) ainda não subiram. Elas continuam salvas; tento de novo na próxima vez que você abrir.`);
  else aviso('Fotos guardadas na nuvem. Agora a lista de produtos abre mais rápido.', true);
  desenharLista();
}

function temSessaoGuardada() {
  try {
    return Object.keys(localStorage).some((k) => /^sb-.+-auth-token$/.test(k));
  } catch {
    return true; // sem acesso ao armazenamento: pergunta ao Supabase
  }
}

async function iniciar() {
  const recuperando = /type=recovery/.test(location.hash); // voltou pelo link de "Esqueci a senha" (antes do login limpar o endereço)
  // As telas trocam primeiro, para nunca aparecerem todas juntas.
  ligarRotas(); // /produtos, Voltar/Avançar e o /#produtos antigo
  window.addEventListener('tela', mostrarTela);
  mostrarTela();
  $('#versao-num').textContent = VERSAO; // a versão mora em src/config.js
  iniciarLogin();
  // Sem sessão guardada e sem link de login no endereço: o login aparece na hora, sem esperar a biblioteca do Supabase.
  if (!temSessaoGuardada() && !/access_token|[?&]code=|type=recovery/.test(location.href)) return mostrarLogin();
  try {
    if (!(await nuvem.pessoaLogada())) return mostrarLogin();
    if (recuperando) {
      mostrarLogin('Escolha a sua senha nova (pelo menos 8 caracteres).');
      $('#login-form').hidden = true;
      $('#nova-senha-form').hidden = false;
      return $('#nova-senha').focus();
    }
    if (!(await nuvem.prepararEmpresa())) return mostrarLogin('Seu e-mail ainda não está em nenhuma empresa. Peça um convite ao admin.', true);
    usarGuardado(nuvem.guardadoNaNuvem);
    await carregar();
  } catch (erro) {
    return mostrarLogin(/canais\.json|JSON/.test(erro.message) ? 'Não deu para carregar as taxas dos canais. Recarregue a página.' : erro.message || 'Não deu para falar com o servidor. Confira a internet e recarregue.', Boolean(nuvem.emailAtual()));
  }
  $('#abrindo').hidden = true;
  $('.app').hidden = false;
  nuvem.quandoFalhar((e) => aviso(`Não deu para salvar na nuvem (${e.message}). Confira a internet e faça a alteração de novo.`));
  aoMudar((ok) => {
    desenharLista();
    desenharTudo();
    aoMudarDados();
    if (!ok) aviso('Não deu para guardar os dados. Exporte para não perder o que fez.');
  });
  $('#sair').addEventListener('click', nuvem.sair);
  ligar('menu lateral', iniciarLateral);
  ligar('produtos', iniciarProdutos);
  ligar('planilhas', iniciarPlanilhas);
  ligar('calculadora', iniciarCalculadora);
  ligar('início', iniciarInicio);
  ligar('novidades', iniciarNovidades);
  ligar('taxas dos canais', iniciarConfiguracoes);
  ligar('configurar canal', iniciarConfigurarCanal);
  ligar('exportar e importar', () => {
    $('#exportar').addEventListener('click', exportar);
    $('#importar').addEventListener('change', importar);
    $('#importar-botao').addEventListener('click', () => $('#importar').click());
  });
  ligar('equipe, histórico e empresa', iniciarNuvemTelas);
  oferecerLevarDados();
  if (nuvem.souDono()) levarFotosParaStorage();
}

iniciar();
