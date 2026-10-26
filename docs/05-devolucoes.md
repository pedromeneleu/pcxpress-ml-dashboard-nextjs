# 05 · Seção Devoluções (ponta a ponta)

A funcionalidade mais recente (outubro/2026) e a de regras mais detalhadas. Substitui a planilha
de operação `pcxpress-fila-devolucoes`.

## Definição

- **Devolução = pós-entrega:** o comprador recebeu o produto e o devolveu (ou abriu reclamação
  que gerou um retorno). Cancelamento é outro assunto e continua em **Saúde da conta**.
- Famílias de motivo: **PDD** (produto com defeito ou diferente do anunciado) e **PNR** (produto
  não recebido). `INCLUDE_PNR = true`: PNR aparece como família própria; com `false`, some de
  todas as telas e cálculos.
- Entram Reclamação, Mediação, Devolução e Retorno (não entregue) — coluna "Etapa" (`etapa_ml`).

## Caminho do dado

```text
API ML (claims/search, claims/{id}/returns, returns/{id}/reviews, charges/return-cost, shipments, orders)
   └─► n8n "ML Dashboards - MVP7 Devolucoes v2 (painel)", de hora em hora
         └─► ml_dashboards.devolucoes / devolucoes_status / devolucoes_motivos / devolucoes_claims_sem_devolucao
               + view devolucoes_base_vendas_diaria (orders_current + order_items, pedidos pagos)
                     └─► lib/supabase-returns.ts (GET /api/returns)
                           └─► app/returns/returns-metrics.ts (cálculos puros)
                                 └─► app/returns/ReturnsView.tsx (telas) + alertas na Visão geral
```

