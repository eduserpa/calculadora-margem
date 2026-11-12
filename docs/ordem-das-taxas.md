# Ordem da conta e base de cada taxa

É a sequência exata que a calculadora segue (`src/calculos/margem.js`). Vale para todos os canais. O que muda de um canal para outro está nos passos 4 e 5.

## Passo a passo

| # | Etapa | Conta | Base (sobre o que incide) | Arredonda? |
|---|---|---|---|---|
| 1 | Preço DE | digitado | — | não |
| 2 | Desconto | % digitado (ou calculado a partir do preço POR) | preço DE | não |
| 3 | **Preço POR** (o que o cliente paga) | preço DE × (1 − desconto ÷ 100) | — | **sim, para centavos** (única etapa arredondada) |
| 4 | Faixa do canal | escolhida pelo **preço POR** | preço POR | — |
| 5a | Comissão | preço POR × comissão % | **preço POR** | não |
| 5b | Taxa fixa | R$ da faixa ou do canal | por venda | não |
| 5c | Frete do Mercado Livre | tabela [faixa do preço POR] × [peso para frete]; abaixo de R$ 19, no máximo metade do preço | preço POR e peso | não |
| 5d | Taxa de frete do TikTok | mínimo(preço POR × 6%, R$ 50) | **preço POR** | não |
| 6 | Impostos | preço POR × impostos % | **preço POR** (não é sobre o lucro nem sobre o preço sem as taxas) | não |
| 7 | Taxa financeira | preço POR × taxa % | **preço POR** | não |
| 8 | Custos por unidade | frete absorvido + pick & pack + outros | R$ por peça | não |
| 9 | Custo do produto (CMV) | do cadastro (revenda, fabricação ou kit) | R$ por peça | não |
| 10 | **Lucro por peça** | preço POR − (5a + 5b + 5c + 5d + 6 + 7 + 8 + 9) | — | não |
| 11 | **Margem %** | lucro ÷ preço POR × 100 | preço POR | não |

**Peso para frete (passo 5c):** é o maior valor entre o peso real e o peso pela caixa. Peso pela caixa = comprimento × largura × altura (cm) ÷ 6000, em kg. Se faltar uma das medidas, vale o peso real.

**No Mercado Livre não existe taxa fixa:** o frete grátis pago pelo vendedor entra no lugar dela.

## Pontos importantes

- **Nenhuma taxa incide sobre o valor já descontado de outra.** Comissão, impostos, taxa financeira e a taxa de frete do TikTok são todas calculadas sobre o preço POR cheio.
- **Só o preço POR é arredondado.** Cada parcela é calculada com todas as casas, e o lucro usa essas parcelas sem arredondar. A tela arredonda só para mostrar: R$ com 2 casas e % com 1 casa. Por isso, a soma das parcelas que aparecem na tela pode ficar 1 centavo diferente do lucro mostrado.
- **A faixa (comissão, taxa fixa, frete) é escolhida pelo preço POR**, depois do desconto. Exemplo: preço DE R$ 89,90 com 15% → POR R$ 76,42. Na Shopee, vale a faixa "até R$ 79,99".
- **Preço mínimo:** a calculadora procura, centavo por centavo, o menor preço POR em que a margem do passo 11 fica igual ou acima da desejada. Ela testa faixa por faixa porque as taxas mudam de uma faixa para outra.

## Viradas de faixa conferidas (12/11/2026)

| Canal | Preços testados de cada lado da virada |
|---|---|
| Shopee | 79,99 / 80,00 · 99,99 / 100,00 · 199,99 / 200,00 · 499,99 / 500,00 |
| Mercado Livre (frete) | 18,99 / 19,00 · 78,99 / 79,00 · 149,99 / 150,00 · 699,99 / 700,00 |
| Mercado Livre (peso) | exatamente 0,3 kg · caixa maior que o peso real (800 g e 4,08 kg) · exatamente 4 kg · caixa igual ao real (2 kg) |
| TikTok | 49,99 / 50,00 · R$ 900 (a taxa de frete bate no teto de R$ 50) |

Os testes ficam em `tests/fronteiras.test.js`.
