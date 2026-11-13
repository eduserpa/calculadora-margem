// Planilhas em Meus Produtos: importar produtos (modelo, prévia, só grava ao confirmar) e exportar as precificações.
import { icone } from '../icones.js';
import { dados, salvar, novoId, canais } from '../dados.js';
import { modelo, decodificar, prepararImportacao, baixar, csvPrecificacoes } from '../planilha.js';
import { custoDoProduto, pesoDoProduto } from '../produtos.js';
import { calcularMargem, precoMinimo } from '../calculos/margem.js';
import { precoPor } from '../calculos/preco-de-por.js';
import { esc, reais } from '../formato.js';
import { aviso } from '../app.js';
import { anotarImportacao } from '../nuvem.js';

const janela = () => document.getElementById('janela-planilha');
let previa = null;

const MARGEM_DESEJADA = 20; // a mesma com que a Calculadora abre

export function iniciarPlanilhas() {
  document.getElementById('importar-planilha').addEventListener('click', () => desenhar(null));
  document.getElementById('exportar-precos').addEventListener('click', exportarPrecificacoes);
  const j = janela();
  j.addEventListener('click', (e) => {
    const acao = e.target.closest('[data-acao]')?.dataset.acao;
    if (acao === 'fechar') j.close();
    if (acao === 'modelo') baixar('modelo-produtos.csv', modelo());
    if (acao === 'escolher') j.querySelector('input[type=file]').click();
    if (acao === 'outro') desenhar(null);
    if (acao === 'gravar') gravar();
  });
  j.addEventListener('change', async (e) => {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;
    const texto = decodificar(new Uint8Array(await arquivo.arrayBuffer()));
    desenhar(prepararImportacao(texto, dados.produtos, novoId));
  });
}

function desenhar(p, erro = '') {
  previa = p;
  const quantos = p ? total(p) : 0;
  janela().innerHTML = `
    <div class="janela-topo">
      <h3 id="titulo-planilha">Importar planilha</h3>
      <button type="button" class="fechar" data-acao="fechar" aria-label="Fechar">${icone('x')}</button>
    </div>
    <div class="janela-corpo">
      ${p
        ? `<p role="status"><strong>${p.novos.length}</strong> novo(s) · <strong>${p.atualizados.length}</strong> atualizado(s) pelo SKU · <strong>${p.erros.length}</strong> linha(s) com erro</p>
           ${quantos ? `<ul class="lista-previa">${[...p.novos.map((n) => `<li>Novo: ${nomeComSku(n)}</li>`), ...p.atualizados.map(linhaAtualizado)].slice(0, 50).join('')}</ul>${quantos > 50 ? `<p class="dica">e mais ${quantos - 50}.</p>` : ''}` : ''}
           ${p.erros.length ? `<ul class="lista-erros">${p.erros.slice(0, 50).map((e) => `<li>Linha ${e.linha}: ${esc(e.motivo)}</li>`).join('')}</ul>${p.erros.length > 50 ? `<p class="dica">e mais ${p.erros.length - 50}.</p>` : ''}` : ''}
           ${p.erros.length && quantos ? '<p class="dica">As linhas com erro ficam de fora.</p>' : ''}`
        : `<p>Uma linha por produto. Se o SKU já existir, o produto é atualizado; célula vazia mantém o valor de hoje.</p>
           <p class="dica">Colunas do modelo: nome, sku, tipo (revenda ou fabricante), custo (R$), peso_g, comprimento_cm, largura_cm, altura_cm e foto_url. Só nome e custo são obrigatórios. No Excel: Arquivo › Salvar como › CSV.</p>
           <div class="acoes-planilha">
             <button type="button" class="botao" data-acao="modelo">${icone('download')} Baixar modelo</button>
             <button type="button" class="botao principal" data-acao="escolher">${icone('upload')} Escolher arquivo CSV</button><input type="file" accept=".csv,text/csv" hidden>
           </div>`}
      ${erro ? `<p class="erro" role="alert">${esc(erro)}</p>` : ''}
    </div>
    <div class="janela-base"><div class="direita">
      ${p ? '<button type="button" class="botao" data-acao="outro">Outro arquivo</button>' : ''}
      ${quantos ? `<button type="button" class="botao principal" data-acao="gravar">Importar ${quantos} produto(s)</button>` : ''}
    </div></div>`;
  if (!janela().open) janela().showModal();
}

function gravar() {
  const antes = dados.produtos;
  const novosDados = new Map(previa.atualizados.map((p) => [p.id, p]));
  dados.produtos = [...antes.map((p) => novosDados.get(p.id) ?? p), ...previa.novos];
  if (!salvar()) {
    dados.produtos = antes;
    salvar();
    return desenhar(previa, 'O espaço do navegador acabou. Nada foi gravado. Exporte os dados e apague produtos antigos.');
  }
  janela().close();
  const resumo = `${total(previa)} produto(s) importado(s): ${previa.novos.length} novo(s), ${previa.atualizados.length} atualizado(s).`;
  aviso(resumo, true);
  anotarImportacao(`Planilha: ${resumo}`).catch((e) => aviso(e.message));
}

const total = (p) => p.novos.length + p.atualizados.length;
const nomeComSku = (p) => `${esc(p.nome)}${p.sku ? ` (${esc(p.sku)})` : ''}`;
// Atualizado: mostra o custo de antes e o de agora quando mudou.
function linhaAtualizado(p) {
  const antes = custoDoProduto(dados.produtos.find((x) => x.id === p.id));
  const depois = custoDoProduto(p);
  return `<li>Atualizado: ${nomeComSku(p)}${Math.abs(antes - depois) >= 0.005 ? `, custo ${reais(antes)} → ${reais(depois)}` : ''}</li>`;
}

// Uma linha por produto x canal com preço salvo na Calculadora.
function exportarPrecificacoes() {
  const linhas = dados.produtos.flatMap((p) => {
    const cmv = custoDoProduto(p);
    const pesoG = pesoDoProduto(p);
    return Object.entries(dados.precificacoes?.[p.id] ?? {}).flatMap(([idCanal, salvo]) => {
      const canal = canais()[idCanal];
      const preco = precoPor(salvo.de, salvo.desconto);
      if (!canal || !(preco > 0)) return [];
      const r = calcularMargem({ preco, cmv, canal, pesoG });
      const minimo = precoMinimo({ cmv, canal, pesoG, margemDesejada: MARGEM_DESEJADA });
      return [{ produto: p.nome, sku: p.sku, canal: canal.nome, preco, margem: r.margem, lucro: r.lucro, minimo: minimo || NaN }]; // NaN: margem inalcançável, célula vazia
    });
  });
  baixar(`precificacoes-${new Date().toISOString().slice(0, 10)}.csv`, csvPrecificacoes(linhas));
}
