// Tela Início (a primeira ao entrar): como estão as margens da empresa, pelos preços salvos na Calculadora.
// Números, margem por canal, preços que pedem atenção, um plano de ação curto e as últimas alterações.
import { dados, aoMudar } from '../dados.js';
import { precosSalvos } from '../produtos.js';
import { faixaDaMargem, abrirNaCalculadora } from './calculadora.js';
import { historico } from '../nuvem.js';
import { telaAtual } from '../rotas.js';
import { reais, numero, esc, margemPct } from '../formato.js';
import { htmlVazio } from './mascote.js';

const $ = (s) => document.querySelector(s);
const pct = margemPct; // 2 casas, como na Calculadora
// Object.groupBy não existe em navegador mais antigo (iOS abaixo de 17.4): agrupa à mão
const agrupar = (lista, chave) => lista.reduce((g, x) => ((g[chave(x)] ??= []).push(x), g), {});
// As 7 faixas da Análise da margem, na ordem, com a classe que pinta cada uma.
const FAIXAS = [
  ['Prejuízo', 'f-prejuizo'], ['Margem crítica', 'f-critica'], ['Margem baixa', 'f-baixa'], ['Margem razoável', 'f-razoavel'],
  ['Margem boa', 'f-boa'], ['Margem muito boa', 'f-muito-boa'], ['Margem excelente', 'f-excelente'],
];
const classeDaFaixa = (m) => FAIXAS.find(([r]) => r === faixaDaMargem(m).rotulo)[1];
// Margem média ponderada pelo preço: soma dos lucros ÷ soma dos preços.
const ponderada = (lista) => (lista.reduce((s, x) => s + x.r.lucro, 0) / lista.reduce((s, x) => s + x.preco, 0)) * 100;
const quando = (iso) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export function iniciarInicio() {
  aoMudar(() => (telaAtual() === 'inicio' ? desenhar() : null));
  window.addEventListener('tela', () => telaAtual() === 'inicio' && desenhar());
  $('#tela-inicio').addEventListener('click', (e) => {
    const b = e.target.closest('[data-abrir]');
    if (b) abrirNaCalculadora(b.dataset.abrir, b.dataset.canal);
  });
  desenhar();
}

