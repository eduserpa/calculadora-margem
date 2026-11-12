import { carregar, aoMudar, paraArquivo, lerArquivo, substituirTudo, dados } from './dados.js';
import { iniciarProdutos, desenharLista } from './telas/produtos.js';

const $ = (s) => document.querySelector(s);

function mostrarTela() {
  const telas = [...document.querySelectorAll('.tela')].map((t) => t.id.replace('tela-', ''));
  const atual = telas.includes(location.hash.slice(1)) ? location.hash.slice(1) : telas[0];
  telas.forEach((t) => ($(`#tela-${t}`).hidden = t !== atual));
  document.querySelectorAll('.aba').forEach((a) =>
    a.dataset.aba === atual ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'),
  );
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

async function iniciar() {
  try {
    await carregar();
  } catch {
    aviso('Não deu para carregar as taxas dos canais (data/canais.json). Abra a página por um endereço http, não direto do arquivo.');
  }
  aoMudar((ok) => {
    desenharLista();
    if (!ok) aviso('Este navegador não deixou guardar os dados. Exporte para não perder o que fez.');
  });
  iniciarProdutos();
  $('#exportar').addEventListener('click', exportar);
  $('#importar').addEventListener('change', importar);
  window.addEventListener('hashchange', mostrarTela);
  mostrarTela();
}

iniciar();
