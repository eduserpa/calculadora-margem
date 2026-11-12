# 8. Taxas de cada canal

**Para que serve:** guardar as taxas de cada lugar onde a empresa vende. A calculadora usa esses números. Os valores iniciais estão em [`data/canais.json`](../data/canais.json), cada um com a fonte e a data da conferência. Quando ainda não foi conferido na página oficial, está marcado "conferir".

Para mudar: clique na engrenagem do canal, na calculadora (janela **Configurar**), ou use a tela **Taxas dos Canais**.

## Como cada canal cobra e o que dá para mudar

| Canal | Regra (quadro no topo da janela) | Opções |
|---|---|---|
| Shopee | comissão por faixa de preço (ex.: até R$ 79,99: 20% + R$ 4,50) | CNPJ ou CPF. CPF com mais de 450 pedidos em 90 dias paga um adicional por item (R$ 3, a conferir). Faixas editáveis |
| Mercado Livre | Clássico ou Premium + frete grátis pago pelo vendedor (tabela por preço e peso) | tipo de anúncio; comissão da categoria (Clássico 10–14%, Premium 15–19%); comissão própria; categoria da lista oficial com a comissão menor de R$ 150 a R$ 700 ([`data/ml-categorias.json`](../data/ml-categorias.json)); faixa da redução; reputação |
| SHEIN | % + R$ por venda | comissão e taxa fixa |
| TikTok Shop | comissão por faixa de preço + taxa de frete (% com teto) | faixas, % e teto do frete |
| Loja própria | sem comissão | taxa financeira / plataforma |
| Atacado e loja física | comissão de vendedora | comissão e taxa financeira |

**Reputação no Mercado Livre:** só a tabela de MercadoLíder, reputação verde e sem reputação é pública. Para amarela, laranja e vermelha, a conta usa a mesma tabela e avisa na tela. Quando a tabela de uma reputação for conferida, ela entra em `frete_por_reputacao` no `canais.json` e passa a valer sozinha.

## Campos que todo canal tem

- **Impostos (%)**: sobre o preço de venda (padrão 10%).
- **Taxa financeira (%)**: cartão, gateway ou plataforma de pagamento.
- **Frete absorvido (R$ por unidade)**: frete que a empresa paga e que não está na tabela do canal.
- **Pick & pack (R$ por unidade)**: embalagem + manuseio + etiqueta.
- **Outros custos (R$ por unidade)**.
- **Cupom (%)**, desligado por padrão. Ligado, o cliente paga o preço com cupom, e todas as taxas passam a incidir sobre esse preço.
- **Comissão de afiliado (%)**, desligada por padrão. Ligada, é uma % do preço que o cliente paga.

Quando uma plataforma mudar a tabela, é só atualizar `data/canais.json` (com nova fonte e data) ou ajustar na janela Configurar.
