// Tela Empresa (endereço /empresa; no código, "equipe"), parte das pessoas: uma lista só com quem está na empresa e os
// convites pendentes. O admin convida (janela), muda o papel e remove; o membro só vê a lista.
// Quem barra o membro é o banco (RLS); aqui o membro só não vê os botões. O cabeçalho da empresa é do empresa.js.
import { equipe, convidar, cancelarConvite, removerMembro, mudarPapel, pessoaLogada } from '../nuvem.js';
import { esc } from '../formato.js';
import { icone } from '../icones.js';
import { telaAtual } from '../rotas.js';
import { mostrarErro } from './erro.js';
import { htmlVazio, htmlCarregando } from './mascote.js';
import { mostrarAviso } from './aviso.js';

const $ = (s) => document.querySelector(s);
const PAPEL = { dono: 'Admin', membro: 'Membro' };
const dia = (iso) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '');
const contar = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
let eu = '';
let resumo = ''; // "3 pessoas · 1 convite pendente", para o cabeçalho da empresa

// O cabeçalho (empresa.js) mostra o resumo ao se redesenhar; aqui ele é atualizado quando a lista muda.
export const resumoEquipe = () => resumo;

export async function iniciarEquipe() {
  eu = ((await pessoaLogada())?.email ?? '').toLowerCase();
  const tela = $('#tela-equipe');
  tela.addEventListener('click', aoClicar);
  tela.addEventListener('change', aoMudarPapel);
  // Clicar fora ou Esc desfaz o "Confirmar remoção" e a pergunta do papel.
  // composedPath: o ícone clicado some quando a lixeira vira 'Confirmar remoção', e aí o closest() não acha mais o botão
  document.addEventListener('click', (ev) => !ev.composedPath().some((n) => n.dataset?.remover) && desarmarRemover());
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

const botaoRemover = (m) =>
  `<button type="button" class="botao pequeno perigo" data-remover="${esc(m.usuarioId)}" data-email="${esc(m.email)}" aria-label="Remover ${esc(m.email)}" title="Remover">${icone('trash-2')}</button>`;

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
  resumo = contar(e.membros.length, 'pessoa', 'pessoas') + (e.convites.length ? ` · ${contar(e.convites.length, 'convite pendente', 'convites pendentes')}` : '');
  const r = $('#empresa-resumo');
  if (r) r.textContent = ` · ${resumo}`;
  const donos = e.membros.filter((m) => m.papel === 'dono').length;
  // o dono troca o papel de cada pessoa (inclusive o próprio, se não for o único dono); o membro só lê o papel
  const papel = (m) => {
    const souEu = m.email.toLowerCase() === eu;
    if (!e.souDono || (souEu && m.papel === 'dono' && donos === 1)) return `<span class="pilula">${PAPEL[m.papel] ?? esc(m.papel)}</span>`;
    const opcao = (v) => `<label><input type="radio" name="papel-${esc(m.usuarioId)}" value="${v}"${m.papel === v ? ' checked' : ''}><span>${PAPEL[v]}</span></label>`;
    return `<div class="alternar papel" role="radiogroup" aria-label="Papel de ${esc(m.email)}" data-papel="${esc(m.usuarioId)}" data-email="${esc(m.email)}" data-antes="${esc(m.papel)}">${opcao('membro')}${opcao('dono')}</div>`;
  };
  const pessoa = (m) => {
    const souEu = m.email.toLowerCase() === eu;
    return `
    <li class="pessoa">
      <span class="avatar-pessoa" aria-hidden="true">${esc(m.email[0]?.toUpperCase() ?? '?')}</span>
      <span class="pessoa-nome"><span><strong>${esc(m.email)}</strong>${souEu ? ' (você)' : ''}</span>
        <small class="dica">Na empresa desde ${dia(m.entrouEm)}</small></span>
      <span class="pessoa-acoes">${papel(m)}${e.souDono && !souEu ? botaoRemover(m) : ''}</span>
    </li>`;
  };
  const convite = (c) => `
    <li class="pessoa convite">
      <span class="avatar-pessoa" aria-hidden="true">${esc(c.email[0]?.toUpperCase() ?? '?')}</span>
      <span class="pessoa-nome"><strong>${esc(c.email)}</strong>
        <small class="dica">Convite pendente · ${PAPEL[c.papel] ?? esc(c.papel)} · enviado em ${dia(c.convidadoEm)}</small></span>
      <span class="pessoa-acoes"><button type="button" class="botao pequeno" data-cancelar="${esc(c.email)}">Cancelar convite</button></span>
    </li>`;
  lista.innerHTML = `
    <div class="cartao-topo">
      <h2>Pessoas</h2>
      ${e.souDono ? `<button type="button" class="botao principal" data-acao="convidar">${icone('plus')} Convidar pessoa</button>` : ''}
    </div>
    <ul class="lista-pessoas">${e.membros.map(pessoa).join('')}${e.convites.map(convite).join('')}</ul>
    ${e.membros.length === 1 && !e.convites.length ? htmlVazio('equipe', 'Por enquanto é só você.', e.souDono ? 'Convide alguém para dividir a juba.' : '') : ''}
    <p class="dica">Membro: usa a calculadora e os produtos. Admin: também convida, remove e edita a empresa.</p>`;
}

