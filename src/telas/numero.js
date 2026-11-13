// Campo de número numa peça só: [−][ 20 % ][+] (desenho do seletor de quantidade da Conceito, em camadas).
// − e + (e as setas ↑ ↓ no campo de texto) mudam de 1 em 1 dentro do min/max e disparam o mesmo 'input' da digitação,
// então quem já ouve o campo (slider ligado, cálculo, rascunho da janela) não muda nada. Um listener só, no document:
// vale também para as janelas que redesenham o HTML.
import { lerNumero } from '../formato.js';

// HTML da peça em volta de um <input> já pronto. unidade: '%' (sufixo, com − e +) ou 'R$' (prefixo, sem botões).
export function campoNumero(input, unidade = '%', rotulo = 'o valor') {
  if (unidade === 'R$') return `<span class="passo-numero"><span class="passo-numero-un" aria-hidden="true">R$</span>${input}</span>`;
  // o input vem primeiro: dentro de <label>, o 1º elemento rotulável é o que leva o rótulo (o − vai para a esquerda pelo CSS)
  return `<span class="passo-numero">${input}<span class="passo-numero-un" aria-hidden="true">${unidade}</span>${botao(-1, rotulo)}${botao(1, rotulo)}</span>`;
}
const botao = (passo, rotulo) =>
  `<button type="button" class="passo-numero-btn" data-passo="${passo}" tabindex="-1" aria-label="${passo > 0 ? 'Aumentar' : 'Diminuir'} ${rotulo}">${passo > 0 ? '+' : '−'}</button>`;

function passar(campo, passo) {
  const lim = (k) => { const v = campo.getAttribute(k) ?? campo.dataset[k]; return v == null || v === '' ? null : Number(v); };
  let n = Math.round((lerNumero(campo.value) + passo) * 100) / 100;
  if (lim('min') != null) n = Math.max(lim('min'), n);
  if (lim('max') != null) n = Math.min(lim('max'), n);
  campo.value = campo.type === 'number' ? String(n) : n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  campo.dispatchEvent(new Event('input', { bubbles: true }));
}

document.addEventListener('mousedown', (e) => e.target.closest('[data-passo]') && e.preventDefault()); // o foco fica no campo
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-passo]');
  if (b) passar(b.parentElement.querySelector('input'), Number(b.dataset.passo));
});
// type="number" já sobe e desce com as setas; o campo de texto (vírgula decimal) ganha o mesmo aqui
document.addEventListener('keydown', (e) => {
  const c = e.target;
  if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && c.type === 'text' && c.parentElement?.querySelector(':scope > [data-passo]')) {
    e.preventDefault();
    passar(c, e.key === 'ArrowUp' ? 1 : -1);
  }
});
