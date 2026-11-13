# Calculéo

Calculadora de margem

Cadastro de produtos com preço de custo e calculadora de margem por canal (comissão, taxa fixa, frete, impostos e taxa financeira).

Página estática (HTML, CSS e JS, sem build e sem dependências), pronta para publicar na Vercel.

Três telas:

- **Calculadora**: escolhe o produto e o canal, digita o preço (DE e desconto, ou POR) e vê a margem, o lucro por peça e o preço mínimo para a margem desejada.
- **Produtos**: cadastro com o custo (revenda, fabricação ou kit) e o peso para frete.
- **Configurações**: as taxas de cada canal, com a fonte de cada número.

Os dados ficam no navegador de quem usa (localStorage) nesta fase de testes. Use **Exportar dados** para guardar uma cópia em arquivo e **Importar dados** para levar a outro computador.

## Pastas

- `docs/`: o que cada conta faz, com fórmula e exemplo.
- `data/canais.json`: taxas de cada canal, com fonte e data da conferência.
- `src/calculos/`: as contas, uma função por conta.
- `src/telas/`: as telas.
- `supabase/schema.sql`: o banco preparado para a próxima fase (ver `docs/banco.md`).
- `tests/`: casos de teste com números fictícios.

## Abrir no computador

A página lê `data/canais.json`, então precisa de um endereço http (abrir o arquivo direto não funciona):

```
python -m http.server 8787
```

Depois abra http://127.0.0.1:8787

## Testes

```
npm install
npm test
```

O `npm install` (uma vez) baixa o Postgres de teste usado em `tests/banco.test.js`. O site em si não depende de nada.

## Créditos

Ícones: [Lucide](https://lucide.dev) v0.460.0, licença ISC (texto em `assets/icones-LICENSE.txt`). Só os ícones usados estão em `assets/icones.svg`, sem carregar nada de fora.
