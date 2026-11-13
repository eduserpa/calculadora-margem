// Tela Novidades: um cartão por versão (a mais nova em cima), lido de data/novidades.json.
import { esc } from '../formato.js';

export async function iniciarNovidades() {
  const versoes = await (await fetch('data/novidades.json')).json();
  document.querySelector('#novidades-lista').innerHTML = versoes.map((v) => `
    <article class="cartao">
      <h2>${esc(v.versao)} <small class="dica">${esc(v.data)}</small></h2>
      <ul>${v.itens.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
    </article>`).join('');
}
