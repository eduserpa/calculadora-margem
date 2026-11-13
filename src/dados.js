// Camada de dados única: as telas só usam `dados`, `salvar()` e `aoMudar()`; não sabem onde os dados ficam.
// Com login, ficam na nuvem (src/nuvem.js troca o `guardado`); sem ele, no navegador (localStorage).
// Exportar/importar um arquivo .json serve de cópia de segurança e para levar a outro lugar.

const CHAVE = 'calculadora-margem.v1';

// Onde os dados ficam. ler() devolve { produtos, canais, precificacoes, empresa } ou null; gravar() lança erro se não conseguir.
const noNavegador = {
  ler: () => JSON.parse(localStorage.getItem(CHAVE) || 'null'),
  gravar: (d) => localStorage.setItem(CHAVE, JSON.stringify(d)),
};
let guardado = noNavegador;
export const usarGuardado = (outro) => (guardado = outro);

// O que ficou guardado só neste navegador (para levar para a nuvem no 1º login).
export function lerDoNavegador() {
  try {
    return noNavegador.ler();
  } catch {
    return null;
  }
}

// empresa: { impostos } vale para todo canal que não tiver imposto próprio (canal.impostosProprio === true).
export const dados = { produtos: [], canais: null, precificacoes: {}, empresa: null };
let canaisPadrao = null;
const avisos = new Set();

export function aoMudar(fn) {
  avisos.add(fn);
}

export async function carregar() {
  try {
    const salvo = await guardado.ler();
    if (salvo) Object.assign(dados, { produtos: salvo.produtos ?? [], canais: salvo.canais ?? null, precificacoes: salvo.precificacoes ?? {}, empresa: salvo.empresa ?? null });
  } catch (erro) {
    if (guardado !== noNavegador) throw erro; // nuvem fora do ar: quem chamou avisa
    // navegador sem acesso ao armazenamento: segue só na memória
  }
  const resposta = await fetch('data/canais.json');
  canaisPadrao = (await resposta.json()).canais;
}

export function salvar() {
  let ok = true;
  try {
    guardado.gravar(dados);
  } catch {
    ok = false;
  }
  avisos.forEach((fn) => fn(ok));
  return ok;
}

// Taxas em uso: as que a empresa ajustou (ou as de data/canais.json), com o imposto da empresa
// em todo canal que não tem imposto próprio.
export function canais() {
  const base = dados.canais ?? canaisPadrao;
  const imposto = dados.empresa?.impostos;
  if (imposto == null || !base) return base;
  return Object.fromEntries(Object.entries(base).map(([id, c]) => [id, c.impostosProprio ? c : { ...c, impostos: imposto }]));
}
export const canaisDePadrao = () => structuredClone(canaisPadrao);

export const novoId = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));

export function paraArquivo() {
  return JSON.stringify({ tipo: 'calculadora-margem', versao: 1, exportadoEm: new Date().toISOString(), ...dados }, null, 1);
}

// Lê um arquivo exportado. Devolve o conteúdo ou lança um erro com mensagem para a pessoa.
export function lerArquivo(texto) {
  let obj;
  try {
    obj = JSON.parse(texto);
  } catch {
    throw new Error('Este arquivo não é um .json válido.');
  }
  if (obj?.tipo !== 'calculadora-margem' || !Array.isArray(obj.produtos)) {
    throw new Error('Este arquivo não foi exportado por esta calculadora.');
  }
  return { produtos: obj.produtos, canais: obj.canais ?? null, precificacoes: obj.precificacoes ?? {}, empresa: obj.empresa ?? null };
}

export function substituirTudo(novo) {
  dados.produtos = novo.produtos;
  dados.canais = novo.canais;
  dados.precificacoes = novo.precificacoes ?? {};
  dados.empresa = novo.empresa ?? null;
  return salvar();
}
