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
import { iniciarPlataforma } from './telas/plataforma.js'; // só aparece para os donos da plataforma (o banco decide)
import { iniciarAviso } from './telas/aviso.js';

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

// Depois de mandar um link (confirmar o cadastro, esqueci a senha, link de acesso): o MESMO cartão troca o formulário por uma frase
// (regra do Eduardo: login enxuto). "Reenviar" (link de texto) só aparece 60 s depois de cada envio; "Voltar" devolve o formulário.
const FRASE_LOGIN = 'Bora calcular essa margem?';
// confirmou o cadastro e ainda não criou a senha (fechou a aba no meio): a tela de criar a senha volta, mas só para ESTA pessoa
// (guarda o id dela: num computador dividido, quem entrar depois não cai na tela de outra pessoa)
const CHAVE_SENHA_PENDENTE = 'calculadora-margem.criar-senha';
const lembrarCriarSenha = (quem) => {
  try {
    if (quem) localStorage.setItem(CHAVE_SENHA_PENDENTE, quem);
    else localStorage.removeItem(CHAVE_SENHA_PENDENTE);
  } catch {
    // sem armazenamento: vale só nesta visita
  }
};
const faltaCriarSenha = (quem) => {
  try {
    return Boolean(quem) && localStorage.getItem(CHAVE_SENHA_PENDENTE) === quem;
  } catch {
    return false;
  }
};
const ESPERA_REENVIAR = 60000;
let relogioReenviar = null;
function mostrarEnviado(texto, reenviar = null, jaPode = false) {
  const r = $('#login-reenviar');
  clearTimeout(relogioReenviar);
  $('#login-form').hidden = true;
  $('#login-mascote').src = 'assets/mascote/email.webp';
  $('#login-frase').textContent = 'Confira o seu e-mail.';
  $('#login-msg').textContent = texto;
  $('#login-voltar').hidden = false;
  r.hidden = true;
  if (!reenviar) return;
  const liberar = () => (r.hidden = false);
  if (jaPode) liberar();
  else relogioReenviar = setTimeout(liberar, ESPERA_REENVIAR);
  r.onclick = async () => {
    r.hidden = true;
    try {
      await reenviar();
      $('#login-msg').textContent = `${texto} Mandamos de novo.`;
    } catch (erro) {
      $('#login-msg').textContent = erro.message;
    }
    relogioReenviar = setTimeout(liberar, ESPERA_REENVIAR);
  };
}

function voltarAoLogin() {
  clearTimeout(relogioReenviar);
  $('#login-reenviar').hidden = true;
  $('#login-voltar').hidden = true;
  $('#login-form').hidden = false;
  $('#login-entrar').disabled = false;
  $('#login-mascote').src = 'assets/mascote/login.webp';
  $('#login-frase').textContent = FRASE_LOGIN;
  $('#login-msg').textContent = '';
  $('#login-email').focus();
}

