// Tela Equipe: quem usa o Calculéo nesta empresa. O dono convida por e-mail (com o papel) e remove; o membro só vê a lista.
// Quem barra o membro é o banco (RLS); aqui o membro só não vê os botões.
import { equipe, convidar, cancelarConvite, removerMembro, pessoaLogada } from '../nuvem.js';
import { esc } from '../formato.js';
import { mostrarErro } from './erro.js';

const $ = (s) => document.querySelector(s);
const PAPEL = { dono: 'Dono', membro: 'Membro' };
const dia = (iso) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '');
let eu = '';

export async function iniciarEquipe() {
  eu = ((await pessoaLogada())?.email ?? '').toLowerCase();
  const tela = $('#tela-equipe');
  tela.addEventListener('submit', aoConvidar);
  tela.addEventListener('click', aoClicar);
  window.addEventListener('hashchange', () => location.hash === '#equipe' && desenhar());
  await desenhar();
}

function estado(texto, erro = false) {
  const el = $('#equipe-estado');
  el.textContent = texto;
  el.classList.toggle('erro', erro);
}

async function desenhar() {
  const lista = $('#equipe-lista');
  let e;
  try {
    e = await equipe();
  } catch (erro) {
    mostrarErro(lista, erro.message, () => desenhar(), 'Não deu para carregar a equipe');
    return;
  }
  $('#equipe-convidar').hidden = !e.souDono;
  const pessoa = (m) => `
    <li class="pessoa">
      <span class="pessoa-nome"><span><strong>${esc(m.email)}</strong>${m.email.toLowerCase() === eu ? ' (você)' : ''}</span>
        <small class="dica">${PAPEL[m.papel] ?? esc(m.papel)} · desde ${dia(m.entrouEm)}</small></span>
      ${e.souDono && m.email.toLowerCase() !== eu ? `<button type="button" class="botao pequeno" data-remover="${esc(m.usuarioId)}" data-email="${esc(m.email)}">Remover</button>` : ''}
    </li>`;
  const convite = (c) => `
    <li class="pessoa">
      <span class="pessoa-nome"><strong>${esc(c.email)}</strong>
        <small class="dica">${PAPEL[c.papel] ?? esc(c.papel)} · convite de ${dia(c.convidadoEm)}, ainda não entrou</small></span>
      <button type="button" class="botao pequeno" data-cancelar="${esc(c.email)}">Cancelar convite</button>
    </li>`;
  lista.innerHTML = `
    <h2>Pessoas (${e.membros.length})</h2>
    <ul class="lista-pessoas">${e.membros.map(pessoa).join('')}</ul>
    ${e.souDono && e.convites.length ? `<h2>Convites pendentes (${e.convites.length})</h2><ul class="lista-pessoas">${e.convites.map(convite).join('')}</ul>` : ''}
    ${e.souDono ? '' : '<p class="dica">Só o dono da empresa convida e remove pessoas.</p>'}`;
}

async function aoConvidar(ev) {
  if (ev.target.id !== 'equipe-convidar') return;
  ev.preventDefault();
  const campo = $('#convite-email');
  const email = campo.value.trim().toLowerCase();
  if (!campo.checkValidity() || !email) {
    estado('Digite um e-mail válido, por exemplo nome@empresa.com.br.', true);
    return campo.focus();
  }
  try {
    await convidar(email, $('#convite-papel').value);
    campo.value = '';
    estado(`Convite feito. ${email} entra na equipe no primeiro acesso, com o link que chega no e-mail.`);
    await desenhar();
  } catch (erro) {
    estado(erro.message, true);
  }
}

async function aoClicar(ev) {
  const b = ev.target.closest('[data-remover], [data-cancelar]');
  if (!b) return;
  try {
    if (b.dataset.remover) {
      if (!confirm(`Remover ${b.dataset.email} da equipe? A pessoa deixa de ver os dados desta empresa.`)) return;
      await removerMembro(b.dataset.remover);
      estado(`${b.dataset.email} saiu da equipe.`);
    } else {
      await cancelarConvite(b.dataset.cancelar);
      estado(`Convite de ${b.dataset.cancelar} cancelado.`);
    }
    await desenhar();
    $('#equipe-estado').focus(); // o botão clicado sumiu: o foco não se perde
  } catch (erro) {
    estado(erro.message, true);
  }
}
