// Camada de dados única: as telas só usam `dados`, `salvar()` e `aoMudar()`; não sabem onde os dados ficam.
// Hoje ficam no navegador (localStorage). Para o banco (Supabase), troca-se só o `guardado` abaixo
// por um que leia e grave nas tabelas de supabase/schema.sql (ver docs/banco.md).
// Exportar/importar um arquivo .json serve de cópia de segurança e para levar a outro computador.

const CHAVE = 'calculadora-margem.v1';

// Onde os dados ficam. ler() devolve { produtos, canais, precificacoes } ou null; gravar() lança erro se não conseguir.
const noNavegador = {
  ler: () => JSON.parse(localStorage.getItem(CHAVE) || 'null'),
  gravar: (d) => localStorage.setItem(CHAVE, JSON.stringify(d)),
};
let guardado = noNavegador;
export const usarGuardado = (outro) => (guardado = outro);

export const dados = { produtos: [], canais: null, precificacoes: {} };
let canaisPadrao = null;
const avisos = new Set();

export function aoMudar(fn) {
  avisos.add(fn);
}

export async function carregar() {
  try {
    const salvo = await guardado.ler();
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
    guardado.gravar(dados);
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
