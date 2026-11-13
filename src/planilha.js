// Planilhas (CSV): importar produtos em lote e exportar as precificações.
// CSV com ";" e vírgula decimal, que é como o Excel em português abre e salva.
import { lerNumero } from './formato.js';
import { produtoVazio } from './produtos.js';

export const COLUNAS = ['nome', 'sku', 'tipo', 'custo', 'peso_g', 'comprimento_cm', 'largura_cm', 'altura_cm', 'foto_url'];

const semAcento = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
const celula = (v) => (/[";\n\r]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const decimal = (v, casas = 2) => (Number.isFinite(v) ? v.toFixed(casas).replace('.', ',') : '');

// Texto CSV pronto para o Excel (com BOM para os acentos abrirem certos).
export const paraCsv = (linhas) => `﻿${linhas.map((l) => l.map(celula).join(';')).join('\r\n')}\r\n`;

export const modelo = () =>
  paraCsv([COLUNAS, ['Garrafa térmica 500 ml', 'GT-500', 'revenda', '32,90', '450', '25', '8', '8', 'https://exemplo.com/foto.jpg']]);

// Lê CSV com ";" ou "," (o que aparecer mais na 1ª linha), com campos entre aspas.
export function lerCsv(texto) {
  texto = texto.replace(/^﻿/, '');
  const primeira = texto.split(/\r?\n/, 1)[0];
  const sep = (primeira.match(/;/g) || []).length >= (primeira.match(/,/g) || []).length ? ';' : ',';
  const linhas = [];
  let linha = [];
  let atual = '';
  let aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') (atual += '"'), i++;
      else if (c === '"') aspas = false;
      else atual += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) linha.push(atual), (atual = '');
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      linha.push(atual), linhas.push(linha), (linha = []), (atual = '');
    } else atual += c;
  }
  if (atual || linha.length) linha.push(atual), linhas.push(linha);
  return linhas.filter((l) => l.some((v) => v.trim()));
}

// Arquivo do Excel pode vir em UTF-8 ou no padrão antigo do Windows.
export function decodificar(bytes) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

const TIPOS = { revenda: 'revenda', revendedor: 'revenda', fabricante: 'fabricacao', fabricacao: 'fabricacao' };
const NUMEROS = { custo: 'custo', pesoG: 'peso_g', comprimento: 'comprimento_cm', largura: 'largura_cm', altura: 'altura_cm' };

// Confere a planilha contra os produtos que já existem (casa pelo SKU). Não grava nada.
// Devolve { novos, atualizados, erros: [{ linha, motivo }] }. Célula vazia numa atualização mantém o valor de hoje.
export function prepararImportacao(texto, produtos, novoId, agora = new Date().toISOString()) {
  const [cabeca = [], ...linhas] = lerCsv(texto);
  const col = Object.fromEntries(cabeca.map((n, i) => [semAcento(n).replace(/\s+/g, '_'), i]));
  const faltando = ['nome', 'custo'].filter((c) => !(c in col));
  if (faltando.length) return { novos: [], atualizados: [], erros: [{ linha: 1, motivo: `Faltam as colunas: ${faltando.join(', ')}. Use o modelo.` }] };

  const porSku = new Map(produtos.filter((p) => p.sku).map((p) => [semAcento(p.sku), p]));
  const vistos = new Set();
  const novos = [];
  const atualizados = [];
  const erros = [];
  linhas.forEach((l, i) => {
    const numLinha = i + 2;
    const v = (c) => (c in col ? String(l[col[c]] ?? '').trim() : '');
    const erro = (motivo) => erros.push({ linha: numLinha, motivo });
    const num = (c) => (v(c) && /\d/.test(v(c)) ? lerNumero(v(c)) : v(c) ? NaN : null); // null = vazio
    const sku = v('sku');
    const chave = semAcento(sku);
    if (chave && vistos.has(chave)) return erro(`SKU ${sku} repetido na planilha.`);
    if (chave) vistos.add(chave);
    const existente = chave ? porSku.get(chave) : null;
    if (existente?.tipoCusto === 'kit') return erro(`SKU ${sku} é um kit: edite na tela.`);

    const tipo = v('tipo') ? TIPOS[semAcento(v('tipo'))] : existente?.tipoCusto ?? 'revenda';
    if (!tipo) return erro(`Tipo "${v('tipo')}" não existe. Use revenda ou fabricante.`);
    const numeros = Object.fromEntries(Object.entries(NUMEROS).map(([k, c]) => [k, num(c)]));
    const ruim = Object.keys(NUMEROS).find((k) => Number.isNaN(numeros[k]) || numeros[k] < 0);
    if (ruim) return erro(`Número inválido na coluna ${NUMEROS[ruim]}: "${v(NUMEROS[ruim])}".`);
    if (!existente && !v('nome')) return erro('Falta o nome.');
    if (!existente && numeros.custo == null) return erro('Falta o custo.');
    const foto = v('foto_url');
    if (foto && !/^https?:\/\//i.test(foto)) return erro('foto_url precisa começar com http:// ou https://.');

    const p = existente ? structuredClone(existente) : { ...produtoVazio(), id: novoId(), sku };
    if (v('nome')) p.nome = v('nome');
    p.tipoCusto = tipo;
    if (numeros.custo != null) {
      if (tipo === 'revenda') p.revenda = { ...p.revenda, custoCompra: numeros.custo };
      else p.fabricacao = { ...p.fabricacao, materiais: [{ descricao: 'Custo (planilha)', precoUnitario: numeros.custo, quantidade: 1 }], maoDeObra: [] };
    }
    for (const k of ['pesoG', 'comprimento', 'largura', 'altura']) if (numeros[k] != null) p[k] = numeros[k];
    if (foto) p.fotos = [foto, ...(p.fotos ?? []).filter((f) => f !== foto)].slice(0, 3);
    p.atualizadoEm = agora;
    (existente ? atualizados : novos).push(p);
  });
  return { novos, atualizados, erros };
}

// Uma linha por produto x canal com preço salvo.
export function csvPrecificacoes(linhas) {
  return paraCsv([
    ['produto', 'sku', 'canal', 'preco', 'margem_%', 'lucro_r$', 'preco_minimo'],
    ...linhas.map((l) => [l.produto, l.sku ?? '', l.canal, decimal(l.preco), decimal(l.margem, 1), decimal(l.lucro), decimal(l.minimo)]),
  ]);
}

// Entrega o arquivo para a pessoa salvar.
export function baixar(nome, conteudo, tipo = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  Object.assign(document.createElement('a'), { href: url, download: nome }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
