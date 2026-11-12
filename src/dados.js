// Onde os dados ficam: no navegador (localStorage), nesta fase de testes.
// Exportar/importar um arquivo .json serve de cópia de segurança e para levar a outro computador.

const CHAVE = 'calculadora-margem.v1';

export const dados = { produtos: [], canais: null, precificacoes: {} };
let canaisPadrao = null;
const avisos = new Set();

export function aoMudar(fn) {
  avisos.add(fn);
}

export async function carregar() {
  try {
    const salvo = JSON.parse(localStorage.getItem(CHAVE) || 'null');
    if (salvo) Object.assign(dados, { produtos: salvo.produtos ?? [], canais: salvo.canais ?? null, precificacoes: salvo.precificacoes ?? {} });
  } catch {
    // navegador sem acesso ao armazenamento: segue só na memória
  }
  const resposta = await fetch('data/canais.json');
  canaisPadrao = (await resposta.json()).canais;
}

export function salvar() {
  let ok = true;
  try {
    localStorage.setItem(CHAVE, JSON.stringify(dados));
  } catch {
    ok = false;
  }
  avisos.forEach((fn) => fn(ok));
  return ok;
}

// Taxas em uso: as que a empresa ajustou, ou as de data/canais.json.
export const canais = () => dados.canais ?? canaisPadrao;
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
  return { produtos: obj.produtos, canais: obj.canais ?? null, precificacoes: obj.precificacoes ?? {} };
}

export function substituirTudo(novo) {
  dados.produtos = novo.produtos;
  dados.canais = novo.canais;
  dados.precificacoes = novo.precificacoes ?? {};
  return salvar();
}
