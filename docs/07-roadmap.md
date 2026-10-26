# 07 · Roadmap e próximos passos

> **De onde vem esta lista.** O README cita um `docs/ROADMAP-EVOLUCAO-DASHBOARD.md` que **nunca foi
> enviado ao repositório**. Os itens abaixo foram reconstruídos a partir do que está marcado no
> código como provisório, dos "próximos passos" e "não validado" dos PRs, das lacunas encontradas
> nesta documentação e dos placeholders da interface. Se o roadmap original for recuperado, ele
> deve ser conciliado com esta lista.
>
> Esforço: **P** (horas), **M** (1–3 dias), **G** (uma semana ou mais).

## P0 — Transição e segurança (fazer antes de qualquer funcionalidade)

| # | Item | Por quê | Onde | Esforço |
|---|---|---|---|---|
| 1 | Transferir o repositório `pedromeneleu/pcxpress-ml-dashboard-nextjs` para a organização da Aruna (ou para o responsável) e reconectar o projeto na Vercel | Está numa conta pessoal de quem está saindo | GitHub → Settings → Transfer; Vercel → Git | P |
| 2 | Garantir acesso de administrador ao projeto da Vercel, ao n8n, ao Supabase, ao app do Mercado Livre (DevCenter) e ao espaço do Google Chat | Sem isso não há como operar | — | P |
| 3 | **Rotacionar segredos**: client secret do app ML, chave `service_role`/segredo JWT do Supabase (exige atualizar Vercel e todos os CONFIG do n8n), chave/token do webhook do Google Chat | Estão em texto puro nos nodes do n8n e eram acessíveis a quem está saindo | n8n, Supabase, Vercel, DevCenter ML | M |
| 4 | Tirar as chaves dos nodes `CONFIG` e usar Credentials ou variáveis do n8n (`$env`/Variables) | Qualquer leitor do workflow vê as chaves; cada rotação exige editar 5+ fluxos | n8n | M |
| 5 | Versionar o DDL completo do schema (`pg_dump --schema-only --schema=ml_dashboards`) em `supabase/schema/` | Tabelas e views principais só existem no banco; sem isso não há como recriar o ambiente | Ver [02-supabase.md](02-supabase.md#como-confirmar-no-banco) | P |
| 6 | Recuperar da máquina de quem está saindo: `docs/*.md` antigos citados no README, `supabase-seller-health-cancellations.sql`, `supabase-logistics-shipment-reconciliation-v5.sql`, `supabase-check-logistics-shipment-reconciliation-v5.sql` | Contexto perdido + 3 testes falhando | Pasta local do projeto (os SQL ficavam um nível acima da raiz) | P |
| 7 | Exportar todos os workflows ML do n8n, inclusive os inativos (MVP5, MVP6, Logística v2), e guardar sanitizados em `ingestao/n8n/` | O código deles só existe no n8n; arquivar/apagar perderia tudo | n8n → Download | P |
| 8 | Corrigir a suíte de testes: versionar os 3 SQL lidos pelos testes (item 6) ou ajustar/remover esses testes. O `.env.example` já foi criado junto com esta documentação | `pnpm run check` nunca passa por inteiro, o que esconde regressões | `tests/project.test.mjs` | P |

## P1 — Confiabilidade e qualidade dos dados

| # | Item | Evidência | Onde | Esforço |
|---|---|---|---|---|
| 9 | **Definir "Pedidos" oficialmente.** A view `dashboard_daily_account_summary` soma pedidos por anúncio (pedido com 2 anúncios conta 2×) e inclui cancelados; isso afeta Pedidos, Ticket médio e Conversão | Comentário em `2026-10-05_devolucoes.sql`; consulta de conferência em [02-supabase.md](02-supabase.md#como-confirmar-no-banco) | View no Supabase + rótulos no painel | M |
| 10 | Atualizar status de pedidos antigos: o MVP3 só relê pedidos criados nos últimos 30 dias; cancelamentos/mediações tardias ficam com status velho (afeta cancelamentos e a base de vendas das devoluções) | Código do MVP3 | Trocar/adicionar busca por `order.date_last_updated` (a Logística v2 já faz isso) | M |
| 11 | Anúncios que saem da busca ficam congelados em `items_current` (99 na busca × 260 na tabela) — status/estoque podem estar errados | Saída do Sync Diario de 25/10 | MVP2: atualizar também os IDs já conhecidos via `/items?ids=` ou buscar por status | P |
| 12 | `order_daily_snapshots` grava o dia mais antigo da janela parcial | Código do MVP3 | Descartar o primeiro dia parcial ou recalcular pelo banco | P |
| 13 | Alertas de falha: nenhum fluxo ML tem *Error Workflow*; uma falha só é vista abrindo o n8n | Os fluxos `catalog-monitor` e "Monitor \| Erros Mídia Paga" já usam Error Trigger → Google Chat | n8n | P |
| 14 | Monitor de frescor: alerta se `sync_runs` não tiver `success` de cada fluxo nas últimas 26 h (Sync Diario) / 3 h (MVP7) | Retenção do n8n é de ~14 dias; `sync_runs` é permanente | n8n ou SQL agendado | P |
| 15 | Retentativas em 429/5xx nos nodes MVP1–MVP4 (hoje um erro de rede derruba o dia) | Código do Sync Diario | Copiar `requestWithRetry` do MVP7 | P |
| 16 | Ficar de olho no limite de 300 s do node Code (MVP7 estourou uma vez em 20/10) | Execução 77896 | Reduzir `max_claims_to_process_per_run` se repetir | P |
| 17 | Processo de "editou no n8n → atualiza a cópia no repo" (ou o inverso: só importar do repo) | MVP7 ficou 10 dias diferente | Combinar com o time | P |

## P2 — Evolução do painel

### Devoluções

| # | Item | Evidência | Esforço |
|---|---|---|---|
| 18 | **Classificação de motivos pelo cliente** (`devolucoes_motivos.erro_operacional`): hoje não existe tela nem processo; o KPI "% por erro operacional" fica "Aguardando classificação" | Coluna nula por desenho; a ingestão nunca altera | M (tela simples ou planilha → SQL) |
| 19 | Confirmar com a operação da PCXpress os limites provisórios: 3 dias para "parado", 2 dias para prazo do vendedor, 60 dias de mês provisório, alerta de +5 p.p. | Marcados como PROVISÓRIO em `returns-config.ts` | P |
| 20 | Decidir a etapa de `closed` (reembolsada × encerrada sem devolução) no mapa de status | Comentário em `returns-config.ts`; hoje a ingestão manda `encerrada_sem_devolucao` | P |
| 21 | Trocar `claims_days_back` de 180 para 30 no MVP7 (ou decidir manter 180) | Passo 4 do README da ingestão não foi feito; `claims_deferred` já é 0 | P |
| 22 | Reprocessar as 27 devoluções sem colunas da fila (rodar uma vez com 180 dias resolve só as que estão na janela) | Saída do MVP7 de 26/10 | P |
| 23 | Excluir o Full também do denominador (base de vendas), cruzando pedido → envio/anúncio → `logistic_type` | Limite registrado na migração | M |
| 24 | Validar com a API real ações do vendedor, condições de revisão e prazos (`prazo_acao_vendedor`, `data_prevista` e `resultado` vieram vazios nas últimas execuções) | PR #9 "Não validado com a API real" | P |

### Comercial e Saúde da conta

| # | Item | Evidência | Esforço |
|---|---|---|---|
| 25 | Religar `metric-signals` ao `ComparisonIndicator` e aos KPIs (direção `lowerIsBetter` onde cabe) e usar `SELLER_RATE_THRESHOLDS` nas taxas de Saúde da conta | Ligado no PR #2 e desfeito no upload de 23/08; limites definidos e não usados | P |
| 26 | Confirmar os limites de saúde do vendedor com o painel de reputação do ML | "valores iniciais, não oficiais" em `metric-signals.ts` | P |
| 27 | Tornar reais os blocos estáticos: "Ações operacionais" (estoque crítico, pausado com estoque, sem venda com visita), "Dimensão do período" (larguras fixas), funil de Tráfego (larguras fixas) | Código de `ProductsView`, `SalesView`, `TrafficView` | M |
| 28 | Respostas da aba Tráfego ("Quais anúncios atraem público mas não convertem?" etc.): transformar as perguntas fixas em listas calculadas | Lista "Perguntas respondidas" em `TrafficView` | M |
| 29 | Evitar que os números do fallback (ex.: R$ 1.763.179,84) apareçam por um instante no primeiro carregamento: usar estado de carregamento | `FALLBACK_DASHBOARD_DATA` é o estado inicial | P |
| 30 | Controle de acesso (o painel é público para quem tem a URL) | Não há autenticação | M (Vercel Password Protection ou auth) |

### Logística (decisão pendente)

| # | Item | Evidência | Esforço |
|---|---|---|---|
| 31 | **Decidir:** remover de vez (≈900 linhas de `page.tsx`, tipos, consultas, testes de logística e os objetos no Supabase) **ou** reativar via Logística v2 (fluxos prontos e inativos, views `dashboard_logistics_v2_*`, flag `LOGISTICS_V2_ENABLED`) | Aba retirada em 05/10; comentário diz que os objetos "serão removidos" | M (remover) / G (reativar) |

### Código

| # | Item | Esforço |
|---|---|---|
| 32 | Quebrar `app/page.tsx` (~3 000 linhas) em um arquivo por aba + componentes compartilhados, como já é a seção Devoluções | M |
| 33 | Multi-conta: o modelo de dados já tem `account_id`; falta o seletor de conta (hoje só visual) e parametrizar a conta por requisição | G |

## Decisões que dependem do negócio

1. Definição oficial de "Pedidos" (únicos? só pagos?) — item 9.
2. Limites da fila de devoluções e de saúde do vendedor — itens 19 e 26.
3. Tratamento de `closed` e de PNR (`INCLUDE_PNR`) — item 20.
4. Futuro da Logística — item 31.
5. Quem classifica `erro_operacional` e com que frequência — item 18.
6. O painel deve ser público ou ter login — item 30.
