# 8. Taxas de cada canal

**Para que serve:** guardar as taxas de cada lugar onde a empresa vende. A calculadora usa esses números. Os valores iniciais estão em [`data/canais.json`](../data/canais.json), cada um com a fonte e a data em que foi conferido. Na tela **Configurações** dá para mudar.

## Como cada canal cobra

| Canal | Comissão e taxa fixa | Frete que entra na conta |
|---|---|---|
| Shopee | por faixa de preço (ex.: até R$ 79,99: 20% + R$ 4,50) | não entra |
| Mercado Livre | Clássico ou Premium. Tem uma faixa de preço com comissão reduzida. Pode usar uma comissão própria, que vale para qualquer preço | tabela por preço e peso (frete grátis pago pelo vendedor). Abaixo de R$ 19, no máximo metade do preço |
| SHEIN | % + R$ por venda | não entra |
| TikTok Shop | por faixa de preço | % do preço, com teto por produto |
| Loja própria | sem comissão | não entra |
| Atacado e loja física | comissão de vendedor (%) | não entra |

## Campos que todo canal tem

- **Impostos (%)**: sobre o preço de venda (padrão 10%).
- **Taxa financeira (%)**: cartão ou plataforma de pagamento.
- **Frete absorvido (R$ por peça)**: frete que a empresa paga e que não está na tabela.
- **Embalagem e manuseio (R$ por peça)**.
- **Outros custos (R$ por peça)**.

Quando uma plataforma mudar a tabela, é só atualizar `data/canais.json` (com nova fonte e data) ou ajustar na tela de Configurações.
