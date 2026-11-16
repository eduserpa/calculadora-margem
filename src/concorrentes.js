// Concorrentes anotados à mão (correção 12): a margem e o lucro que teríamos vendendo no preço de cada um, e onde estamos
// mais caros que a concorrência. Sem rede nem tela (testado em tests/concorrentes-calculo.test.js).
import { calcularMargem } from './calculos/margem.js';

export function mediana(valores) {
  const v = [...valores].sort((a, b) => a - b);
  if (!v.length) return null;
  const meio = Math.floor(v.length / 2);
  return v.length % 2 ? v[meio] : (v[meio - 1] + v[meio]) / 2;
}

// Cada concorrente com { margem, lucro } no preço dele (mesmo canal, mesmo peso e mesmo custo do nosso produto), do mais
// barato ao mais caro, e o resumo do topo do cartão: menor, mediana, maior e quantos estão abaixo do nosso preço mínimo.
export function margensDosConcorrentes({ concorrentes, cmv, canal, pesoG, minimo = 0 }) {
  const itens = concorrentes
    .map((c) => {
      const r = calcularMargem({ preco: c.preco, cmv, canal, pesoG });
      return { ...c, margem: r.margem, lucro: r.lucro };
    })
    .sort((a, b) => a.preco - b.preco);
  const precos = itens.map((c) => c.preco);
  return {
    itens,
    menor: precos[0] ?? null,
    mediana: mediana(precos),
    maior: precos.at(-1) ?? null,
    abaixoDoMinimo: minimo > 0 ? precos.filter((p) => p < minimo).length : 0,
  };
}

// Busca de concorrentes no ML: os anúncios que o Apify devolve (Edge Function ou, na demo, servidor local) viram candidatos
// { produtoCatalogo, itemId, titulo, foto, vendedor, preco, full, freteGratis, link, vendidos }, na ordem de relevância do ML,
// sem os nossos (Conceito Metais, Lorenmetais, LP Metais, com ou sem "Loja oficial"), sem preço zerado e sem repetir anúncio.
const NOSSOS = ['CONCEITOMETAIS', 'LORENMETAIS', 'LPMETAIS'];
const precoBR = (t) => Number(String(t ?? '').replace(/\./g, '').replace(',', '.')) || 0; // '1.234,56' -> 1234.56
export function candidatosDoApify(itens, max = 20) {
  const vistos = new Set();
  return (Array.isArray(itens) ? itens : [])
    .map((i) => candidatoSeguro({
      produtoCatalogo: i.idProdutoCatalogo,
      itemId: i.idPublicacao,
      titulo: i.eTituloProduto,
      foto: i.imagemLink,
      vendedor: String(i.Vendedor ?? '').replace(/\s*Loja oficial\s*$/i, ''),
      preco: precoBR(i.novoPreco),
      full: /full/i.test(i.envio ?? ''),
      freteGratis: i.freteGratis === true,
      link: i.zProdutoLink,
      vendidos: i.quantidadeVendida,
    }))
    .filter((c) => c.preco > 0 && !NOSSOS.some((n) => c.vendedor.toUpperCase().replace(/\s/g, '').includes(n)))
    .filter((c) => !c.itemId || (!vistos.has(c.itemId) && vistos.add(c.itemId)))
    .slice(0, max);
}

