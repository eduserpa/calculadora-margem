# 3. Preço DE, desconto e preço POR

**Para que serve:** o anúncio mostra um preço cheio (DE) e um preço com desconto (POR). A margem é calculada sempre no **preço POR**.

## O que entra

- Preço DE (R$)
- Desconto (%), de 0 a 70 na barra
- ou o preço POR digitado direto

## Fórmulas

```
preço POR = arredondado para centavos( preço DE × (1 − desconto ÷ 100) )

digitou o preço POR:
  desconto = (DE − POR) ÷ DE × 100        (entre 0 e 100)
  sem preço DE (ou POR maior que o DE): o DE passa a ser o próprio POR e o desconto fica 0
```

## Exemplos

| Preço DE | Desconto | Preço POR |
|---|---|---|
| 199,90 | 30% | 139,93 |
| 89,90 | 15% | 76,42 |
| 149,90 | 33% | 100,43 |
