# 02 · Supabase — schema `ml_dashboards`

> **Como este inventário foi feito.** O banco não pôde ser consultado diretamente. As colunas e
> chaves abaixo vêm de três fontes, indicadas em cada tabela:
> **[M]** migração versionada em `supabase/migrations/` (definição exata);
> **[G]** o que os workflows do n8n gravam (colunas do *upsert* e coluna de `on_conflict`, que
> precisa ser chave primária ou única);
> **[L]** o que o painel ou os fluxos leem (`select=`).
> Tipos exatos, índices, defaults e a definição SQL das views **não estão no repositório** para as
> tabelas sem [M]. A seção [Como confirmar no banco](#como-confirmar-no-banco) traz as consultas
> para fechar essa lacuna — rodar e versionar o resultado é o item 1 do [roadmap](07-roadmap.md).

## Conexão e convenções

- URL: `https://supabase.arunadata.com.br` (self-hosted pela Aruna). Schema: `ml_dashboards`
  (precisa estar em *Exposed schemas* da Data API; sem isso o PostgREST responde `PGRST106`).
- Todo acesso usa a chave **`service_role`** (painel e n8n). Não há usuários finais no banco.
- Escrita sempre por *upsert* do PostgREST: `POST /rest/v1/<tabela>?on_conflict=<colunas>` com
  `Prefer: resolution=merge-duplicates`. Reprocessar não duplica linhas.
- Multi-conta por desenho: quase toda tabela tem `account_id` (uuid de `accounts`). Hoje só existe
  a conta PCXpress (`3cc8f0ba-4310-49b9-94ac-1073b35cfe71`) sendo sincronizada.
- Datas de evento em `timestamptz` (UTC). Agregações por dia usam o calendário de
  `America/Sao_Paulo`.
- Padrão de nomes: `*_current` = estado atual (1 linha por entidade, sobrescrita);
  `*_daily_snapshots` = foto diária (1 linha por entidade por dia); `dashboard_*` = views para o
  painel; `raw` = JSON bruto da API do Mercado Livre.

## O que está e o que não está versionado

| Objeto | Onde está o SQL |
|---|---|
| `devolucoes`, `devolucoes_status`, `devolucoes_motivos`, view `devolucoes_base_vendas_diaria` | `supabase/migrations/2026-10-05_devolucoes.sql` |
| Colunas da fila em `devolucoes` | `supabase/migrations/2026-10-08_devolucoes_fila.sql` |
| `devolucoes_claims_sem_devolucao` | `supabase/migrations/2026-10-08_devolucoes_claims_sem_devolucao.sql` |
| View `dashboard_daily_order_impact` | `supabase-seller-health-cancellations.sql` — **fora do repositório** (os testes procuram o arquivo na pasta acima da raiz do projeto) |
| Views de reconciliação logística (`dashboard_logistics_shipment_reconciliation`, `dashboard_daily_logistics_reconciliation_waterfall`) | `supabase-logistics-shipment-reconciliation-v5.sql` e `supabase-check-logistics-shipment-reconciliation-v5.sql` — **fora do repositório** |
| Todo o resto (tabelas de controle, comerciais, pós-venda, logística e as demais views) | **Nenhum SQL conhecido.** Foi criado direto no Supabase |

As três migrações versionadas são idempotentes (`create … if not exists`, `add column if not
exists`), não apagam nada, terminam com `notify pgrst, 'reload schema'` e foram aplicadas em
produção (a execução do MVP7 em 26/10 confirma `colunas_fila_disponiveis: true` e
`controle_sem_devolucao_disponivel: true`).

## Mapa geral

| Domínio | Objetos | Quem grava | Quem lê | Situação |
|---|---|---|---|---|
| Controle | `accounts`, `oauth_tokens`, `sync_runs` | MVP1–MVP7 | todos os fluxos; painel (`accounts`) | **Ativo** |
| Comercial | `sellers_current`, `seller_daily_snapshots`, `items_current`, `item_daily_snapshots`, `orders_current`, `order_items`, `order_daily_snapshots`, `item_visits_daily` | Sync Diario (MVP1–4), Backfill (MVP1) | views do painel | **Ativo** |
| Views do painel | `dashboard_item_catalog`, `dashboard_daily_account_summary`, `dashboard_daily_item_performance`, `dashboard_daily_order_impact` | — | `/api/dashboard` | **Ativo** |
| Devoluções | `devolucoes`, `devolucoes_status`, `devolucoes_motivos`, `devolucoes_claims_sem_devolucao`, view `devolucoes_base_vendas_diaria` | MVP7 v2 | `/api/returns` | **Ativo** |
| Pós-venda v7 | `claims_current`, `claim_orders`, `returns_current`, `return_items`, `return_shipments`, `return_costs_current`, `return_reviews_current` | MVP6 (inativo) | ninguém hoje | Legado, parado |
| Logística v1 | `shipments_current`, `shipment_orders`, `shipment_items`, `shipment_events`, `shipment_sla_snapshots`, `shipment_costs_current`, `logistics_sla_policies` + 7 views `dashboard_*logistics*` / `dashboard_fulfillment_inventory` | MVP5 (inativo) | painel com `logisticsEnabled = false` (não consulta) | Legado; o código diz que os objetos "serão removidos" |
| Logística v2 | `logistics_v2_*` (8 tabelas) + 3 views `dashboard_logistics_v2_*` | Logística v2 (2 fluxos inativos) | painel (desligado) | Piloto parado |

---

## 1. Controle

### `accounts` — contas Mercado Livre atendidas [G][L]

| Coluna | Observação |
|---|---|
| `id` | uuid, chave primária; referenciada por `devolucoes*`, `oauth_tokens` |
| `account_name` | texto; o painel procura `eq.<SUPABASE_ACCOUNT_NAME>` (padrão "PC Express") |
| `active` | boolean; os fluxos só processam contas com `active = true` |
| `ml_user_id`, `nickname`, `site_id` | atualizados pelo MVP1 a cada execução |
| `last_sync_at`, `updated_at` | atualizados por MVP1, MVP2 e MVP3 |

### `oauth_tokens` — tokens OAuth do Mercado Livre [G][L]

Chave única: `account_id` (há FK para `accounts`, usada no *embed* `accounts!inner(...)`).
Colunas: `account_id`, `ml_user_id`, `access_token`, `refresh_token`, `token_type`, `expires_in`,
`scope`, `expires_at` (gravado como agora + `expires_in` − 300 s), `updated_at`.

- Renovado por MVP1 (Sync Diario e Backfill), MVP7 e, quando ativos, MVP5/MVP6. A Logística v2 só
  lê o `access_token` e falha se ele vence em menos de 10 min.
- O `refresh_token` do Mercado Livre é de uso único: cada renovação devolve um novo e invalida o
  anterior. Duas renovações simultâneas podem deixar o banco com um token já invalidado — por isso
  os horários são desencontrados (MVP1 no minuto 0, MVP7 no minuto 7).

### `sync_runs` — log permanente das execuções [G][L]

Colunas: `id` (PK, devolvido no `POST`), `account_id`, `workflow_name`, `status`
(`running` → `success` | `error`), `started_at`, `finished_at`, `error_message`, `raw_error`
(JSON com `statusCode`, `url`, corpo resumido).

Valores de `workflow_name` gravados: `ml_dashboards_mvp1_seller_sync`,
`ml_dashboards_mvp2_items_sync`, `ml_dashboards_mvp3_orders_sync`, `ml_dashboards_mvp4_visits_sync`,
`ml_dashboards_mvp5_shipments_sync`, `ml_dashboards_mvp6_claims_returns_sync`,
`ml_dashboards_mvp7_devolucoes_sync`. O painel (código de logística, desligado) também espera
`ml_dashboards_mvp7_fulfillment_inventory_sync`, mas **não existe workflow com esse nome no n8n**
— o "MVP7" acabou sendo usado para devoluções.

MVP6 e MVP7 marcam como `error` ("execução órfã") as linhas `running` com mais de 30 min antes de
abrir uma nova. É a melhor fonte de histórico de longo prazo, já que o n8n guarda só ~14 dias.

---

## 2. Comercial (Sync Diario / Backfill)

### `sellers_current` — perfil e reputação atuais [G][L]

Chave única: `seller_id`. Colunas: `account_id`, `seller_id`, `nickname`, `email`, `first_name`,
`last_name`, `registration_date`, `country_id`, `site_id`, `user_type`, `permalink`, `points`,
`tags`, `seller_experience`, `status`, `reputation_level_id`, `power_seller_status`,
`reputation_real_level`, `protection_end_date`, `transactions_period`, `transactions_total`,
`transactions_completed`, `transactions_canceled`, `rating_positive`, `rating_neutral`,
`rating_negative`, `sales_completed`, `claims_rate`, `claims_value`,
`delayed_handling_time_rate`, `delayed_handling_time_value`, `cancellations_rate`,
`cancellations_value`, `raw`, `synced_at`. Origem: `GET /users/me`.

O painel lê `seller_id, nickname, reputation_real_level, power_seller_status,
protection_end_date, transactions_period, synced_at` (a linha mais recente da conta).

### `seller_daily_snapshots` — reputação por dia [G][L]

Chave única: `(account_id, snapshot_date)` — uma linha por dia (as execuções de 2 em 2 h
sobrescrevem a do dia). Mesmas métricas do `sellers_current` (sem dados pessoais) + `raw`.
As taxas (`claims_rate`, `delayed_handling_time_rate`, `cancellations_rate`, `rating_*`) vêm como
**fração** (0,014 = 1,4 %); o painel multiplica por 100.

### `items_current` — anúncios (estado atual) [G][L]

Chave primária: `item_id`. Colunas: `item_id`, `account_id`, `seller_id`, `title`, `category_id`,
`status`, `price`, `base_price`, `original_price`, `available_quantity`, `sold_quantity`,
`listing_type_id`, `condition`, `catalog_listing`, `free_shipping`, `logistic_type`, `permalink`,
`thumbnail`, `last_updated`, `raw`, `synced_at`. Origem: `/users/{id}/items/search` + `/items?ids=`
(lotes de 20).

> **Atenção:** a busca devolveu 99 IDs em 25/10, mas a tabela tem 260 anúncios (o MVP4 consulta
> 260). Os anúncios que deixam de aparecer na busca **não são apagados nem atualizados**: preço,
> estoque e status deles ficam congelados no último valor visto.

### `item_daily_snapshots` [G]

Chave única: `(item_id, snapshot_date)`. Foto diária de `status`, preços, estoques,
`listing_type_id`, `free_shipping`, `logistic_type`, `raw`.

### `orders_current` — pedidos [G][L]

Chave primária: `order_id`. Colunas: `order_id`, `account_id`, `seller_id`, `buyer_id`, `pack_id`,
`shipping_id`, `status` (`paid`, `cancelled`…), `status_detail_code`,
`status_detail_description`, `currency_id`, `total_amount`, `paid_amount`, `fulfilled`,
`buying_mode`, `tags`, `date_created`, `date_closed`, `expiration_date`, `date_last_updated`,
`raw`, `synced_at`. Origem: `/orders/search?seller=…&order.date_created.from/to`.

> **Atenção:** só os pedidos **criados nos últimos 30 dias** são relidos a cada dia. Um pedido mais
> antigo que mude de status depois disso (cancelamento tardio, mediação) fica com o status antigo.
> `raw` e `buyer_id` são dados pessoais do comprador.

### `order_items` — itens de cada pedido [G][L]

Chave primária: `line_id` = `"<order_id>:<posição>"`. Colunas: `order_id`, `account_id`,
`seller_id`, `item_id`, `variation_id`, `title`, `category_id`, `seller_sku`, `listing_type_id`,
`quantity`, `unit_price`, `full_unit_price`, `sale_fee`, `currency_id`, `raw`, `synced_at`.

### `order_daily_snapshots` — resumo diário de pedidos [G]

Chave única: `(account_id, snapshot_date)`. Colunas: `seller_id`, `orders_count`,
`paid_orders_count`, `canceled_orders_count`, `units_sold`, `gross_amount` (soma de
`total_amount`), `paid_amount`, `avg_ticket`, `synced_at`. O painel não lê esta tabela diretamente.

> **Atenção:** o MVP3 recalcula o resumo só com os pedidos da janela de 30 dias "até agora". O dia
> mais antigo da janela entra parcial (só os pedidos depois do horário da execução) e não é mais
> corrigido no dia seguinte. Não use esta tabela como fonte oficial sem verificar.

### `item_visits_daily` — visitas por anúncio por dia [G]

Chave única: `(account_id, item_id, visit_date)`. Colunas: `seller_id`, `visits`,
`total_visits_window`, `visits_detail`, `raw`, `synced_at`. Origem:
`/items/{id}/visits/time_window?last=30&unit=day` (uma chamada por anúncio; os últimos 30 dias são
regravados todo dia).

---

## 3. Views lidas pelo painel comercial

A definição SQL destas views não está no repositório. As colunas abaixo são as que o painel pede.

| View | Colunas lidas | Uso |
|---|---|---|
| `dashboard_item_catalog` | `account_id`, `item_id`, `catalog_source` (`items_current` ou `order_items_fallback`), `synced_at`, `last_updated` | Cobertura do catálogo: anúncios com dados atuais × anúncios que só existem nos pedidos. `updatedAt` do painel = maior `synced_at`/`last_updated` |
| `dashboard_daily_account_summary` | `account_id`, `performance_date`, `items_count`, `fallback_items_count`, `visits`, `units_sold`, `orders_count`, `gross_amount`, `paid_gross_amount`, `avg_ticket`, `conversion_rate_percent` | KPIs, gráfico diário, datas disponíveis (min/max `performance_date`) |
| `dashboard_daily_item_performance` | `account_id`, `performance_date`, `item_id`, `title`, `catalog_source`, `visits`, `units_sold`, `orders_count`, `gross_amount`, `conversion_rate_percent`, `available_quantity`, `status`, `thumbnail`, `permalink` | Ranking e comparação por anúncio |
| `dashboard_daily_order_impact` | `account_id`, `performance_date`, `orders_count`, `paid_orders_count`, `canceled_orders_count`, `gross_amount`, `paid_amount`, `canceled_amount`, `canceled_orders_percent`, `canceled_amount_percent`, `average_canceled_ticket`, `synced_at` | Cancelamentos em Saúde da conta. Calculada sobre `orders_current` com `count(*) filter (where o.status in ('cancelled','canceled'))` |

> **Atenção (definição de "Pedidos"):** o comentário da migração de devoluções registra que
> `dashboard_daily_account_summary` **soma pedidos por anúncio e inclui pedidos cancelados**. Um
> pedido com dois anúncios conta duas vezes, e cancelados entram no total, no ticket médio e na
> conversão. Por isso as devoluções usam outra base (`devolucoes_base_vendas_diaria`). Validar e
> decidir a definição oficial está no [roadmap](07-roadmap.md).

O painel recalcula ticket médio (valor bruto ÷ pedidos) e conversão (pedidos ÷ visitas × 100) a
partir das somas; as colunas `avg_ticket`/`conversion_rate_percent` da view são lidas mas não
usadas nos totais.

---

## 4. Devoluções [M]

Definições completas nas migrações. Resumo:

### `devolucoes` — uma linha por devolução, sempre no estado mais recente

PK `(account_id, claim_id)`; FK `account_id → accounts(id) on delete cascade`.

| Grupo | Colunas |
|---|---|
| Identificação | `claim_id`, `return_id`, `order_id`, `mlb_id`, `titulo_anuncio` |
| Motivo | `familia_motivo` (`PDD` defeito/diferente · `PNR` não recebido), `reason_id`, `motivo_descricao` (fica vazia de propósito) |
| Situação | `status_atual` (status da API com 2 ajustes: `status_money=refunded` → `refunded`; `delivered` com revisão → `reviewed`), `etapa_atual` (uma das 6 etapas; só usada se o status não estiver mapeado no painel) |
| Datas | `data_venda` (date, calendário SP), `data_abertura`, `data_envio_comprador`, `data_recebimento`, `data_reembolso`, `ultima_atualizacao` |
| Valores | `unidades_devolvidas`, `valor_devolvido` (unidades × preço unitário do item, nunca o pedido inteiro), `custo_frete_devolucao` (nulo = desconhecido, não zero) |
| Logística | `logistic_type` (`fulfillment`, `cross_docking`, `self_service`, `drop_off`…) — separa o Full |
| Fila (2026-10-08) | `sku`, `quantidade`, `valor_venda`, `valor_reembolsado`, `comprador_apelido`, `etapa_ml`, `status_reclamacao` (`opened`/`closed`), `status_retorno`, `descricao_status`, `data_prevista`, `destino_retorno`, `rastreio`, `prazo_acao_vendedor`, `acao_pendente`, `resultado` |
| Controle | `synced_at` |

Restrições: família em (`PDD`,`PNR`); etapa em (`aberta`, `enviada_pelo_comprador`, `recebida`,
`revisada`, `reembolsada`, `encerrada_sem_devolucao`); valores ≥ 0; `status_reclamacao` em
(`opened`,`closed`). Índices por abertura, venda, status e `status_reclamacao`.

### `devolucoes_status` — histórico de mudanças de status

PK `(account_id, claim_id, status, data_status)`; FK para `devolucoes`. Colunas: `status`, `etapa`,
`data_status`, `synced_at`. Na primeira gravação o MVP7 reconstrói os marcos conhecidos (abertura,
postagem, entrega, revisão, reembolso).

### `devolucoes_motivos` — dicionário de motivos

PK `(account_id, reason_id)`. Colunas: `familia`, `nome`, `detalhe`, **`erro_operacional`**
(boolean preenchido pelo cliente; nulo = "aguardando classificação"; a ingestão nunca altera),
`synced_at`.

### `devolucoes_claims_sem_devolucao` — controle da ingestão

PK `(account_id, claim_id)`. Colunas: `ultima_atualizacao`, `verificado_em`. Reclamações já
conferidas que não têm devolução; só são reconferidas se `ultima_atualizacao` mudar. Não é lida
pelo painel.

### View `devolucoes_base_vendas_diaria` — denominador do Fechamento

`security_invoker = true`. Por `account_id` e `data_venda` (calendário SP): `pedidos_pagos`
(`count(distinct order_id)`), `unidades_pagas` (`sum(quantity)`), `faturamento_pago`
(`sum(quantity × unit_price)`), a partir de `orders_current` (`status = 'paid'`) +
`order_items`. Limite conhecido: pedidos não guardam a logística, então esta base **não consegue
excluir o Full**.

Números de 26/10/2026 (saída do MVP7): 439 devoluções no banco; 828 reclamações nos últimos 180
dias, das quais 445 sem devolução; 24 reclamações abertas. Linhas ainda sem dado:
`data_envio_comprador` 81, `data_recebimento` 98, `status_reclamacao`/`sku`/`valor_venda` 27.

---

## 5. Legado — Pós-venda v7 (MVP6, inativo)

Gravadas pelo fluxo `ML Dashboards - MVP6 Pos-venda Claims Returns v7 Retomavel` (desativado). O
MVP7 **não** depende delas (usa só `accounts`, `oauth_tokens` e `sync_runs`).

| Tabela | Chave (`on_conflict`) | Colunas |
|---|---|---|
| `claims_current` | `account_id, claim_id` | `seller_id`, `resource`, `resource_id`, `status`, `claim_type`, `stage`, `reason_id`, `fulfilled`, `quantity_type`, `related_entities`, `date_created`, `date_last_updated`, `raw` (inclui `_sync_access` para detalhes 403/404), `synced_at` |
| `claim_orders` | `account_id, claim_id, order_id` | `item_id`, `variation_id`, `context_type`, `total_quantity`, `claimed_quantity`, `raw`, `synced_at` |
| `returns_current` | `account_id, return_id` | `claim_id`, `seller_id`, `status`, `status_money`, `subtype`, `resource_id`, `intermediate_check`, `return_total`, `related_entities`, `date_created`, `date_last_updated`, `raw`, `synced_at` |
| `return_items` | `account_id, return_id, return_item_key` | `claim_id`, `order_id`, `item_id`, `variation_id`, `context_type`, `total_quantity`, `return_quantity`, `raw`, `synced_at` |
| `return_shipments` | `account_id, return_id, shipment_id` | `claim_id`, `status`, `tracking_number`, `destination_type`, `raw`, `synced_at` |
| `return_costs_current` | `account_id, claim_id` | `return_id`, `seller_id`, `currency_id`, `amount`, `amount_usd`, `charged_at`, `raw`, `last_seen_at`, `synced_at` |
| `return_reviews_current` | `account_id, return_id, review_key` | `order_id`, `method`, `stage`, `review_status`, `product_condition`, `product_destination`, `reason_id`, `benefited`, `seller_status`, `seller_reason`, `missing_quantity`, `date_created`, `date_last_updated`, `raw`, `synced_at` |

## 6. Legado — Logística v1 (MVP5, inativo)

Tabelas gravadas pelo `ML Dashboards - MVP5 Logistica Shipments v2`:

| Tabela | Chave | Colunas principais |
|---|---|---|
| `shipments_current` | `account_id, shipment_id` | `seller_id`, `direction` (`outbound`/`return`), `pack_id`, `status`, `substatus`, `mode`, `logistic_mode`, `logistic_type`, `service_id`, `shipping_method_*`, `tracking_number`, `tracking_method`, `carrier_name`, `carrier_url`, `date_created`, `date_last_updated`, `dispatch_deadline_current`, `dispatch_sla_status_current`, `dispatch_sla_service`, `delivery_promise_current`, `delivery_limit_current`, `delivery_extended_current`, `delay_reasons`, `tags`, `raw_shipment`, `raw_sla`, `raw_lead_time`, `raw_carrier`, `synced_at` |
| `shipment_orders` | `account_id, shipment_id, order_id` | `seller_id`, `pack_id`, `synced_at` |
| `shipment_items` | `account_id, shipment_id, shipment_item_key` | `order_id`, `item_id`, `variation_id`, `seller_sku`, `description`, `quantity`, `height_cm`, `width_cm`, `length_cm`, `weight_g`, `raw` |
| `shipment_events` | `account_id, shipment_id, event_key` | `event_code` (`handling_started`, `label_ready`, `seller_handoff`, `in_hub`, `shipped`, `out_for_delivery`, `delivered`, `not_delivered`, `cancelled`…), `status`, `substatus`, `event_at`, `source`, `raw`, `last_seen_at` |
| `shipment_sla_snapshots` | `account_id, shipment_id, snapshot_key` | `dispatch_sla_status`, `dispatch_sla_service`, `dispatch_deadline`, `delivery_promise`, `delivery_limit`, `delivery_extended`, `estimated_handling_*`, `estimated_shipping_*`, `delay_reasons`, `raw_sla`, `raw_lead_time` |
| `shipment_costs_current` | `account_id, shipment_id` | `seller_id`, `currency_id`, `gross_amount`, `seller_cost`, `seller_compensation`, `receiver_cost`, `receiver_compensation`, `seller_discounts`, `receiver_discounts`, `raw` |
| `logistics_sla_policies` | ? | `policy_name`, `logistic_type`, `start_event_code`, `end_event_code`, `target_minutes`, `valid_from`, `valid_to`, `active` (metas internas; lida pelo painel) |

Views que o painel consultava (código ainda presente, desligado): `dashboard_daily_logistics_sla`,
`dashboard_daily_logistics_reconciliation_waterfall` (e a base
`dashboard_logistics_shipment_reconciliation`), `dashboard_daily_logistics_economics`,
`dashboard_fulfillment_inventory` (`inventory_id`, quantidades, `synced_at` — o fluxo que a
alimentava não existe mais), `dashboard_logistics_stage_times`. As colunas estão nos tipos
`Logistics*Record` em `lib/supabase-dashboard.ts`.

## 7. Legado — Logística v2 (piloto, inativo)

Gravadas pelos fluxos "Logistica v2 - Sincronizacao incremental" e "Logistica v2 - Backfill
mensal retomavel" (ambos desativados):

| Tabela | Chave | Uso |
|---|---|---|
| `logistics_v2_sync_runs` | `run_id` (PK) | Log próprio: `workflow_name` (`logistics_v2_incremental_sync`, `logistics_v2_backfill_day`), `run_type`, `status` (`running`/`success`/`partial`/`failed`), janela, contadores, `metadata` |
| `logistics_v2_checkpoints` | `account_id, workflow_name, checkpoint_key` | Cursor (`incremental:cursor`) e progresso por dia (`backfill:AAAA-MM:AAAA-MM-DD`) |
| `logistics_v2_orders` | `account_id, order_id` | Pedidos, com `raw_order` |
| `logistics_v2_order_payments` | `account_id, order_id, payment_id` | Pagamentos (`date_approved` é a base provável da coorte "dia do pagamento") |
| `logistics_v2_shipments_current` | `account_id, shipment_id` | Envio atual + `terminal_rechecked_at`, `terminal_audited_at` |
| `logistics_v2_shipment_orders` | `account_id, shipment_id, relation_key` | Relação envio × pedido × item |
| `logistics_v2_shipment_events` | `account_id, shipment_id, status, substatus_key, occurred_at` | Histórico (`substatus_key` não é enviado pelo fluxo: provavelmente coluna gerada a partir de `substatus`) |
| `logistics_v2_shipment_costs_current` | `account_id, shipment_id, seller_id` | Custos com `fetch_status` e `currency_source` |

Views: `dashboard_logistics_v2_facts` (um envio por linha com `outcome`, `cohort_date` e tempos
pago→trânsito→entrega), `dashboard_logistics_v2_backlog_current` (abertos por faixa de idade),
`dashboard_logistics_v2_data_health` (1 linha de saúde da carga).

---

## Como confirmar no banco

Rodar no *SQL Editor* do Supabase e guardar o resultado no repositório (por exemplo
`supabase/schema/ml_dashboards.sql`):

```sql
-- Tabelas e views do schema
select table_name, table_type
from information_schema.tables
where table_schema = 'ml_dashboards'
order by table_type, table_name;

-- Colunas, tipos e nulabilidade
select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'ml_dashboards'
order by table_name, ordinal_position;

-- Chaves primárias e únicas
select tc.table_name, tc.constraint_type, string_agg(kcu.column_name, ', ' order by kcu.ordinal_position) as colunas
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
where tc.table_schema = 'ml_dashboards' and tc.constraint_type in ('PRIMARY KEY', 'UNIQUE', 'FOREIGN KEY')
group by tc.table_name, tc.constraint_type, tc.constraint_name
order by tc.table_name;

-- Definição de todas as views
select viewname, definition from pg_views where schemaname = 'ml_dashboards' order by viewname;

-- Volume aproximado por tabela
select relname, n_live_tup from pg_stat_user_tables where schemaname = 'ml_dashboards' order by n_live_tup desc;
```

Ou, com acesso ao Postgres: `pg_dump --schema-only --schema=ml_dashboards --no-owner "$DATABASE_URL" > supabase/schema/ml_dashboards.sql`.

Saúde da ingestão (última execução de cada fluxo):

```sql
select distinct on (workflow_name)
  workflow_name, status, started_at, finished_at, error_message
from ml_dashboards.sync_runs
order by workflow_name, started_at desc;
```

Conferência rápida da definição de "Pedidos" (diferença entre a view do painel e os pedidos únicos):

```sql
select s.performance_date, s.orders_count as pedidos_view,
       count(distinct o.order_id) filter (where o.status = 'paid') as pedidos_pagos_unicos,
       count(distinct o.order_id) as pedidos_unicos
from ml_dashboards.dashboard_daily_account_summary s
left join ml_dashboards.orders_current o
  on o.account_id = s.account_id
 and date(o.date_created at time zone 'America/Sao_Paulo') = s.performance_date
where s.performance_date >= current_date - 30
group by 1, 2
order by 1 desc;
```