- Ingestão campo a campo: [`ingestao/n8n/README.md`](../ingestao/n8n/README.md).
- Tabelas: [02-supabase.md](02-supabase.md#4-devoluções-m).
- O painel lê `devolucoes` com `select=*` de propósito: pedir uma coluna que não existe faz o
  PostgREST recusar a consulta inteira; com `*`, colunas ausentes viram "—".
- Lê **todas** as devoluções da conta (casos abertos precisam aparecer qualquer que seja a idade);
  o volume é de centenas por semestre.

## Etapas do funil e tradução de status

Seis etapas normalizadas: `aberta`, `enviada_pelo_comprador` ("A caminho"), `recebida` ("Recebida,
aguardando revisão"), `revisada`, `reembolsada`, `encerrada_sem_devolucao`. Abertas = as quatro
primeiras.

Ordem para descobrir a etapa (`resolveStage`):

1. `RETURN_STATUS_TO_STAGE` em `app/returns/returns-config.ts` (status bruto da API, sem
   diferenciar maiúsculas): `opened`/`pending`/`label_generated`/`ready_to_ship` → aberta;
   `shipped`/`in_transit` → enviada_pelo_comprador; `delivered` → recebida; `reviewed` → revisada;
   `refunded` → reembolsada; `cancelled`/`expired`/`not_delivered` → encerrada_sem_devolucao.
2. Se o status não está no mapa, usa a etapa gravada pela ingestão (`etapa_atual`). Ex.: `closed`
   ficou de fora do mapa de propósito (pode ser reembolsada ou encerrada); a ingestão grava
   `encerrada_sem_devolucao` para ele.
3. Sem nenhuma das duas: "status não mapeado" — a devolução é **contada à parte, nunca escondida**
   (aparece com o selo "Status não traduzido").

Ajustes que a ingestão faz no `status_atual`: `status_money = refunded` → `refunded`;
`delivered` com revisão → `reviewed`.

## Tela: barra de filtros

- **Visão:** Acompanhamento | Fechamento.
- **Logística:** Todas | Sem Full | Cross docking | Flex (`self_service` ou `flex`) | Só Full —
  pelo `logistic_type` do envio original.
- **Família do motivo:** Todas | PDD | PNR.

## A. Acompanhamento — a fila de hoje

Mostra a **situação de hoje** (calendário de São Paulo). **O filtro de datas do topo não altera
esta aba** (há um aviso). Reproduz as abas "Devoluções" e "Resumo" da planilha.

Caso aberto: `status_reclamacao = opened` ("Aberta"); se a informação não existe, usa a etapa.

Regras (`RETURNS_QUEUE_RULES`, provisórias):

| Regra | Definição |
|---|---|
| **Parado** | aberto **e** (data prevista do ML já passou **ou** sem atualização do ML há ≥ `stalledDaysWithoutUpdate` = **3** dias — sugerido pela Aruna, a confirmar com a operação) |
| **Prazo do vendedor** | `prazo_acao_vendedor` comparado a hoje: vencido · hoje · "≤ N dias" (`deadlineWarningDays` = **2**) · ok |
| **Aguardando ação** | `acao_pendente` preenchida e que não começa com "Nenhuma" |
| **Prioridade** (ordem da fila) | 0 prazo vencido/hoje → 1 aguardando ação → 2 parado → 3 demais; empate: mais dias sem atualização, depois abertura mais antiga |

Blocos:

1. KPIs: **Casos abertos na fila** (com valor de venda), **Prazo do vendedor vencido ou hoje**,
   **Aguardando ação do vendedor**, **Parados** (com valor). Valor ausente = "Valor de venda ainda
   não informado", nunca R$ 0,00.
2. **Por status do retorno:** casos abertos e valor por `status_retorno`.
3. **Fila de devoluções:** as 24 colunas A–X da planilha — Nº da venda, ID da reclamação, Data da
   venda, Data abertura reclamação, MLB, Título do anúncio, SKU, Qtd, Valor da venda, Valor
   reembolsado, Comprador (apelido), Motivo, Etapa, Status ML, Status do retorno, Descrição do
   status, Data prevista, Destino do retorno, Rastreio, Prazo p/ ação do vendedor, Ação pendente,
   Última atualização ML, Resultado, Data do sync. Linha vermelha = prazo vencido/hoje; amarela =
   parado. Ordenação clicando no título (botão volta à prioridade); primeira coluna fixa; mostra 25
   e "Mostrar todos".

## B. Fechamento — por mês da venda

Segue o filtro de datas do topo, mas **pela data da venda original** (cada devolução entra no mês
em que a venda aconteceu, não no mês em que voltou). "Encerradas sem devolução" não contam.

| KPI | Cálculo |
|---|---|
| % devolvido por quantidade | unidades devolvidas ÷ unidades pagas vendidas no período × 100 |
| % devolvido por faturamento | valor devolvido ÷ faturamento pago no período × 100 |
| Frete de devolução | Σ `custo_frete_devolucao` (conta quantos estão sem valor) |
| % por erro operacional | devoluções com motivo classificado como erro ÷ devoluções com motivo **classificado** × 100; sem nenhuma classificação: "Aguardando classificação dos motivos" |

As comparações usam `evaluateTrend(..., "lowerIsBetter")`: subir é vermelho.

Tabela **Fechamento por mês da venda**: Mês, Unid. vendidas, Unid. devolvidas, % qtd., Vendas
pagas, Valor devolvido, % fat., Frete devolução, Erro operacional, Situação (**Provisório** se o
mês terminou há menos de `PROVISIONAL_WINDOW_DAYS` = 60 dias — ainda podem chegar devoluções;
**Fechado**; **Parcial** se o filtro corta o mês).

Também no Fechamento: **Motivos mais frequentes** (por família, top 10, com coluna "Antes" da
comparação) e **Anúncios com mais devoluções** (top 10 por quantidade e valor).

Base de vendas: `devolucoes_base_vendas_diaria` (pedidos `paid`, contados uma vez cada). Se a view
não existir, os percentuais ficam "Sem base". Limite: não dá para excluir o Full do denominador.

## C. Alertas na Visão geral

Ocultos enquanto não houver devoluções (`status !== "ready"`). Mostram: casos com prazo do
vendedor vencido/hoje; devoluções paradas (ou "Nenhuma devolução parada"); e "Alta de devoluções
por erro operacional" quando o % do período sobe ≥ `OPERATIONAL_ERROR_ALERT_INCREASE_POINTS` (5
p.p.) contra a comparação.

## Modo demonstração (dados fictícios)

Regra em `resolveDemoMode` / `shouldShowDemo` (`returns-metrics.ts`):

| Ambiente | Comportamento |
|---|---|
| `RETURNS_DEMO_MODE=false` (qualquer ambiente) | Nunca mostra fictícios |
| Produção (`VERCEL_ENV=production`) | Fictícios **só** enquanto não houver devolução real (`tables_missing`, `empty`, `not_configured`). **Erro de leitura nunca vira fictício** |
| Prévia (`VERCEL_ENV=preview`) | Sempre fictícios |
| Local | Fictícios só com `RETURNS_DEMO_MODE=true` |

Só "tabela/view inexistente" (`PGRST205`, `42P01`) conta como "sem tabelas"; coluna inexistente
(`42703`) é erro. Isso nasceu de um incidente em 08/10: o painel pediu colunas que ainda não
existiam, o erro foi lido como "tabela ausente" e o site oficial passou a mostrar fictícios no
lugar das devoluções reais (corrigido no PR #8).

No modo demonstração: faixa laranja "DADOS FICTÍCIOS", etiqueta "Fictício" no menu e nos alertas,
bordas tracejadas. Dados gerados por `lib/returns-demo-data.ts` com semente fixa, IDs `DEMO-…`.
Hoje produção mostra dados reais.

## Configuração — o único arquivo a editar

`app/returns/returns-config.ts` (todos os valores marcados como **PROVISÓRIOS**):

| Constante | Valor | Para quê |
|---|---|---|
| `RETURN_STATUS_TO_STAGE` | mapa acima | Tradução status → etapa |
| `RETURNS_QUEUE_RULES.stalledDaysWithoutUpdate` | 3 | "Parado" |
| `RETURNS_QUEUE_RULES.deadlineWarningDays` | 2 | "≤ N dias" do prazo do vendedor |
| `PROVISIONAL_WINDOW_DAYS` | 60 | Meses provisórios no Fechamento |
| `INCLUDE_PNR` | `true` | Mostrar PNR |
| `OPERATIONAL_ERROR_ALERT_INCREASE_POINTS` | 5 | Alerta de erro operacional |

No n8n (código do MVP7): `SELLER_ACTION_LABELS` (tradução das ações do vendedor),
`REVIEW_CONDITION_LABELS` (condição na revisão), `CLAIM_STAGE_LABELS`. Código sem tradução
aparece na tela como "Ação do ML: <código>" e na saída da execução em `acoes_vendedor_vistas`.

## Situação dos dados em 26/10/2026

- 439 devoluções no banco; 828 reclamações nos últimos 180 dias (445 sem devolução, anotadas em
  `devolucoes_claims_sem_devolucao`); 24 reclamações abertas.
- Ainda sem dado: `data_envio_comprador` em 81 linhas, `data_recebimento` em 98,
  `status_reclamacao`/`sku`/`valor_venda` em 27 (provavelmente casos antigos não reprocessados
  depois da migração da fila).
- Na execução de 26/10, das 18 devoluções processadas nenhuma tinha `data_prevista`,
  `prazo_acao_vendedor` nem `resultado` preenchidos (normal para casos sem ação obrigatória ou
  ainda não revisados, mas vale acompanhar).
- Códigos de ação vistos: `send_message_to_mediator`, `return_review_fail`, `return_review_ok`,
  `refund`, `return_review_unified_fail`, `return_review_unified_ok`,
  `send_message_to_complainant`, `open_dispute` — todos já traduzidos.
- `devolucoes_motivos.erro_operacional` depende de classificação do cliente; enquanto estiver
  nulo, "% por erro operacional" mostra "Aguardando classificação".

## Pendências desta seção

Ver [07-roadmap.md](07-roadmap.md#devoluções): processo para o cliente classificar motivos,
confirmação dos limites provisórios com a operação, decisão sobre `closed`, excluir Full da base de
vendas, troca de `claims_days_back` para 30, reprocessar as 27 linhas sem colunas da fila.
