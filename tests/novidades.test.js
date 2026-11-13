// A página Novidades começa pela versão que o app mostra (src/config.js): esqueceu de um dos dois, o teste falha.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { VERSAO } from '../src/config.js';

test('a versão mais nova das Novidades é a VERSAO do config.js', () => {
  const versoes = JSON.parse(readFileSync(new URL('../data/novidades.json', import.meta.url), 'utf8'));
  assert.equal(versoes[0].versao, VERSAO);
  versoes.forEach((v) => assert.ok(v.data && v.itens.length, `${v.versao} sem data ou sem itens`));
});
