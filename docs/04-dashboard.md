# 04 · O painel (Next.js)

## Stack

| Item | Versão / escolha |
|---|---|
| Framework | Next.js **16.2.6**, App Router, build com **webpack** (`next dev --webpack`, `next build --webpack`) |
| UI | React **19.2.6**, um único client component por tela; ícones `lucide-react`; **sem biblioteca de gráficos** (SVG e CSS feitos à mão) |
| Linguagem | TypeScript 5.9, `strict`, alias `@/*` → raiz |
| Gerenciador | pnpm **11.9.0** (`packageManager`), Node `>=22.13 <25` (Vercel: 22.x) |
| Lint | ESLint 9, flat config com `eslint-config-next/core-web-vitals` + `typescript` |
| Testes | `node --test tests/*.test.mjs` (sem Jest/Vitest) |
| Fontes | `next/font/google`: Bricolage Grotesque (títulos), Schibsted Grotesk (interface), Space Mono (números) |
| Supabase | **sem SDK**: `fetch` direto no PostgREST |

## Mapa de arquivos

| Arquivo | Linhas | Responsabilidade |
|---|---|---|
| `app/page.tsx` | ~3 000 | Toda a interface: casca (menu, barra superior, filtro de datas) e as telas `OverviewView`, `SalesView`, `ProductsView`, `PerformanceView`, `TrafficView`, `SellerView`, além de `LogisticsView`/`LogisticsV2View` (dormentes) e componentes compartilhados |
| `app/dashboard-types.ts` | ~800 | Tipos do contrato `DashboardData` e o objeto `FALLBACK_DASHBOARD_DATA` |
| `lib/supabase-dashboard.ts` | ~2 240 | Camada de dados do painel comercial: leitura das env vars, `supabaseFetch`/`fetchAll`, `resolveDateSelection`, consultas e todos os cálculos (`build*`) |
| `app/api/dashboard/route.ts` | ~100 | `GET /api/dashboard`: valida parâmetros e chama `getDashboardData` |
| `app/api/returns/route.ts` | ~70 | `GET /api/returns`: valida datas e chama `getReturnsData` |
| `lib/supabase-returns.ts` | ~280 | Leitura das tabelas de devoluções e decisão do modo demonstração |
| `lib/returns-demo-data.ts` | ~345 | Gerador determinístico de devoluções fictícias (IDs `DEMO-…`) |
| `app/returns/ReturnsView.tsx` | ~870 | Tela Devoluções (Acompanhamento e Fechamento) e alertas da Visão geral |
| `app/returns/returns-metrics.ts` | ~610 | Funções puras de cálculo das devoluções (testadas direto no Node) |
| `app/returns/returns-config.ts` | ~80 | **Regras de negócio de devoluções** (mapa de status, limites provisórios) |
| `app/returns/returns-types.ts` | ~140 | Contrato `ReturnsPayload` |
| `app/metric-signals.ts` | ~145 | Semântica de cor (bom/atenção/ruim) e limites de saúde do vendedor |
| `app/layout.tsx`, `error.tsx`, `not-found.tsx` | — | Metadados/fontes, tela de erro isolada, 404 |
| `app/globals.css` | ~750 | Todo o CSS (tokens em `:root`, sem Tailwind) |
| `public/` | — | `pcxpress-logo.webp`, `og.png` |
| `ingestao/n8n/` | — | Cópias sem chaves dos workflows + README da ingestão de devoluções |
| `supabase/migrations/` | — | As 3 migrações de devoluções |
| `tests/` | — | 4 arquivos de teste (ver [Testes](#testes)) |

## Como uma tela é montada

```text
app/page.tsx (client)
  ├─ useEffect → fetch /api/dashboard?periodDays=30&logisticsType=all      (ou currentStart/currentEnd/comparisonMode/…)
  │     └─ route.ts valida → getDashboardData(query)
  │           ├─ readConfig() → sem env vars → fallbackForQuery()        (connected:false)
  │           ├─ getAccount()  → accounts?account_name=eq.PC Express
  │           ├─ 2 consultas: primeira e última performance_date da conta  → âncora das datas
  │           ├─ resolveDateSelection(query, âncora)
  │           ├─ Promise.all(consultas)  ← 1 consulta por view cobrindo os 2 períodos (filtro `or`)
  │           └─ separa período atual × comparação em memória (inRange) e calcula tudo
  └─ quando dateSelection chega → fetch /api/returns?currentStart=…&currentEnd=…&comparisonStart=…&comparisonEnd=…
        └─ getReturnsData(window) → devolucoes, devolucoes_status, devolucoes_motivos, devolucoes_base_vendas_diaria
```

- Antes da primeira resposta a tela mostra `FALLBACK_DASHBOARD_DATA` (números de exemplo, selo
  "Dados de demonstração"). Mudar o formato de `DashboardData` exige atualizar esse objeto.
- Se a chamada falhar, a tela volta ao fallback com a mensagem de erro (nunca quebra).
- O botão de atualizar incrementa `refreshNonce` e refaz as duas chamadas.
- `cache: "no-store"` no cliente e no servidor; as rotas são `dynamic = "force-dynamic"` e
  `runtime = "nodejs"` e respondem com `Cache-Control: no-store`.

## Contratos das APIs

### `GET /api/dashboard`

| Parâmetro | Valores | Regra |
|---|---|---|
| `periodDays` | 7, 30, 90 | Qualquer outro valor vira 30. Ignorado se `currentStart/currentEnd` vierem |
| `currentStart`, `currentEnd` | `AAAA-MM-DD` | Os dois ou nenhum; início ≤ fim; no máximo 366 dias |
| `comparisonMode` | `previousPeriod` (padrão), `previousMonthEquivalent`, `previousMonthFull`, `custom`, `none` | Valor desconhecido vira `previousPeriod` |
| `comparisonStart`, `comparisonEnd` | `AAAA-MM-DD` | Obrigatórios só em `custom`; mesma validação |
| `logisticsType` | `all`, `fulfillment`, `cross_docking`, `flex` | Outro valor → 400 "Modalidade inválida". Só afetava a Logística |

Erros de validação → **400** com `{ "error": "<mensagem em português>" }`. Qualquer erro do
Supabase **não** vira 500: a resposta é 200 com `source: "fallback"`, `connected: false` e
`message` com o erro (ex.: `Supabase 404: …PGRST…`). Por isso, para diagnosticar, abra
`/api/dashboard?periodDays=30` e leia `connected` e `message`.

Principais campos da resposta (`DashboardData`, em `app/dashboard-types.ts`):

| Campo | Conteúdo |
|---|---|
| `source`, `connected`, `message` | Origem (`supabase`/`fallback`) e erro, se houver |
| `accountName`, `updatedAt` | "PCXpress" e o último `synced_at`/`last_updated` do catálogo |
| `dateSelection`, `availableDateRange` | Período aplicado, comparação, rótulo; primeira e última data com dados |
| `catalog` | Totais de anúncios (atuais, preservados pelas vendas, sem classificação) |
| `sales`, `comparison.sales` | Totais do período e da comparação (`null` se não houver dias na comparação) |
| `dailyPerformance` | Séries diárias atual e anterior (gráfico) |
| `topProducts` | 12 anúncios de maior valor bruto no período |
| `productComparisons` | Até 50 anúncios com métricas nos dois períodos e posição no ranking |
| `sellerHealth` | Perfil atual, snapshot mais recente em cada período, histórico do período |
| `cancellations` | Totais e série diária de cancelamentos (por pedidos) |
| `logistics`, `logisticsV2` | Sempre vazios hoje (Logística desligada), mas com o formato completo |

### `GET /api/returns`

`currentStart` e `currentEnd` obrigatórios; `comparisonStart`/`comparisonEnd` opcionais (os dois
ou nenhum); mesma validação de 366 dias. O painel sempre passa as datas **já resolvidas** pelo
`/api/dashboard`. Resposta `ReturnsPayload` com `status` (`ready`, `empty`, `tables_missing`,
`not_configured`, `error`), `demo`, `generatedAt`, `records`, `history`, `reasons`, `salesDaily`,
`salesBaseAvailable`. Detalhes em [05-devolucoes.md](05-devolucoes.md).

## Modelo de datas

A **âncora** é a última `performance_date` de `dashboard_daily_account_summary` da conta (sem
dados, a data de hoje em UTC). Com os atalhos, o período atual é `[âncora − (N−1), âncora]`.

| Modo | Período de comparação |
|---|---|
| `previousPeriod` | Mesmo número de dias, terminando no dia anterior ao início do período atual ("30 dias anteriores") |
| `previousMonthEquivalent` | Início e fim deslocados um mês para trás, com o dia limitado ao fim do mês ("Mesmo intervalo no mês anterior") |
| `previousMonthFull` | O mês inteiro anterior ao mês do início do período ("Mês anterior completo") |
| `custom` | Datas informadas ("Período personalizado") |
| `none` | Sem comparação |

Detalhes que importam:

- Uma única consulta por view busca os dois períodos com
  `or=(and(performance_date.gte.A,performance_date.lte.B),and(...C,...D))`; o código separa os
  períodos em memória. Paginação de 1 000 linhas pelo cabeçalho `Range`; *timeout* de 15 s por
  chamada.
- Com períodos de tamanhos diferentes, a tela avisa ("Compare totais absolutos com cautela").
- O gráfico alinha os dois períodos pelo **dia 1, dia 2…** (não pela data), e dias sem registro
  ficam como lacuna (não são zerados).
- Snapshots do vendedor: usa o **último snapshot dentro** de cada período.
- Datas `AAAA-MM-DD` são exibidas com `timeZone: "UTC"` para não "voltar um dia".

## Fórmulas (iguais em todo o painel e verificadas pelos testes)

| Métrica | Fórmula | Observação |
|---|---|---|
| Valor bruto | Σ `gross_amount` | Sempre em reais completos (`Intl.NumberFormat` BRL) |
| Valor pago | Σ `paid_gross_amount` | Mostrado ao lado do bruto |
| Pedidos | Σ `orders_count` da view diária | Ver ressalva sobre pedidos multi-anúncio e cancelados em [02-supabase.md](02-supabase.md#3-views-lidas-pelo-painel-comercial) |
| Conversão | pedidos ÷ visitas × 100 | **Pedidos**, não unidades. `null` sem visitas |
| Ticket médio | valor bruto ÷ pedidos | |
| Unidades por pedido | unidades ÷ pedidos | |
| Variação | (atual − anterior) ÷ \|anterior\| × 100 | Anterior 0 e atual > 0 → "Novo" |
| Cancelamento (% pedidos) | cancelados ÷ pedidos criados × 100 | De `dashboard_daily_order_impact` |
| Cancelamento (% valor) | valor cancelado ÷ valor bruto × 100 | |
| Ticket cancelado | valor cancelado ÷ cancelados | |
| Taxas do ML (reclamações, atrasos, cancelamentos) | fração do snapshot × 100 | Período próprio do ML (`transactions_period`), diferente do filtro |
| Variação das taxas do ML | (atual − comparação) × 100 em **p.p.** | "+0,12 p.p. desde 01/10/2026" |

Ranking de anúncios: ordenado por valor bruto; só entra no ranking quem tem valor > 0. A tabela
de comparação lista os 50 com maior valor em qualquer um dos dois períodos (mostra 12).

## Casca da interface

- **Menu lateral:** "Análises" (Visão geral, Vendas, Produtos e anúncios, Desempenho, Tráfego e
  conversão) e "Controle" (Saúde da conta, Devoluções — com etiqueta "Fictício" no modo
  demonstração). Rodapé com o estado da conexão. Em telas estreitas vira gaveta (botão de menu).
- **Barra superior:** seletor de conta (só visual, uma conta), selo "Dados atualizados"/"Dados de
  demonstração", atalhos **7d/30d/90d**, botão **Personalizar** (painel de datas) e **Atualizar**.
- **Painel de datas:** período principal (limitado às datas disponíveis), regra de comparação,
  datas da comparação personalizada, validações (início ≤ fim, até 366 dias) e aviso de durações
  diferentes.
- **Título da página:** nome e descrição da aba + faixa com as datas aplicadas.

## Abas

### Visão geral (`OverviewView`)

- 4 KPIs com comparação: **Valor bruto** (destaque), **Pedidos**, **Ticket médio**, **Unidades
  vendidas** (a comparação deste card é de unidades por pedido).
- **Resumo comercial:** Visitas → Conversão → Pedidos → Valor bruto.
- **Gráfico diário** (`PeriodComparisonChart`): alterna Valor bruto / Pedidos / Unidades /
  Visitas; tooltip com o valor do dia, o do dia equivalente, a variação entre períodos e contra o
  dia anterior.
- **Cobertura do catálogo:** barra com anúncios "com atributos atuais" × "histórico preservado"
  × "pendências".
- **Pontos de atenção** (sobre os 12 anúncios do ranking):
  conversão do anúncio abaixo da conversão da conta (com visitas > 0);
  estoque disponível ≤ unidades vendidas no período;
  queda de mais de 10 % no valor bruto em relação à comparação;
  mais os alertas de devoluções (prazo do vendedor vencido/hoje, devoluções paradas, alta de erro
  operacional) — ocultos enquanto não houver devoluções.
- Tabela dos 8 anúncios de maior valor bruto.

### Vendas (`SalesView`)

Faixa "Dados considerados" com a última data; KPIs Valor bruto, Pedidos, Unidades, Média por
pedido; o mesmo gráfico; painel "Dimensão do período" e "Regras de leitura" (as 3 fórmulas).
> As barras de "Dimensão do período" têm larguras fixas no código (86 %, 100 %) — são decorativas.

### Produtos e anúncios (`ProductsView`)

KPIs de catálogo (total, com dados operacionais, unidades, cobertura classificada); **Comparação
por anúncio** (visitas, pedidos, unidades, valor, conversão, variação, posição no ranking com
"Subiu/Caiu N posições", "Novo no ranking", "Sem vendas").
> O bloco "Ações operacionais" (estoque crítico, pausado com estoque, sem venda com visita) é
> **estático**: mostra só "Disponível"/"Sem dados", não calcula nada.

### Desempenho (`PerformanceView`)

Faixa "Visitas + Unidades + Preço e status = Decisão por anúncio"; KPIs (período, visitas,
nível de detalhe, conversão); tabela dos 8 maiores anúncios. Sem dados, mostra uma tabela fixa de
orientação (muita visita + pouca venda etc.).

### Tráfego e conversão (`TrafficView`)

Funil Visitas → Pedidos → Unidades com comparação. As larguras do funil (100 %, 78 %, 56 %) e a
lista "Perguntas respondidas" são fixas.

### Saúde da conta (`SellerView`)

- Cabeçalho com o apelido, a data do snapshot, dias disponíveis e o nível MercadoLíder.
- KPIs oficiais do ML: **Reputação** (rótulo de `5_green` … `1_red`), **Reclamações**,
  **Atrasos**, **Cancelamentos** (taxa + ocorrências + variação em p.p.).
- Aviso de que o índice do ML usa período próprio.
- KPIs calculados pelos pedidos do período: pedidos cancelados (e %), valor bruto cancelado,
  impacto sobre o valor, ticket cancelado.
- Gráfico de barras **Cancelamentos por dia**, **Resumo da conta** (transações, avaliações,
  proteção até) e **Histórico da conta** (uma linha por snapshot do período).

### Devoluções (`ReturnsView`)

Ver [05-devolucoes.md](05-devolucoes.md).

### Logística (dormente)

Removida do menu em 05/10/2026. Continuam no código: `LogisticsView` e `LogisticsV2View`
(~900 linhas em `page.tsx`), os tipos `Logistics*` e todas as consultas em
`getDashboardData`, desligadas por `const logisticsEnabled = false;` (comentário: "evita chamadas
aos objetos exclusivos que serão removidos do Supabase"). `ViewId` ainda inclui `"logistics"` e o
`switch` ainda renderiza a tela, mas não há item de menu que leve a ela. O que ela mostrava:
pontualidade de despacho/entrega pelos prazos do ML, fila operacional, reconciliação da base de
despacho, tempos por etapa, metas internas, frete e devoluções, estoque no Full e saúde das fontes.
A decisão entre remover de vez ou reativar via Logística v2 está no [roadmap](07-roadmap.md).

## Componentes compartilhados

| Componente | O que faz |
|---|---|
| `KpiCard` | Card com rótulo, valor, detalhe, ícone, tom fixo (`neutral/good/warning/brand`) e `ComparisonIndicator` opcional |
| `ComparisonIndicator` | "x,x % em relação ao período anterior": **verde quando sobe, vermelho quando cai**, sempre |
| `PeriodComparisonChart` + `buildChartPath` | Gráfico de linhas SVG (viewBox 860×260), duas séries, área de *hover* por dia |
| `TopProductsTable`, `ProductComparisonTable`, `ProductVariation`, `ProductRank` | Tabelas de anúncios |
| `CancellationTrend` | Barras verticais em CSS |
| `PanelTitle` | Título/subtítulo/ação de cada painel |

**Cores com significado (`app/metric-signals.ts`).** O arquivo define `evaluateTrend` (seta =
fato, cor = julgamento, zona morta de 2 %, direção `lowerIsBetter`), `SELLER_RATE_THRESHOLDS`
(limites **provisórios**: reclamações bom ≤ 1 %, atenção ≤ 2 %; atrasos ≤ 10 % / ≤ 15 %;
cancelamentos ≤ 1 % / ≤ 2 %) e `reputationSignal`. Foi ligado ao `ComparisonIndicator` em 18/08
(PR #2), mas o upload manual de `page.tsx` em 23/08 desfez a ligação: **hoje só a seção Devoluções
usa `metric-signals`** e `SELLER_RATE_THRESHOLDS` não é usado em lugar nenhum. Item do roadmap.

## Formatação e texto

- Toda a interface em pt-BR. Moeda: `Intl.NumberFormat("pt-BR", { style: "currency", currency:
  "BRL" })`, sempre completa (teste impede "mil"/"mi"). Percentuais com 2 casas ("Sem dados" quando
  nulo; "—" em tabelas). Números inteiros com separador de milhar.
- Estilo: tokens em `:root` (`--brand: #00d8ff`, `--ink`, `--muted`, `--green`, `--amber`,
  `--red`…), menu escuro, quebras em 1120 px, 860 px e 600 px. A página não pode ter rolagem
  lateral no celular (tabelas rolam dentro do próprio quadro).

## Testes

`pnpm run test` = `node --test tests/*.test.mjs`. Rodar um arquivo:
`node --test tests/returns.test.mjs`; um caso: `--test-name-pattern="<trecho do nome>"`.

| Arquivo | Testes | O que cobre |
|---|---|---|
| `tests/project.test.mjs` | 14 | Verificações por texto no código: build/rotas, chave só no servidor, modos de comparação, validação de datas, fórmulas, moeda completa, cancelamentos, logística |
| `tests/returns.test.mjs` | 13 | Importa `app/returns/returns-metrics.ts` direto (precisa de Node com *type stripping*, 22.18+; senão os testes de cálculo são pulados) e confere migrações e a integração no menu |
| `tests/ingestao-mvp7.test.mjs` | 9 | Executa o código do node do MVP7 com Mercado Livre e Supabase falsos |
| `tests/ingestao-n8n.test.mjs` | 1 | Nenhuma cópia de workflow em `ingestao/n8n/` guarda chaves |

**Falhas conhecidas (3, todas em `tests/project.test.mjs`, `ENOENT`):** "renders the account
history and calculates cancellations from order-level data", "separates logistics modalities,
punctuality, backlog and reconciliation" e "keeps the operational backlog independent of sale date
and Full outside seller dispatch". Eles leem scripts SQL que nunca foram enviados ao GitHub e que
ficavam na **pasta acima da raiz do projeto**: `supabase-seller-health-cancellations.sql`,
`supabase-logistics-shipment-reconciliation-v5.sql` e
`supabase-check-logistics-shipment-reconciliation-v5.sql`. (Havia uma quarta falha, por falta do
`.env.example`, resolvida em 26/10.) Resultado atual: 37 testes, 34 passam. Os testes de logística
também verificam textos da `LogisticsView` dormente; se a Logística for removida, eles precisam
sair junto.

`pnpm run check` roda lint + test + build (com as 3 falhas acima, o `check` para no test).

## Build e deploy

- Vercel com detecção nativa do Next.js, **sem `vercel.json`**; *Root Directory* vazio
  (`package.json` na raiz); *Framework* Next.js; não sobrescrever build/install/output; Node 22.x.
- Variáveis em *Settings → Environment Variables* (lista em
  [01-arquitetura.md](01-arquitetura.md#painel-vercel-e-envlocal)). Depois de mudar variáveis,
  fazer *Redeploy* sem reaproveitar o cache.
- Prévias (*Preview*) mostram devoluções **fictícias** por padrão (`VERCEL_ENV=preview`).
- Verificação pós-deploy: `/api/dashboard?periodDays=30` com `"connected": true`, selo "Dados
  atualizados" na página, atalhos 7d/30d/90d e botão de atualizar.

## Convenções para mudanças

- Linhas do banco em snake_case, tipadas como `*Record` privados em `lib/`; o contrato da tela em
  camelCase em `app/*-types.ts`.
- Fonte nova que pode não existir em todos os ambientes: usar `optionalFetchAll` (devolve `[]`) ou
  `optionalFetchAllWithAvailability` (devolve `{ available, rows }`) — o painel nunca deve cair
  porque uma view ainda não foi criada.
- Cálculo novo de devoluções: função pura em `returns-metrics.ts` + teste em
  `tests/returns.test.mjs`; limite novo em `returns-config.ts`.
- Os PRs do projeto descrevem o que muda, o impacto para o cliente e a verificação (lint, test,
  build e navegador, inclusive no celular) — vale manter o padrão.
