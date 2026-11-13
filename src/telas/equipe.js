// Tela Equipe: quem usa o Calculéo nesta empresa. O dono convida por e-mail (com o papel) e remove; o membro só vê a lista.
// Quem barra o membro é o banco (RLS); aqui o membro só não vê os botões.
import { equipe, convidar, cancelarConvite, removerMembro, mudarPapel, pessoaLogada } from '../nuvem.js';
import { esc } from '../formato.js';
import { telaAtual } from '../rotas.js';
import { mostrarErro } from './erro.js';
import { htmlVazio, htmlCarregando } from './mascote.js';
import { mostrarAviso } from './aviso.js';

const $ = (s) => document.querySelector(s);
const PAPEL = { dono: 'Admin', membro: 'Membro' };
const dia = (iso) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '');
let eu = '';

export async function iniciarEquipe() {
  eu = ((await pessoaLogada())?.email ?? '').toLowerCase();
  const tela = $('#tela-equipe');
  tela.addEventListener('submit', aoConvidar);
  tela.addEventListener('click', aoClicar);
  tela.addEventListener('change', aoMudarPapel);
  // Clicar fora ou Esc desfaz o "Confirmar remoção" e a pergunta do papel.
  document.addEventListener('click', (ev) => !ev.target.closest('[data-remover]') && desarmarRemover());
  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape' || telaAtual() !== 'equipe') return;
    desarmarRemover();
    cancelarPapel();
  });
  window.addEventListener('tela', () => telaAtual() === 'equipe' && desenhar());
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
  if (!lista.children.length) lista.innerHTML = htmlCarregando('Chamando a equipe…');
  try {
    e = await equipe();
  } catch (erro) {
    mostrarErro(lista, erro.message, () => desenhar(), 'Não deu para carregar a equipe');
    return;
  }
  $('#equipe-convidar').hidden = !e.souDono;
  const donos = e.membros.filter((m) => m.papel === 'dono').length;
  // o dono troca o papel de cada pessoa (inclusive o próprio, se não for o único dono); o membro só lê o papel
  const papel = (m) => {
    const souEu = m.email.toLowerCase() === eu;
    if (!e.souDono || (souEu && m.papel === 'dono' && donos === 1)) return '';
    const opcao = (v) => `<label><input type="radio" name="papel-${esc(m.usuarioId)}" value="${v}"${m.papel === v ? ' checked' : ''}><span>${PAPEL[v]}</span></label>`;
    return `<div class="alternar papel" role="radiogroup" aria-label="Papel de ${esc(m.email)}" data-papel="${esc(m.usuarioId)}" data-email="${esc(m.email)}" data-antes="${esc(m.papel)}">${opcao('membro')}${opcao('dono')}</div>`;
  };
  const pessoa = (m) => `
    <li class="pessoa">
      <span class="pessoa-nome"><span><strong>${esc(m.email)}</strong>${m.email.toLowerCase() === eu ? ' (você)' : ''}</span>
        <small class="dica">${PAPEL[m.papel] ?? esc(m.papel)} · desde ${dia(m.entrouEm)}</small></span>
      <span class="pessoa-acoes">${papel(m)}${e.souDono && m.email.toLowerCase() !== eu ? `<button type="button" class="botao pequeno" data-remover="${esc(m.usuarioId)}" data-email="${esc(m.email)}">Remover</button>` : ''}</span>
    </li>`;
  const convite = (c) => `
    <li class="pessoa">
      <span class="pessoa-nome"><strong>${esc(c.email)}</strong>
        <small class="dica">${PAPEL[c.papel] ?? esc(c.papel)} · convite de ${dia(c.convidadoEm)}, ainda não entrou</small></span>
      <button type="button" class="botao pequeno" data-cancelar="${esc(c.email)}">Cancelar convite</button>
    </li>`;
  lista.innerHTML = `
    <h2>Pessoas (${e.membros.length})</h2>
    <p class="dica">O admin pode a mais: convidar e remover pessoas, mudar papéis e renomear a empresa.</p>
    <ul class="lista-pessoas">${e.membros.map(pessoa).join('')}</ul>
    ${e.souDono && e.convites.length ? `<h2>Convites pendentes (${e.convites.length})</h2><ul class="lista-pessoas">${e.convites.map(convite).join('')}</ul>` : ''}
    ${e.membros.length === 1 && !e.convites.length ? htmlVazio('equipe', 'Por enquanto é só você.', e.souDono ? 'Convide alguém acima para dividir a juba.' : '') : ''}
    ${e.souDono ? '' : '<p class="dica">Só o admin da empresa convida e remove pessoas.</p>'}`;
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
    await convidar(email, $('input[name=convite-papel]:checked').value);
    campo.value = '';
    estado(`Convite feito. Avise ${email}: é só abrir o Calculéo, tocar em "Primeiro acesso? Crie sua senha" e usar este e-mail.`);
    await desenhar();
  } catch (erro) {
    estado(erro.message, true);
  }
}