function desenhar() {
  const corpo = $('#inicio-corpo');
  if (!dados.produtos.length) {
    corpo.innerHTML = htmlVazio('calculando', 'Bora calcular essa margem?', 'Cadastre o primeiro produto com o custo. Depois é só escolher o canal na Calculadora.')
      + '<div class="inicio-atalhos"><a class="botao principal" href="/produtos">Cadastrar produto</a></div>';
    return;
  }
  const precos = precosSalvos();
  const comPreco = new Set(precos.map((p) => p.produto.id));
  const semPreco = dados.produtos.filter((p) => !comPreco.has(p.id));
  const porCanal = Object.values(agrupar(precos, (p) => p.canalId));
  const media = precos.length ? ponderada(precos) : null;
  const baixos = precos.filter((p) => p.r.margem < 10).sort((a, b) => a.r.margem - b.r.margem);
  const prejuizo = baixos.filter((p) => p.r.margem < 0);

  const numeros = `
    <div class="inicio-numeros">
      ${cartaoNumero('Produtos', dados.produtos.length, semPreco.length ? `${semPreco.length} sem preço salvo` : 'todos com preço')}
      ${cartaoNumero('Preços salvos', precos.length, precos.length ? `em ${porCanal.length} canal(is)` : 'nenhum ainda')}
      ${cartaoNumero('Margem média', media == null ? '—' : pct(media), media == null ? 'salve um preço na Calculadora' : `${faixaDaMargem(media).rotulo.toLowerCase()} · ponderada pelo preço`, media == null ? '' : classeDaFaixa(media))}
    </div>`;

  const canais = porCanal.length ? `
    <section class="cartao">
      <h2>Margem por canal</h2>
      <ul class="lista-simples lista-canais">${porCanal.sort((a, b) => ponderada(b) - ponderada(a)).map((lista) => {
        const m = ponderada(lista);
        const abaixo = lista.filter((p) => p.r.margem < 10).length;
        const contagem = FAIXAS.map(([rotulo, classe]) => [classe, lista.filter((p) => faixaDaMargem(p.r.margem).rotulo === rotulo).length]);
        return `<li>
          <span>${esc(lista[0].canal.nome)}</span>
          <span class="barra-dist" role="img" aria-label="${contagem.filter(([, n]) => n).map(([c, n]) => `${n} ${FAIXAS.find(([, k]) => k === c)[0].toLowerCase()}`).join(', ')}">${contagem.filter(([, n]) => n).map(([c, n]) => `<span class="${c}" style="flex-grow:${n}"></span>`).join('')}</span>
          <strong class="${classeDaFaixa(m)}">${pct(m)}</strong>
          <small class="dica">${abaixo ? `${abaixo} de ${lista.length} abaixo de 10%` : `${lista.length} preço(s), nenhum abaixo de 10%`}</small>
        </li>`;
      }).join('')}</ul>
      <p class="dica">Média ponderada pelo preço. As cores seguem as faixas da Análise da margem.</p>
    </section>` : '';

  const atencao = baixos.length ? `
    <section class="cartao">
      <h2>Preços abaixo de 10% de margem</h2>
      <p class="dica">${baixos.length} preço(s), do pior para o melhor. Clique para abrir na Calculadora.</p>
      <div class="tabela-rolagem"><table>
        <thead><tr><th>Produto</th><th>Canal</th><th>Preço</th><th>Margem</th><th>Lucro</th></tr></thead>
        <tbody>${baixos.slice(0, 10).map((p) => `<tr>
          <td><button type="button" class="link-botao" data-abrir="${esc(p.produto.id)}" data-canal="${esc(p.canalId)}">${esc(p.produto.nome)}</button>${p.produto.sku ? ` <small class="dica">${esc(p.produto.sku)}</small>` : ''}</td>
          <td>${esc(p.canal.nome)}</td><td>${reais(p.preco)}</td><td class="${classeDaFaixa(p.r.margem)}">${pct(p.r.margem)}</td><td>${reais(p.r.lucro)}</td>
        </tr>`).join('')}</tbody>
      </table></div>
      ${baixos.length > 10 ? `<p class="dica">e mais ${baixos.length - 10}.</p>` : ''}
    </section>` : '';

  // Plano de ação: do mais grave ao menos grave, só o que existe.
  const passos = [];
  if (prejuizo.length) passos.push(`<strong>${prejuizo.length} preço(s) dão prejuízo:</strong> ${prejuizo.slice(0, 3).map((p) => `${esc(p.produto.nome)} (${esc(p.canal.nome)})`).join(', ')}${prejuizo.length > 3 ? ' e outros' : ''}. Cada venda tira dinheiro do caixa: suba o preço ou tire do canal.`);
  const criticosPorCanal = Object.entries(agrupar(baixos, (p) => p.canal.nome)).sort((a, b) => b[1].length - a[1].length);
  if (baixos.length >= 2 && porCanal.length >= 2) passos.push(  // com 1 canal só, "concentra" não diz nada
    `<strong>${esc(criticosPorCanal[0][0])} concentra as margens baixas:</strong> ${criticosPorCanal[0][1].length} dos ${baixos.length} preços abaixo de 10%. Comece a revisão por esse canal.`);
  if (semPreco.length) passos.push(`<strong>${semPreco.length} de ${dados.produtos.length} produtos ainda não têm preço salvo.</strong> A margem deles não entra em nada aqui. <a href="/calculadora">Precificar</a>`);
  const plano = `
    <section class="cartao">
      <h2>Plano de ação</h2>
      ${passos.length ? `<ol class="plano">${passos.map((t) => `<li>${t}</li>`).join('')}</ol>` : '<p>Tudo em ordem: nenhum preço abaixo de 10% e todos os produtos com preço. 🦁</p>'}
    </section>`;

  corpo.innerHTML = `
    ${numeros}
    <div class="inicio-grade">${plano}${canais}${atencao}
      <section class="cartao"><h2>Últimas alterações</h2><div id="inicio-historico"><p class="dica">Carregando…</p></div><a class="link-botao" href="/historico">Ver histórico completo</a></section>
    </div>
    <div class="inicio-atalhos"><a class="botao principal" href="/calculadora">Abrir a Calculadora</a><a class="botao" href="/produtos">Meus Produtos</a></div>`;
  desenharHistorico();
}

const cartaoNumero = (rotulo, valor, sub, classe = '') => `
  <div class="cartao numero"><span class="numero-rotulo">${rotulo}</span><strong class="numero-valor ${classe}">${valor}</strong><small class="numero-sub">${sub}</small></div>`;

async function desenharHistorico() {
  const caixa = $('#inicio-historico');
  try {
    const linhas = (await historico({})).slice(0, 5);
    caixa.innerHTML = linhas.length
      ? `<ul class="lista-simples">${linhas.map((l) => `<li><span><strong>${esc(l.acao)}</strong>${l.detalhe ? `: ${esc(l.detalhe)}` : ''} <small class="dica">${esc(l.quem)}</small></span><time datetime="${esc(l.quando)}">${quando(l.quando)}</time></li>`).join('')}</ul>`
      : '<p class="dica">Nada registrado ainda.</p>';
  } catch {
    caixa.innerHTML = '<p class="dica">Não deu para carregar as últimas alterações agora.</p>';
  }
}
