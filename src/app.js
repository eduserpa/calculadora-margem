import { carregar, aoMudar, paraArquivo, lerArquivo, substituirTudo, dados, usarGuardado, lerDoNavegador } from './dados.js';
import * as nuvem from './nuvem.js';
import { iniciarProdutos, desenharLista } from './telas/produtos.js';
import { iniciarCalculadora, desenharTudo } from './telas/calculadora.js';
import { iniciarConfiguracoes, aoMudarDados } from './telas/configuracoes.js';
import { iniciarConfigurarCanal } from './telas/configurar-canal.js';
import { iniciarPlanilhas } from './telas/planilhas.js';
import { iniciarNuvemTelas } from './telas/empresa.js'; // equipe, histórico e empresa: chamar depois do login e dos dados carregados

const $ = (s) => document.querySelector(s);

function mostrarTela() {
  const telas = [...document.querySelectorAll('.tela')].map((t) => t.id.replace('tela-', ''));
  const atual = telas.includes(location.hash.slice(1)) ? location.hash.slice(1) : telas[0];
  telas.forEach((t) => ($(`#tela-${t}`).hidden = t !== atual));
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
  j.onclose = () => {
    if (j.returnValue !== 'substituir' || !substituirTudo(conteudo)) return;
    aviso('Dados importados. Enviando para a nuvem...', true);
    nuvem.anotarImportacao(`Arquivo com ${conteudo.produtos.length} produto(s)`)
      .then(() => aviso('Dados importados e salvos na nuvem.', true))
      .catch((e) => aviso(e.message));
  };
  j.returnValue = '';
  j.showModal();
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

// 1º login com a nuvem vazia e dados neste navegador: oferece levar.
function oferecerLevarDados() {
  const local = lerDoNavegador();
  if (dados.produtos.length || !local?.produtos?.length) return;
  const j = $('#janela-importar');
  j.innerHTML = `
    <form method="dialog">
      <div class="janela-topo"><h3 id="titulo-importar">Levar meus dados para a nuvem</h3></div>
      <div class="janela-corpo">
        <p>Este navegador tem <strong>${local.produtos.length} produto(s)</strong> guardados só nele. Levando para a nuvem, a equipe vê também.</p>
        <p class="dica">A cópia neste navegador continua guardada.</p>
      </div>
      <div class="janela-base"><div class="direita">
        <button type="submit" class="botao" value="nao">Agora não</button>
        <button type="submit" class="botao principal" value="levar">Levar meus dados para a nuvem</button>
      </div></div>
    </form>`;
  j.onclose = () => {
    if (j.returnValue !== 'levar') return;
    substituirTudo({ produtos: local.produtos, canais: local.canais ?? null, precificacoes: local.precificacoes ?? {}, empresa: local.empresa ?? null });
    aviso('Levando para a nuvem...', true);
    nuvem.anotarImportacao(`Dados do navegador: ${local.produtos.length} produto(s)`)
      .then(() => aviso('Pronto: seus dados estão na nuvem.', true))
      .catch((e) => aviso(e.message));
  };
  j.returnValue = '';
  j.showModal();
}

async function iniciar() {
  // As telas trocam primeiro, para nunca aparecerem todas juntas.
  window.addEventListener('hashchange', mostrarTela);
  mostrarTela();
  iniciarLogin();
  try {
    if (!(await nuvem.pessoaLogada())) return mostrarLogin();
    if (!(await nuvem.prepararEmpresa())) return mostrarLogin('Seu e-mail ainda não está em nenhuma empresa. Peça um convite ao dono.', true);
    usarGuardado(nuvem.guardadoNaNuvem);
    await carregar();
  } catch (erro) {
    return mostrarLogin(/canais\.json|JSON/.test(erro.message) ? 'Não deu para carregar as taxas dos canais. Recarregue a página.' : erro.message || 'Não deu para falar com o servidor. Confira a internet e recarregue.', Boolean(nuvem.emailAtual()));
  }
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
  ligar('taxas dos canais', iniciarConfiguracoes);
  ligar('configurar canal', iniciarConfigurarCanal);
  ligar('exportar e importar', () => {
    $('#exportar').addEventListener('click', exportar);
    $('#importar').addEventListener('change', importar);
    $('#importar-botao').addEventListener('click', () => $('#importar').click());
  });
  ligar('equipe, histórico e empresa', iniciarNuvemTelas);
  oferecerLevarDados();
}

iniciar();
