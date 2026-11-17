// Link secreto de convite ou de senha nova (Eduardo 17/11: sem e-mail; vale 24 h e uma vez; gerar outro cancela o anterior).
// Janela com o link num campo só leitura, "Copiar link" e "Mandar no WhatsApp" (mensagem pronta). Plataforma e tela Empresa.
import { esc } from '../formato.js';
import { icone } from '../icones.js';

// Área de transferência; sem permissão (http, navegador antigo) seleciona o campo, para o Ctrl+C (ou o Copiar do celular).
export async function copiar(texto, campo) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    campo?.select();
    return false;
  }
}

export const mensagemDoLink = ({ tipo, empresa, link }) => (tipo === 'senha'
  ? `Olá! Este é o seu link para criar uma senha nova no Calculéo${empresa ? ` (${empresa})` : ''}. Abra e escolha a senha. O link vale 24 horas e só funciona uma vez: ${link}`
  : `Olá! Você foi convidado(a) para usar o Calculéo, a calculadora de margem${empresa ? ` da ${empresa}` : ''}. Abra este link para entrar e criar a sua senha. Ele vale 24 horas e só funciona uma vez: ${link}`);

// O link não saiu (sem internet, a função recusou, o servidor falhou): a janela fica aberta com o erro e "Tentar de novo"
// (nunca fecha calada; Eduardo 17/11). tentar = pedir o link de novo, e só ele (ex.: a empresa já foi criada).
export function janelaErroLink(j, { tipo, texto, erro, tentar }) {
  j.innerHTML = `
    <form method="dialog">
      <div class="janela-topo">
        <h3 id="${esc(j.getAttribute('aria-labelledby'))}">${tipo === 'senha' ? 'Link de senha nova' : 'Link do convite'}</h3>
        <button type="button" class="fechar" data-acao="fechar" aria-label="Fechar">${icone('x')}</button>
      </div>
      <div class="janela-corpo">${texto ? `<p>${esc(texto)}</p>` : ''}<p class="erro" role="alert">${esc(erro)}</p></div>
      <div class="janela-base"><div class="direita">
        <button type="button" class="botao" data-acao="fechar">Fechar</button>
        <button type="button" class="botao principal" data-acao="tentar">Tentar de novo</button>
      </div></div>
    </form>`;
  j.onsubmit = (ev) => ev.preventDefault();
  j.onclick = async (ev) => {
    if (ev.target.closest('[data-acao=fechar]')) return j.close();
    const b = ev.target.closest('[data-acao=tentar]');
    if (!b) return;
    b.disabled = true;
    b.textContent = 'Gerando…';
    await tentar();
  };
  if (!j.open) j.showModal();
  j.querySelector('[data-acao=tentar]').focus();
}

// E-mail que já tem conta com senha: a função não gera link (seria entrar na conta da pessoa); o convite fica salvo e ela entra
// com o e-mail e a senha dela. A janela diz isso, com OK (Eduardo 17/11: fechar calada parecia "não faz nada").
export function janelaTemConta(j, { tipo, email }) {
  j.innerHTML = `
    <form method="dialog">
      <div class="janela-topo">
        <h3 id="${esc(j.getAttribute('aria-labelledby'))}">${tipo === 'senha' ? 'Link de senha nova' : 'Link do convite'}</h3>
        <button type="button" class="fechar" data-acao="fechar" aria-label="Fechar">${icone('x')}</button>
      </div>
      <div class="janela-corpo"><p><strong>${esc(email)}</strong></p><p>Este e-mail já tem conta no Calculéo. Ele já entra na empresa com o e-mail e a senha dele; não precisa de link.</p></div>
      <div class="janela-base"><div class="direita"><button type="button" class="botao principal" data-acao="fechar">OK</button></div></div>
    </form>`;
  j.onsubmit = (ev) => ev.preventDefault();
  j.onclick = (ev) => ev.target.closest('[data-acao=fechar]') && j.close();
  if (!j.open) j.showModal();
  j.querySelector('.janela-base [data-acao=fechar]').focus();
}

// Pede o link e abre a janela dele. pedir() devolve o link; null = já tem conta (janela que diz isso); undefined = não houve link
// (a gerar-link não existe e foi feito o convite de antes: a janela fecha e quem chamou avisa em aoSemLink). Erro -> a janela de
// erro com "Tentar de novo".
export async function abrirLink(j, pedir, opcoes) {
  let link;
  try {
    link = await pedir();
  } catch (x) {
    janelaErroLink(j, { tipo: opcoes.tipo, texto: opcoes.texto, erro: x.message, tentar: () => abrirLink(j, pedir, opcoes) });
    return;
  }
  if (link) return janelaLink(j, { tipo: opcoes.tipo, email: opcoes.email, empresa: opcoes.empresa, link });
  if (link === null) return janelaTemConta(j, { tipo: opcoes.tipo, email: opcoes.email });
  if (j.open) j.close();
  opcoes.aoSemLink?.();
}

// j: o <dialog> da tela (o h3 usa o id do aria-labelledby dele)
export function janelaLink(j, { tipo, email, empresa, link }) {
  j.innerHTML = `
    <form method="dialog">
      <div class="janela-topo">
        <h3 id="${esc(j.getAttribute('aria-labelledby'))}">${tipo === 'senha' ? 'Link de senha nova' : 'Link do convite'}</h3>
        <button type="button" class="fechar" data-acao="fechar" aria-label="Fechar">${icone('x')}</button>
      </div>
      <div class="janela-corpo">
        <p>Mande este link para <strong>${esc(email)}</strong>. Ele vale <strong>24 horas</strong> e só funciona <strong>uma vez</strong>; gerar outro cancela este.</p>
        <p class="dica">Não abra este link você mesmo: ele vale uma vez e entra na conta da pessoa.</p>
        <label class="campo"><span>Link</span><input class="campo-texto" name="link" readonly value="${esc(link)}"></label>
        <p class="dica" role="status"></p>
      </div>
      <div class="janela-base"><div class="direita">
        <button type="button" class="botao" data-acao="copiar">${icone('copy')} Copiar link</button>
        <a class="botao principal" href="https://wa.me/?text=${encodeURIComponent(mensagemDoLink({ tipo, empresa, link }))}" target="_blank" rel="noopener">Mandar no WhatsApp</a>
      </div></div>
    </form>`;
  const status = j.querySelector('[role=status]');
  j.onsubmit = (ev) => ev.preventDefault();
  j.onclick = async (ev) => {
    if (ev.target.closest('[data-acao=fechar]')) return j.close();
    if (!ev.target.closest('[data-acao=copiar]')) return;
    status.textContent = (await copiar(link, j.querySelector('[name=link]'))) ? 'Link copiado.' : 'O link está selecionado: copie com Ctrl+C (no celular, toque e segure).';
  };
  if (!j.open) j.showModal();
  j.querySelector('[data-acao=copiar]').focus();
}
