# 1. Margem por canal

**Para que serve:** você digita o preço de venda e vê quanto sobra por peça naquele canal, em reais e em porcentagem.

## O que entra

| Campo | Unidade | De onde vem |
|---|---|---|
| Preço de venda | R$ | digitado (ou calculado pelo preço DE e o desconto, ver função 3) |
| Custo do produto (CMV) | R$ | cadastro do produto (função 6) |
| Peso para o frete | g | cadastro do produto (função 7). Só o Mercado Livre usa |
| Comissão e taxa fixa | % e R$ | taxas do canal (função 8) |
| Impostos | % do preço | taxas do canal |
| Taxa financeira | % do preço | taxas do canal (cartão, plataforma) |
| Frete absorvido, embalagem e manuseio, outros | R$ por peça | taxas do canal |

## Fórmula

```
preço           = arredondado para centavos
comissão        = preço × comissão% ÷ 100
impostos        = preço × impostos% ÷ 100
taxa financeira = preço × taxa financeira% ÷ 100
frete do canal  = tabela do canal (Mercado Livre: preço e peso) ou % do preço com teto (TikTok)

custos = comissão + taxa fixa + frete do canal + impostos + taxa financeira
       + frete absorvido + embalagem e manuseio + outros + CMV

lucro por peça = preço − custos
margem %       = lucro ÷ preço × 100
```

No Mercado Livre o frete vem da tabela e não existe taxa fixa.

## Exemplo

Loja própria: preço R$ 200,00, CMV R$ 100,00, impostos 10%, taxa financeira 5%.
Custos = 20 + 10 + 100 = 130. Lucro **R$ 70,00**. Margem **35,0%**.

## Faixas de margem (para colorir o resultado)

| Margem | Leitura |
|---|---|
| abaixo de 0% | prejuízo |
| 0 a 10% | crítica |
| 10 a 15% | baixa |
| 15 a 20% | razoável |
| 20 a 25% | boa |
| 25 a 40% | muito boa |
| 40% ou mais | excelente |