// Dado de fora não é confiável: o Apify e a busca guardada (qualquer membro pode gravar direto pela API). Antes de ir para a
// tela, cada campo volta ao tipo esperado: texto é texto (a tela ainda passa por esc), número é número, link só http(s) e
// foto só https do servidor de imagens do ML. Assim nada vira HTML nem javascript: na tela.
const texto = (v, max = 300) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim().slice(0, max) : '');
export const linkSeguro = (u) => (typeof u === 'string' && /^https?:\/\/[^\s"'<>`]+$/i.test(u) ? u : null);
const fotoSegura = (u) => (typeof u === 'string' && /^https:\/\/([a-z0-9-]+\.)*mlstatic\.com\/[^\s"'<>`]+$/i.test(u) ? u : null);
export function candidatoSeguro(c) {
  const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return {
    produtoCatalogo: texto(c?.produtoCatalogo, 40) || null,
    itemId: texto(c?.itemId, 40) || null,
    titulo: texto(c?.titulo),
    foto: fotoSegura(c?.foto),
    vendedor: texto(c?.vendedor, 120) || 'Vendedor não informado',
    preco: Math.max(0, n(c?.preco)),
    full: c?.full === true,
    freteGratis: c?.freteGratis === true,
    link: linkSeguro(c?.link),
    vendidos: Math.max(0, Math.floor(n(c?.vendidos))),
  };
}

// Anúncios da busca guardada entram TODOS no cálculo; a pessoa desmarca os que não são o mesmo produto (excluidos: as chaves
// deles, guardadas por produto e mantidas no "Atualizar"). -> candidatos limpos, cada um com { chave, fora }.
export const chaveDoCandidato = (c) => c.itemId || c.link || `${c.vendedor}|${c.preco}`;
export function candidatosDaBusca(busca) {
  const fora = new Set(Array.isArray(busca?.excluidos) ? busca.excluidos.map(String) : []);
  return (Array.isArray(busca?.resultados) ? busca.resultados : [])
    .map(candidatoSeguro)
    .filter((c) => c.preco > 0)
    .map((c) => ({ ...c, chave: chaveDoCandidato(c), fora: fora.has(chaveDoCandidato(c)) }));
}

// O nome do produto é a palavra-chave da busca. Tira o que atrapalha (o SKU, "Ref", as nossas marcas, palavras de promoção,
// códigos e traços soltos). Promoção não conta como palavra: o nome só é fraco por ela se sobrar pouco.
// e diz se o nome é bom: ruim se fica vazio, é só código, é igual ao SKU, tem menos de 3 palavras ou é quase todo medidas/códigos.
// -> { boa, termo } (termo: o que vai para a busca; as medidas ficam, ajudam a achar o mesmo produto)
const NOSSAS_MARCAS = /(^|\s)(?:ref\.?|refer[eê]ncia|loren|conceito|lp)(?:\s+metais)?(?=\s|$)/gi;
const PROMOCAO = /(^|\s)(?:queima\s+de\s+estoque|promo[cç][aã]o|oferta|liquida[cç][aã]o|outlet|[uú]ltimas\s+unidades)[!.:,;-]*(?=\s|$)/gi;
const CODIGO = /^(?:\d{4,}|[a-z]{1,4}-?\d{2,}[a-z\d-]*|\d+[a-z]?-[a-z\d-]+)$/i; // 15001, CM-1060, MLB123, 13807-40
const MEDIDA = /^\d+(?:[.,]\d+)?(?:x\d+(?:[.,]\d+)?)*(?:mm|cm|m|mts?|metros?|l|ml|litros?|kg|g|pol|")?$/i; // 400, 40x102, 50cm
const soLetras = (t) => t.toLowerCase().replace(/\s+/g, '');
export function qualidadeDoNome(nome, sku = '') {
  const original = String(nome ?? '').trim();
  const codigo = String(sku ?? '').trim();
  let texto = ` ${original} `;
  if (codigo) texto = texto.split(new RegExp(codigo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')).join(' ');
  const pedacos = texto.replace(/[()[\]|]/g, ' ').replace(NOSSAS_MARCAS, ' ').replace(PROMOCAO, ' ').split(/\s+/)
    .map((p) => p.replace(/^[-–—|:;,.()[\]]+|[-–—|:;,()[\]]+$/g, '')) // traços e pontuação soltos
    .filter((p) => p && !CODIGO.test(p));
  const medidas = pedacos.filter((p) => MEDIDA.test(p)).length;
  const palavras = pedacos.filter((p) => !MEDIDA.test(p) && /\p{L}{3,}/u.test(p)).length;
  const codigos = original.split(/\s+/).filter((p) => CODIGO.test(p.replace(/[-–—|:;,.()]+$/, ''))).length;
  const termo = pedacos.join(' ');
  const boa = Boolean(termo) && soLetras(original) !== soLetras(codigo) && palavras >= 3 && medidas + codigos <= palavras;
  return { boa, termo: termo.length >= 3 ? termo : original };
}

// Início: produto e canal em que o nosso preço salvo passa da mediana dos concorrentes, da maior diferença para a menor.
// salvos = precosSalvos() (produtos.js); concorrentes = linhas de nuvem.concorrentes().
// buscas = buscas guardadas da empresa (nuvem.buscasGuardadas): os anúncios que ficaram no cálculo contam nos canais Mercado Livre.
export function maisCaroQueConcorrencia(salvos, concorrentes, buscas = []) {
  const grupos = new Map();
  concorrentes.forEach((c) => grupos.set(`${c.produtoId}|${c.canal}`, [...(grupos.get(`${c.produtoId}|${c.canal}`) ?? []), c]));
  const daBusca = new Map(buscas.map((b) => [b.produtoId, candidatosDaBusca(b).filter((c) => !c.fora)]));
  return salvos
    .flatMap((s) => {
      const lista = [...(grupos.get(`${s.produto.id}|${s.canalId}`) ?? []), ...(s.canal?.tipo === 'mercadolivre' ? daBusca.get(s.produto.id) ?? [] : [])];
      const med = mediana(lista.map((c) => c.preco));
      return med && s.preco > med ? [{ ...s, mediana: med, diferenca: s.preco - med, quantos: lista.length }] : [];
    })
    .sort((a, b) => b.diferenca / b.mediana - a.diferenca / a.mediana);
}
