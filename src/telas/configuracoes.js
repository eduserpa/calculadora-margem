// Tela Taxas dos Canais: um cartão por canal (ícone, nome e o que ele cobra), com "Personalizado" quando a empresa mudou
// alguma taxa. "Editar" abre a mesma janela Configurar da Calculadora (um formulário só para os dois lugares).
import { dados, salvar, canais, canaisDePadrao } from '../dados.js';
import { linhasDoCanal, iconeDoCanal } from '../canais-texto.js';
import { comissoesProprias } from '../calculos/canal.js';
import { abrirConfigurarCanal } from './configurar-canal.js';
import { icone } from '../icones.js';
import { esc } from '../formato.js';

const $ = (s) => document.querySelector(s);

export function iniciarConfiguracoes() {
  if (!canais()) return;
  $('#tela-configuracoes').addEventListener('click', aoClicar);
  // Clicar fora ou Esc desfaz o "Confirmar: voltar tudo ao padrão".
  document.addEventListener('click', (ev) => !ev.target.closest('#cfg-padrao-tudo') && desarmarPadrao());
  document.addEventListener('keydown', (ev) => ev.key === 'Escape' && desarmarPadrao());
  desenhar();
}

// Chamado quando os dados mudam (janela Configurar salvou, importação, outra empresa).
export function aoMudarDados() {
  if (canais()) desenhar();
}

// Mesmo conteúdo, sem ligar para a ordem das chaves (o banco reordena) nem para o formato antigo da comissão própria do ML.
const normal = (c) => (c?.tipo === 'mercadolivre' ? { ...c, comissao_propria: comissoesProprias(c) } : c);
function igual(a, b) {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return Number.isNaN(a) && Number.isNaN(b);
  const chaves = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...chaves].every((k) => igual(a[k] ?? null, b[k] ?? null));
}
function personalizado(id, padrao) {
  if (!dados.canais?.[id]) return false;
  const salvo = { ...normal(dados.canais[id]), impostosProprio: null };
  const base = { ...normal(padrao[id]), impostosProprio: null };
  // Com imposto da empresa, canal sem imposto próprio herda o dela: esse imposto não conta como mudança do canal.
  if (dados.empresa?.impostos != null && !dados.canais[id].impostosProprio) salvo.impostos = base.impostos;
  return !igual(salvo, base);
}

function desenhar() {
  const padrao = canaisDePadrao();
  const ids = Object.keys(canais());
  const mudados = ids.filter((id) => personalizado(id, padrao));
  $('#lista-canais').innerHTML = `<div class="canais">${ids.map((id) => {
    const c = canais()[id];
    return `
      <div class="canal-caixa">
        <div class="canal">
          ${iconeDoCanal(id, c)}
          <span class="canal-nome">${esc(c.nome)}</span>
          ${mudados.includes(id) ? '<span class="etiqueta">Personalizado</span>' : ''}
          <span class="canal-linhas">${linhasDoCanal(c, true)}</span>
          <button type="button" class="botao pequeno" data-editar-canal="${id}">${icone('settings')} Editar</button>
        </div>
      </div>`;
  }).join('')}</div>`;
  $('#cfg-estado').textContent = mudados.length ? `${mudados.length} canal(is) com taxas da empresa; os outros usam o padrão.` : 'Usando as taxas padrão.';
  $('#cfg-padrao-tudo').hidden = !mudados.length;
}

const PERGUNTA_PADRAO = 'Confirmar: voltar tudo ao padrão';
function desarmarPadrao() {
  const b = $('#cfg-padrao-tudo');
  if (b?.dataset.confirmar !== 'sim') return;
  delete b.dataset.confirmar;
  b.classList.remove('perigo', 'confirmar');
  b.textContent = 'Voltar tudo ao padrão';
}

function aoClicar(ev) {
  const editar = ev.target.closest('[data-editar-canal]');
  if (editar) return abrirConfigurarCanal(editar.dataset.editarCanal);
  const b = ev.target.closest('#cfg-padrao-tudo');
  if (!b) return;
  // Mesmo padrão do Excluir: 1º clique pergunta no próprio botão, 2º aplica.
  if (b.dataset.confirmar !== 'sim') {
    b.dataset.confirmar = 'sim';
    b.classList.add('perigo', 'confirmar');
    b.textContent = PERGUNTA_PADRAO;
    return;
  }
  desarmarPadrao();
  dados.canais = null; // o imposto da empresa (dados.empresa) continua
  salvar();
}
