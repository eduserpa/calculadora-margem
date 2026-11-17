// Lista oficial das categorias do Mercado Livre com comissão menor (data/ml-categorias.json): [caminho, pontos Premium, pontos
// Clássico]. Carregada uma vez no início: o cálculo de um produto com categoria própria precisa dela (Eduardo 17/11, correção 20).
export const OUTRA = 'Outra categoria (sem redução)';
export let categoriasMl = null; // null = ainda não carregou (ou falhou): a categoria do produto não muda a conta, fica a do canal
let pedido = null;
export const carregarCategoriasMl = () => (pedido ??= fetch('data/ml-categorias.json').then((r) => r.json())
  .then((j) => (categoriasMl = j.categorias)).catch(() => { pedido = null; }));
export const usarCategoriasMl = (lista) => (categoriasMl = lista); // testes

// Pontos a menos da categoria ({ premium, classico }); fora da lista (e "Outra") não tem redução. null = lista não carregada.
export function reducaoDaCategoria(nome) {
  if (!categoriasMl) return null;
  const c = categoriasMl.find((x) => x[0] === nome);
  return c ? { premium: c[1], classico: c[2] } : { premium: 0, classico: 0 };
}
