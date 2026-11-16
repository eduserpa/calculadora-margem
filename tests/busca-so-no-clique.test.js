// Regra do Eduardo: a busca de concorrentes (Apify, custa crédito) só sai do clique da pessoa em "Buscar concorrentes" ou
// "Atualizar". Nunca ao abrir a tela, trocar de produto/canal, carregar a Início, em segundo plano ou agendada.
// Falha se algum arquivo do app passar a chamar a busca por outro caminho. (A tela de verdade é conferida no headless com mock.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const SRC = new URL('../src/', import.meta.url);
const arquivos = readdirSync(SRC, { recursive: true }).filter((f) => f.endsWith('.js')).map((f) => f.replaceAll('\\', '/'));
const ler = (f) => readFileSync(new URL(f, SRC), 'utf8');
const sem = (texto) => texto.replace(/\/\/.*$/gm, ''); // tira comentários de linha

test('busca de concorrentes: só o clique em "Buscar concorrentes"/"Atualizar" chama o Apify', () => {
  // 1) a função que chama o Apify só é usada num lugar do app: buscarNoML, na Calculadora
  const usos = arquivos.flatMap((f) => (sem(ler(f)).match(/buscarConcorrentesNoML\s*\(/g) ?? []).map(() => f));
  assert.deepEqual(usos.sort(), ['nuvem.js', 'telas/calculadora.js'], 'definição em nuvem.js e 1 chamada na Calculadora');
  const calc = sem(ler('telas/calculadora.js'));
  const corpo = calc.slice(calc.indexOf('async function buscarNoML()'));
  assert.ok(/^async function buscarNoML\(\) \{[\s\S]*?nuvem\.buscarConcorrentesNoML\(/.test(corpo), 'a chamada fica dentro de buscarNoML');

  // 2) buscarNoML só é chamada no clique de verdade (isTrusted) no botão data-acao="buscar-ml"
  const chamadas = calc.split('\n').filter((l) => /buscarNoML\(/.test(l) && !/function buscarNoML/.test(l));
  assert.deepEqual(chamadas.map((l) => l.trim()), [`if (e.target.closest('[data-acao="buscar-ml"]')) return e.isTrusted && buscarNoML();`]);
  assert.match(calc, /caixa\.addEventListener\('click', async \(e\) => \{[\s\S]*?return e\.isTrusted && buscarNoML\(\);/, 'dentro do ouvinte de clique');

  // 3) ninguém aperta o botão por código, e ao abrir o produto só se lê a busca guardada
  for (const f of arquivos) assert.ok(!/buscar-ml[^\n]*\.click\(|dispatchEvent\(\s*new \w*Event\(\s*['"]click/.test(sem(ler(f))), `${f} não aperta botão por código`);
  assert.ok(/nuvem\.ultimaBusca\(produto\.id\)/.test(calc), 'abrir o produto lê a busca guardada');
});
