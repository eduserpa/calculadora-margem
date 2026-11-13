// Aviso geral (#aviso-geral) como balão flutuante no topo: fecha no ×, some sozinho (aviso em 6 s; erro em 10 s, para dar tempo de
// ler; Eduardo 13/11) e não some enquanto o mouse ou o foco estão nele. Quem escreve o aviso continua sendo aviso() do app.js; aqui só se observa.
// Barrinha de tempo (Eduardo 13/11): esvazia em TEMPO no rodapé do balão; pausa e retoma junto com o relógio (mouse/foco) e
// recomeça cheia a cada aviso novo. O CSS (.toast.com-tempo) desenha: roxa no aviso, vermelho escuro no erro; quem pede menos
// movimento fica sem barra (o aviso some igual).
const TEMPO = 6000;
const TEMPO_ERRO = 10000;

// Para as telas (o app.js tem o seu aviso()): texto no balão, com o leão de "salvo" por padrão.
export function mostrarAviso(texto, mascote = 'salvo') {
  const a = document.getElementById('aviso-geral');
  a.textContent = texto;
  a.classList.add('ok');
  a.dataset.mascote = mascote;
  a.hidden = false;
}

export function iniciarAviso() {
  const caixa = document.getElementById('toast');
  const aviso = document.getElementById('aviso-geral');
  let tempo = null;
  let inicio = 0;
  let resta = TEMPO;
  const emCima = () => caixa.matches(':hover, :focus-within');
  const some = () => !aviso.hidden && aviso.textContent.trim() !== '';
  const duracao = () => (aviso.classList.contains('ok') ? TEMPO : TEMPO_ERRO);
  const fechar = () => {
    clearTimeout(tempo);
    tempo = null;
    aviso.hidden = true;
  };
  const rodar = () => {
    inicio = Date.now();
    tempo = setTimeout(fechar, resta);
    caixa.classList.remove('pausado');
  };
  const pausar = () => {
    if (!tempo) return;
    clearTimeout(tempo);
    tempo = null;
    resta -= Date.now() - inicio;
    caixa.classList.add('pausado');
  };
  // aviso novo (ou que mudou): relógio e barra cheios de novo
  const novo = () => {
    clearTimeout(tempo);
    tempo = null;
    resta = duracao();
    caixa.classList.remove('com-tempo', 'pausado');
    if (!some()) return;
    caixa.style.setProperty('--tempo', `${resta}ms`);
    void caixa.offsetWidth; // recomeça a animação da barra
    caixa.classList.add('com-tempo');
    if (emCima()) caixa.classList.add('pausado');
    else rodar();
  };
  const retomar = () => {
    if (some() && !tempo && !emCima()) rodar();
  };
  caixa.querySelector('.toast-fechar').addEventListener('click', fechar);
  caixa.addEventListener('mouseenter', pausar);
  caixa.addEventListener('focusin', pausar);
  caixa.addEventListener('mouseleave', retomar);
  caixa.addEventListener('focusout', () => setTimeout(retomar));
  new MutationObserver(novo).observe(aviso, { attributes: true, attributeFilter: ['hidden', 'class'], childList: true, characterData: true, subtree: true });
  novo();
}
