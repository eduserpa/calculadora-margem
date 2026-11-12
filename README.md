# Calculadora de margem

Cadastro de produtos com preço de custo e calculadora de margem por canal (comissão, taxa fixa, frete, impostos e taxa financeira).

Página estática (HTML, CSS e JS, sem build e sem dependências), pronta para publicar na Vercel.

Os dados ficam no navegador de quem usa (localStorage) nesta fase de testes. Use **Exportar dados** para guardar uma cópia em arquivo e **Importar dados** para levar a outro computador.

## Pastas

- `docs/`: o que cada conta faz, com fórmula e exemplo.
- `data/canais.json`: taxas de cada canal, com fonte e data da conferência.
- `src/calculos/`: as contas, uma função por conta.
- `src/telas/`: as telas.
- `tests/`: casos de teste com números fictícios.

## Abrir no computador

A página lê `data/canais.json`, então precisa de um endereço http (abrir o arquivo direto não funciona):

```
python -m http.server 8787
```

Depois abra http://127.0.0.1:8787

## Testes

```
npm test
```
