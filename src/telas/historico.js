// Tela Histórico: quem mudou o quê e quando (o banco anota sozinho), com filtro por pessoa. Mostra os últimos 200.
import { historico } from '../nuvem.js';
import { esc } from '../formato.js';
import { mostrarErro } from './erro.js';
import { htmlVazio, htmlCarregando } from './mascote.js';

const $ = (s) => document.querySelector(s);
const quando = (iso) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export async function iniciarHistorico() {
  $('#historico-pessoa').addEventListener('change', () => desenhar());
  window.addEventListener('hashchange', () => location.hash === '#historico' && desenhar(true));
  await desenhar(true);
}

// todas = true também refaz a lista de pessoas do filtro (a partir do histórico sem filtro)
async function desenhar(todas = false) {
  const filtro = $('#historico-pessoa');
  const lista = $('#historico-lista');
  let linhas;
  if (!lista.children.length) lista.innerHTML = htmlCarregando('Procurando os registros…');
  try {
    linhas = await historico({ quem: todas ? undefined : filtro.value || undefined });
  } catch (erro) {
    mostrarErro(lista, erro.message, () => desenhar(todas), 'Não deu para carregar o histórico');
    return;
  }
  if (todas) {
    const escolhida = filtro.value;
    const pessoas = [...new Set(linhas.map((l) => l.quem))].sort();
    filtro.innerHTML = `<option value="">Todas as pessoas</option>${pessoas.map((p) => `<option value="${esc(p)}">${esc(p)}</option>`).join('')}`;
    filtro.value = pessoas.includes(escolhida) ? escolhida : '';
    if (filtro.value) return desenhar();
  }
  $('#historico-total').textContent = linhas.length ? `${linhas.length} registro(s)${linhas.length >= 200 ? ', os 200 mais recentes' : ''}` : '';
  lista.innerHTML = linhas.length
    ? `<ol class="lista-historico">${linhas.map((l) => `
        <li><time datetime="${esc(l.quando)}">${quando(l.quando)}</time>
          <span><strong>${esc(l.acao)}</strong>${l.detalhe ? `: ${esc(l.detalhe)}` : ''}</span>
          <small class="dica">${esc(l.quem)}</small></li>`).join('')}</ol>`
    : htmlVazio('historico', filtro.value ? 'Nada desta pessoa por aqui.' : 'Nada registrado ainda.', 'Cada produto, preço ou taxa salvo aparece aqui. O leão anota tudo.');
}