// Janela "Convidar pessoa" (mesmo padrão das janelas de empresa): e-mail e papel.
function janelaConvite() {
  const j = $('#janela-convite');
  j.innerHTML = `
    <form method="dialog" novalidate>
      <div class="janela-topo">
        <h3 id="titulo-convite">Convidar pessoa</h3>
        <button type="button" class="fechar" data-acao="fechar" aria-label="Fechar">${icone('x')}</button>
      </div>
      <div class="janela-corpo">
        <label class="campo"><span>E-mail</span><input type="email" class="campo-texto" name="email" autocomplete="off" required placeholder="nome@empresa.com.br"></label>
        <div class="campo"><span id="convite-papel-rotulo">Papel</span>
          <div class="alternar" role="radiogroup" aria-labelledby="convite-papel-rotulo"><label><input type="radio" name="papel" value="membro" checked><span>Membro</span></label><label><input type="radio" name="papel" value="dono"><span>Admin</span></label></div>
        </div>
        <p class="dica">A pessoa entra abrindo o Calculéo com este e-mail e tocando em "Primeiro acesso? Crie sua senha".</p>
        <p class="erro" role="alert" hidden></p>
      </div>
      <div class="janela-base"><div class="direita">
        <button type="button" class="botao" data-acao="fechar">Cancelar</button>
        <button type="submit" class="botao principal">Convidar</button>
      </div></div>
    </form>`;
  const erro = (t) => {
    j.querySelector('.erro').textContent = t;
    j.querySelector('.erro').hidden = !t;
  };
  j.onclick = (ev) => ev.target.closest('[data-acao=fechar]') && j.close();
  j.onsubmit = async (ev) => {
    ev.preventDefault();
    const campo = j.querySelector('[name=email]');
    const email = campo.value.trim().toLowerCase();
    if (!campo.checkValidity() || !email) {
      erro('Digite um e-mail válido, por exemplo nome@empresa.com.br.');
      return campo.focus();
    }
    const botao = j.querySelector('[type=submit]');
    botao.disabled = true;
    try {
      await convidar(email, j.querySelector('[name=papel]:checked').value);
      j.close();
      estado(`Convite feito. Avise ${email}: é só abrir o Calculéo, tocar em "Primeiro acesso? Crie sua senha" e usar este e-mail.`);
      await desenhar();
      $('#equipe-lista [data-acao=convidar]')?.focus();
    } catch (x) {
      erro(x.message);
      botao.disabled = false;
    }
  };
  j.showModal();
  j.querySelector('[name=email]').focus();
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

// Remover: o mesmo padrão do Excluir de Meus Produtos. 1º clique na lixeira pergunta no próprio botão; 2º remove.
const PERGUNTA_REMOVER = 'Confirmar remoção';
function desarmarRemover(menos) {
  document.querySelectorAll('[data-remover][data-confirmar="sim"]').forEach((b) => {
    if (b === menos) return;
    delete b.dataset.confirmar;
    b.classList.remove('confirmar');
    b.innerHTML = icone('trash-2');
    b.setAttribute('aria-label', `Remover ${b.dataset.email}`);
  });
}

async function aoClicar(ev) {
  const acao = ev.target.closest('[data-acao]')?.dataset.acao;
  if (acao === 'convidar') return janelaConvite();
  if (acao === 'cancelar-papel') return cancelarPapel();
  if (acao === 'salvar-papel') return salvarPapel(ev.target.closest('[data-confirmar-papel]'));
  const b = ev.target.closest('[data-remover], [data-cancelar]');
  if (!b) return;
  try {
    if (b.dataset.remover) {
      if (b.dataset.confirmar !== 'sim') {
        desarmarRemover(b);
        b.dataset.confirmar = 'sim';
        b.classList.add('confirmar');
        b.textContent = PERGUNTA_REMOVER;
        b.setAttribute('aria-label', `${PERGUNTA_REMOVER} de ${b.dataset.email}`);
        return;
      }
      await removerMembro(b.dataset.remover);
      estado(`${b.dataset.email} saiu da empresa.`);
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
