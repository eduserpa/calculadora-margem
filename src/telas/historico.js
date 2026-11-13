// Tela Histórico: quem mudou o quê e quando (o banco anota sozinho), com filtro por pessoa. Mostra os últimos 200.
import { historico } from '../nuvem.js';
import { telaAtual } from '../rotas.js';
import { esc } from '../formato.js';
import { mostrarErro } from './erro.js';
import { htmlVazio, htmlCarregando } from './mascote.js';

const $ = (s) => document.querySelector(s);
const quando = (iso) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export async function iniciarHistorico() {
  $('#historico-pessoa').addEventListener('change', () => desenhar());
  window.addEventListener('tela', () => telaAtual() === 'historico' && desenhar(true));
  await desenhar(true);
}

// Linha com o que mudou (correção 08 do banco): <details> nativo, abre com clique, Enter ou Espaço e mostra "Campo: antes → depois".
// Linha antiga (sem detalhe) fica como era, sem setinha.
function linhaDoHistorico(l) {
  const titulo = `<strong>${esc(l.acao)}</strong>${l.detalhe ? `: ${esc(l.detalhe)}` : ''}`;
  const mudancas = Array.isArray(l.mudancas) ? l.mudancas : [];
  if (!mudancas.length) return `<span>${titulo}</span>`;
  // <dl> e não <ul>: o li da lista do histórico tem grade e borda próprias (estilo.css)
  const item = (m) => `<div><dt>${esc(m.campo)}</dt>${'antes' in m || 'depois' in m ? `<dd>${esc(m.antes ?? '—')} → ${esc(m.depois ?? '—')}</dd>` : ''}</div>`;
  return `<details class="historico-detalhe"><summary>${titulo}</summary><dl class="historico-mudancas">${mudancas.map(item).join('')}</dl></details>`;
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
          ${linhaDoHistorico(l)}
          <small class="dica">${esc(l.quem)}</small></li>`).join('')}</ol>`
    : htmlVazio('historico', filtro.value ? 'Nada desta pessoa por aqui.' : 'Nada registrado ainda.', 'Cada produto, preço ou taxa salvo aparece aqui. O leão anota tudo.');
}