function iniciarLogin() {
  const msg = (texto) => ($('#login-msg').textContent = texto);
  // o e-mail do próprio login (sem tela nova): vazio, pede e põe o cursor nele
  const emailDigitado = (oQue) => {
    const campo = $('#login-email');
    if (campo.value.trim()) return campo.value;
    msg(`Digite o seu e-mail e toque de novo em "${oQue}".`);
    campo.focus();
    return null;
  };
  $('#login-sair').addEventListener('click', nuvem.sair);
  $('#login-voltar').addEventListener('click', voltarAoLogin);
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#login-entrar').disabled = true;
    msg('Entrando...');
    try {
      const r = await nuvem.entrarComSenha($('#login-email').value, $('#login-senha').value);
      if (!r?.confirmar) return location.reload();
      $('#login-entrar').disabled = false;
      mostrarEnviado(`Enviamos um link para ${r.confirmar}. Abra o e-mail para entrar.`, () => nuvem.reenviarConfirmacao(r.confirmar), r.jaPode);
    } catch (erro) {
      msg(erro.message);
      $('#login-entrar').disabled = false;
    }
  });
  // sem SMTP próprio o Supabase só manda e-mail para quem é do projeto: "Esqueci a senha" e "Receber link por e-mail" ficam escondidos
  $('#login-esqueci').hidden = !ESQUECI_SENHA;
  $('#login-link').hidden = !ESQUECI_SENHA;
  $('#login-esqueci').addEventListener('click', async () => {
    const email = emailDigitado('Esqueci a senha');
    if (!email) return;
    msg('Mandando...');
    try {
      await nuvem.esqueciSenha(email);
      // neutro: não conta se o e-mail tem conta
      mostrarEnviado('Se este e-mail tiver conta no Calculéo, mandamos um link para criar uma senha nova.', () => nuvem.esqueciSenha(email));
    } catch (erro) {
      msg(erro.message);
    }
  });
  $('#criar-empresa-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    msg('Criando...');
    try {
      await nuvem.criarEmpresa($('#criar-empresa-nome').value); // já passa para a nova e recarrega
    } catch (erro) {
      msg(erro.message);
    }
  });
  // senha + confirmação (Eduardo 17/11): o olhinho mostra as duas; "Salvar" só com as duas iguais e com 8 ou mais; diferentes, o
  // aviso aparece quando a 2ª já tem o tamanho da 1ª (enquanto digita, não acusa)
  const senha = $('#nova-senha'), senha2 = $('#nova-senha-2');
  const conferirSenhas = () => {
    const iguais = senha.value === senha2.value;
    $('#nova-senha-erro').hidden = iguais || senha2.value.length < Math.min(senha.value.length, 8);
    $('#nova-senha-salvar').disabled = !iguais || senha.value.length < 8;
  };
  senha.addEventListener('input', conferirSenhas);
  senha2.addEventListener('input', conferirSenhas);
  senha2.addEventListener('blur', () => senha2.value && ($('#nova-senha-erro').hidden = senha.value === senha2.value));
  $('#nova-senha-olho').addEventListener('click', (e) => {
    const campo = $('#nova-senha'), b = e.currentTarget, ver = campo.type === 'password';
    campo.type = ver ? 'text' : 'password';
    senha2.type = campo.type;
    b.setAttribute('aria-pressed', String(ver));
    b.setAttribute('aria-label', ver ? 'Esconder senha' : 'Mostrar senha');
    b.querySelector('use').setAttribute('href', `assets/icones.svg#${ver ? 'eye-off' : 'eye'}`);
  });
  $('#nova-senha-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (senha.value !== senha2.value) {
      $('#nova-senha-erro').hidden = false;
      return senha2.focus();
    }
    msg('Salvando...');
    try {
      await nuvem.trocarSenha($('#nova-senha').value, { mesmaVale: $('#nova-senha-form').dataset.cadastro === '1' });
      lembrarCriarSenha(null);
      history.replaceState(null, '', location.pathname);
      location.reload();
    } catch (erro) {
      msg(erro.message);
    }
  });
  $('#login-link').addEventListener('click', async () => {
    const email = emailDigitado('Receber link por e-mail');
    if (!email) return;
    msg('Mandando...');
    try {
      await nuvem.mandarLink(email);
      mostrarEnviado('Se este e-mail tiver conta no Calculéo, mandamos um link para entrar. Abra o e-mail neste aparelho.', () => nuvem.mandarLink(email)); // neutro
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

// Só a Plataforma, sem empresa ativa (dono da plataforma que nunca teve empresa, excluiu ou suspendeu a dele): o resto do app
// precisa de empresa e fica de fora; no menu, só a Plataforma e o Sair.
async function abrirSoPlataforma() {
  $('#login').hidden = true;
  $('#abrindo').hidden = true;
  $('.app').hidden = false;
  document.querySelectorAll('.menu .aba, .menu .menu-titulo, #exportar, #importar-botao, .versao').forEach((el) => (el.hidden = true));
  $('#sair').addEventListener('click', nuvem.sair);
  ligar('menu lateral', iniciarLateral);
  ligar('avisos', iniciarAviso);
  await iniciarPlataforma(); // o caminho já é /plataforma: a tela aparece no aviso 'tela' que ela dá
}

async function iniciar() {
  // volta dos links de e-mail (lida antes de o Supabase limpar o endereço): o # diz o tipo; link vencido ou já usado vem com error_code
  const volta = new URLSearchParams(location.hash.slice(1) || location.search.slice(1));
  // link secreto do convite ou da senha nova (gerar-link, sem e-mail): #link=<token>&tipo=<invite|magiclink|recovery>
  const linkSecreto = volta.get('link'), tipoLink = volta.get('tipo');
  const recuperando = volta.get('type') === 'recovery' || (linkSecreto && tipoLink === 'recovery'); // "Esqueci a senha" ou link de senha nova
  // confirmação do cadastro e link do convite (invite, ou magiclink de conta sem senha): cria a senha. type=magiclink do
  // "Receber link por e-mail" (conta que já tem senha) entra direto
  const confirmou = /^(signup|invite)$/.test(volta.get('type') ?? '') || (linkSecreto && /^(invite|magiclink)$/.test(tipoLink ?? ''));
  const linkRuim = volta.has('error_code') || volta.get('error') === 'access_denied';
  // As telas trocam primeiro, para nunca aparecerem todas juntas.
  ligarRotas(); // /produtos, Voltar/Avançar e o /#produtos antigo
  window.addEventListener('tela', mostrarTela);
  mostrarTela();
  $('#versao-num').textContent = VERSAO; // a versão mora em src/config.js
  iniciarLogin();
  // Sem sessão guardada e sem link de login no endereço: o login aparece na hora, sem esperar a biblioteca do Supabase.
  if (linkRuim) {
    history.replaceState(null, '', location.pathname);
    if (!temSessaoGuardada()) return mostrarLogin('Este link venceu ou já foi usado. Peça um novo a quem te convidou.');
  }
  if (linkSecreto) {
    history.replaceState(null, '', location.pathname); // o token sai do endereço já (vale uma vez só)
    try {
      await nuvem.entrarPeloLink(linkSecreto, tipoLink);
    } catch (x) {
      return mostrarLogin(x.rede ? 'Não deu para abrir o link agora. Confira a internet e tente de novo.' : 'Este link venceu ou já foi usado. Peça um novo a quem te convidou.');
    }
  } else if (!temSessaoGuardada() && !/access_token|[?&]code=|type=recovery/.test(location.href)) return mostrarLogin();
  try {
    const logada = await nuvem.pessoaLogada();
    if (!logada) return mostrarLogin();
    const quem = logada.id ?? logada.email; // de quem é a "senha a criar" guardada
    // senha nova (Esqueci a senha) ou a senha do cadastro recém-confirmado: na confirmação ela é pedida de novo, porque a conta
    // pode ter sido criada por outra pessoa com este e-mail e a senha DELA; quem tem o e-mail é quem define a senha
    const criarSenha = confirmou || (!recuperando && faltaCriarSenha(quem));
    if (recuperando || criarSenha) {
      if (criarSenha) lembrarCriarSenha(quem);
      mostrarLogin(!criarSenha ? 'Crie a sua senha nova (pelo menos 8 caracteres).'
        : volta.get('type') === 'signup' ? 'E-mail confirmado! Agora crie a sua senha (pelo menos 8 caracteres).' // só a volta da confirmação por e-mail
          : 'Bem-vindo ao Calculéo! Crie a sua senha (pelo menos 8 caracteres).'); // link do convite
      $('#login-form').hidden = true;
      $('#nova-senha-form').hidden = false;
      $('#nova-senha-form').dataset.cadastro = criarSenha ? '1' : '';
      return $('#nova-senha').focus();
    }
    if (!(await nuvem.prepararEmpresa())) {
      const [suspensas, plataforma] = await Promise.all([nuvem.empresasSuspensas(), nuvem.acessoPlataforma()]);
      // dono da plataforma sem empresa ativa: a Plataforma abre mesmo assim (nunca se tranca fora suspendendo a própria empresa)
      if (plataforma === 'sim' || plataforma === 'precisa_mfa') {
        if (telaAtual() === 'plataforma') return abrirSoPlataforma();
        $('#login-sair').insertAdjacentHTML('beforebegin', '<button type="button" class="botao" id="login-plataforma">Abrir a Plataforma</button>');
        $('#login-plataforma').addEventListener('click', () => (history.pushState(null, '', '/plataforma'), abrirSoPlataforma()));
      }
      // empresa suspensa pela plataforma: diz qual e não oferece criar outra (senão a suspensão vira só "cria uma nova")
      if (suspensas.length) {
        const nomes = new Intl.ListFormat('pt-BR').format(suspensas);  // "Loren Metais e Conceito Metais"
        return mostrarLogin(`${suspensas.length > 1 ? `As empresas ${nomes} estão suspensas` : `A empresa ${nomes} está suspensa`}. Fale com o suporte.`, true);
      }
      // sem empresa (nunca teve ou excluiu a última): cria a sua aqui mesmo
      mostrarLogin('Crie a sua empresa ou peça um convite ao admin.', true);
      $('#criar-empresa-form').hidden = false;
      return $('#criar-empresa-nome').focus();
    }
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
  ligar('plataforma', () => iniciarPlataforma().catch((e) => console.error('plataforma', e))); // sem a correção 17 no banco: nada aparece
  oferecerLevarDados();
  if (nuvem.souDono()) levarFotosParaStorage();
}

iniciar().catch((erro) => {
  console.error('abrir', erro);
  if ($('#abrindo').hidden) aviso('Uma parte da página não carregou. Recarregue a página; se continuar, exporte os dados e avise.');
  else abrirFalhou();
});
