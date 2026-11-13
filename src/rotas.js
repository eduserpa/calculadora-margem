// Telas por endereço normal (/produtos), com Voltar e Avançar do navegador. O endereço antigo (/#produtos, de favoritos e
// links já enviados) vira o novo. O # que o Supabase põe na volta do e-mail (#access_token=…, #type=recovery) não é tela.
const TELA_DO_CAMINHO = { inicio: 'inicio', calculadora: 'calculadora', produtos: 'produtos', taxas: 'configuracoes', configuracoes: 'configuracoes', equipe: 'equipe', historico: 'historico', novidades: 'novidades' };
const CAMINHO_DA_TELA = { configuracoes: 'taxas' }; // onde o caminho não é o nome da tela

export const caminhoDaTela = (tela) => `/${CAMINHO_DA_TELA[tela] ?? tela}`;
export const telaAtual = () => TELA_DO_CAMINHO[location.pathname.split('/')[1]] ?? 'inicio';

// Avisa quem desenha uma tela ao abrir (Início, Equipe, Histórico): window.addEventListener('tela', …)
const avisar = () => window.dispatchEvent(new Event('tela'));

export function irPara(tela) {
  if (location.pathname !== caminhoDaTela(tela)) history.pushState(null, '', caminhoDaTela(tela));
  avisar();
}

export function ligarRotas() {
  const antigo = location.hash.match(/^#([a-z]+)$/)?.[1];
  if (antigo && TELA_DO_CAMINHO[antigo]) history.replaceState(null, '', caminhoDaTela(TELA_DO_CAMINHO[antigo]));
  // Um listener só: clique em link interno (/produtos) troca a tela sem recarregar a página.
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="/"]');
    if (!a || a.target || a.hasAttribute('download') || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const tela = TELA_DO_CAMINHO[new URL(a.href).pathname.split('/')[1] || 'inicio'];
    if (!tela) return;
    e.preventDefault();
    irPara(tela);
  });
  window.addEventListener('popstate', avisar);
}
