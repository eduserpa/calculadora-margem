import { carregar, aoMudar, paraArquivo, lerArquivo, substituirTudo, dados } from './dados.js';
import { iniciarProdutos, desenharLista } from './telas/produtos.js';
import { iniciarCalculadora, desenharTudo } from './telas/calculadora.js';
import { iniciarConfiguracoes, aoMudarDados } from './telas/configuracoes.js';
import { iniciarConfigurarCanal } from './telas/configurar-canal.js';
import { iniciarPlanilhas } from './telas/planilhas.js';

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

function aviso(texto, ok = false) {
  const el = $('#aviso-geral');
  el.textContent = texto;
  el.classList.toggle('ok', ok);
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
    if (j.returnValue === 'substituir') aviso(substituirTudo(conteudo) ? 'Dados importados.' : '', true);
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

async function iniciar() {
  // As telas trocam primeiro, para nunca aparecerem todas juntas.
  window.addEventListener('hashchange', mostrarTela);
  mostrarTela();
  try {
    await carregar();
  } catch {
    aviso('Não deu para carregar as taxas dos canais (data/canais.json). Abra a página por um endereço http, não direto do arquivo.');
  }
  aoMudar((ok) => {
    desenharLista();
    desenharTudo();
    aoMudarDados();
    if (!ok) aviso('Este navegador não deixou guardar os dados. Exporte para não perder o que fez.');
  });
  ligar('menu lateral', iniciarLateral);
  ligar('produtos', iniciarProdutos);
  ligar('planilhas', iniciarPlanilhas);
  ligar('calculadora', iniciarCalculadora);
  ligar('taxas dos canais', iniciarConfiguracoes);
  ligar('configurar canal', iniciarConfigurarCanal);
  ligar('exportar e importar', () => {
    $('#exportar').addEventListener('click', exportar);
    $('#importar').addEventListener('change', importar);
  });
}

iniciar();
