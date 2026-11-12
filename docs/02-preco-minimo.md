# 2. Preço mínimo para a margem desejada

**Para que serve:** você diz a margem que quer (padrão 20%, entre 5% e 50%) e a calculadora mostra o menor preço que chega nela.

## Como calcula

Num canal com taxa fixa simples, a conta é direta:

```
preço = (CMV + taxa fixa + custos em R$) ÷ (1 − comissão% − impostos% − taxa financeira% − margem desejada%)
```

O resultado é arredondado **para cima**, até o centavo.

Shopee, TikTok e Mercado Livre mudam a taxa ou o frete conforme a faixa de preço. Por isso a calculadora testa faixa por faixa, da mais barata para a mais cara. Dentro de cada faixa ela procura, centavo por centavo (com busca rápida), o menor preço em que a margem da função 1 fica **igual ou acima** da desejada.

Se nenhum preço chega na margem (taxas altas demais), ela avisa que não dá.

## Avisos

- O preço digitado está abaixo do mínimo.
- O preço digitado está acima do mínimo, mas não chega na margem. Isso acontece quando ele cai numa faixa com taxa ou frete mais caro.

## Exemplo

Loja própria: CMV R$ 100, impostos 10%, taxa financeira 5%, margem desejada 20%.
100 ÷ (1 − 0,10 − 0,05 − 0,20) = 153,846… → **R$ 153,85**.
