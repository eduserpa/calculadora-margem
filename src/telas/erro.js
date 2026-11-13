// Estado de erro reaproveitável (falha ao salvar ou carregar, sem internet): o leão com a calculadora soltando fumaça,
// o que aconteceu em uma frase e "Tentar de novo". O mascote é decorativo (alt vazio); o texto diz o que importa.
import { esc } from '../formato.js';
import { imgMascote } from './mascote.js';

export const SEM_INTERNET = 'Sem internet. O leão espera a conexão voltar.';

export function htmlErro(texto, titulo = 'A calculadora engasgou') {
  return `
    <div class="estado-erro" role="alert">
      ${imgMascote('erro')}
      <div>
        <h2>${esc(titulo)}</h2>
        <p>${esc(texto)}</p>
        <button type="button" class="botao principal" data-tentar>Tentar de novo</button>
      </div>
    </div>`;
}

// Mostra o erro dentro de `onde`; o botão chama aoTentar (que redesenha o lugar).
export function mostrarErro(onde, texto, aoTentar, titulo) {
  onde.innerHTML = htmlErro(navigator.onLine === false ? SEM_INTERNET : texto, titulo);
  onde.querySelector('[data-tentar]').addEventListener('click', aoTentar, { once: true });
}
