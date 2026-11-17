// Nome provisório da Plataforma (Eduardo 17/11): adjetivo + substantivo em inglês, mesma letra, minúsculo e junto ('bodaciousbluff').
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nomeAleatorio, NOMES } from '../src/telas/plataforma.js';

test('nome aleatório: só letras minúsculas, com aliteração, e varia', () => {
  const vistos = new Set();
  for (let i = 0; i < 500; i++) {
    const n = nomeAleatorio();
    assert.match(n, /^[a-z]{6,}$/);
    vistos.add(n);
  }
  assert.ok(vistos.size > 100, `pouca variedade: ${vistos.size}`);
  // cada nome = um adjetivo + um substantivo da MESMA letra
  const daLetra = (n) => Object.entries(NOMES).some(([letra, [adj, sub]]) => n[0] === letra && adj.some((a) => n.startsWith(a) && sub.includes(n.slice(a.length))));
  for (const n of vistos) assert.ok(daLetra(n), n);
  for (const [letra, [adj, sub]] of Object.entries(NOMES)) assert.ok([...adj, ...sub].every((p) => p[0] === letra && /^[a-z]+$/.test(p)), letra);
});