// Mudar papel não grava na hora: a própria linha pergunta, com Salvar e Cancelar (sem caixa do navegador).
function aoMudarPapel(ev) {
  const grupo = ev.target.closest('[data-papel]');
  if (!grupo) return;
  cancelarPapel(); // só uma pergunta aberta por vez
  if (ev.target.value === grupo.dataset.antes) return;
  grupo.insertAdjacentHTML('afterend', `<span class="confirmar-papel" data-confirmar-papel="${esc(grupo.dataset.papel)}">
    <span>Tornar ${esc(grupo.dataset.email)} ${PAPEL[ev.target.value]}?</span>
    <button type="button" class="botao principal pequeno" data-acao="salvar-papel">Salvar</button>
    <button type="button" class="botao pequeno" data-acao="cancelar-papel">Cancelar</button>
  </span>`);
}

// Fecha a pergunta aberta e volta o seletor ao papel de antes.
function cancelarPapel() {
  const aberta = document.querySelector('[data-confirmar-papel]');
  if (!aberta) return;
  const grupo = document.querySelector(`[data-papel="${CSS.escape(aberta.dataset.confirmarPapel)}"]`);
  const antes = grupo?.querySelector(`input[value="${grupo.dataset.antes}"]`);
  if (antes) antes.checked = true;
  aberta.remove();
}

async function salvarPapel(aberta) {
  const grupo = document.querySelector(`[data-papel="${CSS.escape(aberta.dataset.confirmarPapel)}"]`);
  const novo = grupo.querySelector('input:checked').value;
  const voltar = () => (grupo.querySelector(`input[value="${grupo.dataset.antes}"]`).checked = true);
  aberta.querySelectorAll('button').forEach((b) => (b.disabled = true));
  try {
    await mudarPapel(grupo.dataset.papel, novo);
    mostrarAviso(`Papel atualizado: ${grupo.dataset.email} agora é ${PAPEL[novo]}.`);
    await desenhar();
    const igual = document.querySelector(`[data-papel="${CSS.escape(grupo.dataset.papel)}"] input:checked`);
    (igual ?? $('#equipe-estado')).focus(); // se os botões de dono sumiram (rebaixou a si mesmo), o foco vai para o estado
  } catch (erro) {
    voltar();
    aberta.remove();
    estado(erro.message, true);
  }
}

// Remover: o mesmo padrão do Excluir de Meus Produtos. 1º clique pergunta no próprio botão; 2º remove.
const PERGUNTA_REMOVER = 'Confirmar remoção';
function desarmarRemover(menos) {
  document.querySelectorAll('[data-remover][data-confirmar="sim"]').forEach((b) => {
    if (b === menos) return;
    delete b.dataset.confirmar;
    b.classList.remove('perigo', 'confirmar');
    b.textContent = 'Remover';
  });
}

async function aoClicar(ev) {
  const acao = ev.target.closest('[data-acao]')?.dataset.acao;
  if (acao === 'cancelar-papel') return cancelarPapel();
  if (acao === 'salvar-papel') return salvarPapel(ev.target.closest('[data-confirmar-papel]'));
  const b = ev.target.closest('[data-remover], [data-cancelar]');
  if (!b) return;
  try {
    if (b.dataset.remover) {
      if (b.dataset.confirmar !== 'sim') {
        desarmarRemover(b);
        b.dataset.confirmar = 'sim';
        b.classList.add('perigo', 'confirmar');
        b.textContent = PERGUNTA_REMOVER;
        return;
      }
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
